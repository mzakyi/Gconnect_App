import React, { useState, useEffect, useContext } from 'react';
import { 
  View, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity,
  Alert,
  RefreshControl 
} from 'react-native';
import { 
  Text, 
  Searchbar,
  Card,
  Avatar,
  Chip,
  IconButton,
  Menu,
  Divider 
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc,
  deleteDoc,
  query,
  orderBy 
} from 'firebase/firestore';
import { db } from '../../../firebase.config';
import { AuthContext } from '../../context/AuthContext';

export default function ManageUsersScreen({ navigation }) {
  const { organizationId } = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [menuVisible, setMenuVisible] = useState({});

  // FIX: Guard against organizationId being undefined on the first render.
  // Without this, the effect fires before context is ready and loadUsers()
  // returns early silently, leaving the screen permanently empty.
  useEffect(() => {
    if (!organizationId) return;
    loadUsers();
  }, [organizationId]);

  useEffect(() => {
    filterUsers();
  }, [searchQuery, users, selectedFilter]);

  const loadUsers = async () => {
    // FIX: Double-check inside the async function too, in case organizationId
    // becomes undefined between the effect firing and the await resolving.
    if (!organizationId) return;

    setLoading(true);
    try {
      const usersCollection = collection(db, 'organizations', organizationId, 'users');
      const usersQuery = query(usersCollection, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(usersQuery);
      const usersData = snapshot.docs.map(doc => ({
        id: doc.id,
        // FIX: Resolve uid the same way as other screens — prefer the stored
        // uid field, fall back to doc.id. This keeps admin operations
        // consistent with auth-based lookups elsewhere in the app.
        uid: doc.data().uid || doc.id,
        ...doc.data(),
      }));
      setUsers(usersData);
    } catch (error) {
      console.error('Error loading users:', error);
      Alert.alert('Error', 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUsers();
    setRefreshing(false);
  };

  const filterUsers = () => {
    let filtered = users;

    if (searchQuery) {
      filtered = filtered.filter(user =>
        `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.studentId?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedFilter === 'admins') {
      filtered = filtered.filter(user => user.isAdmin);
    } else if (selectedFilter === 'active') {
      filtered = filtered.filter(user => !user.isBanned && !user.isAdmin);
    } else if (selectedFilter === 'banned') {
      filtered = filtered.filter(user => user.isBanned);
    }

    setFilteredUsers(filtered);
  };

  const toggleMenu = (userId) => {
    setMenuVisible(prev => ({ ...prev, [userId]: !prev[userId] }));
  };

  const handleMakeAdmin = async (user) => {
    Alert.alert(
      'Make Admin',
      `Are you sure you want to make ${user.firstName} ${user.lastName} an admin?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              const userRef = doc(db, 'organizations', organizationId, 'users', user.id);
              await updateDoc(userRef, { isAdmin: true });
              Alert.alert('Success', 'User is now an admin');
              loadUsers();
            } catch (error) {
              console.error('Error making admin:', error);
              Alert.alert('Error', 'Failed to update user');
            }
          }
        }
      ]
    );
  };

  const handleRemoveAdmin = async (user) => {
    Alert.alert(
      'Remove Admin',
      `Remove admin privileges from ${user.firstName} ${user.lastName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              const userRef = doc(db, 'organizations', organizationId, 'users', user.id);
              await updateDoc(userRef, { isAdmin: false });
              Alert.alert('Success', 'Admin privileges removed');
              loadUsers();
            } catch (error) {
              console.error('Error removing admin:', error);
              Alert.alert('Error', 'Failed to update user');
            }
          }
        }
      ]
    );
  };

  const handleBanUser = async (user) => {
    Alert.alert(
      'Ban User',
      `Are you sure you want to ban ${user.firstName} ${user.lastName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Ban',
          style: 'destructive',
          onPress: async () => {
            try {
              const userRef = doc(db, 'organizations', organizationId, 'users', user.id);
              await updateDoc(userRef, { 
                isBanned: true,
                bannedAt: new Date()
              });
              Alert.alert('Success', 'User has been banned');
              loadUsers();
            } catch (error) {
              console.error('Error banning user:', error);
              Alert.alert('Error', 'Failed to ban user');
            }
          }
        }
      ]
    );
  };

  const handleUnbanUser = async (user) => {
    try {
      const userRef = doc(db, 'organizations', organizationId, 'users', user.id);
      await updateDoc(userRef, { 
        isBanned: false,
        bannedAt: null
      });
      Alert.alert('Success', 'User has been unbanned');
      loadUsers();
    } catch (error) {
      console.error('Error unbanning user:', error);
      Alert.alert('Error', 'Failed to unban user');
    }
  };

  const handleDeleteUser = async (user) => {
    Alert.alert(
      'Delete User',
      `This will permanently delete ${user.firstName} ${user.lastName}. This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const userRef = doc(db, 'organizations', organizationId, 'users', user.id);
              await deleteDoc(userRef);
              Alert.alert('Success', 'User deleted');
              loadUsers();
            } catch (error) {
              console.error('Error deleting user:', error);
              Alert.alert('Error', 'Failed to delete user');
            }
          }
        }
      ]
    );
  };

  const filters = [
    { label: 'All', value: 'all', icon: 'account-multiple' },
    { label: 'Admins', value: 'admins', icon: 'shield-account' },
    { label: 'Active', value: 'active', icon: 'account-check' },
    { label: 'Banned', value: 'banned', icon: 'account-cancel' },
  ];

  const renderUserCard = (user) => (
    <Card key={user.id} style={styles.userCard}>
      <Card.Content>
        <View style={styles.userHeader}>
          <View style={styles.userInfo}>
            <Avatar.Text 
              size={50} 
              label={`${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`}
              style={{ backgroundColor: user.isAdmin ? '#6366F1' : '#2196F3' }}
            />
            <View style={styles.userDetails}>
              <View style={styles.nameRow}>
                <Text variant="titleMedium" style={styles.userName}>
                  {user.firstName} {user.lastName}
                </Text>
                {user.isAdmin && (
                  <Chip 
                    icon="shield-crown" 
                    style={styles.adminChip}
                    textStyle={styles.adminChipText}
                  >
                    Admin
                  </Chip>
                )}
                {user.isBanned && (
                  <Chip 
                    icon="cancel" 
                    style={styles.bannedChip}
                    textStyle={styles.bannedChipText}
                  >
                    Banned
                  </Chip>
                )}
              </View>
              <Text style={styles.userEmail}>{user.email}</Text>
              {user.studentId && (
                <Text style={styles.userStudentId}>ID: {user.studentId}</Text>
              )}
              {user.year && user.major && (
                <Text style={styles.userMeta}>
                  {user.year} • {user.major}
                </Text>
              )}
            </View>
          </View>

          <Menu
            visible={menuVisible[user.id]}
            onDismiss={() => toggleMenu(user.id)}
            anchor={
              <IconButton
                icon="dots-vertical"
                size={24}
                onPress={() => toggleMenu(user.id)}
              />
            }
          >
            <Menu.Item
              leadingIcon="account-details"
              onPress={() => {
                toggleMenu(user.id);
                // Navigate to user details
              }}
              title="View Profile"
            />
            <Divider />
            {!user.isAdmin ? (
              <Menu.Item
                leadingIcon="shield-account"
                onPress={() => {
                  toggleMenu(user.id);
                  handleMakeAdmin(user);
                }}
                title="Make Admin"
              />
            ) : (
              <Menu.Item
                leadingIcon="shield-off"
                onPress={() => {
                  toggleMenu(user.id);
                  handleRemoveAdmin(user);
                }}
                title="Remove Admin"
              />
            )}
            <Divider />
            {!user.isBanned ? (
              <Menu.Item
                leadingIcon="cancel"
                onPress={() => {
                  toggleMenu(user.id);
                  handleBanUser(user);
                }}
                title="Ban User"
                titleStyle={{ color: '#f44336' }}
              />
            ) : (
              <Menu.Item
                leadingIcon="account-check"
                onPress={() => {
                  toggleMenu(user.id);
                  handleUnbanUser(user);
                }}
                title="Unban User"
                titleStyle={{ color: '#4CAF50' }}
              />
            )}
            <Menu.Item
              leadingIcon="delete"
              onPress={() => {
                toggleMenu(user.id);
                handleDeleteUser(user);
              }}
              title="Delete User"
              titleStyle={{ color: '#f44336' }}
            />
          </Menu>
        </View>
      </Card.Content>
    </Card>
  );

  // FIX: Show a loading state while organizationId is not yet available,
  // rather than a crash from attempting Firestore paths with undefined segments.
  if (!organizationId) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.loadingText}>Loading organization...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text variant="headlineSmall" style={styles.headerTitle}>Manage Users</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search users..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
        />
      </View>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {filters.map((filter) => (
          <TouchableOpacity
            key={filter.value}
            onPress={() => setSelectedFilter(filter.value)}
            style={[
              styles.filterChip,
              selectedFilter === filter.value && styles.filterChipActive
            ]}
          >
            <MaterialCommunityIcons 
              name={filter.icon} 
              size={18} 
              color={selectedFilter === filter.value ? '#6366F1' : '#666'} 
            />
            <Text 
              style={[
                styles.filterText,
                selectedFilter === filter.value && styles.filterTextActive
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          Showing {filteredUsers.length} of {users.length} users
        </Text>
      </View>

      <ScrollView 
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {filteredUsers.map(renderUserCard)}
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: '#6366F1',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    color: '#fff',
    fontWeight: 'bold',
  },
  searchContainer: {
    padding: 16,
    backgroundColor: '#fff',
  },
  searchBar: {
    elevation: 0,
    backgroundColor: '#f8f9fa',
  },
  filterScroll: {
    backgroundColor: '#fff',
    paddingVertical: 12,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  filterChipActive: {
    backgroundColor: '#6366F1' + '20',
    borderColor: '#6366F1',
  },
  filterText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#6366F1',
    fontWeight: '600',
  },
  statsBar: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  statsText: {
    fontSize: 14,
    color: '#666',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  userCard: {
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  userInfo: {
    flexDirection: 'row',
    flex: 1,
    gap: 12,
  },
  userDetails: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  userName: {
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  adminChip: {
    height: 24,
    backgroundColor: '#6366F1' + '20',
  },
  adminChipText: {
    fontSize: 11,
    color: '#6366F1',
    fontWeight: '600',
  },
  bannedChip: {
    height: 24,
    backgroundColor: '#f44336' + '20',
  },
  bannedChipText: {
    fontSize: 11,
    color: '#f44336',
    fontWeight: '600',
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  userStudentId: {
    fontSize: 13,
    color: '#999',
    marginBottom: 2,
  },
  userMeta: {
    fontSize: 13,
    color: '#666',
  },
});