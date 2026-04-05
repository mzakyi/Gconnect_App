import React, { useState, useEffect, useContext, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity, Image, ImageBackground } from 'react-native';
import { Text, Avatar, Surface, List, Divider, Switch, Button, ActivityIndicator } from 'react-native-paper';
import { AuthContext } from '../../context/AuthContext';
import { useActiveOrg } from '../../context/ActiveOrgContext'; // ✅ FIXED: was missing
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase.config';
import * as ImagePicker from 'expo-image-picker';
import {
  deletePrivateChat,
  hideChatForUser,
  muteChat,
  unmuteChat,
  getMuteStatus,
  blockUser,
  unblockUser,
  setChatBackgroundImage,
  removeChatBackgroundImage,
} from '../../services/chatService';

const MUTE_OPTIONS = [
  { label: '8 hours', value: 8 * 60 * 60 * 1000 },
  { label: '1 week', value: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Always', value: 'forever' },
];

const getMuteDescription = (mutedUntil) => {
  if (!mutedUntil) return 'Notifications are on';
  if (mutedUntil === 'forever') return 'Muted forever';
  const remaining = new Date(mutedUntil).getTime() - Date.now();
  if (remaining <= 0) return 'Notifications are on';
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  if (hours < 1) return 'Muted (less than 1h remaining)';
  if (hours < 24) return `Muted for ${hours} more hour${hours !== 1 ? 's' : ''}`;
  const days = Math.floor(hours / 24);
  return `Muted for ${days} more day${days !== 1 ? 's' : ''}`;
};

export default function ChatInfoScreen({ route, navigation }) {
  const { chatId, otherUserId, otherUserName } = route.params;
  const { user, userProfile } = useContext(AuthContext);
  const { activeOrgId: organizationId } = useActiveOrg(); // ✅ FIXED

  const [otherUserData, setOtherUserData] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [mutedUntil, setMutedUntil] = useState(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState(null);
  const [savingBackground, setSavingBackground] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;

    const loadOtherUser = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'organizations', organizationId, 'users', otherUserId));
        if (userDoc.exists()) setOtherUserData(userDoc.data());
      } catch (e) { console.error(e); }
    };

    const loadBlockStatus = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'organizations', organizationId, 'users', user.uid));
        const blockedUsers = userDoc.data()?.blockedUsers || [];
        setIsBlocked(blockedUsers.includes(otherUserId));
      } catch (e) { console.error(e); }
    };

    loadOtherUser();
    loadBlockStatus();

    const chatRef = doc(db, 'organizations', organizationId, 'privateChats', chatId);
    const unsubscribe = onSnapshot(chatRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();

      const mu = data.mutedFor?.[user.uid] ?? null;
      const isCurrentlyMuted = mu === 'forever' || (mu && new Date(mu).getTime() > Date.now());
      setIsMuted(isCurrentlyMuted);
      setMutedUntil(mu);

      setBackgroundImage(data.backgroundImage || null);
      setLoading(false);
    }, (err) => {
      console.error('ChatInfo listener error:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [organizationId, chatId, user.uid, otherUserId]);

  const handleMuteToggle = () => {
    if (isMuted) {
      Alert.alert('Unmute', 'Turn notifications back on for this chat?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unmute',
          onPress: async () => {
            try {
              await unmuteChat(chatId, user.uid, organizationId);
            } catch {
              Alert.alert('Error', 'Failed to unmute');
            }
          }
        }
      ]);
    } else {
      Alert.alert(
        'Mute notifications',
        'For how long?',
        [
          { text: 'Cancel', style: 'cancel' },
          ...MUTE_OPTIONS.map(opt => ({
            text: opt.label,
            onPress: async () => {
              try {
                await muteChat(chatId, user.uid, opt.value, organizationId);
              } catch {
                Alert.alert('Error', 'Failed to mute');
              }
            }
          }))
        ]
      );
    }
  };

  const handleBlockToggle = async () => {
    try {
      if (isBlocked) {
        await unblockUser(user.uid, otherUserId, organizationId);
        setIsBlocked(false);
        Alert.alert('Success', `${otherUserName} unblocked`);
      } else {
        Alert.alert('Block User', `Are you sure you want to block ${otherUserName}?`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: async () => {
              await blockUser(user.uid, otherUserId, organizationId);
              setIsBlocked(true);
              Alert.alert('Success', `${otherUserName} blocked`);
            }
          }
        ]);
      }
    } catch {
      Alert.alert('Error', 'Failed to update block status');
    }
  };

  const handlePickBackground = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
    });
    if (result.canceled) return;

    setSavingBackground(true);
    try {
      await setChatBackgroundImage(chatId, result.assets[0].uri, organizationId);
      Alert.alert('Done', 'Background updated for both of you!');
    } catch {
      Alert.alert('Error', 'Failed to set background image');
    } finally {
      setSavingBackground(false);
    }
  };

  const handleRemoveBackground = async () => {
    Alert.alert('Remove background', 'Remove the background image for this chat?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeChatBackgroundImage(chatId, organizationId);
          } catch {
            Alert.alert('Error', 'Failed to remove background');
          }
        }
      }
    ]);
  };

  const handleDeleteChat = () => {
    Alert.alert('Delete Chat', 'Choose how to delete this chat.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete for Me Only',
        onPress: async () => {
          try {
            await hideChatForUser(chatId, user.uid, organizationId);
            Alert.alert('Success', 'Chat removed from your list', [
              { text: 'OK', onPress: () => navigation.navigate('ChatList') }
            ]);
          } catch {
            Alert.alert('Error', 'Failed to remove chat');
          }
        }
      },
      {
        text: 'Delete for Everyone',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePrivateChat(chatId, organizationId);
            Alert.alert('Success', 'Chat deleted', [
              { text: 'OK', onPress: () => navigation.navigate('ChatList') }
            ]);
          } catch {
            Alert.alert('Error', 'Failed to delete chat');
          }
        }
      }
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#6366F1', '#4F46E5']} style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Contact Info</Text>
          <View style={{ width: 24 }} />
        </View>
      </LinearGradient>

      <ScrollView>
        <View style={styles.profileSection}>
          {otherUserData?.profilePicture ? (
            <Avatar.Image size={100} source={{ uri: otherUserData.profilePicture }} style={styles.avatar} />
          ) : (
            <Avatar.Text size={100} label={otherUserName?.split(' ').map(n => n[0]).join('') || 'U'} style={styles.avatar} />
          )}
          <Text style={styles.userName}>{otherUserName}</Text>
          {otherUserData?.occupation && <Text style={styles.userOccupation}>{otherUserData.occupation}</Text>}
          {otherUserData?.online && (
            <View style={styles.onlineBadge}>
              <MaterialCommunityIcons name="circle" size={12} color="#4CAF50" />
              <Text style={styles.onlineText}>Online</Text>
            </View>
          )}
        </View>

        <Divider />

        <List.Section>
          <List.Subheader>About</List.Subheader>
          {otherUserData?.bio && (
            <List.Item title="Bio" description={otherUserData.bio} left={props => <List.Icon {...props} icon="information" />} />
          )}
          {otherUserData?.location && (
            <List.Item title="Location" description={otherUserData.location} left={props => <List.Icon {...props} icon="map-marker" />} />
          )}
          {otherUserData?.graduationYear && (
            <List.Item title="Graduation Year" description={String(otherUserData.graduationYear)} left={props => <List.Icon {...props} icon="school" />} />
          )}
        </List.Section>

        <Divider />

        <List.Section>
          <List.Subheader>Chat Background</List.Subheader>

          {backgroundImage ? (
            <View style={styles.bgPreviewContainer}>
              <Image source={{ uri: backgroundImage }} style={styles.bgPreview} resizeMode="cover" />
              <View style={styles.bgPreviewOverlay}>
                <Text style={styles.bgPreviewLabel}>Current background</Text>
              </View>
            </View>
          ) : (
            <View style={styles.bgPlaceholder}>
              <MaterialCommunityIcons name="image-outline" size={40} color="#CBD5E1" />
              <Text style={styles.bgPlaceholderText}>No background set</Text>
            </View>
          )}

          <View style={styles.bgButtonRow}>
            <TouchableOpacity
              style={[styles.bgButton, styles.bgButtonPrimary]}
              onPress={handlePickBackground}
              disabled={savingBackground}
            >
              {savingBackground ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialCommunityIcons name="image-edit" size={18} color="#fff" />
                  <Text style={styles.bgButtonText}>
                    {backgroundImage ? 'Change background' : 'Set background'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            {backgroundImage && (
              <TouchableOpacity style={[styles.bgButton, styles.bgButtonDanger]} onPress={handleRemoveBackground}>
                <MaterialCommunityIcons name="image-remove" size={18} color="#fff" />
                <Text style={styles.bgButtonText}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.bgNote}>
            Background applies to both participants in this chat.
          </Text>
        </List.Section>

        <Divider />

        <List.Section>
          <List.Subheader>Settings</List.Subheader>

          <List.Item
            title="View Full Profile"
            left={props => <List.Icon {...props} icon="account" color="#6366F1" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => navigation.navigate('UserProfile', { userId: otherUserId })}
          />

          <List.Item
            title="Mute Notifications"
            description={getMuteDescription(isMuted ? mutedUntil : null)}
            left={props => <List.Icon {...props} icon={isMuted ? 'bell-off' : 'bell'} color={isMuted ? '#F59E0B' : undefined} />}
            right={() => <Switch value={isMuted} onValueChange={handleMuteToggle} color="#6366F1" />}
          />

          <List.Item
            title={isBlocked ? 'Unblock User' : 'Block User'}
            description={isBlocked ? 'Tap to unblock this user' : 'Tap to block this user'}
            left={props => <List.Icon {...props} icon="block-helper" color="#F44336" />}
            right={() => <Switch value={isBlocked} onValueChange={handleBlockToggle} color="#F44336" />}
          />
        </List.Section>

        <Divider />

        <View style={styles.dangerZone}>
          <Button
            mode="outlined"
            onPress={handleDeleteChat}
            style={styles.deleteButton}
            textColor="#F44336"
            icon="delete"
          >
            Delete Chat
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: { paddingTop: 50, paddingBottom: 15 },
  headerContent: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 15,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  profileSection: { alignItems: 'center', paddingVertical: 30, backgroundColor: '#F8FAFC' },
  avatar: { backgroundColor: '#6366F1', marginBottom: 15 },
  userName: { fontSize: 24, fontWeight: '700', color: '#1E293B', marginBottom: 5 },
  userOccupation: { fontSize: 16, color: '#64748B', marginBottom: 10 },
  onlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  onlineText: { fontSize: 14, color: '#4CAF50', fontWeight: '500' },
  bgPreviewContainer: { marginHorizontal: 16, borderRadius: 12, overflow: 'hidden', height: 140, marginBottom: 12 },
  bgPreview: { width: '100%', height: '100%' },
  bgPreviewOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end', padding: 10,
  },
  bgPreviewLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
  bgPlaceholder: {
    marginHorizontal: 16, height: 100, borderRadius: 12,
    backgroundColor: '#F8FAFC', borderWidth: 2, borderColor: '#E2E8F0',
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center',
    marginBottom: 12, gap: 6,
  },
  bgPlaceholderText: { color: '#94A3B8', fontSize: 13 },
  bgButtonRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 8 },
  bgButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 11, borderRadius: 10,
  },
  bgButtonPrimary: { backgroundColor: '#6366F1' },
  bgButtonDanger: { backgroundColor: '#F44336' },
  bgButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  bgNote: { fontSize: 12, color: '#94A3B8', paddingHorizontal: 16, marginBottom: 8, fontStyle: 'italic' },
  dangerZone: { padding: 20 },
  deleteButton: { borderColor: '#F44336' },
});