// src/screens/calls/VideoCallScreen.js
import React, { useEffect, useRef, useState, useContext } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
  Dimensions,
  Platform,
  FlatList,
} from 'react-native';
import { Text, Avatar, Modal, Portal, Searchbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { Camera } from 'expo-camera';
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
let Room, RoomEvent, VideoView;
try {
  const lk = require('@livekit/react-native');
  VideoView = lk.VideoView;
  const lkClient = require('livekit-client');
  Room = lkClient.Room;
  RoomEvent = lkClient.RoomEvent;
} catch (e) {
  console.log('[LiveKit] Import error:', e.message);
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function VideoCallScreen({ navigation, route }) {
  const { callId, roomName, otherUserName, otherUserAvatar } = route.params;
  const { user, userProfile } = useContext(AuthContext);
const { activeOrgId: organizationId } = useActiveOrg();

  const [callDuration, setCallDuration]         = useState(0);
  const [isMuted, setIsMuted]                   = useState(false);
  const [isCameraOff, setIsCameraOff]           = useState(false);
  const [isFrontCamera, setIsFrontCamera]       = useState(true);
  const [isFlipping, setIsFlipping]             = useState(false); // prevents double-tap
  const [connectionState, setConnectionState]   = useState('connecting');
  const [controlsVisible, setControlsVisible]   = useState(true);
  const [isConnected, setIsConnected]           = useState(false);
  const [localVideoTrack, setLocalVideoTrack]   = useState(null);
  const [remoteVideoTrack, setRemoteVideoTrack] = useState(null);

  // ── Add Participant state ─────────────────────────────────────────────────
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [allUsers, setAllUsers]                     = useState([]);
  const [participantSearch, setParticipantSearch]   = useState('');
  const [invitingUserId, setInvitingUserId]          = useState(null);

  const controlsOpacity   = useRef(new Animated.Value(1)).current;
  const controlsHideTimer = useRef(null);
  const timerRef          = useRef(null);
  const roomRef           = useRef(null);
  const cameraGrantedRef  = useRef(false);
  const isEndingRef       = useRef(false);
  const callStatusUnsub   = useRef(null);
  const isFrontCameraRef  = useRef(true); // ref so flip handler always has latest value

  // keep ref in sync with state
  useEffect(() => {
    isFrontCameraRef.current = isFrontCamera;
  }, [isFrontCamera]);

  // ── Auto-hide controls ────────────────────────────────────────────────────
  useEffect(() => {
    scheduleHideControls();
    return () => clearTimeout(controlsHideTimer.current);
  }, []);

  const scheduleHideControls = () => {
    clearTimeout(controlsHideTimer.current);
    controlsHideTimer.current = setTimeout(() => {
      Animated.timing(controlsOpacity, {
        toValue: 0, duration: 500, useNativeDriver: true,
      }).start(() => setControlsVisible(false));
    }, 4000);
  };

  const showControls = () => {
    setControlsVisible(true);
    Animated.timing(controlsOpacity, {
      toValue: 1, duration: 200, useNativeDriver: true,
    }).start();
    scheduleHideControls();
  };

  // ── Firestore call status listener ───────────────────────────────────────
  useEffect(() => {
    if (!callId || !organizationId) return;
    const timeout = setTimeout(() => {
      callStatusUnsub.current = subscribeToCallStatus(
        callId,
        (callData) => {
          if (!callData || ['ended', 'declined', 'missed'].includes(callData.status))
            handleEndCall(false);
        },
        organizationId
      );
    }, 1500);
    return () => {
      clearTimeout(timeout);
      if (callStatusUnsub.current) callStatusUnsub.current();
      callStatusUnsub.current = null;
    };
  }, [callId, organizationId]);

  // ── LiveKit connection ────────────────────────────────────────────────────
  useEffect(() => {
    connectToRoom();
    return () => disconnectFromRoom();
  }, []);

  const connectToRoom = async () => {
    try {
      const { status: audioStatus } = await Audio.requestPermissionsAsync();
      if (audioStatus !== 'granted') {
        Alert.alert('Permission Required', 'Microphone access is needed.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
        return;
      }

      const { status: cameraStatus } = await Camera.requestCameraPermissionsAsync();
      cameraGrantedRef.current = cameraStatus === 'granted';
      if (!cameraGrantedRef.current) setIsCameraOff(true);

      if (!Room) {
        setConnectionState('connected');
        setIsConnected(true);
        startTimer();
        return;
      }

      const participantName =
        `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim();
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
        // ── Tell LiveKit to start with the front camera ──
        videoCaptureDefaults: { facingMode: 'user' },
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      roomRef.current = room;

      room.on(RoomEvent.Connected, async () => {
        setConnectionState('connected');
        setIsConnected(true);
        startTimer();
        try { await room.localParticipant.setMicrophoneEnabled(true); } catch {}
        if (cameraGrantedRef.current) {
          setTimeout(async () => {
            try {
              await room.localParticipant.setCameraEnabled(true);
            } catch {
              setIsCameraOff(true);
            }
          }, 500);
        }
      });

      room.on(RoomEvent.LocalTrackPublished, (pub) => {
        if (pub.kind === 'video') {
          setLocalVideoTrack(pub.videoTrack ?? pub.track ?? null);
        }
      });
      room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
        if (pub.kind === 'video') setLocalVideoTrack(null);
      });
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === 'video') setRemoteVideoTrack(track);
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind === 'video') setRemoteVideoTrack(null);
      });

      await room.connect(url, token);
    } catch (error) {
      console.error('[LiveKit] Video connection error:', error);
      Alert.alert('Connection Failed', error.message || 'Could not connect.');
      navigation.goBack();
    }
  };

  const disconnectFromRoom = async () => {
    clearInterval(timerRef.current);
    clearTimeout(controlsHideTimer.current);
    if (roomRef.current) {
      try { await roomRef.current.disconnect(); } catch {}
      roomRef.current = null;
    }
  };

  const startTimer = () => {
    timerRef.current = setInterval(() => setCallDuration((s) => s + 1), 1000);
  };

  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

    // ── Controls ──────────────────────────────────────────────────────────────
  const handleMuteToggle = async () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (roomRef.current?.localParticipant)
      await roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted);
  };

  const handleCameraToggle = async () => {
    const participant = roomRef.current?.localParticipant;
    if (!participant) return;

    const newOff = !isCameraOff;
    setIsCameraOff(newOff);

    try {
      await participant.setCameraEnabled(!newOff);
      await new Promise(res => setTimeout(res, 200));
    } catch (e) {
      console.error('[Camera Toggle Error]', e);
    }
  };

  const handleFlipCamera = async () => {
    const participant = roomRef.current?.localParticipant;
    if (!participant || isFlipping || isCameraOff) return;

    setIsFlipping(true);
    const goingToFront = !isFrontCameraRef.current;

    try {
      // Get the real hardware device list from react-native-webrtc
      const { mediaDevices } = require('@livekit/react-native-webrtc');
      const devices = await mediaDevices.enumerateDevices();

      console.log('[Flip] All devices:', JSON.stringify(devices));

      // Find the camera we want to switch TO
      // react-native-webrtc uses device.facing === 'front' or 'environment'
      const targetFacing = goingToFront ? 'front' : 'environment';
      let targetDevice = null;

      for (const device of devices) {
        if (device.kind === 'videoinput' && device.facing === targetFacing) {
          targetDevice = device;
          break;
        }
      }

      console.log('[Flip] Target device:', JSON.stringify(targetDevice));

      if (!targetDevice) {
        throw new Error(`No ${targetFacing} camera found on this device`);
      }

      // Switch to the real hardware device ID
      await roomRef.current.switchActiveDevice('videoinput', targetDevice.deviceId);

      setIsFrontCamera(goingToFront);
      console.log('[Flip] Success — switched to:', targetFacing);

    } catch (e) {
      console.error('[Flip Error]', e);
      Alert.alert('Camera Flip Failed', e?.message || 'Could not switch camera');
    } finally {
      setIsFlipping(false);
    }
  };

  const handleEndCall = async (updateFirestore = true) => {
    if (isEndingRef.current) return;
    isEndingRef.current = true;
    if (callStatusUnsub.current) {
      callStatusUnsub.current();
      callStatusUnsub.current = null;
    }
    await disconnectFromRoom();
    if (updateFirestore) { try { await endCall(callId, organizationId); } catch {} }
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
        callId, roomName, 'video', organizationId,
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
      Alert.alert('Invited', `${invitedUser.firstName} ${invitedUser.lastName} has been invited.`);
      setShowAddParticipant(false);
    } catch (e) {
      Alert.alert('Error', 'Could not invite user.');
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
    <TouchableOpacity style={styles.container} activeOpacity={1} onPress={showControls}>
      {/* Remote video */}
      <View style={styles.remoteVideoContainer}>
        {isConnected && remoteVideoTrack && VideoView ? (
          <VideoView
            style={styles.remoteVideo}
            videoTrack={remoteVideoTrack}
            objectFit="cover"
          />
        ) : (
          <LinearGradient
            colors={['#0f172a', '#1e293b']}
            style={styles.remoteVideoPlaceholder}
          >
            <View style={styles.remotePlaceholderContent}>
              {otherUserAvatar
                ? <Avatar.Image size={100} source={{ uri: otherUserAvatar }} />
                : <Avatar.Text size={100} label={initials} />
              }
              <Text style={styles.remoteNameText}>{otherUserName}</Text>
              <Text style={styles.remoteStatusText}>
                {connectionState === 'connecting' ? '🔄 Connecting...' : '📵 Camera off'}
              </Text>
            </View>
          </LinearGradient>
        )}
      </View>

      {/* Local PiP — tapping it flips the camera */}
      <TouchableOpacity
        style={styles.localVideoContainer}
        activeOpacity={0.9}
        onPress={handleFlipCamera}
        disabled={isCameraOff || isFlipping}
      >
        {isConnected && localVideoTrack && !isCameraOff && VideoView ? (
          <VideoView
            key={`${isFrontCamera}`} // force re-render after flip
            style={styles.localVideo}
            videoTrack={localVideoTrack}
            objectFit="cover"
          />
        ) : (
          <View style={styles.localVideoPlaceholder}>
            <MaterialCommunityIcons
              name={isFlipping ? 'camera-flip' : isCameraOff ? 'video-off' : 'account'}
              size={28}
              color="#64748b"
            />
          </View>
        )}
        {/* Small flip hint icon on the PiP */}
        {!isCameraOff && !isFlipping && (
          <View style={styles.pipFlipHint}>
            <MaterialCommunityIcons name="camera-flip-outline" size={14} color="rgba(255,255,255,0.7)" />
          </View>
        )}
      </TouchableOpacity>

      {/* Top overlay */}
      <Animated.View style={[styles.topOverlay, { opacity: controlsOpacity }]}>
        <LinearGradient
          colors={['rgba(0,0,0,0.75)', 'transparent']}
          style={styles.topGradient}
        >
          <View style={styles.topInfo}>
            <Text style={styles.topName}>{otherUserName}</Text>
            <View style={styles.topStatusRow}>
              <View style={[
                styles.statusIndicator,
                { backgroundColor: connectionState === 'connected' ? '#4ade80' : '#fbbf24' },
              ]} />
              <Text style={styles.topDuration}>
                {connectionState === 'connecting'
                  ? 'Connecting...'
                  : formatDuration(callDuration)}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.flipButton, isFlipping && styles.flipButtonDisabled]}
            onPress={handleFlipCamera}
            disabled={isCameraOff || isFlipping}
          >
            <MaterialCommunityIcons name="camera-flip-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </LinearGradient>
      </Animated.View>

      {/* Bottom controls */}
      <Animated.View style={[styles.bottomOverlay, { opacity: controlsOpacity }]}>
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.85)']}
          style={styles.bottomGradient}
        >
          <View style={styles.controlsRow}>
            {/* Mute */}
            <TouchableOpacity
              style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
              onPress={handleMuteToggle}
            >
              <MaterialCommunityIcons
                name={isMuted ? 'microphone-off' : 'microphone'}
                size={26} color="#fff"
              />
            </TouchableOpacity>

            {/* Add Participant */}
            <TouchableOpacity style={styles.controlBtn} onPress={openAddParticipant}>
              <MaterialCommunityIcons name="account-plus" size={26} color="#fff" />
            </TouchableOpacity>

            {/* End call */}
            <TouchableOpacity
              style={styles.endBtn}
              onPress={() => handleEndCall(true)}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#ef4444', '#dc2626']}
                style={styles.endBtnGradient}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              >
                <MaterialCommunityIcons name="phone-hangup" size={32} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>

            {/* Camera toggle */}
            <TouchableOpacity
              style={[styles.controlBtn, isCameraOff && styles.controlBtnActive]}
              onPress={handleCameraToggle}
            >
              <MaterialCommunityIcons
                name={isCameraOff ? 'video-off' : 'video'}
                size={26} color="#fff"
              />
            </TouchableOpacity>

            {/* Flip camera */}
            <TouchableOpacity
              style={[styles.controlBtn, isFlipping && styles.controlBtnActive]}
              onPress={handleFlipCamera}
              disabled={isCameraOff || isFlipping}
            >
              <MaterialCommunityIcons name="camera-flip" size={26} color="#fff" />
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Add Participant Modal */}
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
                  <Text style={styles.participantName}>
                    {item.firstName} {item.lastName}
                  </Text>
                  {item.occupation ? (
                    <Text style={styles.participantOccupation}>{item.occupation}</Text>
                  ) : null}
                </View>
                {invitingUserId === item.uid ? (
                  <MaterialCommunityIcons name="loading" size={22} color="#128C7E" />
                ) : (
                  <MaterialCommunityIcons name="video-plus" size={22} color="#128C7E" />
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.noUsersText}>No users found</Text>
            }
          />
        </Modal>
      </Portal>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  remoteVideoContainer: { ...StyleSheet.absoluteFillObject },
  remoteVideo: { flex: 1 },
  remoteVideoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  remotePlaceholderContent: { alignItems: 'center', gap: 16 },
  remoteNameText: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 12 },
  remoteStatusText: { color: '#94a3b8', fontSize: 14 },
  localVideoContainer: {
    position: 'absolute', top: 100, right: 16,
    width: 110, height: 160, borderRadius: 16, overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 8, elevation: 10, zIndex: 20,
  },
  localVideo: { flex: 1 },
  localVideoPlaceholder: {
    flex: 1, backgroundColor: '#1e293b',
    alignItems: 'center', justifyContent: 'center',
  },
  pipFlipHint: {
    position: 'absolute', bottom: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 8, padding: 3,
  },
  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 },
  topGradient: {
    paddingTop: Platform.OS === 'ios' ? 55 : 30,
    paddingBottom: 30, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  topInfo: {},
  topName: {
    color: '#fff', fontSize: 20, fontWeight: '700',
    marginBottom: 6, letterSpacing: -0.3,
  },
  topStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusIndicator: { width: 8, height: 8, borderRadius: 4 },
  topDuration: {
    color: 'rgba(255,255,255,0.8)', fontSize: 14,
    fontWeight: '500', letterSpacing: 1,
  },
  flipButton: {
    backgroundColor: 'rgba(255,255,255,0.15)', padding: 10,
    borderRadius: 50, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  flipButtonDisabled: { opacity: 0.4 },
  bottomOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30 },
  bottomGradient: {
    paddingTop: 40,
    paddingBottom: Platform.OS === 'ios' ? 45 : 30,
    paddingHorizontal: 20,
  },
  controlsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  controlBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)', padding: 14, borderRadius: 50,
    width: 54, height: 54,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  controlBtnActive: {
    backgroundColor: 'rgba(99,102,241,0.5)',
    borderColor: 'rgba(99,102,241,0.7)',
  },
  endBtn: {
    shadowColor: '#ef4444', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6, shadowRadius: 12, elevation: 12,
  },
  endBtnGradient: {
    width: 70, height: 70, borderRadius: 35,
    alignItems: 'center', justifyContent: 'center',
  },
  addParticipantModal: {
    backgroundColor: '#fff', marginHorizontal: 20,
    borderRadius: 20, padding: 20, maxHeight: '75%',
  },
  addParticipantTitle: {
    fontSize: 18, fontWeight: '700', color: '#1e293b',
    marginBottom: 14, textAlign: 'center',
  },
  participantSearch: {
    backgroundColor: '#f1f5f9', borderRadius: 12,
    elevation: 0, marginBottom: 12,
  },
  participantList: { maxHeight: 400 },
  participantRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9', gap: 12,
  },
  participantAvatar: { backgroundColor: '#4f46e5' },
  participantInfo: { flex: 1 },
  participantName: { color: '#1e293b', fontSize: 15, fontWeight: '600' },
  participantOccupation: { color: '#64748b', fontSize: 12, marginTop: 2 },
  noUsersText: { color: '#94a3b8', textAlign: 'center', paddingVertical: 20 },
});