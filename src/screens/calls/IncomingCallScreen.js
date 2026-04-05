// src/screens/calls/IncomingCallScreen.js
import React, { useEffect, useRef, useState, useContext } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Vibration,
  Platform,
} from 'react-native';
import { Text, Avatar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { AuthContext } from '../../context/AuthContext';
import { acceptCall, declineCall, subscribeToCallStatus } from '../../services/callService';
import { useActiveOrg } from '../../context/ActiveOrgContext';

export default function IncomingCallScreen({ navigation, route }) {
  const {
    callId,
    callerName,
    callerAvatar,
    callType,
    roomName,
  } = route.params;
  const { user, organizationId } = useContext(AuthContext);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const acceptSlide = useRef(new Animated.Value(0)).current;
  const declineSlide = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const soundRef = useRef(null);
  const unsubscribeRef = useRef(null);

  const [isAnswering, setIsAnswering] = useState(false);

  // Entrance animation
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 1,
      tension: 50,
      friction: 8,
      useNativeDriver: true,
    }).start();

    // Button bounce animations
    Animated.loop(
      Animated.sequence([
        Animated.timing(acceptSlide, { toValue: -8, duration: 600, useNativeDriver: true }),
        Animated.timing(acceptSlide, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(declineSlide, { toValue: 8, duration: 600, useNativeDriver: true }),
        Animated.timing(declineSlide, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    ).start();

    // Pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Play ringtone + vibrate
  useEffect(() => {
    startRinging();
    return () => stopRinging();
  }, []);

  const startRinging = async () => {
    try {
      // ONLY set this on iOS and only for the ringtone
      if (Platform.OS === 'ios') {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          allowsRecordingIOS: false, // OK here - we're just ringing
          shouldDuckAndroid: false,
        });
      }
      Vibration.vibrate([0, 400, 200, 400, 200, 400], true);
    } catch (e) {
      console.log('Ringtone error:', e);
    }
  };

  const stopRinging = () => {
    Vibration.cancel();
    // RESET audio mode before LiveKit takes over
    try {
      Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
    } catch(e) {}
    
    if (soundRef.current) {
      soundRef.current.stopAsync().catch(() => {});
      soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
  };

  // Watch for caller cancelling
  useEffect(() => {
    unsubscribeRef.current = subscribeToCallStatus(
      callId,
      (callData) => {
        if (!callData) {
          stopRinging();
          navigation.goBack();
          return;
        }
        if (callData.status === 'ended' || callData.status === 'missed') {
          stopRinging();
          navigation.goBack();
        }
      },
      organizationId
    );

    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
    };
  }, [callId, organizationId]);

  const handleAccept = async () => {
    if (isAnswering) return;
    setIsAnswering(true);
    stopRinging();
    try {
      await acceptCall(callId, organizationId);
      navigation.replace(callType === 'video' ? 'VideoCall' : 'VoiceCall', {
        callId,
        roomName,
        otherUserName: callerName,
        otherUserAvatar: callerAvatar,
        callType,
        isIncoming: true,
      });
    } catch (e) {
      console.error('Error accepting call:', e);
      setIsAnswering(false);
    }
  };

  const handleDecline = async () => {
    stopRinging();
    try {
      await declineCall(callId, organizationId);
    } catch (e) {
      console.error('Error declining call:', e);
    }
    navigation.goBack();
  };

  const initials = callerName
    ? callerName.split(' ').map((n) => n[0]).join('').toUpperCase()
    : '?';

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [80, 0],
  });
  const opacity = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <View style={styles.container}>
      {/* Blurred dark overlay */}
      <LinearGradient
        colors={['rgba(0,0,0,0.92)', 'rgba(10,10,30,0.96)']}
        style={StyleSheet.absoluteFill}
      />

      {/* Decorative glow */}
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <Animated.View style={[styles.card, { opacity, transform: [{ translateY }] }]}>
        {/* Call type banner */}
        <View style={styles.callTypeBanner}>
          <MaterialCommunityIcons
            name={callType === 'video' ? 'video' : 'phone-incoming'}
            size={16}
            color="#4ade80"
          />
          <Text style={styles.callTypeBannerText}>
            Incoming {callType === 'video' ? 'Video' : 'Voice'} Call
          </Text>
        </View>

        {/* Avatar */}
        <Animated.View style={[styles.avatarWrapper, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.avatarRingOuter} />
          <View style={styles.avatarRingInner} />
          {callerAvatar ? (
            <Avatar.Image size={130} source={{ uri: callerAvatar }} style={styles.avatar} />
          ) : (
            <Avatar.Text size={130} label={initials} style={styles.avatarFallback} />
          )}
        </Animated.View>

        <Text style={styles.callerName}>{callerName}</Text>
        <Text style={styles.callerSubtext}>is calling you...</Text>

        {/* Action buttons */}
        <View style={styles.actions}>
          {/* Decline */}
          <Animated.View style={{ transform: [{ translateY: declineSlide }] }}>
            <TouchableOpacity style={styles.declineButton} onPress={handleDecline} activeOpacity={0.85}>
              <LinearGradient
                colors={['#ef4444', '#b91c1c']}
                style={styles.actionGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <MaterialCommunityIcons name="phone-hangup" size={34} color="#fff" />
              </LinearGradient>
              <Text style={styles.actionLabel}>Decline</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Accept */}
          <Animated.View style={{ transform: [{ translateY: acceptSlide }] }}>
            <TouchableOpacity
              style={styles.acceptButton}
              onPress={handleAccept}
              disabled={isAnswering}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#22c55e', '#15803d']}
                style={styles.actionGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <MaterialCommunityIcons
                  name={callType === 'video' ? 'video' : 'phone'}
                  size={34}
                  color="#fff"
                />
              </LinearGradient>
              <Text style={styles.actionLabel}>Accept</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Swipe hint */}
        <Text style={styles.hint}>
          {callType === 'video' ? '📹' : '📞'} Answer to connect
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowTop: {
    position: 'absolute',
    top: -100,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(239,68,68,0.06)',
  },
  card: {
    width: '88%',
    maxWidth: 380,
    backgroundColor: 'rgba(15,23,42,0.95)',
    borderRadius: 32,
    padding: 36,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 30,
  },
  callTypeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(74,222,128,0.12)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.2)',
  },
  callTypeBannerText: {
    color: '#4ade80',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  avatarWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  avatarRingOuter: {
    position: 'absolute',
    width: 158,
    height: 158,
    borderRadius: 79,
    borderWidth: 2,
    borderColor: 'rgba(74,222,128,0.2)',
  },
  avatarRingInner: {
    position: 'absolute',
    width: 144,
    height: 144,
    borderRadius: 72,
    borderWidth: 1.5,
    borderColor: 'rgba(74,222,128,0.4)',
  },
  avatar: {
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  avatarFallback: {
    backgroundColor: '#4f46e5',
  },
  callerName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  callerSubtext: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 40,
    fontWeight: '400',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 24,
  },
  declineButton: { alignItems: 'center', gap: 10 },
  acceptButton: { alignItems: 'center', gap: 10 },
  actionGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  actionLabel: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  hint: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '400',
  },
});