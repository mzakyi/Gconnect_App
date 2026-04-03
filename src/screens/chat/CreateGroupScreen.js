import React, { useState, useEffect, useContext } from 'react';
import { useActiveOrg } from '../../context/ActiveOrgContext';
import { View, FlatList, StyleSheet, TouchableOpacity, Alert, Image } from 'react-native';
import { Text, Avatar, Searchbar, Surface, TextInput, Button, IconButton } from 'react-native-paper';
import { AuthContext } from '../../context/AuthContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase.config';
import { createGroupChat } from '../../services/chatService';
import * as ImagePicker from 'expo-image-picker';

export default function CreateGroupScreen({ navigation }) {
  const { user, userProfile } = useContext(AuthContext);
const { activeOrgId: organizationId } = useActiveOrg(); // ✅ pull organizationId
  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [step, setStep] = useState(1);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupImage, setGroupImage] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (organizationId) loadUsers();
  }, [organizationId]);

  const loadUsers = async () => {
    try {
      // ✅ org path
      const usersSnapshot = await getDocs(collection(db, 'organizations', organizationId, 'users'));
      const usersList = usersSnapshot.docs
        .filter(doc => doc.id !== user.uid)
        .map(doc => ({
          id: doc.id,
          uid: doc.data().uid || doc.id,
          ...doc.data()
        }))
        .sort((a, b) => {
          const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
          const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
          return nameA.localeCompare(nameB);
        });
      
      setUsers(usersList);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const toggleUserSelection = (userId) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const pickGroupImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setGroupImage(result.assets[0].uri);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }
    if (selectedUsers.length === 0) {
      Alert.alert('Error', 'Please select at least one member');
      return;
    }

    setLoading(true);
    try {
      // ✅ pass organizationId to service
      const groupId = await createGroupChat(
        user.uid,
        groupName.trim(),
        groupDescription.trim(),
        selectedUsers,
        organizationId,
        groupImage
      );

      Alert.alert('Success', 'Group created successfully!', [
        {
          text: 'OK',
          onPress: () => {
            navigation.navigate('GroupChatScreen', {
              groupId,
              groupName: groupName.trim(),
              groupImage
              
            });
          }
        }
      ]);
    } catch (error) {
      console.error('Error creating group:', error);
      Alert.alert('Error', 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(u =>
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderUserItem = ({ item }) => {
    const isSelected = selectedUsers.includes(item.id);
    
    return (
      <TouchableOpacity onPress={() => toggleUserSelection(item.id)}>
        <Surface style={styles.userItem} elevation={1}>
          <View style={styles.avatarContainer}>
            {item.profilePicture ? (
              <Avatar.Image size={48} source={{ uri: item.profilePicture }} />
            ) : (
              <Avatar.Text size={48} label={`${item.firstName?.[0]}${item.lastName?.[0]}`} />
            )}
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{item.firstName} {item.lastName}</Text>
            <Text style={styles.userOccupation}>{item.occupation || 'RTD Alumni'}</Text>
          </View>
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <MaterialCommunityIcons name="check" size={20} color="#fff" />}
          </View>
        </Surface>
      </TouchableOpacity>
    );
  };

  if (step === 2) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#6366F1', '#4F46E5']} style={styles.header}>
          <View style={styles.headerRow}>
            <IconButton icon="arrow-left" iconColor="#fff" onPress={() => setStep(1)} />
            <Text style={styles.headerTitle}>New Group</Text>
            <View style={{ width: 48 }} />
          </View>
        </LinearGradient>

        <View style={styles.detailsContainer}>
          <TouchableOpacity style={styles.imagePickerContainer} onPress={pickGroupImage}>
            {groupImage ? (
              <Image source={{ uri: groupImage }} style={styles.groupImagePreview} />
            ) : (
              <View style={styles.imagePlaceholder}>
                <MaterialCommunityIcons name="camera" size={40} color="#999" />
                <Text style={styles.imagePlaceholderText}>Add Group Photo</Text>
              </View>
            )}
          </TouchableOpacity>

          <TextInput
            label="Group Name (Required)"
            value={groupName}
            onChangeText={setGroupName}
            mode="outlined"
            style={styles.input}
            maxLength={50}
          />

          <TextInput
            label="Group Description (Optional)"
            value={groupDescription}
            onChangeText={setGroupDescription}
            mode="outlined"
            multiline
            numberOfLines={3}
            style={styles.input}
            maxLength={200}
          />

          <View style={styles.selectedMembersContainer}>
            <Text style={styles.selectedMembersTitle}>
              {selectedUsers.length} member{selectedUsers.length !== 1 ? 's' : ''} selected
            </Text>
          </View>

          <Button
            mode="contained"
            onPress={handleCreateGroup}
            loading={loading}
            disabled={loading || !groupName.trim()}
            style={styles.createButton}
            buttonColor="#6366F1"
          >
            Create Group
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#6366F1', '#4F46E5']} style={styles.header}>
        <View style={styles.headerRow}>
          <IconButton icon="close" iconColor="#fff" onPress={() => navigation.goBack()} />
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Add Group Members</Text>
            <Text style={styles.headerSubtitle}>{selectedUsers.length} selected</Text>
          </View>
          <IconButton 
            icon="arrow-right" 
            iconColor="#fff" 
            disabled={selectedUsers.length === 0}
            onPress={() => setStep(2)}
          />
        </View>
      </LinearGradient>

      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search alumni..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
          iconColor="#6366F1"
        />
      </View>

      <FlatList
        data={filteredUsers}
        renderItem={renderUserItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { paddingTop: 50, paddingBottom: 15 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  headerSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  searchContainer: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff' },
  searchBar: { elevation: 0, borderRadius: 12, backgroundColor: '#F8FAFC' },
  listContent: { paddingBottom: 20 },
  userItem: {
    flexDirection: 'row', padding: 12, marginHorizontal: 16, marginVertical: 4,
    backgroundColor: '#fff', borderRadius: 12, alignItems: 'center',
  },
  avatarContainer: { marginRight: 12 },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  userOccupation: { fontSize: 13, color: '#64748B', marginTop: 2 },
  checkbox: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  detailsContainer: { padding: 20 },
  imagePickerContainer: { alignSelf: 'center', marginBottom: 24 },
  groupImagePreview: { width: 120, height: 120, borderRadius: 60 },
  imagePlaceholder: {
    width: 120, height: 120, borderRadius: 60, backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
    borderColor: '#E2E8F0', borderStyle: 'dashed',
  },
  imagePlaceholderText: { fontSize: 12, color: '#999', marginTop: 8 },
  input: { marginBottom: 16, backgroundColor: '#fff' },
  selectedMembersContainer: { marginVertical: 16 },
  selectedMembersTitle: { fontSize: 14, color: '#64748B', textAlign: 'center' },
  createButton: { marginTop: 16, paddingVertical: 8 },
});