import React, { useState, useEffect, useContext } from 'react';
import { useActiveOrg } from '../../context/ActiveOrgContext';
import { View, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { Text, Card, Avatar, Searchbar, Chip, Menu, Divider } from 'react-native-paper';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase.config';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';

export default function UsersList({ navigation }) {
  const { userProfile } = useContext(AuthContext);
  const { activeOrgId: organizationId } = useActiveOrg();

  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [menuVisible, setMenuVisible] = useState({});

  const isCurrentUserAdmin = userProfile?.isAdmin;

  useEffect(() => {
    if (!organizationId) return;

    // ⭐ NEW: Query organization-specific users
    const usersRef = collection(db, 'organizations', organizationId, 'users');
    const q = query(usersRef, where('status', '==', 'approved'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const approvedUsers = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        // ONLY filter out users who are currently banned
        // Include all approved users who are NOT banned
        if (data.banned !== true && data.isBanned !== true) {
          approvedUsers.push({ id: doc.id, ...data });
        }
      });
      
      // Sort to show admins first, then alphabetically
      approvedUsers.sort((a, b) => {
        if (a.isAdmin && !b.isAdmin) return -1;
        if (!a.isAdmin && b.isAdmin) return 1;
        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
      });
      
      setUsers(approvedUsers);
      setFilteredUsers(approvedUsers);
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

  const handleBanUser = (userId, userName) => {
    if (!organizationId) return;

    Alert.alert(
      'Ban User',
      `Are you sure you want to ban ${userName}? They will lose access immediately and disappear from this list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Ban',
          style: 'destructive',
          onPress: async () => {
            try {
              // ⭐ NEW: Update in organization path
              const userRef = doc(db, 'organizations', organizationId, 'users', userId);
              await updateDoc(userRef, {
                banned: true,
                isBanned: true,
                bannedAt: new Date().toISOString()
              });
              Alert.alert('Success', `${userName} has been banned and removed from the users list`);
            } catch (error) {
              Alert.alert('Error', 'Failed to ban user');
              console.error(error);
            }
          }
        }
      ]
    );
  };

  const handleMakeAdmin = (userId, userName) => {
    Alert.alert(
      'Make Admin',
      `Make ${userName} an admin? They will be able to approve members, create events, and manage the group.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Make Admin',
          onPress: async () => {
            try {
              const userRef = doc(db, 'organizations', organizationId, 'users', userId);
              await updateDoc(userRef, { isAdmin: true });
              Alert.alert('Done', `${userName} is now an admin`);
            } catch (error) {
              Alert.alert('Error', 'Failed to update user');
              console.error(error);
            }
          },
        },
      ]
    );
  };

  const handleRemoveAdmin = (userId, userName) => {
    Alert.alert(
      'Remove Admin',
      `Remove admin privileges from ${userName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const userRef = doc(db, 'organizations', organizationId, 'users', userId);
              await updateDoc(userRef, { isAdmin: false });
              Alert.alert('Done', `${userName} is no longer an admin`);
            } catch (error) {
              Alert.alert('Error', 'Failed to update user');
              console.error(error);
            }
          },
        },
      ]
    );
  };

  const toggleMenu = (userId) => {
    setMenuVisible(prev => ({ ...prev, [userId]: !prev[userId] }));
  };

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

const renderUser = ({ item }) => (
    <Card style={styles.userCard}>
      <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userId: item.id })}>
        <Card.Content>
          <View style={styles.userHeader}>
            <Avatar.Text 
              size={50} 
              label={`${item.firstName?.[0]}${item.lastName?.[0]}`}
              style={[styles.avatar, item.isAdmin && styles.adminAvatar]}
            />
            <View style={styles.userInfo}>
              <View style={styles.nameRow}>
                <Text variant="titleMedium" style={styles.userName}>
                  {item.firstName} {item.lastName}
                </Text>
                {item.isAdmin && (
                  <Chip 
                    icon="shield-crown" 
                    style={styles.adminChip}
                    textStyle={styles.adminChipText}
                    compact
                  >
                    Admin
                  </Chip>
                )}
              </View>
              <Text variant="bodySmall" style={styles.userEmail}>{item.email}</Text>
              {item.location && (
                <View style={styles.locationRow}>
                  <MaterialCommunityIcons name="map-marker" size={14} color="#666" />
                  <Text variant="bodySmall" style={styles.locationText}>{item.location}</Text>
                </View>
              )}
              {item.occupation && (
                <Text variant="bodySmall" style={styles.occupation}>
                  {item.occupation}
                </Text>
              )}
            </View>
            
            <Menu
              visible={menuVisible[item.id]}
              onDismiss={() => toggleMenu(item.id)}
              anchor={
                <TouchableOpacity onPress={() => toggleMenu(item.id)}>
                  <MaterialCommunityIcons name="dots-vertical" size={24} color="#666" />
                </TouchableOpacity>
              }
            >
              <Menu.Item 
                onPress={() => {
                  toggleMenu(item.id);
                  navigation.navigate('UserProfile', { userId: item.id });
                }} 
                title="View Profile"
                leadingIcon="account"
              />

              {/* Make Admin / Remove Admin — only visible to admins */}
              {isCurrentUserAdmin && (
                <>
                  <Divider />
                  {!item.isAdmin ? (
                    <Menu.Item 
                      onPress={() => {
                        toggleMenu(item.id);
                        handleMakeAdmin(item.id, `${item.firstName} ${item.lastName}`);
                      }} 
                      title="Make Admin"
                      leadingIcon="shield-crown"
                      titleStyle={{ color: '#6366F1' }}
                    />
                  ) : (
                    <Menu.Item 
                      onPress={() => {
                        toggleMenu(item.id);
                        handleRemoveAdmin(item.id, `${item.firstName} ${item.lastName}`);
                      }} 
                      title="Remove Admin"
                      leadingIcon="shield-off"
                      titleStyle={{ color: '#FF9800' }}
                    />
                  )}
                </>
              )}

              {/* Ban — only visible to admins */}
              {isCurrentUserAdmin && (
                <>
                  <Divider />
                  <Menu.Item 
                    onPress={() => {
                      toggleMenu(item.id);
                      handleBanUser(item.id, `${item.firstName} ${item.lastName}`);
                    }} 
                    title="Ban User"
                    leadingIcon="cancel"
                    titleStyle={{ color: '#f44336' }}
                  />
                </>
              )}
            </Menu>
          </View>
        </Card.Content>
      </TouchableOpacity>
    </Card>
  );

  // ⭐ NEW: Show loading if no orgId
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
        placeholder="Search users..."
        onChangeText={handleSearch}
        value={searchQuery}
        style={styles.searchBar}
      />

      <View style={styles.statsRow}>
        <MaterialCommunityIcons name="account-check" size={20} color="#4CAF50" />
        <Text style={styles.statsText}>
          {filteredUsers.length} approved user(s) • {filteredUsers.filter(u => u.isAdmin).length} admin(s)
        </Text>
      </View>

      {filteredUsers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="account-search" size={80} color="#ccc" />
          <Text variant="titleMedium" style={styles.emptyTitle}>No Users Found</Text>
          <Text variant="bodyMedium" style={styles.emptyText}>
            {searchQuery ? 'Try a different search term' : 'No approved users yet'}
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
  },
  avatar: {
    backgroundColor: '#6366F1',
  },
  adminAvatar: {
    backgroundColor: '#FF9800',
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 1,
  },
  userName: {
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  adminChip: {
    backgroundColor: '#FF9800' + '20',
    height: 26,
    paddingHorizontal: 4,
  },
  adminChipText: {
    color: '#FF9800',
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 14,
    marginVertical: 0,
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
  occupation: {
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
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