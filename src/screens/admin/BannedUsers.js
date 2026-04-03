import React, { useState, useEffect, useContext } from 'react';
import { View, StyleSheet, FlatList, Alert, RefreshControl, TouchableOpacity } from 'react-native';
import { Text, Card, Avatar, Button, Searchbar, Chip } from 'react-native-paper';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase.config';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext'; // ⭐ NEW

export default function BannedUsers({ navigation }) {
  const { organizationId } = useContext(AuthContext); // ⭐ NEW
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!organizationId) return;

    // ⭐ NEW: Query organization-specific users
    const usersRef = collection(db, 'organizations', organizationId, 'users');
    
    // Listen to all users and filter banned ones in real-time
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const bannedUsers = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        // Include users who are banned (either field)
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
              // ⭐ NEW: Update in organization path
              const userRef = doc(db, 'organizations', organizationId, 'users', userId);
              await updateDoc(userRef, {
                banned: false,
                isBanned: false,
                bannedAt: null,
                unbannedAt: new Date().toISOString()
              });
              Alert.alert('Success', `${userName} has been unbanned and can now log in`);
            } catch (error) {
              Alert.alert('Error', 'Failed to unban user');
              console.error(error);
            }
          }
        }
      ]
    );
  };

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  const renderUser = ({ item }) => (
    <Card style={styles.userCard}>
      <Card.Content>
        <View style={styles.userHeader}>
          <Avatar.Text 
            size={50} 
            label={`${item.firstName?.[0] || '?'}${item.lastName?.[0] || '?'}`}
            style={styles.avatar}
          />
          <View style={styles.userInfo}>
            <Text variant="titleMedium" style={styles.userName}>
              {item.firstName} {item.lastName}
            </Text>
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
            <Text variant="bodySmall" style={styles.bio} numberOfLines={2}>
              {item.bio}
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <Button 
            mode="contained" 
            onPress={() => handleUnbanUser(item.id, `${item.firstName} ${item.lastName}`)}
            style={styles.unbanButton}
            icon="account-check"
          >
            Unban User
          </Button>
        </View>
      </Card.Content>
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
    marginTop: 15,
  },
  unbanButton: {
    backgroundColor: '#4CAF50',
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