// components/IncomingCallModal.js
import React, { useEffect } from 'react';
import { View, StyleSheet, Modal } from 'react-native';
import { Button, Avatar, Text } from 'react-native-paper';
import { Audio } from 'expo-av';

export default function IncomingCallModal({ 
  visible, 
  callData, 
  onAccept, 
  onReject 
}) {
  const [sound, setSound] = React.useState();

  // Play ringtone when call comes in
  useEffect(() => {
    if (visible) {
      playRingtone();
    } else {
      stopRingtone();
    }

    return () => {
      stopRingtone();
    };
  }, [visible]);

  const playRingtone = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/sounds/ringtone.mp3'), // You'll need to add this
        { shouldPlay: true, isLooping: true }
      );
      setSound(sound);
    } catch (error) {
      console.log('Error playing ringtone:', error);
    }
  };

  const stopRingtone = async () => {
    if (sound) {
      await sound.stopAsync();
      await sound.unloadAsync();
    }
  };

  if (!callData) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onReject}
    >
      <View style={styles.container}>
        <View style={styles.card}>
          {/* Avatar handling */}
          {callData.callerAvatar ? (
            <Avatar.Image
              size={100}
              source={{ uri: callData.callerAvatar }}
              style={styles.avatar}
            />
          ) : (
            <Avatar.Text
              size={100}
              label={
                callData.callerName
                  ? callData.callerName[0].toUpperCase()
                  : '?'
              }
              style={[styles.avatar, { backgroundColor: '#ccc' }]}
            />
          )}

          {/* Caller info */}
          <Text style={styles.callerName}>{callData.callerName}</Text>
          <Text style={styles.callType}>
            Incoming {callData.callType === 'video' ? 'Video' : 'Voice'} Call
          </Text>

          {/* Action buttons */}
          <View style={styles.actions}>
            <Button
              mode="contained"
              onPress={onReject}
              style={[styles.button, styles.rejectButton]}
              labelStyle={styles.buttonLabel}
              icon="phone-hangup"
            >
              Decline
            </Button>

            <Button
              mode="contained"
              onPress={onAccept}
              style={[styles.button, styles.acceptButton]}
              labelStyle={styles.buttonLabel}
              icon="phone"
            >
              Accept
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    width: '85%',
    maxWidth: 400,
  },
  avatar: {
    marginBottom: 20,
  },
  callerName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  callType: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  button: {
    flex: 1,
    marginHorizontal: 5,
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#F44336',
  },
  buttonLabel: {
    fontSize: 16,
  },
});