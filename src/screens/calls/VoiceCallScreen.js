// src/screens/calls/VoiceCallScreen.js
import React, { useEffect, useRef, useState, useContext } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
  FlatList,
} from 'react-native';
import { Text, Avatar, Modal, Portal, Searchbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase.config';
import { AuthContext } from '../../context/AuthContext';
import { useActiveOrg } from '../../context/ActiveOrgContext';
import {
  endCall,
  getLiveKitToken,
  subscribeToCallStatus,
  inviteToCall,
} from '../../services/callService';

// LiveKit imports
let Room, RoomEvent;
try {
  const lkClient = require('livekit-client');
  Room = lkClient.Room;
  RoomEvent = lkClient.RoomEvent;
} catch (e) {
  console.log('❌ LiveKit import error:', e.message);
}

export default function VoiceCallScreen({ navigation, route }) {
  const {
    callId,
    roomName,
    otherUserName,
    otherUserAvatar,
    callType,
    isIncoming,
  } = route.params;
  const { user, userProfile } = useContext(AuthContext);
const { activeOrgId: organizationId } = useActiveOrg();

  const [callDuration, setCallDuration]       = useState(0);
  const [isMuted, setIsMuted]                 = useState(false);
  const [isSpeakerOn, setIsSpeakerOn]         = useState(false);
  const [isOnHold, setIsOnHold]               = useState(false);
  const [connectionState, setConnectionState] = useState('connecting');

  // ── Add Participant state ────────────────────────────────────────────────
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [allUsers, setAllUsers]                     = useState([]);
  const [participantSearch, setParticipantSearch]   = useState('');
  const [invitingUserId, setInvitingUserId]          = useState(null); // loading state per user

  const timerRef        = useRef(null);
  const roomRef         = useRef(null);
  const isEndingRef     = useRef(false);
  const callStatusUnsub = useRef(null);
  const waveAnim1       = useRef(new Animated.Value(1)).current;
  const waveAnim2       = useRef(new Animated.Value(1)).current;
  const waveAnim3       = useRef(new Animated.Value(1)).current;

  // ── Sound wave animation ─────────────────────────────────────────────────
  useEffect(() => {
    const makeWave = (anim, delay, amplitude) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: amplitude, duration: 500, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 1,         duration: 500, useNativeDriver: true }),
        ])
      );
    const w1 = makeWave(waveAnim1, 0,   1.6);
    const w2 = makeWave(waveAnim2, 160, 2.2);
    const w3 = makeWave(waveAnim3, 320, 1.8);
    w1.start(); w2.start(); w3.start();
    return () => { w1.stop(); w2.stop(); w3.stop(); };
  }, []);

  // ── Firestore call status listener ──────────────────────────────────────
  useEffect(() => {
    if (!callId || !organizationId) return;
    callStatusUnsub.current = subscribeToCallStatus(
      callId,
      (callData) => {
        if (!callData) { handleEndCall(false); return; }
        if (['ended', 'declined', 'missed'].includes(callData.status)) handleEndCall(false);
      },
      organizationId
    );
    return () => {
      if (callStatusUnsub.current) { callStatusUnsub.current(); callStatusUnsub.current = null; }
    };
  }, [callId, organizationId]);

  // ── LiveKit connection ───────────────────────────────────────────────────
  useEffect(() => {
    connectToRoom();
    return () => disconnectFromRoom();
  }, []);

  const connectToRoom = async () => {
    try {
      const { status: audioStatus } = await Audio.requestPermissionsAsync();
      if (audioStatus !== 'granted') {
        Alert.alert('Permission Required', 'Microphone access is needed for voice calls.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
        return;
      }

      if (!Room) {
        setConnectionState('connected');
        startTimer();
        return;
      }

      const participantName = `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim();
      const tokenResult = await getLiveKitToken(roomName, participantName);
      const { token, url } = tokenResult || {};

      if (!token || !url) {
        Alert.alert('Connection Error', 'Could not get call credentials.');
        navigation.goBack();
        return;
      }

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      roomRef.current = room;

      room.on(RoomEvent.Connected, async () => {
        setConnectionState('connected');
        startTimer();
        try { await room.localParticipant.setMicrophoneEnabled(true); } catch (e) {}
        try { await room.localParticipant.setCameraEnabled(false); } catch (e) {}
      });

      room.on(RoomEvent.Disconnected, () => setConnectionState('disconnected'));

      await room.connect(url, token);
    } catch (error) {
      console.error('[LiveKit] Voice connection error:', error);
      Alert.alert('Connection Failed', error.message || 'Could not connect.');
      navigation.goBack();
    }
  };

  const disconnectFromRoom = async () => {
    clearInterval(timerRef.current);
    if (roomRef.current) {
      try { await roomRef.current.disconnect(); } catch (e) {}
      roomRef.current = null;
    }
  };

  const startTimer = () => {
    timerRef.current = setInterval(() => setCallDuration((s) => s + 1), 1000);
  };

  const formatDuration = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
  };

  // ── Controls ─────────────────────────────────────────────────────────────
  const handleMuteToggle = async () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (roomRef.current?.localParticipant) {
      await roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted);
    }
  };

  const handleSpeakerToggle = async () => {
    const newSpeaker = !isSpeakerOn;
    setIsSpeakerOn(newSpeaker);
    if (roomRef.current) {
      try {
        await roomRef.current.switchActiveDevice('audiooutput', newSpeaker ? 'speaker' : 'earpiece');
      } catch (e) {
        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: false,
            playThroughEarpieceAndroid: !newSpeaker,
          });
        } catch {}
      }
    }
  };

  const handleHoldToggle = async () => {
    const newHold = !isOnHold;
    setIsOnHold(newHold);
    if (roomRef.current?.localParticipant) {
      await roomRef.current.localParticipant.setMicrophoneEnabled(!newHold);
    }
  };

  const handleEndCall = async (updateFirestore = true) => {
    if (isEndingRef.current) return;
    isEndingRef.current = true;
    if (callStatusUnsub.current) { callStatusUnsub.current(); callStatusUnsub.current = null; }
    await disconnectFromRoom();
    if (updateFirestore) { try { await endCall(callId, organizationId); } catch (e) {} }
    navigation.goBack();
  };

  // ── Add Participant ───────────────────────────────────────────────────────
  const openAddParticipant = async () => {
    try {
      const snapshot = await getDocs(
        collection(db, 'organizations', organizationId, 'users')
      );
      const list = snapshot.docs
        .map(d => ({ id: d.id, uid: d.data().uid || d.id, ...d.data() }))
        .filter(u => u.uid !== user.uid);
      setAllUsers(list);
      setShowAddParticipant(true);
    } catch (e) {
      Alert.alert('Error', 'Could not load users');
    }
  };

  const handleInviteUser = async (invitedUser) => {
    setInvitingUserId(invitedUser.uid);
    try {
      await inviteToCall(
        callId,
        roomName,
        callType || 'voice',
        organizationId,
        {
          callerId: user.uid,
          callerName: `${userProfile.firstName} ${userProfile.lastName}`,
          callerAvatar: userProfile.profilePicture || '',
        },
        invitedUser.uid,
        {
          receiverName: `${invitedUser.firstName} ${invitedUser.lastName}`,
          receiverAvatar: invitedUser.profilePicture || '',
        }
      );
      Alert.alert('Invited', `${invitedUser.firstName} ${invitedUser.lastName} has been invited to the call.`);
      setShowAddParticipant(false);
    } catch (e) {
      Alert.alert('Error', 'Could not invite user. Please try again.');
    } finally {
      setInvitingUserId(null);
    }
  };

  const filteredUsers = allUsers.filter(u => {
    const name = `${u.firstName} ${u.lastName}`.toLowerCase();
    return name.includes(participantSearch.toLowerCase());
  });

  const initials = otherUserName
    ? otherUserName.split(' ').map((n) => n[0]).join('').toUpperCase()
    : '?';

  return (
    <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={styles.container}>
      <View style={styles.decorRingOuter} />
      <View style={styles.decorRingInner} />

      {/* Header status */}
      <View style={styles.header}>
        <View style={[
          styles.connectionBadge,
          connectionState === 'connected' ? styles.connectionBadgeActive : styles.connectionBadgeWaiting,
        ]}>
          <View style={[
            styles.connectionDot,
            { backgroundColor: connectionState === 'connected' ? '#4ade80' : '#fbbf24' },
          ]} />
          <Text style={styles.connectionText}>
            {connectionState === 'connecting' ? 'Connecting...' : 'Encrypted call'}
          </Text>
        </View>
      </View>

      {/* Avatar + info */}
      <View style={styles.avatarSection}>
        <View style={styles.avatarContainer}>
          {connectionState === 'connected' && !isMuted && (
            <View style={styles.waveContainer}>
              <Animated.View style={[styles.wavebar, { transform: [{ scaleY: waveAnim1 }] }]} />
              <Animated.View style={[styles.wavebar, styles.wavebarTall, { transform: [{ scaleY: waveAnim2 }] }]} />
              <Animated.View style={[styles.wavebar, { transform: [{ scaleY: waveAnim3 }] }]} />
            </View>
          )}
          {otherUserAvatar ? (
            <Avatar.Image size={150} source={{ uri: otherUserAvatar }} style={styles.avatar} />
          ) : (
            <Avatar.Text size={150} label={initials} style={styles.avatarFallback} />
          )}
        </View>

        <Text style={styles.callerName}>{otherUserName}</Text>
        <Text style={styles.durationText}>
          {connectionState === 'connecting' ? 'Connecting...' : isOnHold ? '⏸ On Hold' : formatDuration(callDuration)}
        </Text>
      </View>

      {/* Controls */}
      <View style={styles.controlsSection}>
        <View style={styles.controlsGrid}>
          {/* Mute */}
          <TouchableOpacity
            style={[styles.controlItem, isMuted && styles.controlItemActive]}
            onPress={handleMuteToggle}
          >
            <View style={[styles.controlIconBg, isMuted && styles.controlIconBgActive]}>
              <MaterialCommunityIcons
                name={isMuted ? 'microphone-off' : 'microphone'}
                size={26}
                color={isMuted ? '#fff' : '#94a3b8'}
              />
            </View>
            <Text style={[styles.controlLabel, isMuted && styles.controlLabelActive]}>
              {isMuted ? 'Unmute' : 'Mute'}
            </Text>
          </TouchableOpacity>

          {/* Speaker */}
          <TouchableOpacity
            style={[styles.controlItem, isSpeakerOn && styles.controlItemActive]}
            onPress={handleSpeakerToggle}
          >
            <View style={[styles.controlIconBg, isSpeakerOn && styles.controlIconBgActive]}>
              <MaterialCommunityIcons
                name={isSpeakerOn ? 'volume-high' : 'volume-medium'}
                size={26}
                color={isSpeakerOn ? '#fff' : '#94a3b8'}
              />
            </View>
            <Text style={[styles.controlLabel, isSpeakerOn && styles.controlLabelActive]}>Speaker</Text>
          </TouchableOpacity>

          {/* Hold */}
          <TouchableOpacity
            style={[styles.controlItem, isOnHold && styles.controlItemActive]}
            onPress={handleHoldToggle}
          >
            <View style={[styles.controlIconBg, isOnHold && styles.controlIconBgActive]}>
              <MaterialCommunityIcons
                name="pause-circle-outline"
                size={26}
                color={isOnHold ? '#fff' : '#94a3b8'}
              />
            </View>
            <Text style={[styles.controlLabel, isOnHold && styles.controlLabelActive]}>
              {isOnHold ? 'Resume' : 'Hold'}
            </Text>
          </TouchableOpacity>

          {/* ── Add Participant ── */}
          <TouchableOpacity style={styles.controlItem} onPress={openAddParticipant}>
            <View style={styles.controlIconBg}>
              <MaterialCommunityIcons name="account-plus" size={26} color="#94a3b8" />
            </View>
            <Text style={styles.controlLabel}>Add</Text>
          </TouchableOpacity>
        </View>

        {/* End call */}
        <TouchableOpacity style={styles.endCallButton} onPress={() => handleEndCall(true)} activeOpacity={0.85}>
          <LinearGradient
            colors={['#ef4444', '#dc2626']}
            style={styles.endCallGradient}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          >
            <MaterialCommunityIcons name="phone-hangup" size={34} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
        <Text style={styles.endCallLabel}>End Call</Text>
      </View>

      {/* ── Add Participant Modal ── */}
      <Portal>
        <Modal
          visible={showAddParticipant}
          onDismiss={() => setShowAddParticipant(false)}
          contentContainerStyle={styles.addParticipantModal}
        >
          <Text style={styles.addParticipantTitle}>Add to Call</Text>
          <Searchbar
            placeholder="Search people..."
            value={participantSearch}
            onChangeText={setParticipantSearch}
            style={styles.participantSearch}
            iconColor="#128C7E"
          />
          <FlatList
            data={filteredUsers}
            keyExtractor={item => item.id}
            style={styles.participantList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.participantRow}
                onPress={() => handleInviteUser(item)}
                disabled={invitingUserId === item.uid}
              >
                {item.profilePicture ? (
                  <Avatar.Image size={44} source={{ uri: item.profilePicture }} />
                ) : (
                  <Avatar.Text
                    size={44}
                    label={`${item.firstName?.[0] || ''}${item.lastName?.[0] || ''}`}
                    style={styles.participantAvatar}
                  />
                )}
                <View style={styles.participantInfo}>
                  <Text style={styles.participantName}>{item.firstName} {item.lastName}</Text>
                  {item.occupation ? (
                    <Text style={styles.participantOccupation}>{item.occupation}</Text>
                  ) : null}
                </View>
                {invitingUserId === item.uid ? (
                  <MaterialCommunityIcons name="loading" size={22} color="#128C7E" />
                ) : (
                  <MaterialCommunityIcons name="phone-plus" size={22} color="#128C7E" />
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.noUsersText}>No users found</Text>
            }
          />
        </Modal>
      </Portal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 60, paddingBottom: 50,
  },
  decorRingOuter: {
    position: 'absolute', width: 400, height: 400, borderRadius: 200,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)', top: '20%',
  },
  decorRingInner: {
    position: 'absolute', width: 280, height: 280, borderRadius: 140,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', top: '24%',
  },
  header: { alignItems: 'center', zIndex: 10 },
  connectionBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
  },
  connectionBadgeActive: {
    backgroundColor: 'rgba(74,222,128,0.1)',
    borderWidth: 1, borderColor: 'rgba(74,222,128,0.2)',
  },
  connectionBadgeWaiting: {
    backgroundColor: 'rgba(251,191,36,0.1)',
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.2)',
  },
  connectionDot: { width: 8, height: 8, borderRadius: 4 },
  connectionText: { color: '#94a3b8', fontSize: 13, fontWeight: '500' },
  avatarSection: { alignItems: 'center', zIndex: 10 },
  avatarContainer: {
    position: 'relative', alignItems: 'center',
    justifyContent: 'center', marginBottom: 24,
  },
  waveContainer: {
    position: 'absolute', bottom: -8, flexDirection: 'row',
    alignItems: 'center', gap: 4, zIndex: 5,
  },
  wavebar: { width: 4, height: 16, borderRadius: 2, backgroundColor: '#4ade80', opacity: 0.8 },
  wavebarTall: { height: 24 },
  avatar: { borderWidth: 4, borderColor: 'rgba(255,255,255,0.1)' },
  avatarFallback: { backgroundColor: '#4f46e5' },
  callerName: {
    fontSize: 30, fontWeight: '700', color: '#f8fafc',
    letterSpacing: -0.5, marginBottom: 10, textAlign: 'center',
  },
  durationText: { fontSize: 18, color: '#64748b', fontWeight: '500', letterSpacing: 1 },
  controlsSection: { alignItems: 'center', width: '100%', zIndex: 10 },
  controlsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: 20, marginBottom: 36, paddingHorizontal: 20,
  },
  controlItem: { alignItems: 'center', gap: 8, width: 80 },
  controlItemActive: {},
  controlIconBg: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  controlIconBgActive: {
    backgroundColor: 'rgba(99,102,241,0.4)',
    borderColor: 'rgba(99,102,241,0.6)',
  },
  controlLabel: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  controlLabelActive: { color: '#c7d2fe' },
  endCallButton: {
    shadowColor: '#ef4444', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 16, elevation: 12,
  },
  endCallGradient: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  endCallLabel: { color: '#64748b', fontSize: 13, marginTop: 10, fontWeight: '500' },
  // Add Participant Modal
  addParticipantModal: {
    backgroundColor: '#1e293b', marginHorizontal: 20,
    borderRadius: 20, padding: 20, maxHeight: '75%',
  },
  addParticipantTitle: {
    fontSize: 18, fontWeight: '700', color: '#f8fafc',
    marginBottom: 14, textAlign: 'center',
  },
  participantSearch: {
    backgroundColor: '#0f172a', borderRadius: 12, marginBottom: 12,
  },
  participantList: { maxHeight: 400 },
  participantRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
    gap: 12,
  },
  participantAvatar: { backgroundColor: '#4f46e5' },
  participantInfo: { flex: 1 },
  participantName: { color: '#f1f5f9', fontSize: 15, fontWeight: '600' },
  participantOccupation: { color: '#64748b', fontSize: 12, marginTop: 2 },
  noUsersText: { color: '#64748b', textAlign: 'center', paddingVertical: 20 },
});