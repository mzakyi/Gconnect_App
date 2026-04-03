// components/MembersChip.js
import React, { useEffect, useState } from 'react';
import { useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { View, ScrollView, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Avatar, Chip, Text, ActivityIndicator } from 'react-native-paper';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase.config';

export default function MembersChip({ navigation }) {
  const { organizationId } = useContext(AuthContext);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const usersCol = collection(db, 'organizations', organizationId, 'users')
;
      const snapshot = await getDocs(usersCol);
      const usersList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      setMembers(usersList);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#6366F1" />
        <Text style={{ marginLeft: 8 }}>Loading members...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContainer}
    >
      {members.map((user) => {
        const isAdmin = !!user.isAdmin;
        const isBanned = !!user.banned || !!user.isBanned;
        const avatarLabel = (user.firstName?.[0] || '') + (user.lastName?.[0] || '?');

        return (
          <TouchableOpacity
            key={user.id}
            style={styles.memberContainer}
            onPress={() => navigation.navigate('UserProfile', { userId: user.id })}
          >
            {user.profilePicture ? (
              <Image source={{ uri: user.profilePicture }} style={styles.avatar} />
            ) : (
              <Avatar.Text
                size={60}
                label={avatarLabel}
                style={[
                  styles.avatar,
                  isAdmin && styles.adminAvatar,
                  isBanned && styles.bannedAvatar,
                ]}
              />
            )}
            <Text numberOfLines={1} style={styles.nameText}>
              {user.firstName} {user.lastName || ''}
            </Text>
            <View style={styles.statusRow}>
              {isAdmin && <Chip style={styles.adminChip} textStyle={styles.chipText} compact>ADMIN</Chip>}
              {isBanned && <Chip style={styles.bannedChip} textStyle={styles.chipText} compact>BANNED</Chip>}
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  memberContainer: {
    alignItems: 'center',
    marginRight: 12,
    width: 80,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 4,
    borderWidth: 2,
    borderColor: '#6366F1',
  },
  adminAvatar: {
    borderColor: '#f7a604ff',
  },
  bannedAvatar: {
    borderColor: '#f44336',
  },
  nameText: {
    fontSize: 12,
    textAlign: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    marginTop: 2,
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 2,
  },
  adminChip: {
    backgroundColor: '#FFE0B2',
    height: 20,
    paddingHorizontal: 2,
  },
  bannedChip: {
    backgroundColor: '#FFCDD2',
    height: 20,
    paddingHorizontal: 2,
  },
  chipText: {
    fontSize: 8,
    fontWeight: '600',
    lineHeight: 12,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
