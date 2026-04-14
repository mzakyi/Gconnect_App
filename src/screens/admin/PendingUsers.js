import React, { useState, useEffect, useContext } from 'react';
import { View, StyleSheet, FlatList, Alert, RefreshControl } from 'react-native';
import { Text, Card, Avatar, Button, Searchbar, Chip } from 'react-native-paper';
import { collection, query, where, doc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase.config';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';


export default function PendingUsers({ navigation }) {
 const { organizationId, userProfile } = useContext(AuthContext);


  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!organizationId || !userProfile?.isAdmin) return;

    const usersRef = collection(db, 'organizations', organizationId, 'users');
    const q = query(usersRef, where('status', '==', 'pending'));
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const pendingUsers = [];
        snapshot.forEach(doc => {
          pendingUsers.push({ id: doc.id, ...doc.data() });
        });
        setUsers(pendingUsers);
        setFilteredUsers(pendingUsers);
        setLoading(false);
      },
      (error) => { // ⭐ NEW error callback
        if (error.code !== 'permission-denied') {
          console.warn('PendingUsers listener error:', error.message);
        }
        setLoading(false);
      }
    );

    return () => unsubscribe();
    }, [organizationId, userProfile?.isAdmin]);

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

  const handleApprove = async (userId, userName) => {
    if (!organizationId) return;

    Alert.alert(
      'Approve User',
      `Are you sure you want to approve ${userName}? They will be able to log in immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            try {
              const userRef = doc(db, 'organizations', organizationId, 'users', userId);
              await updateDoc(userRef, { status: 'approved', approvedAt: new Date().toISOString() });

              const topLevelRef = doc(db, 'users', userId);
              await updateDoc(topLevelRef, { status: 'approved' });

              Alert.alert('Success', `${userName} has been approved and can now log in`);
            } catch (error) {
              Alert.alert('Error', 'Failed to approve user');
              console.error(error);
            }
          }
        }
      ]
    );
  };

  const handleReject = async (userId, userName) => {
    if (!organizationId) return;

    Alert.alert(
      'Reject User',
      `Are you sure you want to reject ${userName}? This will delete their account permanently.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              const userRef = doc(db, 'organizations', organizationId, 'users', userId);
              await deleteDoc(userRef);

              const topLevelRef = doc(db, 'users', userId);
              await updateDoc(topLevelRef, { status: 'rejected' });

              Alert.alert('Success', `${userName}'s account has been rejected`);
            } catch (error) {
              Alert.alert('Error', 'Failed to reject user');
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
          {item.age && (
            <Text variant="bodySmall" style={styles.userAge}>Age: {item.age}</Text>
          )}
        </View>
        <Chip style={styles.pendingChip} textStyle={styles.chipText}>
          Pending
        </Chip>
      </View>

      {/* ✅ ADD THESE BUTTONS */}
      <View style={styles.actions}>
        <Button
          mode="contained"
          style={styles.approveButton}
          onPress={() => handleApprove(item.id, `${item.firstName} ${item.lastName}`)}
        >
          Approve
        </Button>
        <Button
          mode="outlined"
          style={styles.rejectButton}
          textColor="#f44336"
          onPress={() => handleReject(item.id, `${item.firstName} ${item.lastName}`)}
        >
          Reject
        </Button>
      </View>
    </Card.Content>
  </Card>
);

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
        placeholder="Search pending users..."
        onChangeText={handleSearch}
        value={searchQuery}
        style={styles.searchBar}
      />

      {filteredUsers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="account-check" size={80} color="#ccc" />
          <Text variant="titleMedium" style={styles.emptyTitle}>No Pending Users</Text>
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

// styles remain unchanged...

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
    backgroundColor: '#6366F1',
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
  userAge: {
    color: '#666',
    marginTop: 2,
  },
  pendingChip: {
    backgroundColor: '#FFF3E0',
    height: 28,
  },
  chipText: {
    color: '#FF9800',
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
  createdAt: {
    color: '#999',
    fontSize: 12,
    marginTop: 10,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 15,
  },
  approveButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    flex: 1,
    borderColor: '#f44336',
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