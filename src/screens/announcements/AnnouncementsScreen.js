// src/screens/announcements/AnnouncementsScreen.js
import React, { useState, useEffect, useContext } from 'react';
import { useActiveOrg } from '../../context/ActiveOrgContext';
import {
  View,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Image,
  Linking,
  Alert,
  Dimensions,
} from 'react-native';
import { Text, Card, FAB, Surface, Chip, IconButton, Menu } from 'react-native-paper';
import { AuthContext } from '../../context/AuthContext';
import { useBadges } from '../../context/BadgeContext';
import { subscribeToAnnouncements, deleteAnnouncement } from '../../services/announcementService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';

const { width } = Dimensions.get('window');

export default function AnnouncementsScreen({ navigation }) {
  const { userProfile } = useContext(AuthContext);
  const { activeOrgId: organizationId, activeOrgIsAdmin } = useActiveOrg();
  const { markAnnouncementsAsViewed } = useBadges();

  const [announcements, setAnnouncements] = useState([]);
  const [filter, setFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [expandedItems, setExpandedItems] = useState({});
  const [menuVisible, setMenuVisible] = useState({});

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      markAnnouncementsAsViewed();
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (!organizationId) return;
    const unsubscribe = subscribeToAnnouncements(setAnnouncements, organizationId);
    return () => unsubscribe();
  }, [organizationId]);

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const toggleExpand = (id) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleMenu = (id) => {
    setMenuVisible(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDeleteAnnouncement = (announcementId, announcementTitle) => {
    if (!organizationId) return;
    Alert.alert(
      'Delete Announcement',
      `Are you sure you want to delete "${announcementTitle}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAnnouncement(announcementId, organizationId);
              Alert.alert('Success', 'Announcement deleted successfully');
            } catch (error) {
              console.error('Error deleting announcement:', error);
              Alert.alert('Error', 'Failed to delete announcement');
            }
          },
        },
      ]
    );
  };

  const openLink = async (url) => {
    try {
      if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await WebBrowser.openBrowserAsync(url);
      } else {
        Alert.alert('Error', 'Cannot open this link');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open link');
    }
  };

  const openAttachment = async (attachment) => {
    try {
      await WebBrowser.openBrowserAsync(attachment.downloadURL);
    } catch (error) {
      Alert.alert('Error', 'Failed to open attachment');
    }
  };

  const getTimeAgo = (date) => {
    const now = new Date();
    const announcementDate = date?.toDate ? date.toDate() : new Date(date);
    const seconds = Math.floor((now - announcementDate) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return announcementDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getPriorityConfig = (priority) => {
    switch (priority) {
      case 'urgent': return { color: '#EF5350', icon: 'alert-circle', label: 'Urgent', bg: '#FFEBEE', gradient: ['#EF5350', '#E53935'] };
      case 'high': return { color: '#FF7043', icon: 'alert', label: 'High', bg: '#FBE9E7', gradient: ['#FF7043', '#F4511E'] };
      case 'low': return { color: '#66BB6A', icon: 'information', label: 'Low', bg: '#E8F5E9', gradient: ['#66BB6A', '#4CAF50'] };
      default: return { color: '#5C6BC0', icon: 'bell', label: 'Normal', bg: '#E8EAF6', gradient: ['#5C6BC0', '#3949AB'] };
    }
  };

  const getCategoryConfig = (category) => {
    switch (category) {
      case 'event': return { icon: 'calendar-star', color: '#7E57C2', bg: '#F3E5F5' };
      case 'academic': return { icon: 'school', color: '#26C6DA', bg: '#E0F7FA' };
      case 'sports': return { icon: 'basketball', color: '#FFA726', bg: '#FFF3E0' };
      case 'urgent': return { icon: 'alert-circle', color: '#EF5350', bg: '#FFEBEE' };
      default: return { icon: 'bullhorn', color: '#5C6BC0', bg: '#E8EAF6' };
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return mb < 1 ? `${(bytes / 1024).toFixed(1)} KB` : `${mb.toFixed(1)} MB`;
  };

  const filteredAnnouncements = announcements.filter(item => {
    if (filter === 'all') return true;
    if (filter === 'important') return item.priority === 'urgent' || item.priority === 'high';
    return item.category === filter;
  });

  const importantCount = announcements.filter(a => a.priority === 'urgent' || a.priority === 'high').length;

  const renderAnnouncement = ({ item }) => {
    const priorityConfig = getPriorityConfig(item.priority);
    const categoryConfig = getCategoryConfig(item.category || 'general');
    const isExpanded = expandedItems[item.id];
    const isLongContent = item.content?.length > 200;
    const displayContent = isLongContent && !isExpanded
      ? item.content.substring(0, 200) + '...'
      : item.content;
    // ✅ Uses activeOrgIsAdmin — edit/delete only shown when admin in the active org
    const isAdmin = activeOrgIsAdmin;

    return (
      <Card style={[styles.announcementCard, item.priority === 'urgent' && styles.urgentCard]} elevation={2}>
        {item.priority === 'urgent' && (
          <LinearGradient colors={priorityConfig.gradient} style={styles.urgentBanner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <MaterialCommunityIcons name="alert-circle" size={16} color="#fff" />
            <Text style={styles.urgentBannerText}>URGENT NOTICE</Text>
          </LinearGradient>
        )}

        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <View style={[styles.iconBadge, { backgroundColor: categoryConfig.bg }]}>
              <MaterialCommunityIcons name={categoryConfig.icon} size={22} color={categoryConfig.color} />
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.announcementTitle} numberOfLines={2}>{item.title}</Text>
              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <MaterialCommunityIcons name="account" size={13} color="#78909C" />
                  <Text style={styles.metaText}>{item.author?.name || 'Admin'}</Text>
                </View>
                <View style={styles.metaDivider} />
                <View style={styles.metaItem}>
                  <MaterialCommunityIcons name="clock" size={13} color="#78909C" />
                  <Text style={styles.metaText}>{getTimeAgo(item.createdAt)}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.headerActions}>
            {item.priority !== 'normal' && (
              <View style={[styles.priorityBadge, { backgroundColor: priorityConfig.bg }]}>
                <MaterialCommunityIcons name={priorityConfig.icon} size={12} color={priorityConfig.color} />
                <Text style={[styles.priorityText, { color: priorityConfig.color }]}>{priorityConfig.label}</Text>
              </View>
            )}
            {/* Edit/delete menu only shown to admins of the active org */}
            {isAdmin && (
              <Menu
                visible={menuVisible[item.id]}
                onDismiss={() => toggleMenu(item.id)}
                anchor={
                  <IconButton
                    icon="dots-vertical"
                    size={18}
                    iconColor="#78909C"
                    onPress={() => toggleMenu(item.id)}
                    style={styles.menuButton}
                  />
                }
              >
                <Menu.Item
                  onPress={() => {
                    toggleMenu(item.id);
                    navigation.navigate('EditAnnouncement', { announcement: item });
                  }}
                  title="Edit"
                  leadingIcon="pencil"
                />
                <Menu.Item
                  onPress={() => {
                    toggleMenu(item.id);
                    handleDeleteAnnouncement(item.id, item.title);
                  }}
                  title="Delete"
                  leadingIcon="delete"
                />
              </Menu>
            )}
          </View>
        </View>

        <View style={styles.cardContent}>
          <Text style={styles.contentText}>{displayContent}</Text>
          {isLongContent && (
            <TouchableOpacity onPress={() => toggleExpand(item.id)}>
              <Text style={styles.readMore}>{isExpanded ? 'Show less' : 'Read more'}</Text>
            </TouchableOpacity>
          )}

          {item.attachments && item.attachments.length > 0 && (
            <View style={styles.attachmentsSection}>
              <View style={styles.sectionHeader}>
                <MaterialCommunityIcons name="paperclip" size={15} color="#5C6BC0" />
                <Text style={styles.sectionTitle}>Attachments ({item.attachments.length})</Text>
              </View>
              {item.attachments.map((attachment, index) => (
                <TouchableOpacity key={index} style={styles.attachmentCard} onPress={() => openAttachment(attachment)} activeOpacity={0.7}>
                  {attachment.fileType?.startsWith('image/') ? (
                    <Image source={{ uri: attachment.downloadURL }} style={styles.attachmentThumbnail} />
                  ) : (
                    <View style={styles.pdfThumbnail}>
                      <MaterialCommunityIcons name="file-pdf-box" size={28} color="#EF5350" />
                    </View>
                  )}
                  <View style={styles.attachmentInfo}>
                    <Text style={styles.attachmentName} numberOfLines={1}>{attachment.fileName}</Text>
                    {attachment.fileSize && <Text style={styles.attachmentSize}>{formatFileSize(attachment.fileSize)}</Text>}
                  </View>
                  <MaterialCommunityIcons name="download" size={18} color="#5C6BC0" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {item.links && item.links.length > 0 && (
            <View style={styles.linksSection}>
              <View style={styles.sectionHeader}>
                <MaterialCommunityIcons name="link-variant" size={15} color="#66BB6A" />
                <Text style={styles.sectionTitle}>Related Links ({item.links.length})</Text>
              </View>
              {item.links.map((link, index) => (
                <TouchableOpacity key={index} style={styles.linkCard} onPress={() => openLink(link)} activeOpacity={0.7}>
                  <MaterialCommunityIcons name="link" size={16} color="#66BB6A" />
                  <Text style={styles.linkText} numberOfLines={1}>{link}</Text>
                  <MaterialCommunityIcons name="open-in-new" size={16} color="#66BB6A" />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </Card>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <MaterialCommunityIcons name="bullhorn-outline" size={56} color="#CFD8DC" />
      </View>
      <Text style={styles.emptyTitle}>No Announcements</Text>
      <Text style={styles.emptyText}>
        {filter === 'all' ? 'Check back later for important updates' : `No ${filter} announcements at this time`}
      </Text>
    </View>
  );

  if (!organizationId) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#667EEA', '#764BA2']} style={styles.header}>
          <Text style={styles.headerTitle}>Loading...</Text>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#667EEA', '#764BA2']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.headerTitle}>Announcements</Text>
        <View style={styles.statsRow}>
          <Surface style={styles.statCard} elevation={1}>
            <Text style={styles.statNumber}>{announcements.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </Surface>
          <Surface style={styles.statCard} elevation={1}>
            <Text style={styles.statNumber}>{importantCount}</Text>
            <Text style={styles.statLabel}>Important</Text>
          </Surface>
        </View>
      </LinearGradient>

      <View style={styles.filterSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <Chip selected={filter === 'all'} onPress={() => setFilter('all')} style={[styles.filterChip, filter === 'all' && styles.filterChipActive]} textStyle={[styles.filterChipText, filter === 'all' && styles.filterChipTextActive]} icon="view-grid">All</Chip>
          <Chip selected={filter === 'important'} onPress={() => setFilter('important')} style={[styles.filterChip, filter === 'important' && styles.filterChipActive]} textStyle={[styles.filterChipText, filter === 'important' && styles.filterChipTextActive]} icon="alert-circle">Important</Chip>
        </ScrollView>
      </View>

      <FlatList
        data={filteredAnnouncements}
        keyExtractor={(item) => item.id}
        renderItem={renderAnnouncement}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmpty}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#5C6BC0']} tintColor="#5C6BC0" />}
        showsVerticalScrollIndicator={false}
      />

      {/* ✅ FAB only shown to admins of the ACTIVE org */}
      {activeOrgIsAdmin && (
        <FAB
          icon="plus"
          label="New"
          style={styles.fab}
          color="#fff"
          onPress={() => navigation.navigate('CreateAnnouncement')}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: { paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerTitle: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 16, letterSpacing: -0.3 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: 12, padding: 14, alignItems: 'center' },
  statNumber: { fontSize: 24, fontWeight: '700', color: '#263238', marginBottom: 2 },
  statLabel: { fontSize: 11, fontWeight: '600', color: '#78909C', textTransform: 'uppercase', letterSpacing: 0.3 },
  filterSection: { backgroundColor: '#fff', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  filterScroll: { paddingHorizontal: 20, gap: 8 },
  filterChip: { backgroundColor: '#FAFAFA', borderWidth: 1, borderColor: '#E0E0E0' },
  filterChipActive: { backgroundColor: '#5C6BC0', borderColor: '#5C6BC0' },
  filterChipText: { color: '#78909C', fontWeight: '600', fontSize: 13 },
  filterChipTextActive: { color: '#fff' },
  listContent: { padding: 16, paddingBottom: 100 },
  announcementCard: { marginBottom: 14, borderRadius: 16, backgroundColor: '#fff' },
  urgentCard: { borderWidth: 1, borderColor: '#FFEBEE' },
  urgentBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 6 },
  urgentBannerText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, paddingBottom: 10 },
  headerLeft: { flexDirection: 'row', flex: 1, gap: 12 },
  iconBadge: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  headerInfo: { flex: 1 },
  announcementTitle: { fontSize: 16, fontWeight: '700', color: '#263238', lineHeight: 22, marginBottom: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: '#78909C', fontWeight: '500' },
  metaDivider: { width: 2, height: 2, borderRadius: 1, backgroundColor: '#CFD8DC', marginHorizontal: 6 },
  headerActions: { flexDirection: 'column', alignItems: 'flex-end', gap: 4 },
  priorityBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  priorityText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  menuButton: { margin: 0 },
  cardContent: { paddingHorizontal: 14, paddingBottom: 14 },
  contentText: { fontSize: 14, lineHeight: 21, color: '#546E7A', marginBottom: 10 },
  readMore: { color: '#5C6BC0', fontWeight: '600', fontSize: 13, marginTop: 2 },
  attachmentsSection: { marginTop: 12, padding: 12, backgroundColor: '#FAFAFA', borderRadius: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#263238', textTransform: 'uppercase', letterSpacing: 0.3 },
  attachmentCard: { flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: '#fff', borderRadius: 10, marginBottom: 6, gap: 10, borderWidth: 1, borderColor: '#ECEFF1' },
  attachmentThumbnail: { width: 48, height: 48, borderRadius: 8 },
  pdfThumbnail: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#FFEBEE', alignItems: 'center', justifyContent: 'center' },
  attachmentInfo: { flex: 1 },
  attachmentName: { fontSize: 13, fontWeight: '600', color: '#263238', marginBottom: 2 },
  attachmentSize: { fontSize: 11, color: '#78909C' },
  linksSection: { marginTop: 12, padding: 12, backgroundColor: '#E8F5E9', borderRadius: 12 },
  linkCard: { flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: '#fff', borderRadius: 10, marginBottom: 6, gap: 8, borderWidth: 1, borderColor: '#C8E6C9' },
  linkText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#66BB6A' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 40 },
  emptyIcon: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#ECEFF1', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#78909C', marginBottom: 6 },
  emptyText: { fontSize: 13, color: '#B0BEC5', textAlign: 'center', lineHeight: 19 },
  fab: { position: 'absolute', margin: 20, right: 0, bottom: 0, backgroundColor: '#5C6BC0', borderRadius: 14 },
});