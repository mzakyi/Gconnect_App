import React, { useState, useEffect, useContext } from 'react';
import { useActiveOrg } from '../../context/ActiveOrgContext';
import { View, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Avatar, Searchbar, Surface } from 'react-native-paper';
import { AuthContext } from '../../context/AuthContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../../firebase.config';

export default function ChatMembersScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const { activeOrgId: organizationId } = useActiveOrg();
  const [members, setMembers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!organizationId) return;

    // ✅ Query users directly from org path — no need for groupChatMembers collection
    const q = query(
      collection(db, 'organizations', organizationId, 'users'),
      orderBy('firstName')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const memberData = snapshot.docs.map(doc => ({
        id: doc.id,
        name: `${doc.data().firstName || ''} ${doc.data().lastName || ''}`.trim() || 'Unknown',
        avatar: doc.data().profilePicture || null,
        online: doc.data().online || false,
        ...doc.data(),
      }));
      setMembers(memberData);
    }, (error) => {
      if (error.code !== 'permission-denied') {
        console.warn('ChatMembers listener error:', error.message);
      }
    });

    return () => unsubscribe();
  }, [organizationId]);

  const filteredMembers = members.filter(member =>
    member.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderMember = ({ item }) => {
    const isOnline = item.online;
    
    return (
      <Surface style={styles.memberItem} elevation={2}>
        <View style={styles.avatarContainer}>
          {item.avatar ? (
            <Avatar.Image
              size={56}
              source={{ uri: item.avatar }}
              style={styles.avatar}
            />
          ) : (
            <Avatar.Text
              size={56}
              label={item.name?.split(' ').map(n => n[0]).join('') || 'U'}
              style={styles.avatar}
            />
          )}
          {isOnline && (
            <View style={styles.onlineDot}>
              <View style={styles.onlineDotInner} />
            </View>
          )}
        </View>

        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.name}</Text>
          <View style={styles.statusRow}>
            <MaterialCommunityIcons
              name="circle"
              size={10}
              color={isOnline ? '#4CAF50' : '#ccc'}
            />
            <Text style={[styles.memberStatus, isOnline && styles.onlineStatus]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>

        <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
      </Surface>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#e8eaf6', '#c5cae9', '#9fa8da']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={26} color="#1a237e" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Members</Text>
            <View style={styles.memberCountBadge}>
              <MaterialCommunityIcons name="account-group" size={16} color="#fff" />
              <Text style={styles.memberCountText}>{members.length}</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search members..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
          iconColor="#5c6bc0"
          placeholderTextColor="#999"
        />
      </View>

      <FlatList
        data={filteredMembers}
        renderItem={renderMember}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20,
    borderBottomLeftRadius: 25, borderBottomRightRadius: 25,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backButton: {
    marginRight: 12, padding: 4, backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
  },
  headerTitleContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#1a237e' },
  memberCountBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#5c6bc0',
    borderRadius: 15, paddingHorizontal: 10, paddingVertical: 4, gap: 4,
  },
  memberCountText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  searchContainer: { paddingHorizontal: 15, paddingTop: 15, paddingBottom: 10 },
  searchBar: { elevation: 2, borderRadius: 25, backgroundColor: '#fff' },
  listContent: { paddingBottom: 20, paddingTop: 5 },
  memberItem: {
    flexDirection: 'row', padding: 16, marginHorizontal: 10, marginVertical: 5,
    backgroundColor: '#fff', borderRadius: 16, alignItems: 'center',
  },
  avatarContainer: { position: 'relative', marginRight: 14 },
  avatar: { backgroundColor: '#5c6bc0' },
  onlineDot: {
    position: 'absolute', bottom: 2, right: 2, width: 18, height: 18,
    borderRadius: 9, backgroundColor: '#fff', alignItems: 'center',
    justifyContent: 'center', borderWidth: 2, borderColor: '#fff',
  },
  onlineDotInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#4CAF50' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 16, fontWeight: '600', color: '#1a237e', marginBottom: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberStatus: { fontSize: 13, color: '#999' },
  onlineStatus: { color: '#4CAF50', fontWeight: '500' },
});