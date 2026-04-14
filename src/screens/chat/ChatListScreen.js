import React, { useState, useEffect, useContext } from 'react';
import { useActiveOrg } from '../../context/ActiveOrgContext';
import { View, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Text, Avatar, Surface, Searchbar, FAB, Badge, Menu, IconButton } from 'react-native-paper';
import { AuthContext } from '../../context/AuthContext';
import { useBadges } from '../../context/BadgeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  subscribeToPrivateChats, 
  subscribeToUserGroupChats, 
  muteChat,
  unmuteChat,
  muteGroupChat,
  unmuteGroupChat,
  clearChatHistory,
  deletePrivateChat,
  hideChatForUser 
} from '../../services/chatService';

// Returns a human-readable label for how long a mute lasts
const getMuteLabel = (mutedUntil) => {
  if (!mutedUntil) return null;
  if (mutedUntil === 'forever') return 'Muted';
  const remaining = new Date(mutedUntil).getTime() - Date.now();
  if (remaining <= 0) return null;
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  if (hours < 1) return 'Muted';
  if (hours < 24) return `Muted ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Muted ${days}d`;
};

export default function ChatListScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const { activeOrgId: organizationId } = useActiveOrg();
  const { dismissMessagePreview } = useBadges();
  const [searchQuery, setSearchQuery] = useState('');
  const [privateChats, setPrivateChats] = useState([]);
  const [groupChats, setGroupChats] = useState([]);
  const [menuVisible, setMenuVisible] = useState({});

useEffect(() => {
    if (!user?.uid || !organizationId) return;

    let unsubscribe;
    let unsubscribeGroups;

    try {
      unsubscribe = subscribeToPrivateChats(user.uid, setPrivateChats, organizationId);
    } catch (e) {
      if (e.code !== 'permission-denied') console.warn('ChatList private chats error:', e.message);
    }

    try {
      unsubscribeGroups = subscribeToUserGroupChats(user.uid, setGroupChats, organizationId);
    } catch (e) {
      if (e.code !== 'permission-denied') console.warn('ChatList group chats error:', e.message);
    }

    return () => {
      if (unsubscribe) unsubscribe();
      if (unsubscribeGroups) unsubscribeGroups();
      setPrivateChats([]);
      setGroupChats([]);
    };
  }, [user?.uid, organizationId]);

  // Re-check mute expiry every minute so labels update automatically
  useEffect(() => {
    const interval = setInterval(() => {
      setPrivateChats(prev => [...prev]);
      setGroupChats(prev => [...prev]);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const toggleMenu = (chatId) =>
    setMenuVisible(prev => ({ ...prev, [chatId]: !prev[chatId] }));

  const handleMuteChat = (chat) => {
    const isGroup = chat.isGroup;
    const isMuted = chat.isMuted;

    if (isMuted) {
      // Already muted — offer to unmute
      Alert.alert('Unmute notifications', `Unmute this ${isGroup ? 'group' : 'chat'}?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unmute',
          onPress: () => {
            if (isGroup) {
              unmuteGroupChat(chat.id, user.uid, organizationId);
            } else {
              unmuteChat(chat.id, user.uid, organizationId);
            }
          }
        }
      ]);
    } else {
      Alert.alert(
        'Mute notifications',
        'For how long?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: '8 hours',
            onPress: () => isGroup
              ? muteGroupChat(chat.id, user.uid, 8 * 60 * 60 * 1000, organizationId)
              : muteChat(chat.id, user.uid, 8 * 60 * 60 * 1000, organizationId)
          },
          {
            text: '1 week',
            onPress: () => isGroup
              ? muteGroupChat(chat.id, user.uid, 7 * 24 * 60 * 60 * 1000, organizationId)
              : muteChat(chat.id, user.uid, 7 * 24 * 60 * 60 * 1000, organizationId)
          },
          {
            text: 'Always',
            onPress: () => isGroup
              ? muteGroupChat(chat.id, user.uid, 'forever', organizationId)
              : muteChat(chat.id, user.uid, 'forever', organizationId)
          }
        ]
      );
    }
    toggleMenu(chat.id);
  };

  const handleClearChat = (chatId) => {
    Alert.alert(
      'Clear chat',
      'Are you sure you want to clear this chat? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearChatHistory(chatId, user.uid, organizationId, false);
              Alert.alert('Success', 'Chat cleared');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear chat');
            }
            toggleMenu(chatId);
          }
        }
      ]
    );
  };

  const handleDeleteChat = (chatId) => {
    Alert.alert(
      'Delete Chat',
      'This will only remove it from your device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await hideChatForUser(chatId, user.uid, organizationId);
              toggleMenu(chatId);
            } catch (error) {
              Alert.alert('Error', 'Failed to delete chat');
            }
          }
        }
      ]
    );
  };

  const renderChatItem = ({ item }) => {
    const isGroupChat = item.isGroup;
    const muteLabel = getMuteLabel(item.mutedUntil);
    // Auto-clear expired mute label
    const effectiveMuteLabel = item.isMuted ? muteLabel : null;

    return (
      <TouchableOpacity
        onPress={() => {
          if (isGroupChat) {
            dismissMessagePreview(item.id);
            navigation.navigate('GroupChatScreen', {
              groupId: item.id,
              groupName: item.name,
              groupImage: item.image
            });
          } else {
            dismissMessagePreview(item.id);
            navigation.navigate('PrivateChat', {
              chatId: item.id,
              otherUserId: item.otherUserId,
              otherUserName: item.otherUserName,
              otherUserAvatar: item.otherUserAvatar
            });
          }
        }}
        onLongPress={() => toggleMenu(item.id)}
      >
        <Surface style={styles.chatItem} elevation={1}>
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            {isGroupChat ? (
              item.image ? (
                <Avatar.Image size={56} source={{ uri: item.image }} style={styles.avatar} />
              ) : (
                <LinearGradient colors={['#4CAF50', '#388E3C']} style={styles.gradientAvatar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <MaterialCommunityIcons name="account-group" size={28} color="#fff" />
                </LinearGradient>
              )
            ) : item.otherUserAvatar ? (
              <Avatar.Image size={56} source={{ uri: item.otherUserAvatar }} style={styles.avatar} />
            ) : (
              <Avatar.Text
                size={56}
                label={item.otherUserName?.split(' ').map(n => n[0]).join('') || 'U'}
                style={styles.avatar}
              />
            )}
            {item.unreadCount > 0 && (
              <Badge style={styles.unreadBadge} size={22}>
                {item.unreadCount > 99 ? '99+' : item.unreadCount}
              </Badge>
            )}
          </View>

          {/* Chat info */}
          <View style={styles.chatInfo}>
            <View style={styles.chatHeader}>
              <View style={styles.chatNameRow}>
                <Text style={styles.chatName} numberOfLines={1}>
                  {isGroupChat ? item.name : item.otherUserName}
                </Text>
                {/* 🔇 Mute badge */}
                {effectiveMuteLabel && (
                  <View style={styles.muteBadge}>
                    <MaterialCommunityIcons name="bell-off" size={11} color="#fff" />
                    <Text style={styles.muteBadgeText}>{effectiveMuteLabel}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.chatTime}>
                {item.lastMessageTime ? formatTime(item.lastMessageTime) : ''}
              </Text>
            </View>
            <View style={styles.lastMessageContainer}>
              <Text
                style={[styles.lastMessage, item.unreadCount > 0 && styles.unreadMessage]}
                numberOfLines={1}
              >
                {item.lastMessage && item.lastMessage !== '__deleted__'
                  ? item.lastMessage
                  : 'No messages yet'}
              </Text>
              {item.unreadCount === 0 && !isGroupChat && (
                <MaterialCommunityIcons name="check-all" size={16} color="#4FC3F7" />
              )}
            </View>
          </View>

          {/* Long-press context menu */}
          <Menu
            visible={menuVisible[item.id]}
            onDismiss={() => toggleMenu(item.id)}
            anchor={
              <TouchableOpacity style={styles.menuButton} onPress={() => toggleMenu(item.id)}>
                <MaterialCommunityIcons name="chevron-down" size={20} color="#999" />
              </TouchableOpacity>
            }
          >
            <Menu.Item
              onPress={() => handleMuteChat(item)}
              title={item.isMuted ? 'Unmute' : 'Mute'}
              leadingIcon={item.isMuted ? 'bell' : 'bell-off'}
            />
            {!isGroupChat && (
              <>
                <Menu.Item
                  onPress={() => handleClearChat(item.id)}
                  title="Clear chat"
                  leadingIcon="delete-sweep"
                />
                <Menu.Item
                  onPress={() => handleDeleteChat(item.id)}
                  title="Delete chat"
                  leadingIcon="delete"
                />
                <Menu.Item
                  onPress={() => {
                    toggleMenu(item.id);
                    navigation.navigate('ChatInfo', {
                      chatId: item.id,
                      otherUserId: item.otherUserId,
                      otherUserName: item.otherUserName
                    });
                  }}
                  title="Chat info"
                  leadingIcon="information"
                />
              </>
            )}
            {isGroupChat && (
              <Menu.Item
                onPress={() => {
                  toggleMenu(item.id);
                  navigation.navigate('GroupInfo', { groupId: item.id, groupName: item.name });
                }}
                title="Group info"
                leadingIcon="information"
              />
            )}
          </Menu>
        </Surface>
      </TouchableOpacity>
    );
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    if (diff < 86400000) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    if (diff < 604800000) return date.toLocaleDateString('en-US', { weekday: 'short' });
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const allChats = [...privateChats, ...groupChats].sort((a, b) => {
    const timeA = a.lastMessageTime?.toDate?.() || new Date(a.lastMessageTime || 0);
    const timeB = b.lastMessageTime?.toDate?.() || new Date(b.lastMessageTime || 0);
    return timeB - timeA;
  });

  const filteredChats = allChats.filter(chat => {
    const name = chat.isGroup ? chat.name : chat.otherUserName;
    return name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#6366F1', '#4F46E5']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Chats</Text>
          <View style={styles.headerActions}>
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{allChats.length}</Text>
            </View>
            <IconButton
              icon="account-group-outline"
              iconColor="#fff"
              size={24}
              onPress={() => navigation.navigate('CreateGroup')}
            />
          </View>
        </View>
      </LinearGradient>

      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search chats..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
          iconColor="#6366F1"
          placeholderTextColor="#999"
        />
      </View>

      <FlatList
        data={filteredChats}
        renderItem={renderChatItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <FAB
        icon="message-plus"
        style={styles.fab}
        onPress={() => navigation.navigate('NewChat')}
        color="#fff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 8,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 32, fontWeight: '700', color: '#fff', letterSpacing: -0.5 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerBadge: {
    backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 15,
    paddingHorizontal: 12, paddingVertical: 6, minWidth: 40, alignItems: 'center',
  },
  headerBadgeText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  searchContainer: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, backgroundColor: '#fff' },
  searchBar: { elevation: 0, borderRadius: 12, backgroundColor: '#F8FAFC' },
  listContent: { paddingBottom: 100, paddingTop: 8 },
  chatItem: {
    flexDirection: 'row', padding: 16,
    marginHorizontal: 16, marginVertical: 4,
    backgroundColor: '#fff', borderRadius: 16, alignItems: 'center',
  },
  avatarContainer: { position: 'relative', marginRight: 14 },
  avatar: { backgroundColor: '#6366F1' },
  gradientAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  unreadBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#6366F1', color: '#fff' },
  chatInfo: { flex: 1 },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, alignItems: 'flex-start' },
  chatNameRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginRight: 8 },
  chatName: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  // 🔇 Mute badge pill
  muteBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#94A3B8', paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 10,
  },
  muteBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  chatTime: { fontSize: 12, color: '#94A3B8' },
  lastMessageContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lastMessage: { fontSize: 14, color: '#64748B', flex: 1 },
  unreadMessage: { fontWeight: '600', color: '#1E293B' },
  menuButton: { padding: 4 },
  fab: {
    position: 'absolute', margin: 20, right: 0, bottom: 0,
    backgroundColor: '#6366F1', borderRadius: 16,
  },
});