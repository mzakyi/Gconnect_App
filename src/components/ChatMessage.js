import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Avatar } from 'react-native-paper';

export default function ChatMessage({ message, isOwnMessage }) {
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View style={[
      styles.container,
      isOwnMessage ? styles.ownMessage : styles.otherMessage
    ]}>
      {!isOwnMessage && (
        <Avatar.Image 
          size={32} 
          source={{ uri: message.userPhoto || 'https://via.placeholder.com/150' }}
          style={styles.avatar}
        />
      )}
      
      <View style={[
        styles.bubble,
        isOwnMessage ? styles.ownBubble : styles.otherBubble
      ]}>
        {!isOwnMessage && (
          <Text variant="labelSmall" style={styles.name}>
            {message.userName}
          </Text>
        )}
        <Text style={isOwnMessage ? styles.ownText : styles.otherText}>
          {message.text}
        </Text>
        <Text variant="labelSmall" style={styles.time}>
          {formatTime(message.timestamp || message.createdAt)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'flex-end',
  },
  ownMessage: {
    justifyContent: 'flex-end',
  },
  otherMessage: {
    justifyContent: 'flex-start',
  },
  avatar: {
    marginRight: 8,
  },
  bubble: {
    maxWidth: '70%',
    padding: 10,
    borderRadius: 15,
  },
  ownBubble: {
    backgroundColor: '#007AFF',
  },
  otherBubble: {
    backgroundColor: '#E5E5EA',
  },
  name: {
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#000',
  },
  ownText: {
    color: '#fff',
  },
  otherText: {
    color: '#000',
  },
  time: {
    marginTop: 4,
    opacity: 0.6,
    fontSize: 10,
  },
});