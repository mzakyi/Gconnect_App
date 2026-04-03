// src/screens/calls/OutgoingCallScreen.js
import React, { useEffect, useRef, useState, useContext } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Alert,
  Vibration,
} from 'react-native';
import { Text, Avatar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { AuthContext } from '../../context/AuthContext';
import {
  subscribeToCallStatus,
  endCall,
  getLiveKitToken,
} from '../../services/callService';

export default function OutgoingCallScreen({ navigation, route }) {
  const { callId, otherUserName, otherUserAvatar, callType, roomName } = route.params;
  const { user, userProfile } = useContext(AuthContext);
const { activeOrgId: organizationId } = useActiveOrg();

  const [callStatus, setCallStatus] = useState('ringing'); // ringing | active | declined | ended
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulse2Anim = useRef(new Animated.Value(1)).current;
  const pulse3Anim = useRef(new Animated.Value(1)).current;
  const soundRef = useRef(null);
  const timerRef = useRef(null);
  const unsubscribeRef = useRef(null);

  // ── Pulse animation
  useEffect(() => {
    const createPulse = (anim, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1.6, duration: 1200, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        ])
      );

    const p1 = createPulse(pulseAnim, 0);
    const p2 = createPulse(pulse2Anim, 400);
    const p3 = createPulse(pulse3Anim, 800);
    p1.start();
    p2.start();
    p3.start();

    return () => {
      p1.stop();
      p2.stop();
      p3.stop();
    };
  }, []);

  // ── Play outgoing ringtone
  useEffect(() => {
    playRingtone();
    return () => stopRingtone();
  }, []);

  const playRingtone = async () => {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
      // Use a system-like beep pattern via Vibration since ringtone asset may not exist
      Vibration.vibrate([500, 1000, 500, 1000], true);
    } catch (e) {
      console.log('Ringtone error:', e);
    }
  };

  const stopRingtone = async () => {
    Vibration.cancel();
    
    // Reset audio mode so LiveKit can take over cleanly
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
    } catch(e) {}
    
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      } catch (e) {}
    }
  };

  // ── Subscribe to call status changes
  useEffect(() => {
    unsubscribeRef.current = subscribeToCallStatus(
      callId,
      async (callData) => {
        if (!callData) return;

        setCallStatus(callData.status);

        if (callData.status === 'active') {
          await stopRingtone();
          startTimer();
          // Navigate to the active call screen
          navigation.replace(
            callType === 'video' ? 'VideoCall' : 'VoiceCall',
            {
              callId,
              roomName: callData.roomName || roomName,
              otherUserName,
              otherUserAvatar,
              callType,
              isIncoming: false,
            }
          );
        } else if (
          callData.status === 'declined' ||
          callData.status === 'ended' ||
          callData.status === 'missed'
        ) {
          await stopRingtone();
          clearInterval(timerRef.current);
          const msg =
            callData.status === 'declined'
              ? `${otherUserName} declined the call`
              : 'Call ended';
          Alert.alert('Call', msg);
          navigation.goBack();
        }
      },
      organizationId
    );

    // Auto-cancel after 60s (unanswered)
    const autoCancel = setTimeout(async () => {
      await handleCancel(true);
    }, 60000);

    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
      clearTimeout(autoCancel);
      clearInterval(timerRef.current);
      stopRingtone();
    };
  }, [callId, organizationId]);

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleCancel = async (isMissed = false) => {
    await stopRingtone();
    clearInterval(timerRef.current);
    try {
      if (isMissed) {
        await endCall(callId, organizationId);
      } else {
        await endCall(callId, organizationId);
      }
    } catch (e) {
      console.error('Error cancelling call:', e);
    }
    navigation.goBack();
  };

  const initials = otherUserName
    ? otherUserName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : '?';

  return (
    <LinearGradient
      colors={['#0a0a1a', '#0d1b2a', '#1a2a4a']}
      style={styles.container}
    >
      {/* Background pulses */}
      <View style={styles.pulseContainer}>
        <Animated.View
          style={[styles.pulse, styles.pulse3, { transform: [{ scale: pulse3Anim }] }]}
        />
        <Animated.View
          style={[styles.pulse, styles.pulse2, { transform: [{ scale: pulse2Anim }] }]}
        />
        <Animated.View
          style={[styles.pulse, styles.pulse1, { transform: [{ scale: pulseAnim }] }]}
        />
      </View>

      {/* Call type icon */}
      <View style={styles.topBar}>
        <View style={styles.callTypePill}>
          <MaterialCommunityIcons
            name={callType === 'video' ? 'video' : 'phone'}
            size={14}
            color="#7dd3fc"
          />
          <Text style={styles.callTypeText}>
            {callType === 'video' ? 'Video Call' : 'Voice Call'}
          </Text>
        </View>
      </View>

      {/* Avatar + name */}
      <View style={styles.avatarSection}>
        <View style={styles.avatarWrapper}>
          {otherUserAvatar ? (
            <Avatar.Image size={120} source={{ uri: otherUserAvatar }} style={styles.avatar} />
          ) : (
            <Avatar.Text size={120} label={initials} style={styles.avatarFallback} />
          )}
          <View style={styles.avatarRing} />
        </View>

        <Text style={styles.callerName}>{otherUserName}</Text>

        <View style={styles.statusRow}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>
            {callStatus === 'ringing'
              ? 'Calling...'
              : callStatus === 'active'
              ? formatTime(elapsedSeconds)
              : callStatus}
          </Text>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {callStatus === 'active' && (
          <View style={styles.activeControls}>
            <TouchableOpacity
              style={[styles.controlButton, isMuted && styles.controlButtonActive]}
              onPress={() => setIsMuted(!isMuted)}
            >
              <MaterialCommunityIcons
                name={isMuted ? 'microphone-off' : 'microphone'}
                size={26}
                color="#fff"
              />
              <Text style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, isSpeakerOn && styles.controlButtonActive]}
              onPress={() => setIsSpeakerOn(!isSpeakerOn)}
            >
              <MaterialCommunityIcons
                name={isSpeakerOn ? 'volume-high' : 'volume-medium'}
                size={26}
                color="#fff"
              />
              <Text style={styles.controlLabel}>Speaker</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* End call button */}
        <TouchableOpacity
          style={styles.endButton}
          onPress={() => handleCancel(false)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#ef4444', '#dc2626']}
            style={styles.endButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <MaterialCommunityIcons name="phone-hangup" size={34} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
        <Text style={styles.endLabel}>Cancel</Text>
      </View>
    </LinearGradient>
  );
}

const PULSE_BASE = 140;
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 60,
  },
  pulseContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position: 'absolute',
    borderRadius: 1000,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
  },
  pulse1: { width: PULSE_BASE, height: PULSE_BASE },
  pulse2: { width: PULSE_BASE * 1.6, height: PULSE_BASE * 1.6, backgroundColor: 'rgba(99,102,241,0.07)' },
  pulse3: { width: PULSE_BASE * 2.3, height: PULSE_BASE * 2.3, backgroundColor: 'rgba(99,102,241,0.04)' },
  topBar: {
    alignItems: 'center',
    zIndex: 10,
  },
  callTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(125,211,252,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.25)',
  },
  callTypeText: {
    color: '#7dd3fc',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  avatarSection: {
    alignItems: 'center',
    zIndex: 10,
    flex: 1,
    justifyContent: 'center',
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 24,
  },
  avatar: {
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  avatarFallback: {
    backgroundColor: '#4f46e5',
  },
  avatarRing: {
    position: 'absolute',
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    borderRadius: 1000,
    borderWidth: 2,
    borderColor: 'rgba(99,102,241,0.5)',
  },
  callerName: {
    fontSize: 30,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.5,
    marginBottom: 12,
    textAlign: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ade80',
  },
  statusText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  controls: {
    alignItems: 'center',
    gap: 8,
    zIndex: 10,
  },
  activeControls: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 20,
  },
  controlButton: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 16,
    borderRadius: 20,
    minWidth: 80,
  },
  controlButtonActive: {
    backgroundColor: 'rgba(99,102,241,0.4)',
  },
  controlLabel: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  endButton: {
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  endButtonGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endLabel: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 8,
    fontWeight: '500',
  },
});