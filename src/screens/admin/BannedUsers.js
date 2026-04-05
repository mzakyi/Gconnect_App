import React, { useState, useEffect, useContext } from 'react';
import { View, StyleSheet, FlatList, Alert, RefreshControl, TouchableOpacity } from 'react-native';
import { Text, Card, Avatar, Button, Searchbar, Chip } from 'react-native-paper';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db, storage } from '../../../firebase.config';
import { ref, deleteObject, listAll } from 'firebase/storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';

export default function BannedUsers({ navigation }) {
  const { organizationId } = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (!organizationId) return;

    const usersRef = collection(db, 'organizations', organizationId, 'users');

    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const bannedUsers = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.banned === true || data.isBanned === true) {
          bannedUsers.push({ id: doc.id, ...data });
        }
      });
      setUsers(bannedUsers);
      setFilteredUsers(bannedUsers);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [organizationId]);

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (query.trim() === '') {
      setFilteredUsers(users);
    } else {
      const filtered = users.filter(user =>
        `${user.firstName} ${user.lastName}`.toLowerCase().includes(query.toLowerCase()) ||
        user.email.toLowerCase().includes(query.toLowerCase())
      );
      setFilteredUsers(filtered);
    }
  };

  const handleUnbanUser = async (userId, userName) => {
    if (!organizationId) return;

    Alert.alert(
      'Unban User',
      `Are you sure you want to unban ${userName}? They will be able to log in immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unban',
          onPress: async () => {
            try {
              const userRef = doc(db, 'organizations', organizationId, 'users', userId);
              await updateDoc(userRef, {
                banned: false,
                isBanned: false,
                bannedAt: null,
                unbannedAt: new Date().toISOString(),
              });
              Alert.alert('Success', `${userName} has been unbanned and can now log in`);
            } catch (error) {
              Alert.alert('Error', 'Failed to unban user');
              console.error(error);
            }
          },
        },
      ]
    );
  };

  const handleDeleteUser = (userId, userName) => {
    if (!organizationId) return;

    Alert.alert(
      'Delete User',
      `This will permanently delete ${userName} and remove all of their data from the app. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => confirmDeleteUser(userId, userName),
        },
      ]
    );
  };

  const confirmDeleteUser = async (userId, userName) => {
    setDeletingId(userId);
    try {
      const batch = writeBatch(db);

      // Remove user's posts
      const postsQuery = query(
        collection(db, 'organizations', organizationId, 'posts'),
        where('userId', '==', userId)
      );
      const postsSnapshot = await getDocs(postsQuery);
      postsSnapshot.forEach((postDoc) => batch.delete(postDoc.ref));

      // Remove user's comments from other posts
      const allPostsSnapshot = await getDocs(
        collection(db, 'organizations', organizationId, 'posts')
      );
      allPostsSnapshot.forEach((postDoc) => {
        const data = postDoc.data();
        if (data.comments?.length > 0) {
          const updatedComments = data.comments.filter((c) => c.userId !== userId);
          if (updatedComments.length !== data.comments.length) {
            batch.update(postDoc.ref, {
              comments: updatedComments,
              commentCount: updatedComments.length,
            });
          }
        }
      });

      // Remove user's stories
      const storiesQuery = query(
        collection(db, 'organizations', organizationId, 'stories'),
        where('userId', '==', userId)
      );
      const storiesSnapshot = await getDocs(storiesQuery);
      storiesSnapshot.forEach((storyDoc) => batch.delete(storyDoc.ref));

      // Remove user's private chats and messages
      const chatsQuery = query(
        collection(db, 'organizations', organizationId, 'privateChats'),
        where('participants', 'array-contains', userId)
      );
      const chatsSnapshot = await getDocs(chatsQuery);
      for (const chatDoc of chatsSnapshot.docs) {
        const messagesSnapshot = await getDocs(
          collection(db, 'organizations', organizationId, 'privateChats', chatDoc.id, 'messages')
        );
        messagesSnapshot.forEach((msgDoc) => batch.delete(msgDoc.ref));
        batch.delete(chatDoc.ref);
      }

      // Remove org-level user doc
      const orgUserRef = doc(db, 'organizations', organizationId, 'users', userId);
      batch.delete(orgUserRef);

      // Remove top-level user doc
      const topUserRef = doc(db, 'users', userId);
      batch.delete(topUserRef);

      await batch.commit();

      // Clean up Storage files
      try {
        const folders = ['profile_pictures', 'chat-media', 'stories', 'post-media'];
        for (const folder of folders) {
          try {
            const folderRef = ref(storage, folder);
            const fileList = await listAll(folderRef);
            for (const item of fileList.items) {
              if (item.name.includes(userId)) await deleteObject(item);
            }
          } catch (e) {
            console.log(`Storage cleanup skipped for ${folder}:`, e);
          }
        }
      } catch (storageError) {
        console.log('Storage cleanup error (non-critical):', storageError);
      }

      Alert.alert('User Deleted', `${userName} and all their data have been permanently removed.`);
    } catch (error) {
      console.error('Error deleting user:', error);
      Alert.alert('Error', `Failed to delete user: ${error.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  const renderUser = ({ item }) => {
    const isDeleting = deletingId === item.id;
    const fullName = `${item.firstName} ${item.lastName}`;

    return (
      <Card style={styles.userCard}>
        <Card.Content>
          <View style={styles.userHeader}>
            <Avatar.Text
              size={50}
              label={`${item.firstName?.[0] || '?'}${item.lastName?.[0] || '?'}`}
              style={styles.avatar}
            />
            <View style={styles.userInfo}>
              <Text variant="titleMedium" style={styles.userName}>{fullName}</Text>
              <Text variant="bodySmall" style={styles.userEmail}>{item.email}</Text>
              {item.location && (
                <View style={styles.locationRow}>
                  <MaterialCommunityIcons name="map-marker" size={14} color="#666" />
                  <Text variant="bodySmall" style={styles.locationText}>{item.location}</Text>
                </View>
              )}
              {item.bannedAt && (
                <Text variant="bodySmall" style={styles.bannedAt}>
                  Banned: {new Date(item.bannedAt).toLocaleDateString()}
                </Text>
              )}
            </View>
            <Chip style={styles.bannedChip} textStyle={styles.chipText}>
              Banned
            </Chip>
          </View>

          {item.occupation && (
            <View style={styles.infoSection}>
              <Text variant="bodySmall" style={styles.infoLabel}>Occupation:</Text>
              <Text variant="bodySmall" style={styles.infoText}>{item.occupation}</Text>
            </View>
          )}

          {item.bio && (
            <View style={styles.infoSection}>
              <Text variant="bodySmall" style={styles.infoLabel}>Bio:</Text>
              <Text variant="bodySmall" style={styles.bio} numberOfLines={2}>{item.bio}</Text>
            </View>
          )}

          {/* Two action buttons side by side */}
          <View style={styles.actions}>
            <Button
              mode="contained"
              onPress={() => handleUnbanUser(item.id, fullName)}
              style={styles.unbanButton}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
              icon="account-check"
              disabled={isDeleting}
            >
              Unban
            </Button>
            <Button
              mode="contained"
              onPress={() => handleDeleteUser(item.id, fullName)}
              style={styles.deleteButton}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
              icon="account-remove"
              loading={isDeleting}
              disabled={isDeleting}
              buttonColor="#f44336"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </View>
        </Card.Content>
      </Card>
    );
  };

  if (!organizationId) {
    return (
      <View style={styles.container}>
        <Text>Loading organization...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Searchbar
        placeholder="Search banned users..."
        onChangeText={handleSearch}
        value={searchQuery}
        style={styles.searchBar}
      />

      <View style={styles.statsRow}>
        <MaterialCommunityIcons name="account-cancel" size={20} color="#f44336" />
        <Text style={styles.statsText}>{filteredUsers.length} banned user(s)</Text>
      </View>

      {filteredUsers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="account-check" size={80} color="#ccc" />
          <Text variant="titleMedium" style={styles.emptyTitle}>No Banned Users</Text>
          <Text variant="bodyMedium" style={styles.emptyText}>
            {searchQuery ? 'No banned users match your search' : 'No users are currently banned'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          renderItem={renderUser}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  searchBar: {
    margin: 15,
    elevation: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
    gap: 8,
  },
  statsText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  listContent: {
    padding: 15,
  },
  userCard: {
    marginBottom: 15,
    backgroundColor: '#fff',
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 15,
  },
  avatar: {
    backgroundColor: '#f44336',
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  userEmail: {
    color: '#666',
    marginTop: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  locationText: {
    color: '#666',
  },
  bannedAt: {
    color: '#f44336',
    marginTop: 4,
    fontSize: 12,
    fontStyle: 'italic',
  },
  bannedChip: {
    backgroundColor: '#FDECEA',
    height: 28,
  },
  chipText: {
    color: '#f44336',
    fontSize: 12,
  },
  infoSection: {
    marginBottom: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  infoLabel: {
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  infoText: {
    color: '#666',
  },
  bio: {
    color: '#666',
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 15,
  },
  unbanButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
  },
  deleteButton: {
    flex: 1,
  },
  buttonContent: {
    paddingVertical: 2,
  },
  buttonLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    marginTop: 20,
    fontWeight: 'bold',
    color: '#666',
  },
  emptyText: {
    marginTop: 10,
    color: '#999',
    textAlign: 'center',
  },
});