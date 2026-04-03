import React, { useState, useEffect, useContext, useRef } from 'react';
import { useActiveOrg } from '../../context/ActiveOrgContext';
import { View, FlatList, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity, Image, Alert } from 'react-native';
import { TextInput, IconButton, Text, Avatar, Surface, Chip, Modal, Portal } from 'react-native-paper';
import { AuthContext } from '../../context/AuthContext';
import { sendGroupMessage, subscribeToGroupMessages, subscribeToOnlineUsers, addReaction } from '../../services/chatService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import EmojiSelector from 'react-native-emoji-selector';

export default function ChatScreen({ navigation, route }) {
  const { user, userProfile } = useContext(AuthContext);
const { activeOrgId: organizationId } = useActiveOrg();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [selectedMessageForReaction, setSelectedMessageForReaction] = useState(null);
  const flatListRef = useRef(null);
  
  const isChatList = route?.params?.isChatList || false;
  const [incomingCall, setIncomingCall] = useState(null);
  const [showIncomingCall, setShowIncomingCall] = useState(false);

 useEffect(() => {
  const unsubscribe = subscribeToGroupMessages(setMessages, organizationId);
  const unsubscribeOnline = subscribeToOnlineUsers(setOnlineUsers, organizationId);
  return () => {
    if (unsubscribe) unsubscribe();
    if (unsubscribeOnline) unsubscribeOnline();
  };
}, [organizationId]);

  useEffect(() => {
    // Request permissions on mount
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    await ImagePicker.requestMediaLibraryPermissionsAsync();
    await ImagePicker.requestCameraPermissionsAsync();
    await Audio.requestPermissionsAsync();
  };

  const handleAttachment = () => {
    setShowAttachmentMenu(true);
  };

  const pickImage = async () => {
    setShowAttachmentMenu(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      await sendMediaMessage(result.assets[0].uri, 'image');
    }
  };

  const pickVideo = async () => {
    setShowAttachmentMenu(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],       quality: 0.8,
    });

    if (!result.canceled) {
      await sendMediaMessage(result.assets[0].uri, 'video');
    }
  };

  const pickDocument = async () => {
    setShowAttachmentMenu(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        await sendMediaMessage(asset.uri, 'document', asset.name);
      }
    } catch (error) {
      console.error('Error picking document:', error);
    }
  };

  const takePhoto = async () => {
    setShowAttachmentMenu(false);
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      await sendMediaMessage(result.assets[0].uri, 'image');
    }
  };

  const sendMediaMessage = async (uri, type, fileName = null) => {
    setSending(true);
    try {
      await sendGroupMessage(
        user.uid,
        `${userProfile.firstName} ${userProfile.lastName}`,
        userProfile.profilePicture,
        '',
        type,
        uri,
        fileName,
        replyingTo
      );
      setReplyingTo(null);
    } catch (error) {
      console.error('Error sending media:', error);
      Alert.alert('Error', 'Failed to send media');
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      setRecording(recording);
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording', error);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    setIsRecording(false);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);

    if (uri) {
      await sendMediaMessage(uri, 'audio');
    }
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;
    setSending(true);
    try {
      await sendGroupMessage(
        user.uid,
        `${userProfile.firstName} ${userProfile.lastName}`,
        userProfile.profilePicture,
        inputText.trim(),
        'text', null, null,
        replyingTo
      );
      setInputText('');
      setReplyingTo(null);
    } catch (error) {
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleEmojiSelect = (emoji) => {
    setInputText(prev => prev + emoji);
  };

  const handleReaction = async (messageId, emoji) => {
    try {
      await addReaction('alumni-group', messageId, user.uid, emoji, organizationId, false);
      setSelectedMessageForReaction(null);
    } catch (error) {
      console.error('Error sending reaction:', error);
    }
  };

  const handleReply = (message) => {
    setReplyingTo(message);
    setSelectedMessageForReaction(null);
  };

  const handleVideoCall = () => {
    Alert.alert('Video Calls', 'Video calling is currently disabled in Expo Go. This feature will be available in a production build.');
  };

const handleVoiceCall = () => {
  // For now, just log
  console.log('Voice call pressed — feature disabled for now');
};


  const handleMenuPress = () => {
    Alert.alert(
      'Chat Options',
      'Choose an action',
      [
        { text: 'View Members', onPress: () => navigation.navigate('ChatMembers') },
        { text: 'Search Messages', onPress: () => {} },
        { text: 'Mute Notifications', onPress: () => {} },
        { text: 'Chat Settings', onPress: () => navigation.navigate('ChatSettings') },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const getTimeAgo = (date) => {
    const now = new Date();
    const messageDate = date?.toDate ? date.toDate() : new Date(date);
    const seconds = Math.floor((now - messageDate) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    
    const hours = messageDate.getHours();
    const minutes = messageDate.getMinutes();
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  const formatDate = (date) => {
    const messageDate = date?.toDate ? date.toDate() : new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (messageDate.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (messageDate.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return messageDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const shouldShowDateSeparator = (currentMsg, prevMsg) => {
    if (!prevMsg) return true;
    
    const currentDate = currentMsg.createdAt?.toDate ? currentMsg.createdAt.toDate() : new Date(currentMsg.createdAt);
    const prevDate = prevMsg.createdAt?.toDate ? prevMsg.createdAt.toDate() : new Date(prevMsg.createdAt);
    
    return currentDate.toDateString() !== prevDate.toDateString();
  };

  const renderMessageContent = (item) => {
    switch (item.type) {
      case 'image':
        return (
          <TouchableOpacity onPress={() => navigation.navigate('ImageViewer', { uri: item.mediaUrl })}>
            <Image source={{ uri: item.mediaUrl }} style={styles.messageImage} />
            {item.text && <Text style={styles.messageText}>{item.text}</Text>}
          </TouchableOpacity>
        );
      case 'video':
        return (
          <View>
            <TouchableOpacity style={styles.videoContainer}>
              <MaterialCommunityIcons name="play-circle" size={48} color="#fff" />
            </TouchableOpacity>
            {item.text && <Text style={styles.messageText}>{item.text}</Text>}
          </View>
        );
      case 'audio':
        return (
          <View style={styles.audioContainer}>
            <MaterialCommunityIcons name="microphone" size={20} color="#007AFF" />
            <View style={styles.audioWave} />
            <Text style={styles.audioDuration}>0:00</Text>
          </View>
        );
      case 'document':
        return (
          <View style={styles.documentContainer}>
            <MaterialCommunityIcons name="file-document" size={32} color="#007AFF" />
            <View style={styles.documentInfo}>
              <Text style={styles.documentName}>{item.fileName || 'Document'}</Text>
              <Text style={styles.documentSize}>PDF</Text>
            </View>
          </View>
        );
      default:
        return <Text style={styles.messageText}>{item.text}</Text>;
    }
  };

  const renderMessage = ({ item, index }) => {
    const isOwnMessage = item.userId === user.uid;
    const prevMessage = index > 0 ? messages[index - 1] : null;
    const showDate = shouldShowDateSeparator(item, prevMessage);
    const showAvatar = !isOwnMessage && (
      index === messages.length - 1 || 
      messages[index + 1]?.userId !== item.userId
    );

    return (
      <View>
        {showDate && (
          <View style={styles.dateSeparator}>
            <View style={styles.dateLine} />
            <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
            <View style={styles.dateLine} />
          </View>
        )}
        
        <TouchableOpacity
          onLongPress={() => setSelectedMessageForReaction(item)}
          activeOpacity={0.7}
        >
          <View style={[
            styles.messageRow,
            isOwnMessage ? styles.ownMessageRow : styles.otherMessageRow
          ]}>
            {!isOwnMessage && (
              <View style={styles.avatarContainer}>
                {showAvatar ? (
                  <Avatar.Text 
                    size={32} 
                    label={item.userName?.split(' ').map(n => n[0]).join('') || 'U'}
                    style={styles.messageAvatar}
                  />
                ) : (
                  <View style={{ width: 32 }} />
                )}
              </View>
            )}
            
            <View style={[
              styles.messageBubble,
              isOwnMessage ? styles.ownMessage : styles.otherMessage
            ]}>
              {item.replyTo && (
                <View style={styles.replyContainer}>
                  <View style={styles.replyBar} />
                  <View style={styles.replyContent}>
                    <Text style={styles.replyName}>{item.replyTo.userName}</Text>
                    <Text style={styles.replyText} numberOfLines={1}>
                      {item.replyTo.text || 'Media'}
                    </Text>
                  </View>
                </View>
              )}
              
              {!isOwnMessage && (
                <Text style={styles.senderName}>{item.userName}</Text>
              )}
              
              {renderMessageContent(item)}
              
              <View style={styles.messageFooter}>
                <Text style={[
                  styles.timeText,
                  isOwnMessage ? styles.ownTimeText : styles.otherTimeText
                ]}>
                  {getTimeAgo(item.createdAt)}
                </Text>
                {isOwnMessage && (
                  <MaterialCommunityIcons 
                    name="check-all" 
                    size={16} 
                    color="#4FC3F7" 
                    style={styles.readIcon}
                  />
                )}
              </View>

              {/* Reactions */}
              {item.reactions && Object.keys(item.reactions).length > 0 && (
                <View style={styles.reactionsContainer}>
                  {Object.entries(item.reactions).map(([emoji, users]) => (
                    <View key={emoji} style={styles.reactionBubble}>
                      <Text style={styles.reactionEmoji}>{emoji}</Text>
                      <Text style={styles.reactionCount}>{users.length}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons name="chat-outline" size={80} color="#ccc" />
      <Text variant="titleLarge" style={styles.emptyTitle}>No messages yet</Text>
      <Text variant="bodyMedium" style={styles.emptyText}>
        Start the conversation with your fellow alumni!
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Custom Header */}
      <LinearGradient
        colors={['#007AFF', '#0056b3']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity 
            style={styles.headerLeft}
            onPress={() => {
              if (isChatList) {
                navigation.goBack();
              } else {
                navigation.navigate('ChatList');
              }
            }}
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          
          <View style={styles.headerCenter}>
            <View style={styles.groupAvatarContainer}>
              <Avatar.Icon size={40} icon="account-group" style={styles.groupAvatar} />
              <View style={styles.onlineBadge}>
                <View style={styles.onlineDot} />
              </View>
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle}>RTD Alumni Chat</Text>
              <Text style={styles.headerSubtitle}>
                {onlineUsers} {onlineUsers === 1 ? 'member' : 'members'} online
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <IconButton
              icon="phone"
              iconColor="#fff"
              size={22}
              onPress={handleVoiceCall}
            />
            <IconButton
              icon="video"
              iconColor="#fff"
              size={22}
              onPress={handleVideoCall}
            />
            <IconButton
              icon="dots-vertical"
              iconColor="#fff"
              size={22}
              onPress={handleMenuPress}
            />
          </View>
        </View>
      </LinearGradient>

      {/* Quick Reactions Bar */}
      <Surface style={styles.quickReactionsBar} elevation={1}>
        <TouchableOpacity style={styles.quickReaction}>
          <Text style={styles.reactionEmoji}>👍</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickReaction}>
          <Text style={styles.reactionEmoji}>❤️</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickReaction}>
          <Text style={styles.reactionEmoji}>😂</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickReaction}>
          <Text style={styles.reactionEmoji}>🎉</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickReaction}>
          <Text style={styles.reactionEmoji}>👏</Text>
        </TouchableOpacity>
      </Surface>

      {/* Reply Preview */}
      {replyingTo && (
        <Surface style={styles.replyPreview} elevation={2}>
          <View style={styles.replyPreviewContent}>
            <View style={styles.replyBar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.replyPreviewName}>{replyingTo.userName}</Text>
              <Text style={styles.replyPreviewText} numberOfLines={1}>
                {replyingTo.text || 'Media'}
              </Text>
            </View>
          </View>
          <IconButton
            icon="close"
            size={20}
            onPress={() => setReplyingTo(null)}
          />
        </Surface>
      )}

      {/* Messages List */}
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          ListEmptyComponent={renderEmpty}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          inverted={false}
        />

        {/* Emoji Picker */}
        <Portal>
          <Modal
            visible={showEmojiPicker}
            onDismiss={() => setShowEmojiPicker(false)}
            contentContainerStyle={styles.emojiModal}
          >
            <EmojiSelector
              onEmojiSelected={handleEmojiSelect}
              showSearchBar={false}
              columns={8}
            />
          </Modal>
        </Portal>

        {/* Attachment Menu */}
        <Portal>
          <Modal
            visible={showAttachmentMenu}
            onDismiss={() => setShowAttachmentMenu(false)}
            contentContainerStyle={styles.attachmentModal}
          >
            <View style={styles.attachmentGrid}>
              <TouchableOpacity style={styles.attachmentOption} onPress={pickDocument}>
                <View style={[styles.attachmentIcon, { backgroundColor: '#9C27B0' }]}>
                  <MaterialCommunityIcons name="file-document" size={28} color="#fff" />
                </View>
                <Text style={styles.attachmentLabel}>Document</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.attachmentOption} onPress={takePhoto}>
                <View style={[styles.attachmentIcon, { backgroundColor: '#F44336' }]}>
                  <MaterialCommunityIcons name="camera" size={28} color="#fff" />
                </View>
                <Text style={styles.attachmentLabel}>Camera</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.attachmentOption} onPress={pickImage}>
                <View style={[styles.attachmentIcon, { backgroundColor: '#E91E63' }]}>
                  <MaterialCommunityIcons name="image" size={28} color="#fff" />
                </View>
                <Text style={styles.attachmentLabel}>Gallery</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.attachmentOption} onPress={pickVideo}>
                <View style={[styles.attachmentIcon, { backgroundColor: '#FF9800' }]}>
                  <MaterialCommunityIcons name="video" size={28} color="#fff" />
                </View>
                <Text style={styles.attachmentLabel}>Video</Text>
              </TouchableOpacity>
            </View>
          </Modal>
        </Portal>

        {/* Message Reaction Menu */}
        <Portal>
          <Modal
            visible={!!selectedMessageForReaction}
            onDismiss={() => setSelectedMessageForReaction(null)}
            contentContainerStyle={styles.reactionModal}
          >
            <View style={styles.reactionMenuContainer}>
              <View style={styles.reactionMenuEmojis}>
                {['❤️', '👍', '😂', '😮', '😢', '🙏'].map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={styles.reactionMenuEmoji}
                    onPress={() => handleReaction(selectedMessageForReaction?.id, emoji)}
                  >
                    <Text style={styles.reactionMenuEmojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.reactionMenuActions}>
                <TouchableOpacity
                  style={styles.reactionMenuAction}
                  onPress={() => handleReply(selectedMessageForReaction)}
                >
                  <MaterialCommunityIcons name="reply" size={20} color="#007AFF" />
                  <Text style={styles.reactionMenuActionText}>Reply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </Portal>

        {/* Input Container */}
        <View style={styles.inputWrapper}>
          <Surface style={styles.inputContainer} elevation={4}>
            <IconButton
              icon="plus-circle"
              size={28}
              iconColor="#007AFF"
              onPress={handleAttachment}
            />
            
            <View style={styles.inputBox}>
              <TextInput
                value={inputText}
                onChangeText={setInputText}
                placeholder="Type a message..."
                style={styles.input}
                mode="flat"
                multiline
                maxLength={500}
                underlineColor="transparent"
                activeUnderlineColor="transparent"
              />
              <View style={styles.inputActions}>
                <IconButton
                  icon="emoticon-outline"
                  size={22}
                  iconColor="#666"
                  onPress={() => setShowEmojiPicker(true)}
                />
                <IconButton
                  icon="camera"
                  size={22}
                  iconColor="#666"
                  onPress={takePhoto}
                />
              </View>
            </View>

            {inputText.trim() ? (
              <TouchableOpacity
                style={[styles.sendButton, sending && styles.sendButtonDisabled]}
                onPress={handleSend}
                disabled={sending}
              >
                <MaterialCommunityIcons 
                  name="send" 
                  size={22} 
                  color="#fff" 
                />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPressIn={startRecording}
                onPressOut={stopRecording}
              >
                <View style={[styles.micButton, isRecording && styles.micButtonRecording]}>
                  <MaterialCommunityIcons 
                    name="microphone" 
                    size={28} 
                    color={isRecording ? '#fff' : '#007AFF'} 
                  />
                </View>
              </TouchableOpacity>
            )}
          </Surface>

          {/* Character Count */}
          {inputText.length > 400 && (
            <Text style={styles.charCount}>
              {inputText.length}/500
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E5DDD5',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 10,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  headerLeft: {
    padding: 5,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 5,
  },
  groupAvatarContainer: {
    position: 'relative',
  },
  groupAvatar: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 2,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
  },
  headerInfo: {
    marginLeft: 12,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.9,
  },
  headerRight: {
    flexDirection: 'row',
  },
  quickReactionsBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 10,
    justifyContent: 'space-around',
  },
  quickReaction: {
    padding: 5,
  },
  reactionEmoji: {
    fontSize: 24,
  },
  replyPreview: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 15,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyPreviewContent: {
    flex: 1,
    flexDirection: 'row',
  },
  replyBar: {
    width: 3,
    backgroundColor: '#007AFF',
    marginRight: 10,
    borderRadius: 2,
  },
  replyPreviewName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
  },
  replyPreviewText: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  keyboardView: {
    flex: 1,
  },
  messageList: {
    padding: 10,
    flexGrow: 1,
  },
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 15,
  },
  dateLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ccc',
  },
  dateText: {
    marginHorizontal: 10,
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 2,
    paddingHorizontal: 5,
  },
  ownMessageRow: {
    justifyContent: 'flex-end',
  },
  otherMessageRow: {
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    marginRight: 8,
    justifyContent: 'flex-end',
  },
  messageAvatar: {
    backgroundColor: '#007AFF',
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 10,
    borderRadius: 12,
    marginVertical: 1,
  },
  ownMessage: {
    backgroundColor: '#DCF8C6',
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
  },
  replyContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  replyContent: {
    flex: 1,
  },
  replyName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 2,
  },
  replyText: {
    fontSize: 12,
    color: '#666',
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 3,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    color: '#000',
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginBottom: 5,
  },
  videoContainer: {
    width: 200,
    height: 200,
    backgroundColor: '#000',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  audioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  audioWave: {
    flex: 1,
    height: 30,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 10,
    borderRadius: 15,
  },
  audioDuration: {
    fontSize: 12,
    color: '#666',
  },
  documentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  documentInfo: {
    marginLeft: 10,
  },
  documentName: {
    fontSize: 14,
    fontWeight: '500',
  },
  documentSize: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 3,
    gap: 3,
  },
  timeText: {
    fontSize: 11,
  },
  ownTimeText: {
    color: '#667',
  },
  otherTimeText: {
    color: '#999',
  },
  readIcon: {
    marginLeft: 2,
  },
  reactionsContainer: {
    flexDirection: 'row',
    marginTop: 5,
    flexWrap: 'wrap',
  },
  reactionBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginRight: 5,
    marginTop: 3,
  },
  reactionCount: {
    fontSize: 11,
    marginLeft: 3,
    color: '#666',
  },
  inputWrapper: {
    backgroundColor: '#f0f0f0',
    paddingTop: 5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: '#fff',
    marginHorizontal: 8,
    marginBottom: 8,
    borderRadius: 25,
  },
  inputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 12,
    minHeight: 40,
    maxHeight: 100,
  },
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    fontSize: 15,
    paddingTop: 10,
  },
  inputActions: {
    flexDirection: 'row',
    marginLeft: 5,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 5,
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  micButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 5,
  },
  micButtonRecording: {
    backgroundColor: '#F44336',
  },
  charCount: {
    fontSize: 11,
    color: '#999',
    textAlign: 'right',
    paddingHorizontal: 15,
    paddingBottom: 5,
  },
  emojiModal: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    height: 300,
  },
  attachmentModal: {
    backgroundColor: '#fff',
    marginHorizontal: 40,
    marginVertical: 'auto',
    borderRadius: 20,
    padding: 20,
  },
  attachmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
  attachmentOption: {
    alignItems: 'center',
    width: '45%',
    marginVertical: 10,
  },
  attachmentIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  attachmentLabel: {
    fontSize: 13,
    color: '#666',
  },
  reactionModal: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginVertical: 'auto',
    borderRadius: 16,
    padding: 0,
    overflow: 'hidden',
  },
  reactionMenuContainer: {
    padding: 0,
  },
  reactionMenuEmojis: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 15,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  reactionMenuEmoji: {
    padding: 8,
  },
  reactionMenuEmojiText: {
    fontSize: 28,
  },
  reactionMenuActions: {
    padding: 10,
  },
  reactionMenuAction: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  reactionMenuActionText: {
    fontSize: 16,
    marginLeft: 15,
    color: '#007AFF',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    marginTop: 15,
    fontWeight: 'bold',
    color: '#666',
  },
  emptyText: {
    marginTop: 8,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});