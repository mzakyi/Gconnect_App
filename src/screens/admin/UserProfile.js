import React, { useState, useEffect, useContext } from 'react';
import { useActiveOrg } from '../../context/ActiveOrgContext';
import { View, ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform, Image, TouchableOpacity } from 'react-native';
import { Text, Card, Avatar, Divider, ActivityIndicator, Chip, TextInput, Button } from 'react-native-paper';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase.config';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';

// ✅ NO useContext call here - it must be inside the component

export default function UserProfile({ route, navigation }) {
  const { userId } = route.params;

  // ✅ All context calls in one place, inside the component
  const { userProfile: currentUserProfile, refreshUserProfile } = useContext(AuthContext);
  const { activeOrgId: organizationId } = useActiveOrg();

  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    age: '',
    location: '',
    occupation: '',
    bio: '',
  });

  const isOwnProfile = currentUserProfile?.uid === userId;

  useEffect(() => {
    if (organizationId) fetchUser();
  }, [userId, organizationId]);

  const fetchUser = async () => {
    setLoading(true);
    setError(null);
    try {
      const userRef = doc(db, 'organizations', organizationId, 'users', userId); // ✅ correct path
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        setUserData(data);
        setEditForm({
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          phone: data.phone || '',
          age: data.age || '',
          location: data.location || '',
          occupation: data.occupation || '',
          bio: data.bio || '',
        });
      } else {
        setError('User profile not found in database.');
      }
    } catch (err) {
      console.error('Error fetching user:', err);
      setError('Failed to load user profile.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditToggle = () => {
    if (isEditing) {
      setEditForm({
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        phone: userData.phone || '',
        age: userData.age || '',
        location: userData.location || '',
        occupation: userData.occupation || '',
        bio: userData.bio || '',
      });
    }
    setIsEditing(!isEditing);
  };

  const handleSaveProfile = async () => {
    if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
      Alert.alert('Error', 'First name and last name are required');
      return;
    }
    if (editForm.age && (isNaN(editForm.age) || editForm.age < 1)) {
      Alert.alert('Error', 'Please enter a valid age');
      return;
    }

    setSaving(true);
    try {
      // ✅ organizationId already available from context above - no useContext here
      const userRef = doc(db, 'organizations', organizationId, 'users', userId);
      const updateData = {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        phone: editForm.phone.trim(),
        age: editForm.age,
        location: editForm.location.trim(),
        occupation: editForm.occupation.trim(),
        bio: editForm.bio.trim(),
      };
      
      await updateDoc(userRef, updateData);
      await fetchUser();
      
      if (isOwnProfile && refreshUserProfile) {
        await refreshUserProfile();
      }
      
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (err) {
      console.error('Error updating profile:', err);
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <MaterialCommunityIcons name="alert-circle" size={80} color="#f44336" />
        <Text style={styles.errorText}>{error}</Text>
        <Text style={styles.errorSubtext}>This user may not have a complete profile yet.</Text>
      </View>
    );
  }

  // Safe defaults if fields are missing
  const firstName = userData?.firstName || '';
  const lastName = userData?.lastName || '';
  const email = userData?.email || 'No email';
  const phone = userData?.phone || 'Not provided';
  const age = userData?.age || 'Not provided';
  const location = userData?.location || 'Not provided';
  const occupation = userData?.occupation || 'Not provided';
  const bio = userData?.bio || 'No bio available';
  const status = userData?.status || 'Unknown';
  const isAdmin = !!userData?.isAdmin;
  const isBanned = !!userData?.banned || !!userData?.isBanned;
  const joinedDate = userData?.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown';
  const lastSeen = userData?.lastSeen?.toDate?.()?.toLocaleDateString() || 'Unknown';
  const profilePicture = userData?.profilePicture || null;

  const avatarLabel = (firstName[0] || '') + (lastName[0] || '?');

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container}>
        {/* Profile Header */}
        <Card style={styles.headerCard}>
          <Card.Content style={styles.headerContent}>
          {profilePicture ? (
            <TouchableOpacity onPress={() => navigation.navigate('ImageViewer', { uri: profilePicture })}>
              <Image 
                source={{ uri: profilePicture }} 
                style={styles.profileImage}
              />
            </TouchableOpacity>
          ) : (
              <Avatar.Text
                size={100}
                label={avatarLabel}
                style={[styles.avatar, isAdmin && styles.adminAvatar, isBanned && styles.bannedAvatar]}
              />
            )}
            <View style={styles.nameBlock}>
              <Text variant="headlineMedium" style={styles.nameText}>
                {firstName} {lastName || 'Unknown User'}
              </Text>
              <Text variant="bodyLarge" style={styles.email}>
                {email}
              </Text>
              <View style={styles.statusChips}>
                <Chip 
                  icon="information" 
                  style={[
                    styles.statusChip,
                    status === 'approved' ? styles.approvedChip :
                    status === 'pending' ? styles.pendingChip : styles.rejectedChip
                  ]}
                  textStyle={styles.chipText}
                >
                  {status.toUpperCase()}
                </Chip>

                {isAdmin && (
                  <Chip icon="shield-crown" style={styles.adminChip} textStyle={styles.chipText}>
                    ADMIN
                  </Chip>
                )}

                {isBanned && (
                  <Chip icon="account-cancel" style={styles.bannedChip} textStyle={styles.chipText}>
                    BANNED
                  </Chip>
                )}
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Edit/Save Buttons (Only for own profile) */}
        {isOwnProfile && (
          <View style={styles.editButtonContainer}>
            {!isEditing ? (
              <Button
                mode="contained"
                icon="pencil"
                onPress={handleEditToggle}
                style={styles.editModeButton}
              >
                Edit Profile
              </Button>
            ) : (
              <View style={styles.saveButtonsRow}>
                <Button
                  mode="outlined"
                  icon="close"
                  onPress={handleEditToggle}
                  style={styles.cancelButton}
                >
                  Cancel
                </Button>
                <Button
                  mode="contained"
                  icon="check"
                  onPress={handleSaveProfile}
                  loading={saving}
                  disabled={saving}
                  style={styles.saveButton}
                >
                  Save Changes
                </Button>
              </View>
            )}
          </View>
        )}

        {/* Personal Information */}
        <Card style={styles.detailsCard}>
          <Card.Title 
            title="Personal Information" 
            titleStyle={styles.cardTitle}
            left={(props) => <MaterialCommunityIcons name="account" size={24} color="#6366F1" {...props} />}
          />
          <Card.Content>
            {isEditing ? (
              <>
                <TextInput
                  label="First Name *"
                  value={editForm.firstName}
                  onChangeText={(text) => setEditForm({...editForm, firstName: text})}
                  mode="outlined"
                  style={styles.input}
                />
                <TextInput
                  label="Last Name *"
                  value={editForm.lastName}
                  onChangeText={(text) => setEditForm({...editForm, lastName: text})}
                  mode="outlined"
                  style={styles.input}
                />
                <TextInput
                  label="Phone"
                  value={editForm.phone}
                  onChangeText={(text) => setEditForm({...editForm, phone: text})}
                  mode="outlined"
                  keyboardType="phone-pad"
                  style={styles.input}
                />
                <TextInput
                  label="Age"
                  value={editForm.age}
                  onChangeText={(text) => setEditForm({...editForm, age: text})}
                  mode="outlined"
                  keyboardType="numeric"
                  style={styles.input}
                />
                <TextInput
                  label="Location"
                  value={editForm.location}
                  onChangeText={(text) => setEditForm({...editForm, location: text})}
                  mode="outlined"
                  style={styles.input}
                />
                <TextInput
                  label="Occupation"
                  value={editForm.occupation}
                  onChangeText={(text) => setEditForm({...editForm, occupation: text})}
                  mode="outlined"
                  style={styles.input}
                />
              </>
            ) : (
              <>
                <DetailRow icon="email" label="Email" value={email} />
                <Divider style={styles.divider} />
                <DetailRow icon="phone" label="Phone" value={phone} />
                <Divider style={styles.divider} />
                <DetailRow icon="cake-variant" label="Age" value={age.toString()} />
                <Divider style={styles.divider} />
                <DetailRow icon="map-marker" label="Location" value={location} />
                <Divider style={styles.divider} />
                <DetailRow icon="briefcase" label="Occupation" value={occupation} />
              </>
            )}
          </Card.Content>
        </Card>

        {/* Bio */}
        <Card style={styles.detailsCard}>
          <Card.Title 
            title="About" 
            titleStyle={styles.cardTitle}
            left={(props) => <MaterialCommunityIcons name="text" size={24} color="#6366F1" {...props} />}
          />
          <Card.Content>
            {isEditing ? (
              <TextInput
                label="Bio"
                value={editForm.bio}
                onChangeText={(text) => setEditForm({...editForm, bio: text})}
                mode="outlined"
                multiline
                numberOfLines={4}
                style={styles.input}
              />
            ) : (
              <Text style={styles.bioText}>{bio}</Text>
            )}
          </Card.Content>
        </Card>

        {/* Account Information (Read-only) */}
        {!isEditing && (
          <Card style={styles.detailsCard}>
            <Card.Title 
              title="Account Information" 
              titleStyle={styles.cardTitle}
              left={(props) => <MaterialCommunityIcons name="information" size={24} color="#6366F1" {...props} />}
            />
            <Card.Content>
              <DetailRow icon="identifier" label="User ID" value={userId} copyable />
              <Divider style={styles.divider} />
              <DetailRow icon="calendar-check" label="Joined" value={joinedDate} />
              <Divider style={styles.divider} />
              <DetailRow icon="clock-outline" label="Last Seen" value={lastSeen} />
              <Divider style={styles.divider} />
              <DetailRow icon="shield-account" label="Admin Access" value={isAdmin ? 'Yes' : 'No'} />
              <Divider style={styles.divider} />
              <DetailRow icon="account-lock" label="Account Status" value={isBanned ? 'Banned' : 'Active'} />
            </Card.Content>
          </Card>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Helper component for rows
const DetailRow = ({ icon, label, value, copyable }) => (
  <View style={styles.detailRow}>
    <View style={styles.detailIcon}>
      <MaterialCommunityIcons name={icon} size={22} color="#666" />
    </View>
    <View style={styles.detailTextContainer}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} selectable={copyable}>
        {value}
      </Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f8f9fa' 
  },
  loadingContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: '#f8f9fa'
  },
  loadingText: { 
    marginTop: 16, 
    color: '#666',
    fontSize: 16
  },
  errorContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 40,
    backgroundColor: '#f8f9fa'
  },
  errorText: { 
    marginTop: 16, 
    color: '#f44336', 
    fontSize: 18, 
    textAlign: 'center',
    fontWeight: 'bold'
  },
  errorSubtext: { 
    marginTop: 8, 
    color: '#666', 
    textAlign: 'center' 
  },
  headerCard: { 
    margin: 16, 
    backgroundColor: '#fff',
    elevation: 2
  },
  headerContent: { 
    flexDirection: 'row', 
    alignItems: 'center',
    paddingVertical: 10
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#6366F1',
  },
  avatar: { 
    backgroundColor: '#6366F1' 
  },
  adminAvatar: {
    backgroundColor: '#FF9800'
  },
  bannedAvatar: {
    backgroundColor: '#f44336'
  },
  nameBlock: { 
    marginLeft: 20, 
    flex: 1 
  },
  nameText: {
    fontWeight: 'bold',
    color: '#1a1a1a'
  },
  email: { 
    color: '#666', 
    marginTop: 4 
  },
  statusChips: { 
    flexDirection: 'row', 
    gap: 8, 
    marginTop: 12, 
    flexWrap: 'wrap' 
  },
  statusChip: { 
    height: 28 
  },
  approvedChip: { 
    backgroundColor: '#E8F5E9' 
  },
  pendingChip: { 
    backgroundColor: '#FFF3E0' 
  },
  rejectedChip: { 
    backgroundColor: '#FFEBEE' 
  },
  adminChip: { 
    backgroundColor: '#FFE0B2' 
  },
  bannedChip: { 
    backgroundColor: '#FFCDD2' 
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600'
  },
  editButtonContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  editModeButton: {
    backgroundColor: '#6366F1',
  },
  saveButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
  },
  detailsCard: { 
    marginHorizontal: 16, 
    marginBottom: 16, 
    backgroundColor: '#fff',
    elevation: 2
  },
  cardTitle: { 
    color: '#1a1a1a',
    fontWeight: 'bold',
    fontSize: 18
  },
  input: {
    marginBottom: 15,
  },
  divider: {
    marginVertical: 8
  },
  detailRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 12 
  },
  detailIcon: { 
    marginRight: 16,
    width: 30,
    alignItems: 'center'
  },
  detailTextContainer: { 
    flex: 1 
  },
  detailLabel: { 
    fontSize: 13, 
    color: '#999', 
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  detailValue: { 
    fontSize: 16, 
    color: '#1a1a1a', 
    marginTop: 4,
    fontWeight: '500'
  },
  bioText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
    textAlign: 'left'
  },
});