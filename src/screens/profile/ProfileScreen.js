// src/screens/profile/ProfileScreen.js
// CHANGES FROM ORIGINAL:
//   1. Imported SuperAdmin-related helpers
//   2. Added superAdminOrgs state + loader
//   3. Added "Super Admin" card between Account card and Logout button
//   All original functionality is completely preserved.

import React, { useContext, useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking, Image } from 'react-native';
import { Text, Avatar, Card, Button, Divider, ActivityIndicator, Portal, Modal, TextInput } from 'react-native-paper';
import { AuthContext } from '../../context/AuthContext';
import { logout } from '../../services/authService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db, storage } from '../../../firebase.config';
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';
import { deleteUser } from 'firebase/auth';
import * as ImagePicker from 'expo-image-picker';
import { useOrganization } from '../../context/OrganizationContext';
import { getAllAdminOrgsForUser } from '../../services/superAdminService';

export default function ProfileScreen({ navigation }) {
  const { user, userProfile, organizationId, refreshUserProfile } = useContext(AuthContext);
  const { clearOrganizationId } = useOrganization();
  const [adminContact, setAdminContact] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // ── NEW: super admin state ──────────────────────────────────
  const [superAdminOrgs, setSuperAdminOrgs] = useState([]);
  const [loadingSuperAdmin, setLoadingSuperAdmin] = useState(false);
  // ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (organizationId) fetchAdminContact();
  }, [organizationId]);

  // ── NEW: load super admin orgs if applicable ────────────────
  useEffect(() => {
    if (!user?.uid || !userProfile?.isSuperAdmin) return;
    setLoadingSuperAdmin(true);
    getAllAdminOrgsForUser(user.uid)
      .then((orgs) => setSuperAdminOrgs(orgs.filter((o) => o.id !== organizationId)))
      .catch(console.error)
      .finally(() => setLoadingSuperAdmin(false));
  }, [user?.uid, userProfile?.isSuperAdmin, organizationId]);
  // ───────────────────────────────────────────────────────────

  const fetchAdminContact = async () => {
    try {
      const usersRef = collection(db, 'organizations', organizationId, 'users');
      const adminQuery = query(usersRef, where('isAdmin', '==', true));
      const adminSnapshot = await getDocs(adminQuery);
      if (!adminSnapshot.empty) {
        const adminData = adminSnapshot.docs[0].data();
        setAdminContact({
          email: adminData.email || 'Not available',
          phone: adminData.phone || 'Not available',
          name: `${adminData.firstName || ''} ${adminData.lastName || ''}`.trim() || 'Admin',
        });
      }
    } catch (error) {
      console.error('Error fetching admin contact:', error);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Sorry, we need camera roll permissions to upload a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled) uploadImage(result.assets[0].uri);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Sorry, we need camera permissions to take a profile picture.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled) uploadImage(result.assets[0].uri);
  };

  const uploadImage = async (uri) => {
    try {
      setUploading(true);
      const response = await fetch(uri);
      const blob = await response.blob();
      const filename = `profile_pictures/${userProfile.uid}_${Date.now()}.jpg`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      const userRef = doc(db, 'organizations', organizationId, 'users', userProfile.uid);
      await updateDoc(userRef, { profilePicture: downloadURL });
      if (refreshUserProfile) await refreshUserProfile();
      Alert.alert('Success', 'Profile picture updated successfully!');
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', 'Failed to upload profile picture. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleProfilePicturePress = () => {
    Alert.alert('Profile Picture', 'Choose an option', [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Library', onPress: pickImage },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleDeleteAccount = () => {
    if (!adminContact) {
      Alert.alert('Help & Support', 'Admin contact information is not available at this moment.');
      return;
    }
    const hasEmail = adminContact.email && adminContact.email !== 'Not available';
    const hasPhone = adminContact.phone && adminContact.phone !== 'Not available';
    if (!hasEmail && !hasPhone) {
      Alert.alert('Help & Support', 'Admin contact information is not available at this time.');
      return;
    }
    let message = `To delete your account, please contact the administrator:\n\n`;
    if (hasEmail) message += `📧 Email: ${adminContact.email}\n`;
    if (hasPhone) message += `📞 Phone: ${adminContact.phone}\n`;
    message += '\nPlease reach out to request account deletion.';
    const buttons = [{ text: 'OK', style: 'default' }];
    if (hasEmail) buttons.push({ text: 'Send Email', onPress: () => handleContactAdmin('email') });
    if (hasPhone) buttons.push({ text: 'Call', onPress: () => handleContactAdmin('phone') });
    Alert.alert('Delete Account', message, buttons);
  };

  const executeAccountDeletion = async () => {
    if (deleteConfirmText.toLowerCase() !== 'delete') {
      Alert.alert('Invalid Confirmation', 'Please type "delete" exactly to confirm account deletion.');
      return;
    }
    setDeleting(true);
    try {
      const batch = writeBatch(db);
      const userId = user.uid;
      const postsQuery = query(collection(db, 'organizations', organizationId, 'posts'), where('userId', '==', userId));
      const postsSnapshot = await getDocs(postsQuery);
      postsSnapshot.forEach((doc) => { batch.delete(doc.ref); });
      const allPostsSnapshot = await getDocs(collection(db, 'organizations', organizationId, 'posts'));
      allPostsSnapshot.forEach((postDoc) => {
        const postData = postDoc.data();
        if (postData.comments && postData.comments.length > 0) {
          const updatedComments = postData.comments.filter((comment) => comment.userId !== userId);
          if (updatedComments.length !== postData.comments.length) {
            batch.update(postDoc.ref, { comments: updatedComments, commentCount: updatedComments.length });
          }
        }
      });
      const storiesQuery = query(collection(db, 'organizations', organizationId, 'stories'), where('userId', '==', userId));
      const storiesSnapshot = await getDocs(storiesQuery);
      storiesSnapshot.forEach((doc) => { batch.delete(doc.ref); });
      const chatsQuery = query(collection(db, 'organizations', organizationId, 'privateChats'), where('participants', 'array-contains', userId));
      const chatsSnapshot = await getDocs(chatsQuery);
      for (const chatDoc of chatsSnapshot.docs) {
        const messagesSnapshot = await getDocs(collection(db, 'organizations', organizationId, 'privateChats', chatDoc.id, 'messages'));
        messagesSnapshot.forEach((msgDoc) => { batch.delete(msgDoc.ref); });
        batch.delete(chatDoc.ref);
      }
      const userDocRef = doc(db, 'users', userId);
      batch.delete(userDocRef);
      await batch.commit();
      try {
        const userStorageFolders = ['profile_pictures', 'chat-media', 'stories', 'post-media'];
        for (const folder of userStorageFolders) {
          try {
            const folderRef = ref(storage, folder);
            const fileList = await listAll(folderRef);
            for (const item of fileList.items) {
              if (item.name.includes(userId)) await deleteObject(item);
            }
          } catch (error) {
            console.log(`No files in ${folder} or error:`, error);
          }
        }
      } catch (storageError) {
        console.log('Storage cleanup error (non-critical):', storageError);
      }
      await deleteUser(user);
      Alert.alert('Account Deleted', 'Your account and all associated data have been permanently deleted.', [{ text: 'OK' }]);
    } catch (error) {
      console.error('Error deleting account:', error);
      setDeleting(false);
      setShowDeleteModal(false);
      setDeleteConfirmText('');
      Alert.alert('Contact Support', `Failed to delete account: ${error.message}`);
    }
  };

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout(user.uid, organizationId, clearOrganizationId);
          } catch (error) {
            console.error('Logout error:', error);
            Alert.alert('Error', 'Failed to logout. Please try again.');
          }
        },
      },
    ]);
  };

  const handleEditProfile = () => {
    navigation.navigate('UserProfile', { userId: userProfile.uid });
  };

  const handleContactAdmin = (type) => {
    if (!adminContact) return;
    if (type === 'email') {
      if (adminContact.email === 'Not available') { Alert.alert('Not Available', 'Admin email is not available.'); return; }
      Linking.openURL(`mailto:${adminContact.email}`);
    } else if (type === 'phone') {
      if (adminContact.phone === 'Not available') { Alert.alert('Not Available', 'Admin phone number is not available.'); return; }
      Alert.alert('Contact Admin', `Call ${adminContact.name}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Call', onPress: () => Linking.openURL(`tel:${adminContact.phone}`) },
      ]);
    }
  };

  const handleAbout = () => {
    Alert.alert(
      'About This App',
      'Welcome to our community platform!\n\nVersion 1.0.0\n\n© 2024 All rights reserved.',
      [{ text: 'OK' }]
    );
  };

  if (!userProfile) return null;

  const avatarLabel = `${userProfile.firstName?.[0] || ''}${userProfile.lastName?.[0] || ''}`;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <LinearGradient
        colors={['#667EEA', '#764BA2']}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <View style={styles.profileSection}>
        <TouchableOpacity style={styles.avatarContainer} onPress={handleProfilePicturePress} disabled={uploading}>
          {userProfile.profilePicture ? (
            <Image source={{ uri: userProfile.profilePicture }} style={styles.avatarImage} />
          ) : (
            <Avatar.Text size={110} label={avatarLabel} style={styles.avatar} />
          )}
          <View style={styles.cameraIconContainer}>
            {uploading ? <ActivityIndicator size="small" color="#fff" /> : <MaterialCommunityIcons name="camera" size={18} color="#fff" />}
          </View>
          {userProfile.isAdmin && (
            <View style={styles.verifiedBadge}>
              <MaterialCommunityIcons name="crown" size={18} color="#FFD700" />
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.nameSection}>
          <Text variant="headlineMedium" style={styles.name}>
            {userProfile.firstName} {userProfile.lastName}
          </Text>
          {userProfile.isAdmin && (
            <View style={styles.adminBadge}>
              <MaterialCommunityIcons name="shield-crown" size={14} color="#FFD700" />
              <Text style={styles.adminText}>Admin</Text>
            </View>
          )}
          {/* ── NEW: Super Admin badge next to name ── */}
          {userProfile.isSuperAdmin && (
            <View style={styles.superAdminBadge}>
              <MaterialCommunityIcons name="crown" size={14} color="#F59E0B" />
              <Text style={styles.superAdminBadgeText}>Super Admin</Text>
            </View>
          )}
        </View>

        {userProfile.occupation && (
          <Text variant="bodyLarge" style={styles.occupation}>{userProfile.occupation}</Text>
        )}
        {userProfile.location && (
          <View style={styles.locationRow}>
            <MaterialCommunityIcons name="map-marker" size={15} color="#78909C" />
            <Text style={styles.location}>{userProfile.location}</Text>
          </View>
        )}
        {userProfile.bio && (
          <Text variant="bodyMedium" style={styles.bio}>{userProfile.bio}</Text>
        )}

        <Button mode="contained" icon="pencil" style={styles.editButton} onPress={handleEditProfile}>
          Edit Profile
        </Button>
      </View>

      <View style={styles.cardsContainer}>
        {/* Contact info card — unchanged */}
        <Card style={styles.infoCard} elevation={2}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="card-account-details" size={22} color="#7E57C2" />
              <Text variant="titleLarge" style={styles.cardTitle}>Contact Information</Text>
            </View>
            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="email" size={18} color="#78909C" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{userProfile.email || user.email}</Text>
              </View>
            </View>
            <Divider style={styles.divider} />
            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="phone" size={18} color="#78909C" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Phone</Text>
                <Text style={styles.infoValue}>{userProfile.phone || 'Not provided'}</Text>
              </View>
            </View>
            {userProfile.age && (
              <>
                <Divider style={styles.divider} />
                <View style={styles.infoRow}>
                  <MaterialCommunityIcons name="cake-variant" size={18} color="#78909C" />
                  <View style={styles.infoContent}>
                    <Text style={styles.infoLabel}>Age</Text>
                    <Text style={styles.infoValue}>{userProfile.age} years old</Text>
                  </View>
                </View>
              </>
            )}
            {userProfile.location && (
              <>
                <Divider style={styles.divider} />
                <View style={styles.infoRow}>
                  <MaterialCommunityIcons name="map-marker" size={18} color="#78909C" />
                  <View style={styles.infoContent}>
                    <Text style={styles.infoLabel}>Location</Text>
                    <Text style={styles.infoValue}>{userProfile.location}</Text>
                  </View>
                </View>
              </>
            )}
            <Divider style={styles.divider} />
            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="calendar-clock" size={18} color="#78909C" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Member Since</Text>
                <Text style={styles.infoValue}>
                  {userProfile.createdAt?.toDate?.()?.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) ||
                    new Date(user.metadata?.creationTime).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* ── NEW: Super Admin card — only shows for admins ─────────── */}
        {userProfile.isAdmin && (
          <Card style={styles.superAdminCard} elevation={2}>
            <Card.Content>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="crown" size={22} color="#F59E0B" />
                <Text variant="titleLarge" style={styles.cardTitle}>Super Admin</Text>
              </View>

              {/* Current orgs summary */}
              {loadingSuperAdmin ? (
                <ActivityIndicator size="small" color="#F59E0B" style={{ marginVertical: 10 }} />
              ) : (
                <>
                  <View style={styles.orgSummaryRow}>
                    <MaterialCommunityIcons name="office-building" size={16} color="#78909C" />
                    <Text style={styles.orgSummaryText}>
                      You are currently an admin of{' '}
                      <Text style={styles.orgSummaryCount}>
                        {superAdminOrgs.length + 1} organization
                        {superAdminOrgs.length + 1 !== 1 ? 's' : ''}
                      </Text>
                    </Text>
                  </View>

                  {superAdminOrgs.length > 0 && (
                    <View style={styles.extraOrgsList}>
                      {superAdminOrgs.map((org) => (
                        <View key={org.id} style={styles.extraOrgItem}>
                          <MaterialCommunityIcons name="check-circle" size={14} color="#4CAF50" />
                          <Text style={styles.extraOrgName}>{org.name}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}

              <TouchableOpacity
                style={styles.superAdminButton}
                onPress={() => navigation.navigate('SuperAdmin')}
              >
                <MaterialCommunityIcons name="plus-circle-outline" size={20} color="#F59E0B" />
                <Text style={styles.superAdminButtonText}>
                  {superAdminOrgs.length > 0
                    ? 'Manage Super Admin Access'
                    : 'Request Access to Another Org'}
                </Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color="#F59E0B" />
              </TouchableOpacity>
            </Card.Content>
          </Card>
        )}
        {/* ────────────────────────────────────────────────────────── */}

        {/* Account card — unchanged */}
        <Card style={styles.infoCard} elevation={2}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="cog" size={22} color="#7E57C2" />
              <Text variant="titleLarge" style={styles.cardTitle}>Account</Text>
            </View>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                if (!adminContact) { Alert.alert('Help & Support', 'Loading admin contact information...'); return; }
                const hasEmail = adminContact.email && adminContact.email !== 'Not available';
                const hasPhone = adminContact.phone && adminContact.phone !== 'Not available';
                let message = `Contact ${adminContact.name} for assistance:\n\n`;
                if (hasEmail) message += `📧 Email: ${adminContact.email}\n`;
                if (hasPhone) message += `📞 Phone: ${adminContact.phone}\n`;
                if (!hasEmail && !hasPhone) { Alert.alert('Help & Support', 'Admin contact information is not available.'); return; }
                message += "\nChoose how you'd like to contact them:";
                const buttons = [{ text: 'Cancel', style: 'cancel' }];
                if (hasEmail) buttons.push({ text: 'Send Email', onPress: () => handleContactAdmin('email') });
                if (hasPhone) buttons.push({ text: 'Call', onPress: () => handleContactAdmin('phone') });
                Alert.alert('Help & Support', message, buttons);
              }}
            >
              <MaterialCommunityIcons name="help-circle" size={20} color="#78909C" />
              <View style={styles.actionItemContent}>
                <Text style={styles.actionItemText}>Help & Support</Text>
                {adminContact && (
                  <Text style={styles.actionItemSubtext}>Contact {adminContact.name}</Text>
                )}
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color="#E0E0E0" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={handleAbout}>
              <MaterialCommunityIcons name="information" size={20} color="#78909C" />
              <Text style={styles.actionItemText}>About</Text>
              <MaterialCommunityIcons name="chevron-right" size={22} color="#E0E0E0" />
            </TouchableOpacity>
          </Card.Content>
        </Card>

        <Button mode="outlined" icon="logout" onPress={handleLogout} style={styles.logoutButton} textColor="#EF5350">
          Logout
        </Button>
        <Button mode="outlined" icon="account-remove" onPress={handleDeleteAccount} style={styles.deleteButton} textColor="#EF5350">
          Delete Account
        </Button>
        <Text style={styles.versionText}>Version 1.0.0</Text>
      </View>

      {/* Delete account modal — unchanged */}
      <Portal>
        <Modal
          visible={showDeleteModal}
          onDismiss={() => { if (!deleting) { setShowDeleteModal(false); setDeleteConfirmText(''); } }}
          contentContainerStyle={styles.modalContainer}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <MaterialCommunityIcons name="alert-circle" size={46} color="#EF5350" />
              <Text variant="headlineSmall" style={styles.modalTitle}>Confirm Account Deletion</Text>
            </View>
            <Text style={styles.modalText}>
              This action is <Text style={styles.boldText}>permanent and irreversible</Text>.
            </Text>
            <Text style={styles.confirmInstructions}>
              To confirm, please type <Text style={styles.deleteWord}>delete</Text> below:
            </Text>
            <TextInput
              mode="outlined"
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="Type 'delete' to confirm"
              style={styles.confirmInput}
              outlineColor="#EF5350"
              activeOutlineColor="#EF5350"
              disabled={deleting}
              autoCapitalize="none"
            />
            <View style={styles.modalButtons}>
              <Button mode="outlined" onPress={() => { setShowDeleteModal(false); setDeleteConfirmText(''); }} style={styles.cancelButton} disabled={deleting}>
                Cancel
              </Button>
              <Button mode="contained" onPress={executeAccountDeletion} style={styles.confirmDeleteButton} buttonColor="#EF5350" loading={deleting} disabled={deleting || deleteConfirmText.toLowerCase() !== 'delete'}>
                {deleting ? 'Deleting...' : 'Delete Forever'}
              </Button>
            </View>
          </View>
        </Modal>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  headerGradient: { height: 140, paddingTop: 50 },
  profileSection: { marginTop: -55, alignItems: 'center', paddingHorizontal: 20 },
  avatarContainer: { position: 'relative' },
  avatar: { backgroundColor: '#667EEA', borderWidth: 3.5, borderColor: '#fff' },
  avatarImage: { width: 110, height: 110, borderRadius: 55, borderWidth: 3.5, borderColor: '#fff' },
  cameraIconContainer: {
    position: 'absolute', bottom: 0, right: 0, backgroundColor: '#7E57C2',
    borderRadius: 16, width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#fff',
  },
  verifiedBadge: {
    position: 'absolute', top: 0, right: 0, backgroundColor: '#fff',
    borderRadius: 13, padding: 2.5,
  },
  nameSection: { flexDirection: 'row', alignItems: 'center', marginTop: 13, gap: 7, flexWrap: 'wrap', justifyContent: 'center' },
  name: { fontWeight: '700', color: '#263238' },
  adminBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF8DC', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, gap: 3 },
  adminText: { color: '#FFD700', fontSize: 11, fontWeight: '700' },
  // ── NEW styles ──
  superAdminBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF3E0', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, gap: 3 },
  superAdminBadgeText: { color: '#F59E0B', fontSize: 11, fontWeight: '700' },
  superAdminCard: { marginBottom: 13, backgroundColor: '#fff', borderRadius: 14, borderLeftWidth: 3, borderLeftColor: '#F59E0B' },
  orgSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  orgSummaryText: { fontSize: 14, color: '#64748B', flex: 1 },
  orgSummaryCount: { fontWeight: '700', color: '#1E293B' },
  extraOrgsList: { backgroundColor: '#FFF8F0', borderRadius: 8, padding: 10, marginBottom: 12, gap: 6 },
  extraOrgItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  extraOrgName: { fontSize: 13, color: '#1E293B', fontWeight: '500' },
  superAdminButton: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: '#F59E0B', borderRadius: 10,
    padding: 12, marginTop: 4,
  },
  superAdminButtonText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#F59E0B' },
  // ── end NEW styles ──
  occupation: { color: '#78909C', marginTop: 3, textAlign: 'center', fontSize: 15 },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 7, gap: 3 },
  location: { color: '#78909C', fontSize: 13 },
  bio: { color: '#78909C', marginTop: 10, textAlign: 'center', lineHeight: 19 },
  editButton: { marginTop: 17, backgroundColor: '#7E57C2', width: '100%' },
  cardsContainer: { paddingTop: 13, marginTop: 18 },
  infoCard: { marginBottom: 13, backgroundColor: '#fff', borderRadius: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 13 },
  cardTitle: { fontWeight: '700', color: '#263238', fontSize: 17 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 13 },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 11, color: '#B0BEC5', marginBottom: 2 },
  infoValue: { fontSize: 14, color: '#263238', fontWeight: '500' },
  divider: { marginVertical: 7 },
  actionItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 13 },
  actionItemContent: { flex: 1 },
  actionItemText: { fontSize: 14, color: '#263238' },
  actionItemSubtext: { fontSize: 11, color: '#B0BEC5', marginTop: 2 },
  logoutButton: { marginTop: 9, marginBottom: 9, borderColor: '#EF5350' },
  deleteButton: { marginBottom: 18, borderColor: '#EF5350', borderWidth: 1.5 },
  versionText: { textAlign: 'center', color: '#B0BEC5', fontSize: 11, marginBottom: 28 },
  modalContainer: { backgroundColor: 'white', padding: 18, margin: 18, borderRadius: 12, maxHeight: '80%' },
  modalContent: { alignItems: 'stretch' },
  modalHeader: { alignItems: 'center', marginBottom: 17 },
  modalTitle: { marginTop: 13, fontWeight: '700', color: '#EF5350', textAlign: 'center', fontSize: 20 },
  modalText: { fontSize: 14, color: '#263238', lineHeight: 20, marginBottom: 13, textAlign: 'center' },
  boldText: { fontWeight: '700', color: '#EF5350' },
  confirmInstructions: { fontSize: 14, color: '#263238', marginBottom: 9, textAlign: 'center' },
  deleteWord: { fontWeight: '700', color: '#EF5350', fontFamily: 'monospace' },
  confirmInput: { marginBottom: 17, backgroundColor: '#fff' },
  modalButtons: { flexDirection: 'row', gap: 9 },
  cancelButton: { flex: 1 },
  confirmDeleteButton: { flex: 1 },
});