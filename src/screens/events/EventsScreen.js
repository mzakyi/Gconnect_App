
import React, { useState, useEffect, useContext } from 'react';
import { useActiveOrg } from '../../context/ActiveOrgContext';
import { 
  View, 
  FlatList, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  RefreshControl, 
  Alert,
  Image,
  Linking,
  Dimensions
} from 'react-native';
import { 
  Text, 
  Card, 
  FAB, 
  Chip, 
  Dialog, 
  Portal,
  Button,
  Surface
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';

import { AuthContext } from '../../context/AuthContext';
import { useBadges } from '../../context/BadgeContext';
import { subscribeToEvents, updateRSVP, deleteEvent } from '../../services/eventService';

const { width } = Dimensions.get('window');

export default function EventsScreen({ navigation }) {
  const { user, userProfile } = useContext(AuthContext);
const { activeOrgId: organizationId } = useActiveOrg();
  const { markEventsAsViewed } = useBadges();

  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('upcoming');
  const [refreshing, setRefreshing] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [eventToDelete, setEventToDelete] = useState(null);
  const [expandedItems, setExpandedItems] = useState({});

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      markEventsAsViewed();
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
      if (!organizationId) return; // ⭐ NEW: Wait for orgId

      // ⭐ UPDATED: Pass organizationId to service
      const unsubscribe = subscribeToEvents((eventsData) => {
        setEvents(eventsData);
      }, organizationId);
      return () => unsubscribe();
    }, [organizationId]); 

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const toggleExpand = (id) => {
    setExpandedItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleRSVP = async (eventId, currentStatus, newStatus) => {
      if (!organizationId) return; // ⭐ NEW: Guard check
      
      try {
        // ⭐ UPDATED: Pass organizationId
        await updateRSVP(eventId, user.uid, currentStatus, newStatus, organizationId);
      } catch (error) {
        console.error('Error updating RSVP:', error);
      }
    };

  const handleDeletePress = (event) => {
    setEventToDelete(event);
    setDeleteDialogVisible(true);
  };

  const confirmDelete = async () => {
      if (!eventToDelete || !organizationId) return; // ⭐ NEW: Add orgId check

      try {
        // ⭐ UPDATED: Pass organizationId
        await deleteEvent(eventToDelete.id, organizationId);
        Alert.alert('Success', 'Event deleted successfully');
        setEvents(prev => prev.filter(e => e.id !== eventToDelete.id));
      } catch (error) {
        console.error('Error deleting event:', error);
        Alert.alert('Error', 'Failed to delete event: ' + (error.message || 'Unknown error'));
      } finally {
        setDeleteDialogVisible(false);
        setEventToDelete(null);
      }
    };

  const openLink = async (url) => {
    try {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await WebBrowser.openBrowserAsync(url);
      } else {
        Alert.alert('Error', 'Cannot open this link');
      }
    } catch (error) {
      console.error('Error opening link:', error);
      Alert.alert('Error', 'Failed to open link');
    }
  };

  const openAttachment = async (attachment) => {
    try {
      await WebBrowser.openBrowserAsync(attachment.downloadURL);
    } catch (error) {
      console.error('Error opening attachment:', error);
      Alert.alert('Error', 'Failed to open attachment');
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return mb < 1 ? `${(bytes / 1024).toFixed(1)} KB` : `${mb.toFixed(1)} MB`;
  };

  const getUserRSVP = (event) => {
    if (event.rsvpYes?.includes(user.uid)) return 'Yes';
    if (event.rsvpMaybe?.includes(user.uid)) return 'Maybe';
    if (event.rsvpNo?.includes(user.uid)) return 'No';
    return null;
  };

  const isUserEventCreator = (event) => event.createdBy === user?.uid;

  const getEventDateTime = (event) => {
    if (event.eventDateTime) {
      return event.eventDateTime?.toDate ? event.eventDateTime.toDate() : new Date(event.eventDateTime);
    } else if (event.eventDate && event.eventTime) {
      return new Date(`${event.eventDate} ${event.eventTime}`);
    } else if (event.eventDate) {
      return new Date(event.eventDate);
    }
    return new Date();
  };

  const getEventStatus = (event) => {
    const now = new Date();
    const eventDateTime = getEventDateTime(event);
    
    if (eventDateTime < now) return 'past';
    const daysUntil = Math.ceil((eventDateTime - now) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 7) return 'soon';
    return 'upcoming';
  };

  const formatEventDate = (event) => {
    const date = getEventDateTime(event);
    const tz = event.timezone || 'America/New_York';
    
    const getTimezoneAbbr = (timezone) => {
      const abbrs = {
        'America/New_York': 'ET',
        'America/Chicago': 'CT',
        'America/Denver': 'MT',
        'America/Los_Angeles': 'PT',
        'America/Anchorage': 'AKT',
        'Pacific/Honolulu': 'HST',
        'GMT': 'GMT',
        'Europe/Paris': 'CET',
        'Asia/Kolkata': 'IST',
        'Asia/Shanghai': 'CST',
        'Asia/Tokyo': 'JST',
        'Australia/Sydney': 'AET',
      };
      return abbrs[timezone] || 'UTC';
    };

    return {
      month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
      day: date.getDate(),
      weekday: date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      fullDate: date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      timezone: getTimezoneAbbr(tz),
    };
  };

  const getEventColor = (status) => {
    switch (status) {
      case 'soon': return ['#FFA726', '#FB8C00'];
      case 'past': return ['#B0BEC5', '#90A4AE'];
      default: return ['#7E57C2', '#5E35B1'];
    }
  };

  const getCategoryColor = (category) => {
    const colors = {
      sports: '#FFA726',
      social: '#EC407A',
      academic: '#7E57C2',
      workshop: '#66BB6A',
      meeting: '#26C6DA',
      general: '#5C6BC0',
    };
    return colors[category] || colors.general;
  };

  const filteredEvents = events.filter(event => {
    const status = getEventStatus(event);
    if (filter === 'upcoming') return status !== 'past';
    if (filter === 'past') return status === 'past';
    if (filter === 'my-events') return getUserRSVP(event) === 'Yes';
    return true;
  });

  const upcomingEventsCount = events.filter(e => getEventStatus(e) !== 'past').length;
  const myEventsCount = events.filter(e => getUserRSVP(e) === 'Yes').length;

  const renderEvent = ({ item }) => {
    const userRSVP = getUserRSVP(item);
    const dateInfo = formatEventDate(item);
    const status = getEventStatus(item);
    const eventColors = getEventColor(status);
    const canEdit = userProfile?.isAdmin && isUserEventCreator(item);
    const isExpanded = expandedItems[item.id];
    const isLongDescription = item.description?.length > 150;
    const displayDescription = isLongDescription && !isExpanded 
      ? item.description.substring(0, 150) + '...' 
      : item.description;
    const categoryColor = getCategoryColor(item.category);



    return (
      <Card style={styles.eventCard} elevation={2}>
        <View style={styles.eventHeader}>
          <LinearGradient
            colors={eventColors}
            style={styles.dateBadge}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          >
            <Text style={styles.dateMonth}>{dateInfo.month}</Text>
            <Text style={styles.dateDay}>{dateInfo.day}</Text>
            <Text style={styles.dateWeekday}>{dateInfo.weekday}</Text>
          </LinearGradient>

          <View style={styles.eventInfo}>
            <View style={styles.eventTitleRow}>
              <View style={styles.titleContainer}>
                <Text style={styles.eventTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <View style={[styles.categoryBadge, { backgroundColor: categoryColor + '20' }]}>
                  <Text style={[styles.categoryText, { color: categoryColor }]}>
                    {item.category?.toUpperCase()}
                  </Text>
                </View>
              </View>
              {canEdit && (
                <View style={styles.eventActions}>
                  <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={() => navigation.navigate('EditEvent', { event: item })}
                  >
                    <MaterialCommunityIcons name="pencil" size={16} color="#5C6BC0" />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={() => handleDeletePress(item)}
                  >
                    <MaterialCommunityIcons name="delete" size={16} color="#EF5350" />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={styles.eventMeta}>
              <View style={styles.metaItem}>
                <MaterialCommunityIcons name="clock-outline" size={15} color="#78909C" />
                <Text style={styles.metaText}>
                  {dateInfo.time} {dateInfo.timezone}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <MaterialCommunityIcons name="map-marker" size={15} color="#78909C" />
                <Text style={styles.metaText} numberOfLines={1}>{item.location}</Text>
              </View>
            </View>

            {status === 'soon' && (
              <View style={styles.soonBadge}>
                <MaterialCommunityIcons name="clock-fast" size={12} color="#FFA726" />
                <Text style={styles.soonText}>Coming Soon</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.eventContent}>
          <Text style={styles.description}>
            {displayDescription || 'No description available'}
          </Text>
          {isLongDescription && (
            <TouchableOpacity onPress={() => toggleExpand(item.id)}>
              <Text style={styles.readMore}>
                {isExpanded ? 'Show less' : 'Read more'}
              </Text>
            </TouchableOpacity>
          )}

          {item.attachments && item.attachments.length > 0 && (
            <View style={styles.attachmentsSection}>
              <View style={styles.sectionHeader}>
                <MaterialCommunityIcons name="paperclip" size={15} color="#5C6BC0" />
                <Text style={styles.sectionTitle}>
                  Attachments ({item.attachments.length})
                </Text>
              </View>
              {item.attachments.map((attachment, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.attachmentCard}
                  onPress={() => openAttachment(attachment)}
                >
                  {attachment.fileType?.startsWith('image/') ? (
                    <Image 
                      source={{ uri: attachment.downloadURL }} 
                      style={styles.attachmentThumbnail}
                    />
                  ) : (
                    <View style={styles.pdfThumbnail}>
                      <MaterialCommunityIcons name="file-pdf-box" size={24} color="#EF5350" />
                    </View>
                  )}
                  <View style={styles.attachmentInfo}>
                    <Text style={styles.attachmentName} numberOfLines={1}>
                      {attachment.fileName}
                    </Text>
                    {attachment.fileSize && (
                      <Text style={styles.attachmentSize}>
                        {formatFileSize(attachment.fileSize)}
                      </Text>
                    )}
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
                <Text style={styles.sectionTitle}>
                  Links ({item.links.length})
                </Text>
              </View>
              {item.links.map((link, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.linkCard}
                  onPress={() => openLink(link)}
                >
                  <MaterialCommunityIcons name="link" size={15} color="#66BB6A" />
                  <Text style={styles.linkText} numberOfLines={1}>
                    {link}
                  </Text>
                  <MaterialCommunityIcons name="open-in-new" size={15} color="#66BB6A" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.attendanceInfo}>
            <View style={styles.attendanceItem}>
              <MaterialCommunityIcons name="account-check" size={16} color="#66BB6A" />
              <Text style={styles.attendanceText}>{item.countYes || 0} Going</Text>
            </View>
            <View style={styles.attendanceItem}>
              <MaterialCommunityIcons name="account-question" size={16} color="#FFA726" />
              <Text style={styles.attendanceText}>{item.countMaybe || 0} Maybe</Text>
            </View>
          </View>
        </View>

        <View style={styles.rsvpSection}>
          <TouchableOpacity 
            style={[
              styles.rsvpButton,
              userRSVP === 'Yes' && styles.rsvpButtonGoing
            ]}
            onPress={() => handleRSVP(item.id, userRSVP, userRSVP === 'Yes' ? null : 'Yes')}
          >
            <MaterialCommunityIcons 
              name={userRSVP === 'Yes' ? 'check-circle' : 'check-circle-outline'} 
              size={18} 
              color={userRSVP === 'Yes' ? '#fff' : '#66BB6A'} 
            />
            <Text style={[styles.rsvpButtonText, userRSVP === 'Yes' && styles.rsvpButtonTextActive]}>
              Going
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.rsvpButton,
              userRSVP === 'Maybe' && styles.rsvpButtonMaybe
            ]}
            onPress={() => handleRSVP(item.id, userRSVP, userRSVP === 'Maybe' ? null : 'Maybe')}
          >
            <MaterialCommunityIcons 
              name={userRSVP === 'Maybe' ? 'help-circle' : 'help-circle-outline'} 
              size={18} 
              color={userRSVP === 'Maybe' ? '#fff' : '#FFA726'} 
            />
            <Text style={[styles.rsvpButtonText, userRSVP === 'Maybe' && styles.rsvpButtonTextActive]}>
              Maybe
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.rsvpButton,
              userRSVP === 'No' && styles.rsvpButtonNo
            ]}
            onPress={() => handleRSVP(item.id, userRSVP, userRSVP === 'No' ? null : 'No')}
          >
            <MaterialCommunityIcons 
              name={userRSVP === 'No' ? 'close-circle' : 'close-circle-outline'} 
              size={18} 
              color={userRSVP === 'No' ? '#fff' : '#EF5350'} 
            />
            <Text style={[styles.rsvpButtonText, userRSVP === 'No' && styles.rsvpButtonTextActive]}>
              Can't Go
            </Text>
          </TouchableOpacity>
        </View>
      </Card>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <MaterialCommunityIcons name="calendar-blank" size={56} color="#CFD8DC" />
      </View>
      <Text style={styles.emptyTitle}>No Events</Text>
      <Text style={styles.emptyText}>
        {filter === 'my-events' 
          ? 'RSVP to events to see them here' 
          : 'Check back soon for upcoming events'}
      </Text>
    </View>
  );

    // ✅ ADD THIS — correct placement, before main return
  if (!organizationId) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#667EEA', '#764BA2']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
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
        <Text style={styles.headerTitle}>Events</Text>
        <View style={styles.statsRow}>
          <Surface style={styles.statCard} elevation={1}>
            <Text style={styles.statNumber}>{upcomingEventsCount}</Text>
            <Text style={styles.statLabel}>Upcoming</Text>
          </Surface>
          <Surface style={styles.statCard} elevation={1}>
            <Text style={styles.statNumber}>{myEventsCount}</Text>
            <Text style={styles.statLabel}>My Events</Text>
          </Surface>
        </View>
      </LinearGradient>

      <View style={styles.filterSection}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          <Chip
            selected={filter === 'upcoming'}
            onPress={() => setFilter('upcoming')}
            style={[styles.filterChip, filter === 'upcoming' && styles.filterChipActive]}
            textStyle={[styles.filterChipText, filter === 'upcoming' && styles.filterChipTextActive]}
            icon="calendar-clock"
          >
            Upcoming
          </Chip>
          <Chip
            selected={filter === 'my-events'}
            onPress={() => setFilter('my-events')}
            style={[styles.filterChip, filter === 'my-events' && styles.filterChipActive]}
            textStyle={[styles.filterChipText, filter === 'my-events' && styles.filterChipTextActive]}
            icon="calendar-check"
          >
            My Events
          </Chip>
          <Chip
            selected={filter === 'past'}
            onPress={() => setFilter('past')}
            style={[styles.filterChip, filter === 'past' && styles.filterChipActive]}
            textStyle={[styles.filterChipText, filter === 'past' && styles.filterChipTextActive]}
            icon="calendar-remove"
          >
            Past
          </Chip>
        </ScrollView>
      </View>

      <FlatList
        data={filteredEvents}
        keyExtractor={(item) => item.id}
        renderItem={renderEvent}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            colors={['#7E57C2']}
            tintColor="#7E57C2"
          />
        }
        showsVerticalScrollIndicator={false}
      />

      {userProfile?.isAdmin && (
        <FAB
          icon="plus"
          label="New Event"
          style={styles.fab}
          color="#fff"
          onPress={() => navigation.navigate('CreateEvent')}
        />
      )}

      <Portal>
        <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)}>
          <Dialog.Title>Delete Event</Dialog.Title>
          <Dialog.Content>
            <Text>
              Are you sure you want to delete "{eventToDelete?.title}"? This action cannot be undone.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)}>Cancel</Button>
            <Button textColor="#EF5350" onPress={confirmDelete}>Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#263238',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#78909C',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  filterSection: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#ECEFF1',
  },
  filterScroll: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterChip: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filterChipActive: {
    backgroundColor: '#7E57C2',
    borderColor: '#7E57C2',
  },
  filterChipText: {
    color: '#78909C',
    fontWeight: '600',
    fontSize: 13,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  eventCard: {
    marginBottom: 14,
    borderRadius: 16,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  eventHeader: {
    flexDirection: 'row',
    padding: 14,
    gap: 14,
  },
  dateBadge: {
    width: 64,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateMonth: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  dateDay: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 28,
  },
  dateWeekday: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '600',
    opacity: 0.9,
    marginTop: 2,
  },
  eventInfo: {
    flex: 1,
  },
  eventTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  titleContainer: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#263238',
    lineHeight: 22,
    marginBottom: 6,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  categoryText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  eventActions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#FAFAFA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventMeta: {
    gap: 5,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 12,
    color: '#78909C',
    fontWeight: '500',
    flex: 1,
  },
  soonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FFF3E0',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  soonText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFA726',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  eventContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: '#546E7A',
    marginBottom: 10,
  },
  readMore: {
    color: '#7E57C2',
    fontWeight: '600',
    fontSize: 13,
    marginTop: 2,
  },
  attachmentsSection: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#263238',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  attachmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 6,
    gap: 8,
    borderWidth: 1,
    borderColor: '#ECEFF1',
  },
  attachmentThumbnail: {
    width: 42,
    height: 42,
    borderRadius: 8,
  },
  pdfThumbnail: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#FFEBEE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentInfo: {
    flex: 1,
  },
  attachmentName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#263238',
    marginBottom: 2,
  },
  attachmentSize: {
    fontSize: 10,
    color: '#78909C',
  },
  linksSection: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  linkText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#66BB6A',
  },
  attendanceInfo: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#ECEFF1',
  },
  attendanceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  attendanceText: {
    fontSize: 12,
    color: '#78909C',
    fontWeight: '600',
  },
  rsvpSection: {
    flexDirection: 'row',
    padding: 10,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: '#ECEFF1',
  },
  rsvpButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    gap: 4,
    backgroundColor: '#fff',
  },
  rsvpButtonGoing: {
    backgroundColor: '#66BB6A',
    borderColor: '#66BB6A',
  },
  rsvpButtonMaybe: {
    backgroundColor: '#FFA726',
    borderColor: '#FFA726',
  },
  rsvpButtonNo: {
    backgroundColor: '#EF5350',
    borderColor: '#EF5350',
  },
  rsvpButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#78909C',
  },
  rsvpButtonTextActive: {
    color: '#fff',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#ECEFF1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#78909C',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    color: '#B0BEC5',
    textAlign: 'center',
    lineHeight: 19,
  },
  fab: {
    position: 'absolute',
    margin: 20,
    right: 0,
    bottom: 0,
    backgroundColor: '#7E57C2',
    borderRadius: 14,
  },
});