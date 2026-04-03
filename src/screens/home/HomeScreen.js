import React, { useContext, useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Image, Alert } from 'react-native';
import { Text, Card, Avatar, Chip, Surface, IconButton } from 'react-native-paper';
import { AuthContext } from '../../context/AuthContext';
import { useBadges } from '../../context/BadgeContext';
import { logout } from '../../services/authService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useOrganization } from '../../context/OrganizationContext';
import { organizationService } from '../../services/organizationService';

import { 
  collection, 
  getDocs, 
} from 'firebase/firestore';
import { db } from '../../../firebase.config';

export default function HomeScreen({ navigation }) {
  const { userProfile, user, organizationId } = useContext(AuthContext);
  const { clearOrganizationId } = useOrganization();
  const { badges, dismissHomeScreenItem, clearAllHomeScreenItems, dismissMessagePreview } = useBadges();
  
  const [stats, setStats] = useState({
    totalMembers: 0,
    totalEvents: 0,
    recentPosts: 0,
  });
  const [orgLogoUrl, setOrgLogoUrl] = useState(null);
  const [orgName, setOrgName] = useState(null);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState({
    announcements: false,
    events: false,
    posts: false,
    upcomingEvents: false,
    messages: false,
  });

  const recentActivity = {
    announcements: (badges.homeScreen.announcements || []).filter(
      item => !(userProfile?.homeScreenDismissals?.announcements?.includes(item.id))
    ),
    events: (badges.homeScreen.events || []).filter(
      item => !(userProfile?.homeScreenDismissals?.events?.includes(item.id))
    ),
    posts: (badges.homeScreen.posts || []).filter(
      item => !(userProfile?.homeScreenDismissals?.posts?.includes(item.id))
    ),
    messages: badges.homeScreen.messages || [],
  };

  useEffect(() => {
    if (userProfile?.uid && organizationId) {
      loadHomeData();
    }
  }, [userProfile, organizationId]);

  // Load org logo separately so it doesn't block the rest of the screen
  useEffect(() => {
    if (!organizationId) return;
    organizationService.getOrgLogo(organizationId).then(url => {
      if (url) setOrgLogoUrl(url);
    });
    // ADD THIS LINE:
    organizationService.getOrgName(organizationId).then(name => {
      if (name) setOrgName(name);
    });
  }, [organizationId]);

  const loadHomeData = async () => {
    try {
      await Promise.all([
        loadStats(),
        loadUpcomingEvents(),
      ]);
    } catch (error) {
      console.error('Error loading home data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    if (!organizationId) return;
    try {
      const usersSnapshot = await getDocs(collection(db, 'organizations', organizationId, 'users'));
      const totalMembers = usersSnapshot.size;

      const eventsSnapshot = await getDocs(collection(db, 'organizations', organizationId, 'events'));
      const totalEvents = eventsSnapshot.size;

      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
      
      const postsSnapshot = await getDocs(collection(db, 'organizations', organizationId, 'posts'));
      let recentPostsCount = 0;
      
      postsSnapshot.forEach((doc) => {
        const postData = doc.data();
        const createdAt = postData.createdAt?.toDate ? postData.createdAt.toDate() : new Date(postData.createdAt);
        if (createdAt >= twentyFourHoursAgo) {
          recentPostsCount++;
        }
      });

      setStats({ totalMembers, totalEvents, recentPosts: recentPostsCount });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const loadUpcomingEvents = async () => {
    if (!organizationId) return;
    try {
      const now = new Date();
      const eventsSnapshot = await getDocs(collection(db, 'organizations', organizationId, 'events'));
      const events = [];
      
      eventsSnapshot.forEach((doc) => {
        const data = doc.data();
        const eventDateTime = data.eventDateTime?.toDate ? data.eventDateTime.toDate() : new Date(data.eventDateTime);
        if (eventDateTime > now) {
          events.push({ id: doc.id, ...data, eventDateTime });
        }
      });

      events.sort((a, b) => a.eventDateTime - b.eventDateTime);
      setUpcomingEvents(events.slice(0, 3));
    } catch (error) {
      console.error('Error loading upcoming events:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    // Re-fetch org logo on pull-to-refresh so logo changes appear immediately
    if (organizationId) {
      organizationService.getOrgLogo(organizationId).then(url => {
        if (url) setOrgLogoUrl(url);
      });
    }
    await loadHomeData();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    try {
      await logout(user.uid, organizationId, clearOrganizationId);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleDismissItem = async (type, itemId) => {
    try {
      await dismissHomeScreenItem(type, itemId);
    } catch (error) {
      console.error('Error dismissing item:', error);
    }
  };

  const handleClearAll = async (type) => {
    const typeLabels = {
      announcements: 'Announcements',
      events: 'Events',
      posts: 'Posts'
    };
    Alert.alert(
      `Clear All ${typeLabels[type]}`,
      `Remove all ${typeLabels[type].toLowerCase()} from your home screen? You can still view them in the ${typeLabels[type]} tab.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllHomeScreenItems(type);
              Alert.alert('Success', `All ${typeLabels[type].toLowerCase()} cleared from home screen`);
            } catch (error) {
              console.error('Error clearing items:', error);
              Alert.alert('Error', 'Failed to clear items');
            }
          }
        }
      ]
    );
  };

  const getTimeAgo = (date) => {
    if (!date) return 'Recently';
    const now = new Date();
    const activityDate = date?.toDate ? date.toDate() : new Date(date);
    const seconds = Math.floor((now - activityDate) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return activityDate.toLocaleDateString();
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const formatEventDate = (dateTime) => {
    if (!dateTime) return 'Date TBA';
    const date = dateTime?.toDate ? dateTime.toDate() : new Date(dateTime);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      + ' • ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const quickActions = [
    { icon: 'message-text', label: 'Chat', color: '#66BB6A', route: 'Chat' },
    { icon: 'post', label: 'Feed', color: '#5C6BC0', route: 'Feed' },
    { icon: 'calendar', label: 'Events', color: '#7E57C2', route: 'Events' },
    { icon: 'bullhorn', label: 'Announcements', color: '#EC407A', route: 'Announcements' },
  ];

  const statsDisplay = [
    { label: 'Members', value: stats.totalMembers, icon: 'account-group', color: '#66BB6A' },
    { label: 'Events', value: stats.totalEvents, icon: 'calendar-check', color: '#7E57C2' },
    { label: 'Posts (24h)', value: stats.recentPosts, icon: 'post', color: '#5C6BC0' },
  ];

  const getCategoryIcon = (category) => {
    const icons = {
      sports: 'basketball', social: 'account-group', academic: 'school',
      workshop: 'hammer-wrench', meeting: 'calendar-clock', general: 'calendar-star',
    };
    return icons[category] || 'calendar-star';
  };

  const getCategoryColor = (category) => {
    const colors = {
      sports: '#FFA726', social: '#EC407A', academic: '#7E57C2',
      workshop: '#66BB6A', meeting: '#26C6DA', general: '#5C6BC0',
    };
    return colors[category] || '#5C6BC0';
  };

  if (!organizationId) {
    return (
      <ScrollView style={styles.container}>
        <LinearGradient colors={['#667EEA', '#764BA2']} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={styles.headerContent}>
            <Text variant="headlineSmall" style={styles.greeting}>Loading...</Text>
          </View>
        </LinearGradient>
      </ScrollView>
    );
  }

  const hasAnyActivity =
    recentActivity.announcements?.length > 0 ||
    recentActivity.events?.length > 0 ||
    recentActivity.posts?.length > 0 ||
    recentActivity.messages?.length > 0;

  return (
    <ScrollView 
      style={styles.container} 
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <LinearGradient colors={['#667EEA', '#764BA2']} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={styles.headerContent}>
          <View style={styles.headerTop}>
            {/* Shows org logo if uploaded, otherwise falls back to bundled asset */}
            <View style={styles.logoContainer}>
              <Image 
                source={orgLogoUrl ? { uri: orgLogoUrl } : require('../../../assets/rtd-logo.png')}
                style={styles.headerLogo}
                resizeMode="contain"
              />
            </View>
            <IconButton
              icon="logout"
              iconColor="#3949AB"
              size={22}
              onPress={handleLogout}
              style={styles.logoutIcon}
            />
          </View>

          <View style={styles.greetingSection}>
            <Text variant="headlineSmall" style={styles.greeting}>Welcome Back! 👋</Text>
            {userProfile && (
              <Text variant="headlineMedium" style={styles.userName}>
                {userProfile.firstName} {userProfile.lastName}
              </Text>
            )}
          </View>
          
          {userProfile && (
            <View style={styles.userInfo}>
              {userProfile.profilePicture ? (
                <Image source={{ uri: userProfile.profilePicture }} style={styles.avatarImage} />
              ) : (
                <Avatar.Text 
                  size={64} 
                  label={`${userProfile.firstName[0]}${userProfile.lastName[0]}`}
                  style={styles.avatar}
                />
              )}
                  <View style={styles.userDetails}>
                    <Text style={styles.occupation}>{userProfile.firstName} {userProfile.lastName}</Text>
                    {/* ADD THIS: */}
                    {orgName && (
                      <Text style={styles.orgNameText}>{orgName.replace(/\s*group\s*/i, '').trim()}</Text>
                    )}
                    {userProfile.location && (
                      <View style={styles.locationRow}>
                    <MaterialCommunityIcons name="map-marker" size={14} color="#5C6BC0" />
                    <Text style={styles.location}>{userProfile.location}</Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>
      </LinearGradient>

      <View style={styles.content}>
        <View style={styles.statsContainer}>
          {statsDisplay.map((stat, index) => (
            <Surface key={index} style={styles.statCard} elevation={2}>
              <View style={[styles.statIconContainer, { backgroundColor: stat.color + '15' }]}>
                <MaterialCommunityIcons name={stat.icon} size={24} color={stat.color} />
              </View>
              <Text variant="headlineSmall" style={styles.statValue}>{stat.value}</Text>
              <Text variant="bodySmall" style={styles.statLabel}>{stat.label}</Text>
            </Surface>
          ))}
        </View>

        <View style={styles.sectionHeaderContainer}>
          <Text variant="titleLarge" style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.sectionDivider} />
        </View>
        <View style={styles.quickActionsGrid}>
          {quickActions.map((action, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => navigation.navigate(action.route)}
              style={styles.quickActionItem}
            >
              <LinearGradient
                colors={[action.color, action.color + 'DD']}
                style={styles.quickActionIcon}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <MaterialCommunityIcons name={action.icon} size={26} color="#fff" />
              </LinearGradient>
              <Text variant="bodyMedium" style={styles.quickActionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.sectionHeaderContainer}>
          <Text variant="titleLarge" style={styles.sectionTitle}>Recent Activity</Text>
          <View style={styles.sectionDivider} />
        </View>

        {/* ── ANNOUNCEMENTS ── */}
        {recentActivity.announcements?.length > 0 && (
          <Card style={styles.activityGroupCard} elevation={2}>
            <TouchableOpacity onPress={() => toggleSection('announcements')} style={styles.activityGroupHeader}>
              <View style={styles.activityGroupHeaderLeft}>
                <LinearGradient colors={['#EC407A', '#D81B60']} style={styles.activityGroupIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <MaterialCommunityIcons name="bullhorn" size={22} color="#fff" />
                </LinearGradient>
                <View>
                  <Text variant="titleMedium" style={styles.activityGroupTitle}>Announcements</Text>
                  <Text variant="bodySmall" style={styles.activityGroupCount}>{recentActivity.announcements.length} recent</Text>
                </View>
              </View>
              <View style={styles.headerActions}>
                {recentActivity.announcements.length > 1 && (
                  <TouchableOpacity onPress={() => handleClearAll('announcements')} style={styles.clearAllButton}>
                    <Text style={styles.clearAllButtonText}>Clear All</Text>
                  </TouchableOpacity>
                )}
                <MaterialCommunityIcons name={expandedSections.announcements ? 'chevron-up' : 'chevron-down'} size={22} color="#78909C" />
              </View>
            </TouchableOpacity>
            
            {expandedSections.announcements && (
              <View style={styles.activityGroupContent}>
                {recentActivity.announcements.map((item, index) => (
                  <View key={item.id} style={[styles.activityItem, index > 0 && styles.activityItemBorder]}>
                    <TouchableOpacity onPress={() => navigation.navigate('Announcements')} style={styles.activityItemContent}>
                      <View style={styles.activityItemMain}>
                        <Text variant="bodyLarge" style={styles.activityItemTitle} numberOfLines={2}>{item.title}</Text>
                        {item.priority === 'urgent' && (
                          <Chip style={styles.urgentChip} textStyle={styles.urgentChipText} compact>URGENT</Chip>
                        )}
                        <Text variant="bodySmall" style={styles.activityItemTime}>{getTimeAgo(item.createdAt)}</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDismissItem('announcements', item.id)} style={styles.dismissButton}>
                      <MaterialCommunityIcons name="close" size={18} color="#B0BEC5" />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={styles.viewAllButton} onPress={() => navigation.navigate('Announcements')}>
                  <Text style={styles.viewAllButtonText}>View All Announcements</Text>
                  <MaterialCommunityIcons name="arrow-right" size={16} color="#EC407A" />
                </TouchableOpacity>
              </View>
            )}
          </Card>
        )}

        {/* ── NEW EVENTS ── */}
        {recentActivity.events?.length > 0 && (
          <Card style={styles.activityGroupCard} elevation={2}>
            <TouchableOpacity onPress={() => toggleSection('events')} style={styles.activityGroupHeader}>
              <View style={styles.activityGroupHeaderLeft}>
                <LinearGradient colors={['#7E57C2', '#5E35B1']} style={styles.activityGroupIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <MaterialCommunityIcons name="calendar" size={22} color="#fff" />
                </LinearGradient>
                <View>
                  <Text variant="titleMedium" style={styles.activityGroupTitle}>New Events</Text>
                  <Text variant="bodySmall" style={styles.activityGroupCount}>{recentActivity.events.length} new</Text>
                </View>
              </View>
              <View style={styles.headerActions}>
                {recentActivity.events.length > 1 && (
                  <TouchableOpacity onPress={() => handleClearAll('events')} style={styles.clearAllButton}>
                    <Text style={styles.clearAllButtonText}>Clear All</Text>
                  </TouchableOpacity>
                )}
                <MaterialCommunityIcons name={expandedSections.events ? 'chevron-up' : 'chevron-down'} size={22} color="#78909C" />
              </View>
            </TouchableOpacity>
            
            {expandedSections.events && (
              <View style={styles.activityGroupContent}>
                {recentActivity.events.map((item, index) => (
                  <View key={item.id} style={[styles.activityItem, index > 0 && styles.activityItemBorder]}>
                    <TouchableOpacity onPress={() => navigation.navigate('Events')} style={styles.activityItemContent}>
                      <View style={styles.activityItemMain}>
                        <Text variant="bodyLarge" style={styles.activityItemTitle} numberOfLines={2}>{item.title}</Text>
                        {item.location && (
                          <View style={styles.eventLocationRow}>
                            <MaterialCommunityIcons name="map-marker" size={13} color="#B0BEC5" />
                            <Text variant="bodySmall" style={styles.eventLocationText} numberOfLines={1}>{item.location}</Text>
                          </View>
                        )}
                        <Text variant="bodySmall" style={styles.activityItemTime}>{getTimeAgo(item.createdAt)}</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDismissItem('events', item.id)} style={styles.dismissButton}>
                      <MaterialCommunityIcons name="close" size={18} color="#B0BEC5" />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={styles.viewAllButton} onPress={() => navigation.navigate('Events')}>
                  <Text style={styles.viewAllButtonText}>View All Events</Text>
                  <MaterialCommunityIcons name="arrow-right" size={16} color="#7E57C2" />
                </TouchableOpacity>
              </View>
            )}
          </Card>
        )}

        {/* ── RECENT POSTS ── */}
        {recentActivity.posts?.length > 0 && (
          <Card style={styles.activityGroupCard} elevation={2}>
            <TouchableOpacity onPress={() => toggleSection('posts')} style={styles.activityGroupHeader}>
              <View style={styles.activityGroupHeaderLeft}>
                <LinearGradient colors={['#5C6BC0', '#3949AB']} style={styles.activityGroupIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <MaterialCommunityIcons name="post" size={22} color="#fff" />
                </LinearGradient>
                <View>
                  <Text variant="titleMedium" style={styles.activityGroupTitle}>Recent Posts</Text>
                  <Text variant="bodySmall" style={styles.activityGroupCount}>{recentActivity.posts.length} recent</Text>
                </View>
              </View>
              <View style={styles.headerActions}>
                {recentActivity.posts.length > 1 && (
                  <TouchableOpacity onPress={() => handleClearAll('posts')} style={styles.clearAllButton}>
                    <Text style={styles.clearAllButtonText}>Clear All</Text>
                  </TouchableOpacity>
                )}
                <MaterialCommunityIcons name={expandedSections.posts ? 'chevron-up' : 'chevron-down'} size={22} color="#78909C" />
              </View>
            </TouchableOpacity>
            
            {expandedSections.posts && (
              <View style={styles.activityGroupContent}>
                {recentActivity.posts.map((item, index) => (
                  <View key={item.id} style={[styles.activityItem, index > 0 && styles.activityItemBorder]}>
                    <TouchableOpacity onPress={() => navigation.navigate('Feed')} style={styles.activityItemContent}>
                      <View style={styles.activityItemMain}>
                        <Text variant="bodyMedium" style={styles.postUserName}>{item.userName}</Text>
                        <Text variant="bodySmall" style={styles.postContent} numberOfLines={2}>{item.content}</Text>
                        <Text variant="bodySmall" style={styles.activityItemTime}>{getTimeAgo(item.createdAt)}</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDismissItem('posts', item.id)} style={styles.dismissButton}>
                      <MaterialCommunityIcons name="close" size={18} color="#B0BEC5" />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={styles.viewAllButton} onPress={() => navigation.navigate('Feed')}>
                  <Text style={styles.viewAllButtonText}>View Feed</Text>
                  <MaterialCommunityIcons name="arrow-right" size={16} color="#5C6BC0" />
                </TouchableOpacity>
              </View>
            )}
          </Card>
        )}

        {/* ── UNREAD MESSAGES ── */}
        {recentActivity.messages?.length > 0 && (
          <Card style={styles.activityGroupCard} elevation={2}>
            <TouchableOpacity onPress={() => toggleSection('messages')} style={styles.activityGroupHeader}>
              <View style={styles.activityGroupHeaderLeft}>
                <LinearGradient colors={['#26C6DA', '#00ACC1']} style={styles.activityGroupIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <MaterialCommunityIcons name="message-text" size={22} color="#fff" />
                </LinearGradient>
                <View>
                  <Text variant="titleMedium" style={styles.activityGroupTitle}>Unread Messages</Text>
                  <Text variant="bodySmall" style={styles.activityGroupCount}>
                    {recentActivity.messages.length} conversation{recentActivity.messages.length > 1 ? 's' : ''}
                  </Text>
                </View>
              </View>
              <MaterialCommunityIcons name={expandedSections.messages ? 'chevron-up' : 'chevron-down'} size={22} color="#78909C" />
            </TouchableOpacity>

            {expandedSections.messages && (
              <View style={styles.activityGroupContent}>
                {recentActivity.messages.map((item, index) => (
                  <TouchableOpacity
                    key={item.chatId}
                    style={[styles.messageItem, index > 0 && styles.activityItemBorder]}
                    onPress={() => {
                      dismissMessagePreview(item.chatId);
                      navigation.navigate('Chat');
                    }}
                  >
                    {item.avatar ? (
                      <Image source={{ uri: item.avatar }} style={styles.messageAvatar} />
                    ) : (
                      <View style={[styles.messageAvatarPlaceholder, { backgroundColor: item.isGroup ? '#26C6DA20' : '#5C6BC020' }]}>
                        <MaterialCommunityIcons
                          name={item.isGroup ? 'account-group' : 'account'}
                          size={22}
                          color={item.isGroup ? '#26C6DA' : '#5C6BC0'}
                        />
                      </View>
                    )}
                    <View style={styles.messageContent}>
                      <View style={styles.messageTopRow}>
                        <Text style={styles.messageSenderName} numberOfLines={1}>{item.senderName}</Text>
                        <Text style={styles.messageTime}>{getTimeAgo(item.lastMessageTime)}</Text>
                      </View>
                      <Text style={styles.messageSnippet} numberOfLines={1}>{item.snippet}</Text>
                      {item.isGroup && (
                        <View style={styles.groupBadge}>
                          <MaterialCommunityIcons name="account-group" size={10} color="#26C6DA" />
                          <Text style={styles.groupBadgeText}>Group</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>
                        {item.unreadCount > 99 ? '99+' : item.unreadCount}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.viewAllButton} onPress={() => navigation.navigate('Chat')}>
                  <Text style={styles.viewAllButtonText}>Open Messages</Text>
                  <MaterialCommunityIcons name="arrow-right" size={16} color="#26C6DA" />
                </TouchableOpacity>
              </View>
            )}
          </Card>
        )}

        {/* ── ALL CAUGHT UP ── */}
        {!hasAnyActivity && (
          <Card style={styles.emptyCard} elevation={2}>
            <Card.Content style={styles.emptyContent}>
              <View style={styles.emptyIconContainer}>
                <MaterialCommunityIcons name="check-circle" size={52} color="#66BB6A" />
              </View>
              <Text style={styles.emptyText}>All caught up!</Text>
              <Text style={styles.emptySubtext}>You're up to date with everything</Text>
            </Card.Content>
          </Card>
        )}

        {/* ── UPCOMING EVENTS ── */}
        {upcomingEvents.length > 0 && (
          <Card style={styles.activityGroupCard} elevation={2}>
            <TouchableOpacity onPress={() => toggleSection('upcomingEvents')} style={styles.activityGroupHeader}>
              <View style={styles.activityGroupHeaderLeft}>
                <LinearGradient colors={['#66BB6A', '#4CAF50']} style={styles.activityGroupIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <MaterialCommunityIcons name="calendar-clock" size={22} color="#fff" />
                </LinearGradient>
                <View>
                  <Text variant="titleMedium" style={styles.activityGroupTitle}>Upcoming Events</Text>
                  <Text variant="bodySmall" style={styles.activityGroupCount}>{upcomingEvents.length} upcoming</Text>
                </View>
              </View>
              <MaterialCommunityIcons name={expandedSections.upcomingEvents ? 'chevron-up' : 'chevron-down'} size={22} color="#78909C" />
            </TouchableOpacity>

            {expandedSections.upcomingEvents && (
              <View style={styles.activityGroupContent}>
                {upcomingEvents.map((event, index) => (
                  <TouchableOpacity 
                    key={index}
                    onPress={() => navigation.navigate('Events')}
                    style={[styles.eventPreview, index > 0 && styles.eventPreviewMargin]}
                  >
                    <View style={[styles.eventIconContainer, { backgroundColor: getCategoryColor(event.category) + '20' }]}>
                      <MaterialCommunityIcons name={getCategoryIcon(event.category)} size={28} color={getCategoryColor(event.category)} />
                    </View>
                    <View style={styles.eventInfo}>
                      <Text variant="bodyLarge" style={styles.eventName} numberOfLines={1}>{event.title}</Text>
                      <Text variant="bodySmall" style={styles.eventDate}>{formatEventDate(event.eventDateTime)}</Text>
                      {event.location && (
                        <View style={styles.eventLocationRow}>
                          <MaterialCommunityIcons name="map-marker" size={13} color="#78909C" />
                          <Text variant="bodySmall" style={styles.eventLocation} numberOfLines={1}>{event.location}</Text>
                        </View>
                      )}
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={18} color="#B0BEC5" />
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.viewAllButton} onPress={() => navigation.navigate('Events')}>
                  <Text style={styles.viewAllButtonText}>View All Events</Text>
                  <MaterialCommunityIcons name="arrow-right" size={16} color="#66BB6A" />
                </TouchableOpacity>
              </View>
            )}
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 32,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerContent: {
    gap: 18,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoWrapper: {
  borderRadius: 60,
  shadowColor: '#3f51b5',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.3,
  shadowRadius: 5,
  elevation: 8,
  width: 100,
  height: 90,
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  borderWidth: 0,
  borderColor: '#5c6bc0',
  },
  headerLogo: {
    width: 60,
    height: 60,
  },
  logoutIcon: {
    margin: 0,
    backgroundColor: '#ffffff',
    borderRadius: 18,
  },
  greetingSection: {
    marginTop: 0,
  },
  greeting: {
    color: '#e1e2ebff',
    opacity: 0.95,
    fontWeight: '600',
  },
  userName: {
    color: '#2d197fff',
    fontWeight: '700',
    marginTop: 3,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    padding: 13,
    borderRadius: 16,
    shadowColor: '#5C6BC0',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  avatar: {
    backgroundColor: '#5C6BC0',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2.5,
    borderColor: '#ffffff',
  },
  userDetails: {
    flex: 1,
  },
  occupation: {
    color: '#3949AB',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 5,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  orgNameText: {
    color: '#7E57C2',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  content: {
    padding: 18,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -24,
    marginBottom: 22,
    gap: 9,
  },
  statCard: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  statIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
  },
  statValue: {
    fontWeight: '700',
    color: '#263238',
    marginTop: 3,
    fontSize: 22,
  },
  statLabel: {
    color: '#78909C',
    marginTop: 3,
    textAlign: 'center',
    fontSize: 10,
  },
  sectionHeaderContainer: {
    marginBottom: 13,
  },
  sectionTitle: {
    fontWeight: '700',
    color: '#3949AB',
    marginBottom: 7,
    fontSize: 19,
  },
  sectionDivider: {
    height: 2.5,
    width: 36,
    backgroundColor: '#5C6BC0',
    borderRadius: 2,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 26,
  },
  quickActionItem: {
    width: '48%',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 17,
    borderRadius: 14,
    marginBottom: 10,
    shadowColor: '#5C6BC0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  quickActionIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  quickActionLabel: {
    fontWeight: '600',
    color: '#263238',
    fontSize: 14,
  },
  emptyCard: {
    marginBottom: 18,
    backgroundColor: '#fff',
    borderRadius: 14,
  },
  emptyContent: {
    alignItems: 'center',
    paddingVertical: 34,
  },
  emptyIconContainer: {
    backgroundColor: '#E8F5E9',
    borderRadius: 44,
    padding: 17,
    marginBottom: 13,
  },
  emptyText: {
    fontSize: 15,
    color: '#78909C',
    marginTop: 10,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 13,
    color: '#B0BEC5',
    marginTop: 3,
  },
  activityGroupCard: {
    marginBottom: 13,
    backgroundColor: '#fff',
    overflow: 'hidden',
    borderRadius: 14,
  },
  activityGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  activityGroupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    flex: 1,
  },
  activityGroupIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityGroupTitle: {
    fontWeight: '700',
    color: '#3949AB',
    fontSize: 15,
  },
  activityGroupCount: {
    color: '#B0BEC5',
    marginTop: 2,
    fontSize: 11,
  },
  activityGroupContent: {
    borderTopWidth: 1,
    borderTopColor: '#ECEFF1',
  },
  activityItem: {
    flexDirection: 'row',
    padding: 14,
    alignItems: 'flex-start',
    gap: 10,
  },
  activityItemBorder: {
    borderTopWidth: 1,
    borderTopColor: '#F5F5F5',
  },
  activityItemContent: {
    flex: 1,
  },
  activityItemMain: {
    flex: 1,
  },
  activityItemTitle: {
    fontWeight: '600',
    color: '#263238',
    marginBottom: 3,
    fontSize: 14,
  },
  activityItemTime: {
    color: '#B0BEC5',
    fontSize: 11,
    marginTop: 3,
  },
  postUserName: {
    fontWeight: '600',
    color: '#5C6BC0',
    marginBottom: 3,
    fontSize: 13,
  },
  postContent: {
    color: '#78909C',
    lineHeight: 17,
    fontSize: 12,
  },
  eventLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
  },
  eventLocationText: {
    color: '#B0BEC5',
    fontSize: 11,
    flex: 1,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    gap: 5,
    backgroundColor: '#FAFAFA',
    borderTopWidth: 1,
    borderTopColor: '#ECEFF1',
  },
  viewAllButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#78909C',
  },
  urgentChip: {
    height: 18,
    backgroundColor: '#EF5350',
    marginTop: 3,
  },
  urgentChipText: {
    fontSize: 8,
    color: '#fff',
    fontWeight: '700',
  },
  eventPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 13,
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    marginHorizontal: 13,
    marginTop: 13,
  },
  eventPreviewMargin: {
    marginTop: 8,
  },
  eventIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventInfo: {
    flex: 1,
  },
  eventName: {
    fontWeight: '600',
    color: '#263238',
    marginBottom: 3,
    fontSize: 14,
  },
  eventDate: {
    color: '#78909C',
    marginBottom: 2,
    fontSize: 11,
  },
  eventLocation: {
    color: '#B0BEC5',
    fontSize: 11,
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  clearAllButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#ECEFF1',
    borderRadius: 10,
  },
  clearAllButtonText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#78909C',
  },
  dismissButton: {
    padding: 7,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
  },
  messageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 11,
  },
  messageAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  messageAvatarPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageContent: {
    flex: 1,
  },
  messageTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  messageSenderName: {
    fontWeight: '700',
    color: '#263238',
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  messageTime: {
    fontSize: 11,
    color: '#B0BEC5',
  },
  messageSnippet: {
    fontSize: 12,
    color: '#78909C',
    lineHeight: 17,
  },
  groupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  groupBadgeText: {
    fontSize: 10,
    color: '#26C6DA',
    fontWeight: '600',
  },
  unreadBadge: {
    backgroundColor: '#26C6DA',
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});