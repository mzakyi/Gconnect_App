// src/screens/chat/PrivateChatScreen.js
import React, { useState, useEffect, useContext, useRef, memo } from 'react';
import { useActiveOrg } from '../../context/ActiveOrgContext';
import {
  View, FlatList, StyleSheet, KeyboardAvoidingView, Platform, Keyboard,
  TouchableOpacity, Image, Alert, Animated, ImageBackground
} from 'react-native';
import { TextInput, IconButton, Text, Avatar, Surface, Modal, Portal, Button, ActivityIndicator } from 'react-native-paper';
import { AuthContext } from '../../context/AuthContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { TextInput as RNTextInput } from 'react-native';
import { useBadges } from '../../context/BadgeContext';
import { initiateCall } from '../../services/callService';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase.config';
import { Audio } from 'expo-av';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  subscribeToPrivateChatMessages,
  sendPrivateMessage,
  markMessagesAsRead,
  updateChatOnlineStatus,
  updateTypingStatus,
  uploadMediaFile,
  addReaction,
  removeReaction,
  deleteMessageForEveryone,
  deleteMessageForMe,
  downloadMediaFile
} from '../../services/chatService';

// ── Background wrapper — defined OUTSIDE the screen so it never remounts ────
const ChatBackground = memo(({ backgroundImage, children }) => {
  const [ready, setReady] = useState(!backgroundImage);

  useEffect(() => {
    if (!backgroundImage) { setReady(true); return; }
    let cancelled = false;
    Image.prefetch(backgroundImage)
      .then(() => { if (!cancelled) setReady(true); })
      .catch(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [backgroundImage]);

  if (backgroundImage && ready) {
    return (
      <ImageBackground source={{ uri: backgroundImage }} style={{ flex: 1 }} resizeMode="cover" fadeDuration={0}>
        {children}
      </ImageBackground>
    );
  }
  return <View style={{ flex: 1, backgroundColor: '#ECE5DD' }}>{children}</View>;
});

// ── Audio Player ─────────────────────────────────────────────────────────────
const AudioPlayer = ({ uri, duration }) => {
  const [sound, setSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => { return () => { if (sound) sound.unloadAsync(); }; }, [sound]);

  const playSound = async () => {
    try {
      setIsLoading(true);
      if (sound) {
        await sound.playAsync(); setIsPlaying(true);
      } else {
        const { sound: newSound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true }, onPlaybackStatusUpdate);
        setSound(newSound); setIsPlaying(true);
      }
    } catch { Alert.alert('Error', 'Failed to play audio'); }
    finally { setIsLoading(false); }
  };

  const pauseSound = async () => { if (sound) { await sound.pauseAsync(); setIsPlaying(false); } };

  const onPlaybackStatusUpdate = (status) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis);
      setAudioDuration(status.durationMillis || audioDuration);
      if (status.didJustFinish) { setIsPlaying(false); setPosition(0); if (sound) sound.setPositionAsync(0); }
    }
  };

  const formatTime = (millis) => {
    const totalSeconds = Math.floor(millis / 1000);
    return `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
  };

  const progress = audioDuration > 0 ? position / audioDuration : 0;

  return (
    <View style={audioStyles.container}>
      <TouchableOpacity onPress={isPlaying ? pauseSound : playSound} disabled={isLoading} style={audioStyles.playButton}>
        {isLoading
          ? <ActivityIndicator size="small" color="#128C7E" />
          : <MaterialCommunityIcons name={isPlaying ? 'pause-circle' : 'play-circle'} size={32} color="#128C7E" />
        }
      </TouchableOpacity>
      <View style={audioStyles.progressContainer}>
        <View style={audioStyles.waveform}>
          <View style={[audioStyles.progress, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={audioStyles.duration}>{formatTime(position)} / {formatTime(audioDuration)}</Text>
      </View>
    </View>
  );
};

const audioStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, minWidth: 200 },
  playButton: { marginRight: 12 },
  progressContainer: { flex: 1 },
  waveform: { height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, overflow: 'hidden', marginBottom: 6 },
  progress: { height: '100%', backgroundColor: '#128C7E', borderRadius: 2 },
  duration: { fontSize: 11, color: '#666' },
});

// ── Story Reply Bubble ────────────────────────────────────────────────────────
const StoryReplyBubble = memo(({ item, navigation, organizationId, chatId, otherUserId, otherUserName }) => {
  const story = item.storyPreview;
  if (!story) return <Text style={styles.messageText}>↩ Replied to a story</Text>;

  const handleTap = async () => {
    const createdAt = story.createdAt?.toDate ? story.createdAt.toDate() : new Date(story.createdAt);
    if (Date.now() - createdAt.getTime() > 24 * 60 * 60 * 1000) {
      Alert.alert('Story Expired', 'This story is no longer available.'); return;
    }
    try {
      const { getDoc, doc } = await import('firebase/firestore');
      const { db } = await import('../../../firebase.config');
      const storySnap = await getDoc(doc(db, 'organizations', organizationId, 'stories', story.storyId));
      if (!storySnap.exists()) { Alert.alert('Story Expired', 'This story is no longer available.'); return; }
      navigation.navigate('App', {
        screen: 'Feed',
        params: { openStoryUserId: story.userId, openStoryId: story.storyId, returnToChatId: chatId, returnToOtherUserId: otherUserId, returnToOtherUserName: otherUserName },
      });
    } catch { Alert.alert('Story Expired', 'This story is no longer available.'); }
  };

  return (
    <TouchableOpacity onPress={handleTap} activeOpacity={0.85}>
      <View style={storyReplyStyles.container}>
        <View style={storyReplyStyles.header}>
          <MaterialCommunityIcons name="reply" size={13} color="#128C7E" />
          <Text style={storyReplyStyles.headerText}>Replied to {story.userName}'s story</Text>
        </View>
        <View style={storyReplyStyles.preview}>
          {story.mediaType === 'image'
            ? <Image source={{ uri: story.mediaUrl }} style={storyReplyStyles.thumbnail} resizeMode="cover" />
            : <View style={storyReplyStyles.videoThumb}><MaterialCommunityIcons name="play-circle" size={28} color="#fff" /></View>
          }
          <View style={storyReplyStyles.info}>
            <Text style={storyReplyStyles.storyLabel}>{story.mediaType === 'video' ? '🎥 Video story' : '📷 Photo story'}</Text>
            <Text style={storyReplyStyles.tapHint}>Tap to view</Text>
          </View>
        </View>
      </View>
      <Text style={styles.messageText}>{item.text === '↩ Replied to a story' ? '' : item.text}</Text>
    </TouchableOpacity>
  );
});

const storyReplyStyles = StyleSheet.create({
  container: { backgroundColor: 'rgba(18,140,126,0.08)', borderRadius: 10, borderLeftWidth: 3, borderLeftColor: '#128C7E', marginBottom: 6, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 },
  headerText: { fontSize: 12, color: '#128C7E', fontWeight: '600' },
  preview: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 10, gap: 10 },
  thumbnail: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#000' },
  videoThumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  storyLabel: { fontSize: 13, color: '#303030', fontWeight: '500', marginBottom: 3 },
  tapHint: { fontSize: 11, color: '#888' },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function PrivateChatScreen({ navigation, route }) {
  const { chatId, otherUserId, otherUserName, otherUserAvatar } = route.params;
  const { user, userProfile } = useContext(AuthContext);
  const { activeOrgId: organizationId } = useActiveOrg();
  const { refreshBadges } = useBadges();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedAudio, setRecordedAudio] = useState(null);
  const [showAudioPreview, setShowAudioPreview] = useState(false);
  const [audioSound, setAudioSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState(route.params?.backgroundImage ?? null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const flatListRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  const prevMessageCountRef = useRef(0);
  const isInitialLoadRef = useRef(true);



  // 👇 ADD THIS RIGHT HERE
useEffect(() => {
  const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
    setKeyboardHeight(event.endCoordinates.height);
  });

  const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
    setKeyboardHeight(0);
  });

  return () => {
    showSubscription.remove();
    hideSubscription.remove();
  };
}, []);

  // ── Live listener for background image ───────────────────────────────────
  useEffect(() => {
    if (!organizationId) return;
    const chatRef = doc(db, 'organizations', organizationId, 'privateChats', chatId);
    const unsubscribe = onSnapshot(chatRef, (snap) => {
      if (snap.exists()) {
        const newBg = snap.data().backgroundImage ?? null;
        setBackgroundImage(prev => prev === newBg ? prev : newBg);
      }
    }, (error) => {
      if (error.code !== 'permission-denied') console.warn('PrivateChat background listener error:', error.message);
    });
    return () => unsubscribe();
  }, [organizationId, chatId]);

  // ── Messages listener ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!organizationId) return;
    let unsubscribe;
    try {
      unsubscribe = subscribeToPrivateChatMessages(chatId, (msgs) => {
        const filtered = msgs.filter(m => !m.deletedFor?.[user.uid]);
        setMessages(filtered);
        const prevCount = prevMessageCountRef.current;
        const newCount = filtered.length;
        if (isInitialLoadRef.current || newCount > prevCount) {
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: !isInitialLoadRef.current }), 100);
          isInitialLoadRef.current = false;
        }
        prevMessageCountRef.current = newCount;
      }, organizationId);
    } catch (e) {
      if (e.code !== 'permission-denied') console.warn('PrivateChat messages listener error:', e.message);
    }
    markMessagesAsRead(chatId, user.uid, organizationId).then(() => refreshBadges()).catch(() => {});
    updateChatOnlineStatus(chatId, user.uid, true, organizationId);
    return () => {
      if (unsubscribe) unsubscribe();
      updateChatOnlineStatus(chatId, user.uid, false, organizationId);
    };
  }, [chatId, user.uid, organizationId]);

  useEffect(() => { requestPermissions(); }, []);

  const requestPermissions = async () => {
    await ImagePicker.requestMediaLibraryPermissionsAsync();
    await ImagePicker.requestCameraPermissionsAsync();
    await Audio.requestPermissionsAsync();
  };

  // ── Calls ─────────────────────────────────────────────────────────────────
  const handleVideoCall = async () => {
    try {
      const { callId, roomName } = await initiateCall(
        user.uid, otherUserId, 'video', organizationId,
        { callerName: `${userProfile.firstName} ${userProfile.lastName}`, callerAvatar: userProfile.profilePicture || '' },
        { receiverName: otherUserName, receiverAvatar: otherUserAvatar || '' }
      );
      navigation.navigate('OutgoingCall', { callId, roomName, otherUserName, otherUserAvatar, callType: 'video' });
    } catch { Alert.alert('Error', 'Failed to start call. Please try again.'); }
  };

  const handleVoiceCall = async () => {
    try {
      const { callId, roomName } = await initiateCall(
        user.uid, otherUserId, 'voice', organizationId,
        { callerName: `${userProfile.firstName} ${userProfile.lastName}`, callerAvatar: userProfile.profilePicture || '' },
        { receiverName: otherUserName, receiverAvatar: otherUserAvatar || '' }
      );
      navigation.navigate('OutgoingCall', { callId, roomName, otherUserName, otherUserAvatar, callType: 'voice' });
    } catch { Alert.alert('Error', 'Failed to start call. Please try again.'); }
  };

  // ── Typing ────────────────────────────────────────────────────────────────
  const handleTyping = (text) => {
    setInputText(text);
    if (!isTyping && text.length > 0) { setIsTyping(true); updateTypingStatus(chatId, user.uid, true, organizationId); }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false); updateTypingStatus(chatId, user.uid, false, organizationId);
    }, 2000);
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
        const asset = result.assets[0];
        await sendMediaMessage(asset.uri, 'document', asset.name);
      }
    } catch (error) { console.error('Error picking document:', error); }
  };

  const sendMediaMessage = async (uri, type, fileName = null) => {
    setSending(true);
    try {
      const mediaData = await uploadMediaFile(uri, type, chatId, user.uid, organizationId);
      await sendPrivateMessage(chatId, user.uid, `${userProfile.firstName} ${userProfile.lastName}`, userProfile.profilePicture, '', organizationId, type, mediaData.downloadURL, fileName || mediaData.fileName, replyingTo);
      setReplyingTo(null);
    } catch { Alert.alert('Error', 'Failed to send media'); }
    finally { setSending(false); }
  };

  // ── Voice recording ───────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording); setIsRecording(true); setRecordingDuration(0);
      recordingIntervalRef.current = setInterval(() => setRecordingDuration(prev => prev + 1), 1000);
    } catch { Alert.alert('Error', 'Failed to start recording'); }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false); clearInterval(recordingIntervalRef.current);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI(); setRecording(null);
    if (uri) { setRecordedAudio(uri); setShowAudioPreview(true); }
  };

  const playRecordedAudio = async () => {
    try {
      if (audioSound) await audioSound.unloadAsync();
      const { sound } = await Audio.Sound.createAsync({ uri: recordedAudio }, { shouldPlay: true });
      setAudioSound(sound); setIsPlaying(true);
      sound.setOnPlaybackStatusUpdate((status) => { if (status.didJustFinish) setIsPlaying(false); });
      await sound.playAsync();
    } catch (error) { console.error('Error playing audio:', error); }
  };

  const stopPlayingAudio = async () => { if (audioSound) { await audioSound.stopAsync(); setIsPlaying(false); } };

  const sendRecordedAudio = async () => {
    setShowAudioPreview(false); await sendMediaMessage(recordedAudio, 'audio'); setRecordedAudio(null);
    if (audioSound) { await audioSound.unloadAsync(); setAudioSound(null); }
  };

  const cancelRecordedAudio = async () => {
    setShowAudioPreview(false); setRecordedAudio(null);
    if (audioSound) { await audioSound.unloadAsync(); setAudioSound(null); }
  };

  // ── Send text ─────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!inputText.trim()) return;
    const messageText = inputText.trim();
    setInputText(''); setIsTyping(false);
    updateTypingStatus(chatId, user.uid, false, organizationId);
    setSending(true);
    try {
      await sendPrivateMessage(chatId, user.uid, `${userProfile.firstName} ${userProfile.lastName}`, userProfile.profilePicture, messageText, organizationId, 'text', null, null, replyingTo);
      setReplyingTo(null);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      Alert.alert('Error', 'Failed to send message'); setInputText(messageText);
    } finally { setSending(false); }
  };

  // ── Reactions ─────────────────────────────────────────────────────────────
  const handleReaction = async (messageId, emoji) => {
    try {
      const message = messages.find(m => m.id === messageId);
      const userReacted = message.reactions?.[emoji]?.includes(user.uid);
      if (userReacted) await removeReaction(chatId, messageId, user.uid, emoji, organizationId, false);
      else await addReaction(chatId, messageId, user.uid, emoji, organizationId, false);
      setSelectedMessage(null);
    } catch (error) { console.error('Error handling reaction:', error); }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDeleteMessage = (message) => {
    const isOwnMessage = message.userId === user.uid;
    const options = [{ text: 'Cancel', style: 'cancel' }];
    if (isOwnMessage) {
      options.push({ text: 'Delete for me', onPress: async () => { await deleteMessageForMe(chatId, message.id, user.uid, organizationId, false); setSelectedMessage(null); } });
      const messageTime = message.createdAt?.toDate ? message.createdAt.toDate() : new Date(message.createdAt);
      if ((Date.now() - messageTime.getTime()) / (1000 * 60 * 60) < 48) {
        options.push({ text: 'Delete for everyone', style: 'destructive', onPress: async () => { await deleteMessageForEveryone(chatId, message.id, organizationId, false); setSelectedMessage(null); } });
      }
    } else {
      options.push({ text: 'Delete for me', style: 'destructive', onPress: async () => { await deleteMessageForMe(chatId, message.id, user.uid, organizationId, false); setSelectedMessage(null); } });
    }
    Alert.alert('Delete message', 'Choose an option', options);
  };

  const handleDownloadMedia = async (message) => {
    try { await downloadMediaFile(message.mediaUrl, message.fileName || `media_${Date.now()}`); }
    catch { Alert.alert('Error', 'Failed to download media'); }
    setSelectedMessage(null);
  };

  const scrollToMessage = (messageId) => {
    const index = messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      setHighlightedMessageId(messageId);
      flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      setTimeout(() => setHighlightedMessageId(null), 2000);
    } else { Alert.alert('Message not found', 'The original message may have been deleted'); }
  };

  const formatDuration = (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;

  // ── Message content renderers ─────────────────────────────────────────────
  const renderMessageContent = (item) => {
    if (item.type === 'deleted') {
      return <Text style={[styles.messageText, styles.deletedText]}><MaterialCommunityIcons name="block-helper" size={14} /> This message was deleted</Text>;
    }
    switch (item.type) {
      case 'story_reply':
        return <StoryReplyBubble item={item} navigation={navigation} organizationId={organizationId} chatId={chatId} otherUserId={otherUserId} otherUserName={otherUserName} />;
      case 'image':
        return (
          <View>
            <TouchableOpacity onPress={() => navigation.navigate('ImageViewer', { uri: item.mediaUrl })}>
              <Image source={{ uri: item.mediaUrl }} style={styles.messageImage} />
            </TouchableOpacity>
            {item.text ? <Text style={styles.messageText}>{item.text}</Text> : null}
            <TouchableOpacity onPress={() => downloadMediaFile(item.mediaUrl, item.fileName || 'image.jpg')} style={styles.downloadButton}>
              <MaterialCommunityIcons name="download" size={20} color="#007AFF" />
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
            <TouchableOpacity onPress={() => downloadMediaFile(item.mediaUrl, item.fileName || 'video.mp4')} style={styles.downloadButton}>
              <MaterialCommunityIcons name="download" size={20} color="#007AFF" />
              <Text style={styles.downloadText}>Download</Text>
            </TouchableOpacity>
          </View>
        );
      case 'audio':
        return <AudioPlayer uri={item.mediaUrl} duration={item.duration} />;
      case 'document':
        return (
          <TouchableOpacity onPress={() => downloadMediaFile(item.mediaUrl, item.fileName)} style={styles.documentContainer}>
            <MaterialCommunityIcons name="file-document" size={32} color="#007AFF" />
            <View style={styles.documentInfo}>
              <Text style={styles.documentName}>{item.fileName || 'Document'}</Text>
              <MaterialCommunityIcons name="download" size={20} color="#007AFF" />
            </View>
          </TouchableOpacity>
        );
      case 'shared_post':
        return (
          <TouchableOpacity onPress={() => { if (item.sharedPost?.postId) navigation.navigate('App', { screen: 'Feed' }); }} activeOpacity={0.85}>
            <View style={{ backgroundColor: 'rgba(92,107,192,0.08)', borderRadius: 10, borderLeftWidth: 3, borderLeftColor: '#5C6BC0', padding: 10, marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                <MaterialCommunityIcons name="share" size={13} color="#5C6BC0" />
                <Text style={{ fontSize: 12, color: '#5C6BC0', fontWeight: '600' }}>Shared a post</Text>
              </View>
              {item.sharedPost?.postMedia?.[0]?.url && (
                <Image source={{ uri: item.sharedPost.postMedia[0].url }} style={{ width: 120, height: 80, borderRadius: 6, marginBottom: 6 }} resizeMode="cover" />
              )}
              <Text style={{ fontSize: 12, color: '#303030' }} numberOfLines={3}>{item.sharedPost?.postContent || item.text}</Text>
              <Text style={{ fontSize: 11, color: '#888', marginTop: 4 }}>By {item.sharedPost?.postAuthor || 'Unknown'}</Text>
            </View>
          </TouchableOpacity>
        );
      default:
        return <Text style={styles.messageText}>{item.text}</Text>;
    }
  };

  const getTimeAgo = (date) => {
    if (!date) return '';
    const messageDate = date?.toDate ? date.toDate() : new Date(date);
    const seconds = Math.floor((new Date() - messageDate) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return messageDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const formatDate = (date) => {
    if (!date) return '';
    const messageDate = date?.toDate ? date.toDate() : new Date(date);
    const today = new Date(); const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    if (messageDate.toDateString() === today.toDateString()) return 'Today';
    if (messageDate.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return messageDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const shouldShowDateSeparator = (currentMsg, prevMsg) => {
    if (!prevMsg) return true;
    const currentDate = currentMsg.createdAt?.toDate ? currentMsg.createdAt.toDate() : new Date(currentMsg.createdAt);
    const prevDate = prevMsg.createdAt?.toDate ? prevMsg.createdAt.toDate() : new Date(prevMsg.createdAt);
    return currentDate.toDateString() !== prevDate.toDateString();
  };

  const getMediaLabel = (type) => ({ image: '📷 Photo', video: '🎥 Video', audio: '🎤 Voice message', document: '📄 Document' }[type] || 'Media');

  const renderMessage = ({ item, index }) => {
    const isOwnMessage = item.userId === user.uid;
    const prevMessage = index > 0 ? messages[index - 1] : null;
    const showDate = shouldShowDateSeparator(item, prevMessage);
    return (
      <View>
        {showDate && (
          <View style={styles.dateSeparator}>
            <View style={styles.dateLine} />
            <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
            <View style={styles.dateLine} />
          </View>
        )}
        <TouchableOpacity onLongPress={() => setSelectedMessage(item)} activeOpacity={0.7}>
          <View style={[styles.messageRow, isOwnMessage ? styles.ownMessageRow : styles.otherMessageRow]}>
            <View style={[styles.messageBubble, isOwnMessage ? styles.ownMessage : styles.otherMessage, highlightedMessageId === item.id && styles.highlightedMessage]}>
              {item.replyTo && (
                <TouchableOpacity style={styles.replyContainer} onPress={() => item.replyTo.id && scrollToMessage(item.replyTo.id)} activeOpacity={0.7}>
                  <View style={styles.replyBar} />
                  <View style={styles.replyContent}>
                    <Text style={styles.replyName}>{item.replyTo.userName}</Text>
                    <Text style={styles.replyText}>{item.replyTo.text || getMediaLabel(item.replyTo.type)}</Text>
                  </View>
                  <MaterialCommunityIcons name="arrow-up-circle" size={20} color="#128C7E" style={styles.replyIcon} />
                </TouchableOpacity>
              )}
              {renderMessageContent(item)}
              <View style={styles.messageFooter}>
                <Text style={[styles.timeText, isOwnMessage ? styles.ownTimeText : styles.otherTimeText]}>{getTimeAgo(item.createdAt)}</Text>
                {isOwnMessage && <MaterialCommunityIcons name={item.read ? 'check-all' : 'check'} size={16} color={item.read ? '#4FC3F7' : '#999'} style={styles.readIcon} />}
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
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons name="chat-outline" size={80} color="#ccc" />
      <Text style={styles.emptyTitle}>No messages yet</Text>
      <Text style={styles.emptyText}>Start the conversation with {otherUserName}</Text>
    </View>
  );

  // ── Header height for KAV offset ─────────────────────────────────────────
  // iOS: header (paddingTop:50 + paddingBottom:10 + ~44 content) ≈ 104
  // We use insets.top to be accurate across all devices.
  const headerHeight = insets.top + 60; // 60 = paddingBottom(10) + row height(~50)

  return (
    <View style={styles.container}>
      {/* Header — lives OUTSIDE KeyboardAvoidingView so it never moves */}
      <LinearGradient colors={['#128C7E', '#075E54']} style={[styles.header, { paddingTop: insets.top + 10 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={styles.headerContent}>
          <TouchableOpacity style={styles.headerLeft} onPress={() => navigation.goBack()}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerCenter} onPress={() => navigation.navigate('ChatInfo', { chatId, otherUserId, otherUserName })}>
            {otherUserAvatar
              ? <Avatar.Image size={40} source={{ uri: otherUserAvatar }} style={styles.avatar} />
              : <Avatar.Text size={40} label={otherUserName?.split(' ').map(n => n[0]).join('') || 'U'} style={styles.avatar} />
            }
            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle}>{otherUserName}</Text>
              <Text style={styles.headerSubtitle}>Tap for info</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.headerRight}>
            <IconButton icon="phone" iconColor="#fff" size={22} onPress={handleVoiceCall} />
            <IconButton icon="video" iconColor="#fff" size={22} onPress={handleVideoCall} />
            <IconButton icon="dots-vertical" iconColor="#fff" size={22} onPress={() => navigation.navigate('ChatInfo', { chatId, otherUserId, otherUserName })} />
          </View>
        </View>
      </LinearGradient>

      {/* Reply preview — also outside KAV so it doesn't affect offset calc */}
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

      {/*
        ── KeyboardAvoidingView ──────────────────────────────────────────────
        iOS   → behavior="padding"  pushes the input up by the keyboard height.
                keyboardVerticalOffset = header height so the math is correct.
        Android → behavior="height"  shrinks the view; the OS handles the rest.
                  No offset needed — Android already scrolls the window.
      */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Message list with background */}
        <ChatBackground backgroundImage={backgroundImage}>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messageList}
            ListEmptyComponent={renderEmpty}
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
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

        {/* ── Input bar ────────────────────────────────────────────────────
            iOS:     paddingBottom = 8 (keyboard handles the gap via KAV padding)
            Android: paddingBottom = insets.bottom (respects nav bar) + 4 breathing room.
                     When the software keyboard is up, insets.bottom drops to 0 on most
                     Android devices, so the bar sits flush just above the keyboard.
        */}
        <View
            style={[
              styles.inputWrapper,
              {
            paddingBottom:
              Platform.OS === 'ios'
                ? 8
                : Math.max(insets.bottom, 8),
                marginBottom: Platform.OS === 'android' && keyboardHeight > 0
                  ? keyboardHeight
                  : 0,
              },
            ]}
          >
          <View style={styles.inputContainer}>
            <IconButton icon="plus-circle" size={28} iconColor="#128C7E" onPress={() => setShowAttachmentMenu(true)} />
            <View style={styles.inputBox}>
              <RNTextInput
                value={inputText}
                onChangeText={handleTyping}
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
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* ── Modals ── */}
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
              { label: 'Camera', icon: 'camera', color: '#F44336', action: takePhoto },
              { label: 'Gallery', icon: 'image', color: '#128C7E', action: pickImage },
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
        <Modal visible={!!selectedMessage} onDismiss={() => setSelectedMessage(null)} contentContainerStyle={styles.messageActionModal}>
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
              {selectedMessage?.type !== 'text' && (
                <TouchableOpacity style={styles.actionButton} onPress={() => handleDownloadMedia(selectedMessage)}>
                  <MaterialCommunityIcons name="download" size={20} color="#128C7E" />
                  <Text style={styles.actionButtonText}>Download</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.actionButton} onPress={() => handleDeleteMessage(selectedMessage)}>
                <MaterialCommunityIcons name="delete" size={20} color="#DC2626" />
                <Text style={styles.actionButtonText}>Delete</Text>
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
  // header paddingTop is now dynamic (insets.top + 10) — set inline above
  header: { paddingBottom: 10 },
  headerContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  headerLeft: { padding: 5 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 5, marginRight: 5, overflow: 'hidden' },
  avatar: { backgroundColor: 'rgba(255,255,255,0.3)' },
  headerInfo: { marginLeft: 12, flex: 1, overflow: 'hidden' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', flexShrink: 1 },
  headerSubtitle: { color: '#fff', fontSize: 12, opacity: 0.9 },
  headerRight: { flexDirection: 'row' },
  replyPreview: { backgroundColor: '#f0f0f0', paddingHorizontal: 15, paddingVertical: 12, flexDirection: 'row', alignItems: 'flex-start', maxHeight: 120 },
  replyPreviewContent: { flex: 1, flexDirection: 'row' },
  replyBar: { width: 4, backgroundColor: '#128C7E', marginRight: 10, borderRadius: 2, minHeight: 40 },
  replyPreviewName: { fontSize: 14, fontWeight: '700', color: '#128C7E', marginBottom: 4 },
  replyPreviewText: { fontSize: 14, color: '#3B4A54', lineHeight: 20 },
  messageList: { padding: 10, flexGrow: 1 },
  dateSeparator: { flexDirection: 'row', alignItems: 'center', marginVertical: 15 },
  dateLine: { flex: 1, height: 1, backgroundColor: '#ccc' },
  dateText: { marginHorizontal: 10, fontSize: 12, color: '#666', fontWeight: '500' },
  messageRow: { flexDirection: 'row', marginVertical: 2, paddingHorizontal: 5 },
  ownMessageRow: { justifyContent: 'flex-end' },
  otherMessageRow: { justifyContent: 'flex-start' },
  messageBubble: { maxWidth: '75%', padding: 12, borderRadius: 16, marginVertical: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  ownMessage: { backgroundColor: '#DCF8C6', borderBottomRightRadius: 4 },
  otherMessage: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4 },
  highlightedMessage: { backgroundColor: '#FFF9C4', borderWidth: 2, borderColor: '#FFD54F' },
  replyContainer: { backgroundColor: 'rgba(0,0,0,0.08)', padding: 12, borderRadius: 10, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#128C7E' },
  replyContent: { flex: 1, paddingLeft: 8, paddingRight: 30 },
  replyIcon: { position: 'absolute', right: 8, top: 12, opacity: 0.7 },
  replyName: { fontSize: 13, fontWeight: '700', color: '#128C7E', marginBottom: 4 },
  replyText: { fontSize: 14, color: '#303030', lineHeight: 20 },
  messageText: { fontSize: 16, lineHeight: 22, color: '#303030' },
  deletedText: { fontStyle: 'italic', color: '#8696A0', fontSize: 15 },
  messageImage: { width: 250, height: 250, borderRadius: 12, marginBottom: 8 },
  videoContainer: { width: 250, height: 250, backgroundColor: '#000', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  documentContainer: { flexDirection: 'row', alignItems: 'center', padding: 8, minWidth: 200 },
  documentInfo: { marginLeft: 10, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  documentName: { fontSize: 14, fontWeight: '500', flex: 1 },
  messageFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 3, gap: 3 },
  timeText: { fontSize: 12, fontWeight: '500' },
  ownTimeText: { color: '#667781' },
  otherTimeText: { color: '#667781' },
  readIcon: { marginLeft: 2 },
  reactionsContainer: { flexDirection: 'row', marginTop: 5, flexWrap: 'wrap' },
  reactionBubble: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.05)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, marginRight: 5, marginTop: 3 },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11, marginLeft: 3, color: '#666' },
  downloadButton: { flexDirection: 'row', alignItems: 'center', marginTop: 10, padding: 10, backgroundColor: 'rgba(18,140,126,0.1)', borderRadius: 10, gap: 8 },
  downloadText: { color: '#128C7E', fontSize: 14, fontWeight: '600' },
  recordingIndicator: { backgroundColor: '#F44336', paddingVertical: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  recordingDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff' },
  recordingText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  recordingHint: { color: '#fff', fontSize: 12, opacity: 0.9 },
  inputWrapper: { backgroundColor: '#ECE5DD', paddingHorizontal: 8, paddingTop: 6, position: 'relative' },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: '#fff', borderRadius: 25, paddingHorizontal: 4, paddingVertical: 4, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  inputBox: { flex: 1, backgroundColor: '#f5f5f5', borderRadius: 20, paddingHorizontal: 12, minHeight: 40, maxHeight: 100, justifyContent: 'center' },
  input: { flex: 1, fontSize: 15, color: '#303030', paddingTop: Platform.OS === 'ios' ? 10 : 8, paddingBottom: Platform.OS === 'ios' ? 10 : 8, maxHeight: 100, lineHeight: 20 },
  sendButton: { width: 45, height: 45, borderRadius: 23, backgroundColor: '#128C7E', alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  sendButtonDisabled: { backgroundColor: '#cccccc' },
  micButtonContainer: { marginLeft: 4 },
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
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyTitle: { marginTop: 15, fontWeight: 'bold', color: '#666', fontSize: 18 },
  emptyText: { marginTop: 8, color: '#999', textAlign: 'center', paddingHorizontal: 40, fontSize: 14 },
});