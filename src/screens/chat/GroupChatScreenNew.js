// src/screens/chat/GroupChatScreen.js
import React, { useState, useEffect, useContext, useRef, memo } from 'react';
import { useActiveOrg } from '../../context/ActiveOrgContext';
import {
  View, FlatList, StyleSheet, KeyboardAvoidingView, Platform,
  TouchableOpacity, Image, Alert, ImageBackground
} from 'react-native';
import { TextInput, IconButton, Text, Avatar, Surface, Modal, Portal, Button } from 'react-native-paper';
import { AuthContext } from '../../context/AuthContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { TextInput as RNTextInput } from 'react-native';
import { useBadges } from '../../context/BadgeContext';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase.config';
import { Audio } from 'expo-av';
import {
  subscribeToGroupChatMessages,
  sendGroupChatMessage,
  markGroupMessagesAsRead,
  uploadMediaFile,
  addReaction,
  removeReaction,
  downloadMediaFile,
  pinMessage,
  unpinMessage,
} from '../../services/chatService';
import { initiateCall } from '../../services/callService';

// ── Background wrapper — defined OUTSIDE the screen so it never remounts ────
// Same fix as PrivateChatScreen: keeping this outside prevents React from
// treating it as a new component on every render, which caused the flicker.
const ChatBackground = memo(({ backgroundImage, children }) => {
  const [ready, setReady] = useState(!backgroundImage);

  useEffect(() => {
    if (!backgroundImage) {
      setReady(true);
      return;
    }
    let cancelled = false;
    Image.prefetch(backgroundImage)
      .then(() => { if (!cancelled) setReady(true); })
      .catch(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [backgroundImage]);

  if (backgroundImage && ready) {
    return (
      <ImageBackground
        source={{ uri: backgroundImage }}
        style={{ flex: 1 }}
        resizeMode="cover"
        fadeDuration={0}
      >
        {children}
      </ImageBackground>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#ECE5DD' }}>
      {children}
    </View>
  );
});

export default function GroupChatScreen({ navigation, route }) {
  const { groupId, groupImage } = route.params;
  const { user, userProfile } = useContext(AuthContext);
const { activeOrgId: organizationId } = useActiveOrg();
  const { refreshBadges } = useBadges();

  const [messages, setMessages]                     = useState([]);
  const [groupName, setGroupName]                   = useState(route.params.groupName || '');
  const [inputText, setInputText]                   = useState('');
  const [sending, setSending]                       = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [recording, setRecording]                   = useState(null);
  const [isRecording, setIsRecording]               = useState(false);
  const [recordingDuration, setRecordingDuration]   = useState(0);
  const [recordedAudio, setRecordedAudio]           = useState(null);
  const [showAudioPreview, setShowAudioPreview]     = useState(false);
  const [audioSound, setAudioSound]                 = useState(null);
  const [isPlaying, setIsPlaying]                   = useState(false);
  const [replyingTo, setReplyingTo]                 = useState(null);
  const [selectedMessage, setSelectedMessage]       = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);

  // ── Initialize from route params immediately to prevent flicker ───────────
  const [backgroundImage, setBackgroundImage] = useState(
    route.params?.backgroundImage ?? null
  );

  const [pinnedMessage, setPinnedMessage]           = useState(null);
  const [showPinnedBanner, setShowPinnedBanner]     = useState(true);

  const flatListRef          = useRef(null);
  const recordingIntervalRef = useRef(null);

  // ── Live listener for group name + background + pinned message ───────────
  useEffect(() => {
    if (!organizationId) return;
    const groupRef = doc(db, 'organizations', organizationId, 'groupChats', groupId);
    const unsubscribe = onSnapshot(groupRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setGroupName(data.name || route.params.groupName || '');
        // Only update if actually changed to avoid re-renders
        setBackgroundImage(prev => {
          const newBg = data.backgroundImage ?? null;
          return prev === newBg ? prev : newBg;
        });
        setPinnedMessage(data.pinnedMessage || null);
      }
    });
    return () => unsubscribe();
  }, [organizationId, groupId]);

  // ── Messages listener ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!organizationId) return;
    const unsubscribe = subscribeToGroupChatMessages(groupId, (msgs) => {
      setMessages(msgs.filter(m => !m.deletedFor?.[user.uid]));
    }, organizationId);
    markGroupMessagesAsRead(groupId, user.uid, organizationId).then(() => refreshBadges());
    return () => { if (unsubscribe) unsubscribe(); };
  }, [groupId, user.uid, organizationId]);

  useEffect(() => { requestPermissions(); }, []);

  const requestPermissions = async () => {
    await ImagePicker.requestMediaLibraryPermissionsAsync();
    await ImagePicker.requestCameraPermissionsAsync();
    await Audio.requestPermissionsAsync();
  };

  // ── Media pickers ─────────────────────────────────────────────────────────
  const pickImage = async () => {
    setShowAttachmentMenu(false);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
    if (!result.canceled) await sendMediaMessage(result.assets[0].uri, 'image');
  };

  const takePhoto = async () => {
    setShowAttachmentMenu(false);
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 });
    if (!result.canceled) await sendMediaMessage(result.assets[0].uri, 'image');
  };

  const pickDocument = async () => {
    setShowAttachmentMenu(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets?.[0]) {
        await sendMediaMessage(result.assets[0].uri, 'document', result.assets[0].name);
      }
    } catch (error) { console.error('Error picking document:', error); }
  };

  const sendMediaMessage = async (uri, type, fileName = null) => {
    setSending(true);
    try {
      const mediaData = await uploadMediaFile(uri, type, groupId, user.uid, organizationId);
      await sendGroupChatMessage(
        groupId, user.uid,
        `${userProfile.firstName} ${userProfile.lastName}`,
        userProfile.profilePicture, '',
        organizationId, type,
        mediaData.downloadURL,
        fileName || mediaData.fileName,
        replyingTo
      );
      setReplyingTo(null);
    } catch (error) {
      Alert.alert('Error', 'Failed to send media');
    } finally {
      setSending(false);
    }
  };

  // ── Voice recording ───────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
      setIsRecording(true);
      setRecordingDuration(0);
      recordingIntervalRef.current = setInterval(() => setRecordingDuration(prev => prev + 1), 1000);
    } catch (error) {
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    clearInterval(recordingIntervalRef.current);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);
    if (uri) { setRecordedAudio(uri); setShowAudioPreview(true); }
  };

  const playRecordedAudio = async () => {
    try {
      if (audioSound) await audioSound.unloadAsync();
      const { sound } = await Audio.Sound.createAsync({ uri: recordedAudio }, { shouldPlay: true });
      setAudioSound(sound);
      setIsPlaying(true);
      sound.setOnPlaybackStatusUpdate((status) => { if (status.didJustFinish) setIsPlaying(false); });
      await sound.playAsync();
    } catch (error) { console.error('Error playing audio:', error); }
  };

  const stopPlayingAudio = async () => {
    if (audioSound) { await audioSound.stopAsync(); setIsPlaying(false); }
  };

  const sendRecordedAudio = async () => {
    setShowAudioPreview(false);
    await sendMediaMessage(recordedAudio, 'audio');
    setRecordedAudio(null);
    if (audioSound) { await audioSound.unloadAsync(); setAudioSound(null); }
  };

  const cancelRecordedAudio = async () => {
    setShowAudioPreview(false);
    setRecordedAudio(null);
    if (audioSound) { await audioSound.unloadAsync(); setAudioSound(null); }
  };

  // ── Send text ─────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!inputText.trim()) return;
    const messageText = inputText.trim();
    setInputText('');
    setSending(true);
    try {
      await sendGroupChatMessage(
        groupId, user.uid,
        `${userProfile.firstName} ${userProfile.lastName}`,
        userProfile.profilePicture,
        messageText, organizationId, 'text', null, null, replyingTo
      );
      setReplyingTo(null);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error) {
      Alert.alert('Error', 'Failed to send message');
      setInputText(messageText);
    } finally {
      setSending(false);
    }
  };

  // ── Reactions ─────────────────────────────────────────────────────────────
  const handleReaction = async (messageId, emoji) => {
    try {
      const message = messages.find(m => m.id === messageId);
      const userReacted = message.reactions?.[emoji]?.includes(user.uid);
      if (userReacted) {
        await removeReaction(groupId, messageId, user.uid, emoji, organizationId, true);
      } else {
        await addReaction(groupId, messageId, user.uid, emoji, organizationId, true);
      }
      setSelectedMessage(null);
    } catch (error) { console.error('Error handling reaction:', error); }
  };

  // ── Pin / Unpin ───────────────────────────────────────────────────────────
  const handlePinMessage = async (message) => {
    try {
      const isPinned = pinnedMessage?.id === message.id;
      if (isPinned) {
        await unpinMessage(groupId, organizationId);
        Alert.alert('Unpinned', 'Message has been unpinned.');
      } else {
        await pinMessage(groupId, {
          id: message.id,
          text: message.text || getMediaLabel(message.type),
          userName: message.userName,
          type: message.type,
        }, organizationId);
        setShowPinnedBanner(true);
        Alert.alert('Pinned', 'Message has been pinned for everyone.');
      }
      setSelectedMessage(null);
    } catch (error) {
      console.error('Error pinning message:', error);
      Alert.alert('Error', 'Failed to pin message.');
    }
  };

  const scrollToMessage = (messageId) => {
    const index = messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      setHighlightedMessageId(messageId);
      flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      setTimeout(() => setHighlightedMessageId(null), 2000);
    } else {
      Alert.alert('Message not found', 'The original message may have been deleted');
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ── Calls ─────────────────────────────────────────────────────────────────
  const fetchGroupMemberIds = async () => {
    try {
      const groupDoc = await getDoc(doc(db, 'organizations', organizationId, 'groupChats', groupId));
      if (!groupDoc.exists()) return [];
      return (groupDoc.data().members || []).filter(id => id !== user.uid);
    } catch (e) { return []; }
  };

  const handleVoiceCall = () => {
    Alert.alert('Start Voice Call', `Start a voice call with ${groupName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Call',
        onPress: async () => {
          try {
            const groupMemberIds = await fetchGroupMemberIds();
            const { callId, roomName } = await initiateCall(
              user.uid, groupId, 'voice', organizationId,
              { callerName: `${userProfile.firstName} ${userProfile.lastName}`, callerAvatar: userProfile.profilePicture || '' },
              { receiverName: groupName, receiverAvatar: groupImage || '' },
              groupMemberIds
            );
            navigation.navigate('VoiceCall', { callId, roomName, otherUserName: groupName, otherUserAvatar: groupImage || null, callType: 'voice', isIncoming: false });
          } catch (e) { Alert.alert('Error', 'Could not start voice call'); }
        }
      }
    ]);
  };

  const handleVideoCall = () => {
    Alert.alert('Start Video Call', `Start a video call with ${groupName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Call',
        onPress: async () => {
          try {
            const groupMemberIds = await fetchGroupMemberIds();
            const { callId, roomName } = await initiateCall(
              user.uid, groupId, 'video', organizationId,
              { callerName: `${userProfile.firstName} ${userProfile.lastName}`, callerAvatar: userProfile.profilePicture || '' },
              { receiverName: groupName, receiverAvatar: groupImage || '' },
              groupMemberIds
            );
            navigation.navigate('VideoCall', { callId, roomName, otherUserName: groupName, otherUserAvatar: groupImage || null, callType: 'video', isIncoming: false });
          } catch (e) { Alert.alert('Error', 'Could not start video call'); }
        }
      }
    ]);
  };

  // ── Message content renderers ─────────────────────────────────────────────
  const getMediaLabel = (type) => {
    const labels = { image: '📷 Photo', video: '🎥 Video', audio: '🎤 Voice message', document: '📄 Document' };
    return labels[type] || 'Media';
  };

  const renderMessageContent = (item) => {
    switch (item.type) {
      case 'image':
        return (
          <View>
            <TouchableOpacity onPress={() => navigation.navigate('ImageViewer', { uri: item.mediaUrl })}>
              <Image source={{ uri: item.mediaUrl }} style={styles.messageImage} />
            </TouchableOpacity>
            {item.text ? <Text style={styles.messageText}>{item.text}</Text> : null}
            <TouchableOpacity onPress={() => downloadMediaFile(item.mediaUrl, item.fileName || 'image.jpg')} style={styles.downloadButton}>
              <MaterialCommunityIcons name="download" size={20} color="#128C7E" />
              <Text style={styles.downloadText}>Download</Text>
            </TouchableOpacity>
          </View>
        );
      case 'video':
        return (
          <View>
            <TouchableOpacity style={styles.videoContainer} onPress={() => navigation.navigate('VideoViewer', { uri: item.mediaUrl })}>
              <MaterialCommunityIcons name="play-circle" size={48} color="#fff" />
            </TouchableOpacity>
            {item.text ? <Text style={styles.messageText}>{item.text}</Text> : null}
          </View>
        );
      default:
        return <Text style={styles.messageText}>{item.text}</Text>;
    }
  };

  const renderMessage = ({ item, index }) => {
    const isOwnMessage = item.userId === user.uid;
    const showAvatar = !isOwnMessage && (
      index === messages.length - 1 || messages[index + 1]?.userId !== item.userId
    );
    const isPinned = pinnedMessage?.id === item.id;

    return (
      <TouchableOpacity onLongPress={() => setSelectedMessage(item)} activeOpacity={0.7}>
        <View style={[styles.messageRow, isOwnMessage ? styles.ownMessageRow : styles.otherMessageRow]}>
          {!isOwnMessage && (
            <View style={styles.avatarContainer}>
              {showAvatar
                ? <Avatar.Image size={32} source={item.userAvatar ? { uri: item.userAvatar } : null} style={styles.messageAvatar} />
                : <View style={{ width: 32 }} />
              }
            </View>
          )}
          <View style={[
            styles.messageBubble,
            isOwnMessage ? styles.ownMessage : styles.otherMessage,
            highlightedMessageId === item.id && styles.highlightedMessage,
            isPinned && styles.pinnedMessageBubble,
          ]}>
            {isPinned && (
              <View style={styles.pinnedIndicatorRow}>
                <MaterialCommunityIcons name="pin" size={12} color="#128C7E" />
                <Text style={styles.pinnedIndicatorText}>Pinned</Text>
              </View>
            )}
            {item.replyTo && (
              <TouchableOpacity
                style={styles.replyContainer}
                onPress={() => item.replyTo.id && scrollToMessage(item.replyTo.id)}
                activeOpacity={0.7}
              >
                <View style={styles.replyBar} />
                <View style={styles.replyContent}>
                  <Text style={styles.replyName}>{item.replyTo.userName}</Text>
                  <Text style={styles.replyText}>{item.replyTo.text || getMediaLabel(item.replyTo.type)}</Text>
                </View>
                <MaterialCommunityIcons name="arrow-up-circle" size={20} color="#128C7E" style={styles.replyIcon} />
              </TouchableOpacity>
            )}
            {!isOwnMessage && <Text style={styles.senderName}>{item.userName}</Text>}
            {renderMessageContent(item)}
            <View style={styles.messageFooter}>
              <Text style={[styles.timeText, isOwnMessage ? styles.ownTimeText : styles.otherTimeText]}>
                {new Date(item.createdAt?.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            {item.reactions && Object.keys(item.reactions).length > 0 && (
              <View style={styles.reactionsContainer}>
                {Object.entries(item.reactions).map(([emoji, users]) =>
                  users.length > 0 && (
                    <TouchableOpacity key={emoji} style={styles.reactionBubble} onPress={() => handleReaction(item.id, emoji)}>
                      <Text style={styles.reactionEmoji}>{emoji}</Text>
                      <Text style={styles.reactionCount}>{users.length}</Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient colors={['#128C7E', '#075E54']} style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            {groupImage
              ? <Avatar.Image size={40} source={{ uri: groupImage }} />
              : <Avatar.Icon size={40} icon="account-group" style={styles.groupAvatar} />
            }
            <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
              {groupName}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <IconButton icon="phone"         iconColor="#fff" size={22} onPress={handleVoiceCall} />
            <IconButton icon="video"         iconColor="#fff" size={22} onPress={handleVideoCall} />
            <IconButton icon="dots-vertical" iconColor="#fff" size={22}
              onPress={() => navigation.navigate('GroupInfo', { groupId, groupName })} />
          </View>
        </View>
      </LinearGradient>

      {/* Pinned Message Banner */}
      {pinnedMessage && showPinnedBanner && (
        <TouchableOpacity
          style={styles.pinnedBanner}
          onPress={() => scrollToMessage(pinnedMessage.id)}
          activeOpacity={0.85}
        >
          <View style={styles.pinnedBannerLeft}>
            <MaterialCommunityIcons name="pin" size={16} color="#128C7E" />
            <View style={styles.pinnedBannerTextContainer}>
              <Text style={styles.pinnedBannerLabel}>Pinned Message</Text>
              <Text style={styles.pinnedBannerText} numberOfLines={1}>
                {pinnedMessage.text}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => setShowPinnedBanner(false)} style={styles.pinnedBannerClose}>
            <MaterialCommunityIcons name="close" size={16} color="#64748B" />
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* Reply preview */}
      {replyingTo && (
        <Surface style={styles.replyPreview} elevation={2}>
          <View style={styles.replyPreviewContent}>
            <View style={styles.replyBar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.replyPreviewName}>{replyingTo.userName}</Text>
              <Text style={styles.replyPreviewText}>{replyingTo.text || getMediaLabel(replyingTo.type)}</Text>
            </View>
          </View>
          <IconButton icon="close" size={20} onPress={() => setReplyingTo(null)} />
        </Surface>
      )}

      {/* Messages + input */}
      <KeyboardAvoidingView 
          style={styles.keyboardView} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0}
        >
        {/* ✅ ChatBackground is defined outside this component so it never remounts */}
        <ChatBackground backgroundImage={backgroundImage}>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messageList}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => flatListRef.current?.scrollToIndex({ index: info.index, animated: true }), 500);
            }}
          />
        </ChatBackground>

        {/* Recording indicator */}
        {isRecording && (
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>Recording... {formatDuration(recordingDuration)}</Text>
            <Text style={styles.recordingHint}>Release to stop</Text>
          </View>
        )}

        {/* Input bar */}
        <Surface style={styles.inputContainer} elevation={4}>
          <IconButton icon="plus-circle" size={28} iconColor="#128C7E" onPress={() => setShowAttachmentMenu(true)} />
          <View style={styles.inputBox}>
            <RNTextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type a message..."
              placeholderTextColor="#999"
              style={styles.input}
              multiline
              maxLength={500}
            />
          </View>
          {inputText.trim() ? (
            <TouchableOpacity style={[styles.sendButton, sending && styles.sendButtonDisabled]} onPress={handleSend} disabled={sending}>
              <MaterialCommunityIcons name="send" size={22} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPressIn={startRecording} onPressOut={stopRecording} style={styles.micButtonContainer}>
              <View style={[styles.micButton, isRecording && styles.micButtonRecording]}>
                <MaterialCommunityIcons name="microphone" size={28} color="#fff" />
              </View>
            </TouchableOpacity>
          )}
        </Surface>
      </KeyboardAvoidingView>

      {/* Modals */}
      <Portal>
        <Modal visible={showAudioPreview} onDismiss={cancelRecordedAudio} contentContainerStyle={styles.audioPreviewModal}>
          <Text style={styles.audioPreviewTitle}>Voice Message Preview</Text>
          <Text style={styles.audioPreviewDuration}>{formatDuration(recordingDuration)}</Text>
          <View style={styles.audioPreviewControls}>
            <IconButton icon={isPlaying ? 'pause-circle' : 'play-circle'} size={60} iconColor="#128C7E" onPress={isPlaying ? stopPlayingAudio : playRecordedAudio} />
          </View>
          <View style={styles.audioPreviewActions}>
            <Button mode="outlined" onPress={cancelRecordedAudio} style={styles.audioPreviewButton}>Cancel</Button>
            <Button mode="contained" onPress={sendRecordedAudio} style={styles.audioPreviewButton} buttonColor="#128C7E">Send</Button>
          </View>
        </Modal>
      </Portal>

      <Portal>
        <Modal visible={showAttachmentMenu} onDismiss={() => setShowAttachmentMenu(false)} contentContainerStyle={styles.attachmentModal}>
          <View style={styles.attachmentGrid}>
            {[
              { label: 'Document', icon: 'file-document', color: '#9C27B0', action: pickDocument },
              { label: 'Camera',   icon: 'camera',        color: '#F44336', action: takePhoto  },
              { label: 'Gallery',  icon: 'image',         color: '#128C7E', action: pickImage  },
            ].map(opt => (
              <TouchableOpacity key={opt.label} style={styles.attachmentOption} onPress={opt.action}>
                <View style={[styles.attachmentIcon, { backgroundColor: opt.color }]}>
                  <MaterialCommunityIcons name={opt.icon} size={28} color="#fff" />
                </View>
                <Text style={styles.attachmentLabel}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Modal>
      </Portal>

      <Portal>
        <Modal
          visible={!!selectedMessage}
          onDismiss={() => setSelectedMessage(null)}
          contentContainerStyle={styles.messageActionModal}
        >
          <View style={styles.messageActions}>
            <View style={styles.quickReactions}>
              {['❤️', '👍', '😂', '😮', '😢', '🙏'].map((emoji) => (
                <TouchableOpacity key={emoji} style={styles.quickReaction} onPress={() => handleReaction(selectedMessage?.id, emoji)}>
                  <Text style={styles.reactionEmojiLarge}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.actionButtons}>
              <TouchableOpacity style={styles.actionButton} onPress={() => { setReplyingTo(selectedMessage); setSelectedMessage(null); }}>
                <MaterialCommunityIcons name="reply" size={20} color="#128C7E" />
                <Text style={styles.actionButtonText}>Reply</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={() => handlePinMessage(selectedMessage)}>
                <MaterialCommunityIcons
                  name={pinnedMessage?.id === selectedMessage?.id ? 'pin-off' : 'pin'}
                  size={20}
                  color="#128C7E"
                />
                <Text style={styles.actionButtonText}>
                  {pinnedMessage?.id === selectedMessage?.id ? 'Unpin' : 'Pin'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ECE5DD' },
  header: { paddingTop: 50, paddingBottom: 10 },
  headerContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  backButton: { padding: 5 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 5, marginRight: 5 },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginLeft: 12, flex: 1 },
  groupAvatar: { backgroundColor: 'rgba(255,255,255,0.3)' },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  pinnedBanner: {
    backgroundColor: '#fff', borderLeftWidth: 4, borderLeftColor: '#128C7E',
    paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 2, elevation: 2,
  },
  pinnedBannerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  pinnedBannerTextContainer: { flex: 1 },
  pinnedBannerLabel: { fontSize: 11, fontWeight: '700', color: '#128C7E', marginBottom: 2 },
  pinnedBannerText: { fontSize: 13, color: '#3B4A54' },
  pinnedBannerClose: { padding: 4 },
  replyPreview: { backgroundColor: '#f0f0f0', paddingHorizontal: 15, paddingVertical: 12, flexDirection: 'row', alignItems: 'flex-start', maxHeight: 120 },
  replyPreviewContent: { flex: 1, flexDirection: 'row' },
  replyBar: { width: 4, backgroundColor: '#128C7E', marginRight: 10, borderRadius: 2, minHeight: 40 },
  replyPreviewName: { fontSize: 14, fontWeight: '700', color: '#128C7E', marginBottom: 4 },
  replyPreviewText: { fontSize: 14, color: '#3B4A54', lineHeight: 20 },
  keyboardView: { flex: 1 },
  messageList: { padding: 10, flexGrow: 1 },
  messageRow: { flexDirection: 'row', marginVertical: 2, paddingHorizontal: 5 },
  ownMessageRow: { justifyContent: 'flex-end' },
  otherMessageRow: { justifyContent: 'flex-start' },
  avatarContainer: { marginRight: 8, justifyContent: 'flex-end' },
  messageAvatar: { backgroundColor: '#128C7E' },
  messageBubble: {
    maxWidth: '75%', padding: 12, borderRadius: 16, marginVertical: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
  },
  ownMessage: { backgroundColor: '#DCF8C6', borderBottomRightRadius: 4 },
  otherMessage: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4 },
  highlightedMessage: { backgroundColor: '#FFF9C4', borderWidth: 2, borderColor: '#FFD54F' },
  pinnedMessageBubble: { borderWidth: 1.5, borderColor: '#128C7E' },
  pinnedIndicatorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  pinnedIndicatorText: { fontSize: 10, fontWeight: '700', color: '#128C7E' },
  replyContainer: { backgroundColor: 'rgba(0,0,0,0.08)', padding: 12, borderRadius: 10, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#128C7E' },
  replyContent: { flex: 1, paddingLeft: 8, paddingRight: 30 },
  replyIcon: { position: 'absolute', right: 8, top: 12, opacity: 0.7 },
  replyName: { fontSize: 13, fontWeight: '700', color: '#128C7E', marginBottom: 4 },
  replyText: { fontSize: 14, color: '#303030', lineHeight: 20 },
  senderName: { fontSize: 13, fontWeight: '700', color: '#128C7E', marginBottom: 4 },
  messageText: { fontSize: 16, lineHeight: 22, color: '#303030' },
  messageImage: { width: 250, height: 250, borderRadius: 12, marginBottom: 8 },
  videoContainer: { width: 250, height: 250, backgroundColor: '#000', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  downloadButton: { flexDirection: 'row', alignItems: 'center', marginTop: 10, padding: 10, backgroundColor: 'rgba(18,140,126,0.1)', borderRadius: 10, gap: 8 },
  downloadText: { color: '#128C7E', fontSize: 14, fontWeight: '600' },
  messageFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 3, gap: 3 },
  timeText: { fontSize: 12, fontWeight: '500', color: '#667781' },
  ownTimeText: { color: '#667781' },
  otherTimeText: { color: '#667781' },
  reactionsContainer: { flexDirection: 'row', marginTop: 5, flexWrap: 'wrap' },
  reactionBubble: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.05)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, marginRight: 5, marginTop: 3 },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11, marginLeft: 3, color: '#666' },
  recordingIndicator: { backgroundColor: '#F44336', paddingVertical: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  recordingDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff' },
  recordingText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  recordingHint: { color: '#fff', fontSize: 12, opacity: 0.9 },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingVertical: 5, backgroundColor: '#fff', marginHorizontal: 8, marginBottom: 8, borderRadius: 25 },
  inputBox: { flex: 1, backgroundColor: '#f5f5f5', borderRadius: 20, paddingHorizontal: 12, minHeight: 40, maxHeight: 100, justifyContent: 'center' },
  input: { flex: 1, fontSize: 15, color: '#303030', paddingTop: Platform.OS === 'ios' ? 10 : 8, paddingBottom: Platform.OS === 'ios' ? 10 : 8, maxHeight: 100, lineHeight: 20 },
  sendButton: { width: 45, height: 45, borderRadius: 23, backgroundColor: '#128C7E', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  sendButtonDisabled: { backgroundColor: '#cccccc' },
  micButtonContainer: { marginLeft: 8 },
  micButton: { width: 45, height: 45, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#128C7E' },
  micButtonRecording: { backgroundColor: '#F44336' },
  audioPreviewModal: { backgroundColor: '#fff', marginHorizontal: 40, padding: 30, borderRadius: 20, alignItems: 'center' },
  audioPreviewTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  audioPreviewDuration: { fontSize: 24, fontWeight: '600', color: '#128C7E', marginBottom: 20 },
  audioPreviewControls: { marginVertical: 20 },
  audioPreviewActions: { flexDirection: 'row', gap: 15, marginTop: 20 },
  audioPreviewButton: { minWidth: 100 },
  attachmentModal: { backgroundColor: '#fff', marginHorizontal: 40, marginVertical: 'auto', borderRadius: 20, padding: 20 },
  attachmentGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around' },
  attachmentOption: { alignItems: 'center', width: '30%', marginVertical: 10 },
  attachmentIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  attachmentLabel: { fontSize: 13, color: '#666' },
  messageActionModal: { backgroundColor: '#fff', marginHorizontal: 20, marginVertical: 'auto', borderRadius: 16, padding: 0, overflow: 'hidden' },
  messageActions: { padding: 0 },
  quickReactions: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 15, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  quickReaction: { padding: 8 },
  reactionEmojiLarge: { fontSize: 28 },
  actionButtons: { padding: 10 },
  actionButton: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  actionButtonText: { fontSize: 16, marginLeft: 15, color: '#333' },
});