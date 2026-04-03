import React, { useState, useEffect, useContext } from 'react';
import { useActiveOrg } from '../../context/ActiveOrgContext';
import { View, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Text, Avatar, Searchbar, Surface } from 'react-native-paper';
import { AuthContext } from '../../context/AuthContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase.config';
import { createPrivateChat } from '../../services/chatService';

export default function NewChatScreen({ navigation }) {
  const { user, userProfile } = useContext(AuthContext);
const { activeOrgId: organizationId } = useActiveOrg(); // ✅ pull organizationId
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (organizationId) loadUsers();
  }, [organizationId]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const usersSnapshot = await getDocs(collection(db, 'organizations', organizationId, 'users')); // ✅ org path
      const usersList = usersSnapshot.docs
        .map(doc => ({
          id: doc.id,
          // FIX: Use the stored uid field (which may differ from doc.id),
          // falling back to doc.id so nothing is ever undefined.
          // The filter below now correctly compares against user.uid.
          uid: doc.data().uid || doc.id,
          ...doc.data(),
        }))
        // FIX: Filter using the resolved uid, not doc.id, so the current
        // user is reliably excluded regardless of how doc IDs are structured.
        .filter(u => u.uid !== user.uid);

      usersList.sort((a, b) => {
        const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
        const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
        return nameA.localeCompare(nameB);
      });

      setUsers(usersList);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectUser = async (otherUser) => {
    try {
      // FIX: Use otherUser.uid (the Firestore auth uid) instead of otherUser.id
      // (the Firestore document id) so the chat participants array uses the same
      // uid format that auth and other screens expect.
      const chatId = await createPrivateChat(user.uid, otherUser.uid, organizationId); // ✅ pass organizationId
      navigation.navigate('PrivateChat', {
        chatId,
        otherUserId: otherUser.uid,
        otherUserName: `${otherUser.firstName} ${otherUser.lastName}`,
        otherUserAvatar: otherUser.profilePicture || null,
      });
    } catch (error) {
      console.error('Error creating chat:', error);
      Alert.alert('Error', 'Failed to start chat. Please try again.');
    }
  };

  const filteredUsers = users.filter(u =>
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.occupation?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderUser = ({ item }) => {
    const isOnline = item.online || false;

    return (
      <TouchableOpacity onPress={() => handleSelectUser(item)}>
        <Surface style={styles.userItem} elevation={1}>
          <View style={styles.avatarContainer}>
            {item.profilePicture ? (
              <Avatar.Image 
                size={56} 
                source={{ uri: item.profilePicture }}
                style={styles.avatar}
              />
            ) : (
              <Avatar.Text 
                size={56} 
                label={`${item.firstName?.[0] || ''}${item.lastName?.[0] || ''}`}
                style={styles.avatar}
              />
            )}
            {isOnline && (
              <View style={styles.onlineDot}>
                <View style={styles.onlineDotInner} />
              </View>
            )}
          </View>

          <View style={styles.userInfo}>
            <Text style={styles.userName}>
              {item.firstName} {item.lastName}
            </Text>
            <View style={styles.statusRow}>
              {isOnline ? (
                <>
                  <MaterialCommunityIcons name="circle" size={10} color="#4CAF50" />
                  <Text style={styles.onlineText}>Online</Text>
                </>
              ) : (
                <Text style={styles.userOccupation} numberOfLines={1}>
                  {item.occupation || 'RTD Alumni'}
                </Text>
              )}
            </View>
          </View>

          <MaterialCommunityIcons name="message-text" size={24} color="#6366F1" />
        </Surface>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <MaterialCommunityIcons name="account-search" size={80} color="#CBD5E1" />
      <Text style={styles.emptyTitle}>No users found</Text>
      <Text style={styles.emptyText}>
        {searchQuery ? 'Try a different search' : 'No alumni available'}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#6366F1', '#4F46E5']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Chat</Text>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{users.length}</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search alumni..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
          iconColor="#6366F1"
          placeholderTextColor="#999"
        />
      </View>

      <FlatList
        data={filteredUsers}
        renderItem={renderUser}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={!loading && renderEmpty}
        showsVerticalScrollIndicator={false}
      />
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
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.5,
    flex: 1,
    marginLeft: 12,
  },
  headerBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 40,
    alignItems: 'center',
  },
  headerBadgeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
  searchBar: {
    elevation: 0,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
  },
  listContent: {
    paddingBottom: 20,
    paddingTop: 8,
    flexGrow: 1,
  },
  userItem: {
    flexDirection: 'row',
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 4,
    backgroundColor: '#fff',
    borderRadius: 16,
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 14,
  },
  avatar: {
    backgroundColor: '#6366F1',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  onlineDotInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  onlineText: {
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '500',
  },
  userOccupation: {
    fontSize: 13,
    color: '#64748B',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
  },
});