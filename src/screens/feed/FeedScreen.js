import React, { useState, useEffect, useContext, useRef, useMemo, useCallback, memo } from 'react';
import { useActiveOrg } from '../../context/ActiveOrgContext';
import {
  View, FlatList, StyleSheet, Alert, TouchableOpacity, RefreshControl,
  Modal, KeyboardAvoidingView, ActivityIndicator, Platform,
  Dimensions, Linking, ScrollView, InteractionManager, Animated,
  StatusBar, SafeAreaView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import YoutubeIframe from 'react-native-youtube-iframe';
import {
  Text, Card, IconButton, TextInput, Avatar, Chip, Surface,
  FAB, Portal, Button, Menu, Divider, ProgressBar
} from 'react-native-paper';
import { AuthContext } from '../../context/AuthContext';
import { useBadges } from '../../context/BadgeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Video } from 'expo-av';
import { Image as ExpoImage } from 'expo-image';
import {
  collection, addDoc, getDocs, doc, updateDoc, arrayUnion, arrayRemove,
  serverTimestamp, query, orderBy, where, increment, onSnapshot,
  deleteDoc, getDoc, writeBatch, setDoc
} from 'firebase/firestore';
import { db } from '../../../firebase.config';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_MEDIA_ITEMS = 4;
const STORY_IMAGE_DURATION = 5000;

// ─── Pin helpers ──────────────────────────────────────────────────────────────

const getUserPinDocRef = (organizationId, userId, postId) =>
  doc(db, 'organizations', organizationId, 'userPins', userId, 'pins', postId);

const subscribeToUserPins = (organizationId, userId, callback) => {
  const pinsCol = collection(db, 'organizations', organizationId, 'userPins', userId, 'pins');
  return onSnapshot(
    pinsCol,
    (snap) => callback(new Set(snap.docs.map((d) => d.id))),
    (err) => console.error('subscribeToUserPins error:', err)
  );
};

const togglePinPost = async ({
  postId,
  postOwnerId,
  currentlyPinned,
  organizationId,
  actingUserId,
  actingUserIsAdmin,
}) => {
  const isAdminPinningOwnPost = actingUserIsAdmin && postOwnerId === actingUserId;

  if (isAdminPinningOwnPost) {
    const postRef = doc(db, 'organizations', organizationId, 'posts', postId);
    await updateDoc(postRef, { isAdminPinned: !currentlyPinned });
  } else {
    const pinRef = getUserPinDocRef(organizationId, actingUserId, postId);
    if (currentlyPinned) {
      await deleteDoc(pinRef);
    } else {
      await setDoc(pinRef, { postId, pinnedAt: serverTimestamp() });
    }
  }
};

const sortWithPinned = (arr, userPinSet) =>
  [...arr].sort((a, b) => {
    const rank = (p) => {
      if (p.isAdminPinned) return 2;
      if (userPinSet?.has(p.id)) return 1;
      return 0;
    };
    return rank(b) - rank(a);
  });

// ─── Memoized story thumbnail ─────────────────────────────────────────────────
const StoryThumbnail = memo(({ item, user, onPress }) => {
  if (item.isAddButton) {
    return (
      <TouchableOpacity style={styles.storyItem} onPress={item.onPress}>
        <View style={styles.addStoryAvatar}>
          <MaterialCommunityIcons name="plus" size={26} color="#5C6BC0" />
        </View>
        <Text style={styles.storyName}>Add Story</Text>
      </TouchableOpacity>
    );
  }
  if (item.isUploading) {
    return (
      <View style={styles.storyItem}>
        <View style={styles.uploadingStoryContainer}>
          <View style={styles.storyAvatar}>
            {item.userAvatar
              ? <ExpoImage source={{ uri: item.userAvatar }} style={{ width: 46, height: 46, borderRadius: 23 }} cachePolicy="memory-disk" />
              : <Avatar.Text size={46} label={item.userName?.split(' ').map(n => n[0]).join('') || 'U'} />}
          </View>
          <View style={styles.uploadProgressRing}>
            <View style={styles.uploadProgressOverlay}>
              <MaterialCommunityIcons name="cloud-upload" size={18} color="#fff" />
            </View>
          </View>
          <View style={styles.uploadProgressCircle}>
            <Text style={styles.uploadProgressText}>{item.uploadProgress}%</Text>
          </View>
        </View>
        <Text style={styles.storyName}>Uploading...</Text>
      </View>
    );
  }
  const isOwnStory = item.userId === user.uid;
  const hasUnviewed = item.stories?.some(s => !s.views?.includes(user.uid));
  return (
    <TouchableOpacity style={styles.storyItem} onPress={() => onPress(item)}>
      <View style={[
        styles.storyAvatar,
        hasUnviewed && styles.storyAvatarUnviewed,
        isOwnStory && styles.storyAvatarOwn,
      ]}>
        {item.userAvatar
          ? <ExpoImage source={{ uri: item.userAvatar }} style={{ width: 46, height: 46, borderRadius: 23 }} cachePolicy="memory-disk" />
          : <Avatar.Text size={46} label={item.userName?.split(' ').map(n => n[0]).join('') || 'U'} />}
        {item.stories?.length > 1 && (
          <View style={styles.storyCount}>
            <Text style={styles.storyCountText}>{item.stories.length}</Text>
          </View>
        )}
      </View>
      <Text style={styles.storyName} numberOfLines={1}>
        {isOwnStory ? 'Your Story' : item.userName?.split(' ')[0]}
      </Text>
    </TouchableOpacity>
  );
});

// ─── Isolated Story Viewer ────────────────────────────────────────────────────
const StoryViewer = memo(({
  visible, storyGroup, initialIndex, userId, isAdmin, allUsers,
  onClose, onStoryView, onDeleteStory, getTimeAgo
}) => {
  const insets = useSafeAreaInsets();

  const [currentIndex, setCurrentIndex] = useState(initialIndex || 0);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewersModalVisible, setViewersModalVisible] = useState(false);
  const [viewers, setViewers] = useState([]);

  const storyProgressAnim = useRef(new Animated.Value(0)).current;
  const storyProgressRef = useRef(0);
  const videoRef = useRef(null);
  const animationRef = useRef(null);
  const videoDurationRef = useRef(10000);
  const pausedAtRef = useRef(0);

  const viewersMap = useMemo(() => {
    const m = new Map();
    allUsers.forEach(u => m.set(u.uid, u));
    return m;
  }, [allUsers]);

  const currentStory = storyGroup?.stories[currentIndex];
  const isOwnStory = currentStory?.userId === userId;

  useEffect(() => {
    if (visible && storyGroup) {
      setCurrentIndex(initialIndex || 0);
      setPaused(false);
      setLoading(true);
      storyProgressAnim.setValue(0);
      storyProgressRef.current = 0;
      if (storyGroup.stories[initialIndex || 0]) {
        onStoryView(storyGroup.stories[initialIndex || 0]);
      }
    } else {
      stopAnimation();
    }
  }, [visible, storyGroup?.userId]);

  useEffect(() => {
    if (!storyGroup) return;
    const next = storyGroup.stories[currentIndex + 1];
    if (next?.mediaType === 'image' && next.mediaUrl) {
      ExpoImage.prefetch(next.mediaUrl);
    }
  }, [currentIndex, storyGroup]);

  const stopAnimation = useCallback(() => {
    if (animationRef.current) {
      animationRef.current.stop();
      animationRef.current = null;
    }
  }, []);

  const goToIndex = useCallback((idx) => {
    stopAnimation();
    storyProgressAnim.setValue(0);
    storyProgressRef.current = 0;
    pausedAtRef.current = 0;
    setLoading(true);
    setPaused(false);
    videoRef.current?.stopAsync?.();
    if (!storyGroup) return;
    if (idx >= 0 && idx < storyGroup.stories.length) {
      setCurrentIndex(idx);
      onStoryView(storyGroup.stories[idx]);
    }
  }, [storyGroup, stopAnimation, onStoryView, storyProgressAnim]);

  const handleNext = useCallback(() => {
    if (!storyGroup) return;
    const nextIdx = currentIndex + 1;
    if (nextIdx < storyGroup.stories.length) {
      goToIndex(nextIdx);
    } else {
      onClose();
    }
  }, [currentIndex, storyGroup, goToIndex, onClose]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) goToIndex(currentIndex - 1);
  }, [currentIndex, goToIndex]);

  const startImageProgress = useCallback(() => {
    stopAnimation();
    storyProgressAnim.setValue(0);
    storyProgressRef.current = 0;
    pausedAtRef.current = 0;
    const anim = Animated.timing(storyProgressAnim, {
      toValue: 1, duration: STORY_IMAGE_DURATION, useNativeDriver: false,
    });
    animationRef.current = anim;
    anim.start(({ finished }) => { if (finished) handleNext(); });
  }, [storyProgressAnim, stopAnimation, handleNext]);

  const startVideoProgress = useCallback((duration) => {
    stopAnimation();
    storyProgressAnim.setValue(0);
    storyProgressRef.current = 0;
    pausedAtRef.current = 0;
    videoDurationRef.current = duration;
    const anim = Animated.timing(storyProgressAnim, {
      toValue: 1, duration, useNativeDriver: false,
    });
    animationRef.current = anim;
    anim.start(({ finished }) => { if (finished) handleNext(); });
  }, [storyProgressAnim, stopAnimation, handleNext]);

  const handlePressIn = useCallback(() => {
    stopAnimation();
    storyProgressAnim.stopAnimation(val => {
      storyProgressRef.current = val;
      pausedAtRef.current = val;
    });
    videoRef.current?.pauseAsync?.();
    requestAnimationFrame(() => { setPaused(true); });
  }, [stopAnimation, storyProgressAnim]);

  const handlePressOut = useCallback(() => {
    setPaused(false);
    if (!currentStory) return;
    if (currentStory.mediaType === 'image') {
      const remaining = STORY_IMAGE_DURATION * (1 - pausedAtRef.current);
      if (remaining <= 0) { handleNext(); return; }
      const anim = Animated.timing(storyProgressAnim, {
        toValue: 1, duration: remaining, useNativeDriver: false,
      });
      animationRef.current = anim;
      anim.start(({ finished }) => { if (finished) handleNext(); });
    } else {
      const remaining = videoDurationRef.current * (1 - pausedAtRef.current);
      if (remaining <= 0) { handleNext(); return; }
      const anim = Animated.timing(storyProgressAnim, {
        toValue: 1, duration: remaining, useNativeDriver: false,
      });
      animationRef.current = anim;
      anim.start(({ finished }) => { if (finished) handleNext(); });
      videoRef.current?.playAsync?.();
    }
  }, [currentStory, storyProgressAnim, handleNext]);

  const handleEyePress = useCallback(() => {
    if (!currentStory || currentStory.userId !== userId) return;
    stopAnimation();
    storyProgressAnim.stopAnimation(val => {
      storyProgressRef.current = val;
      pausedAtRef.current = val;
    });
    videoRef.current?.pauseAsync?.().catch(() => {});
    const viewerUids = currentStory.views || [];
    const viewerList = viewerUids.map(uid => viewersMap.get(uid)).filter(Boolean);
    setPaused(true);
    setViewers(viewerList);
    setViewersModalVisible(true);
  }, [currentStory, userId, viewersMap, stopAnimation, storyProgressAnim]);

  const handleCloseViewers = useCallback(() => {
    setViewersModalVisible(false);
    setViewers([]);
    setPaused(false);
    if (!currentStory) return;
    const elapsed = pausedAtRef.current;
    if (currentStory.mediaType === 'image') {
      const remaining = STORY_IMAGE_DURATION * (1 - elapsed);
      if (remaining > 0) {
        const anim = Animated.timing(storyProgressAnim, {
          toValue: 1, duration: remaining, useNativeDriver: false,
        });
        animationRef.current = anim;
        anim.start(({ finished }) => { if (finished) handleNext(); });
      }
    } else {
      const remaining = videoDurationRef.current * (1 - elapsed);
      if (remaining > 0) {
        const anim = Animated.timing(storyProgressAnim, {
          toValue: 1, duration: remaining, useNativeDriver: false,
        });
        animationRef.current = anim;
        anim.start(({ finished }) => { if (finished) handleNext(); });
        videoRef.current?.playAsync?.().catch(() => {});
      }
    }
  }, [currentStory, storyProgressAnim, handleNext]);

  const handleDelete = useCallback(() => {
    if (!currentStory) return;
    onDeleteStory(currentStory, (updatedStories) => {
      if (updatedStories.length === 0) {
        onClose();
      } else {
        const newIdx = Math.min(currentIndex, updatedStories.length - 1);
        goToIndex(newIdx);
      }
    });
  }, [currentStory, currentIndex, onDeleteStory, onClose, goToIndex]);

  if (!visible || !storyGroup || !currentStory) return null;

  return (
    <Modal visible={visible} onRequestClose={onClose} animationType="fade" statusBarTranslucent hardwareAccelerated>
      <View style={sv.container}>
        <LinearGradient
          colors={['rgba(0,0,0,0.65)', 'rgba(0,0,0,0.2)', 'transparent']}
          style={[sv.topGradient, { height: insets.top + 120 }]}
          pointerEvents="none"
        />
        <View style={[sv.progressBars, { top: insets.top + 6 }]}>
          {storyGroup.stories.map((_, idx) => (
            <View key={idx} style={sv.progressBarTrack}>
              {idx < currentIndex ? (
                <View style={[sv.progressBarFill, sv.progressBarDone]} />
              ) : idx === currentIndex ? (
                <Animated.View style={[sv.progressBarFill, {
                  width: storyProgressAnim.interpolate({
                    inputRange: [0, 1], outputRange: ['0%', '100%'], extrapolate: 'clamp',
                  }),
                  backgroundColor: '#fff',
                }]} />
              ) : (
                <View style={sv.progressBarFill} />
              )}
            </View>
          ))}
        </View>
        <View style={[sv.header, { paddingTop: insets.top + 18 }]}>
          <IconButton icon="arrow-left" iconColor="#fff" size={22} onPress={onClose} />
          {currentStory.userAvatar
            ? <ExpoImage source={{ uri: currentStory.userAvatar }} style={{ width: 32, height: 32, borderRadius: 16 }} cachePolicy="memory-disk" />
            : <Avatar.Text size={32} label={currentStory.userName?.split(' ').map(n => n[0]).join('') || 'U'} />}
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={sv.name} numberOfLines={1}>{currentStory.userName}</Text>
            <Text style={sv.time}>{getTimeAgo(currentStory.createdAt)}</Text>
          </View>
          {isOwnStory && (
            <TouchableOpacity
              style={sv.eyeButton}
              onPress={handleEyePress}
              hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            >
              <MaterialCommunityIcons name="eye" size={16} color="#fff" />
              <Text style={sv.eyeCount}>{currentStory.viewCount || 0}</Text>
            </TouchableOpacity>
          )}
          {(isOwnStory || isAdmin) && (
            <TouchableOpacity
              style={sv.deleteButton}
              onPress={handleDelete}
              hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            >
              <MaterialCommunityIcons name="delete" size={22} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={sv.mediaContainer}
          activeOpacity={1}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          {currentStory.mediaType === 'video' ? (
            <Video
              ref={videoRef}
              source={{ uri: currentStory.mediaUrl, overrideFileExtensionAndroid: 'mp4' }}
              style={sv.media}
              resizeMode="cover"
              isLooping={false}
              useNativeControls={false}
              rate={1.0}
              volume={1.0}
              progressUpdateIntervalMillis={250}
              onReadyForDisplay={(e) => {
                setLoading(false);
                const duration = e?.status?.durationMillis || 10000;
                startVideoProgress(duration);
                videoRef.current?.playAsync?.();
              }}
              onPlaybackStatusUpdate={(status) => {
                if (status.isLoaded && status.didJustFinish) handleNext();
              }}
              onError={() => handleNext()}
            />
          ) : (
            <ExpoImage
              source={{ uri: currentStory.mediaUrl }}
              style={sv.media}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={100}
              onLoad={() => {
                setLoading(false);
                if (!paused) startImageProgress();
              }}
              onError={() => handleNext()}
            />
          )}
          {loading && (
            <View style={sv.loadingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={sv.navLeft} onPress={handlePrev} />
        <TouchableOpacity style={sv.navRight} onPress={handleNext} />
        {paused && currentStory.mediaType === 'video' && (
          <View style={sv.pausedOverlay}>
            <MaterialCommunityIcons name="pause" size={54} color="rgba(255,255,255,0.8)" />
          </View>
        )}
      </View>

      <Modal
        visible={viewersModalVisible}
        onRequestClose={handleCloseViewers}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <Surface style={styles.commentModalHeader} elevation={1}>
            <IconButton icon="arrow-left" size={22} onPress={handleCloseViewers} />
            <Text variant="titleMedium" style={styles.modalTitle}>Viewers ({viewers.length})</Text>
            <View style={{ width: 36 }} />
          </Surface>
          <FlatList
            data={viewers}
            keyExtractor={item => item.id || item.uid}
            renderItem={({ item }) => (
              <View style={styles.likeUserItem}>
                {item.profilePicture
                  ? <ExpoImage source={{ uri: item.profilePicture }} style={{ width: 42, height: 42, borderRadius: 21, marginRight: 11 }} cachePolicy="memory-disk" />
                  : <Avatar.Text size={42} label={`${item.firstName?.[0] || ''}${item.lastName?.[0] || ''}`} style={styles.likeAvatar} />}
                <View style={styles.likeUserInfo}>
                  <Text style={styles.likeUserName}>{item.firstName} {item.lastName}</Text>
                  <Text style={styles.likeUserOccupation}>{item.occupation || 'Member'}</Text>
                </View>
              </View>
            )}
            contentContainerStyle={{ padding: 13 }}
            ListEmptyComponent={
              <View style={styles.emptyComments}>
                <MaterialCommunityIcons name="eye-outline" size={54} color="#CFD8DC" />
                <Text style={styles.emptyCommentsText}>No viewers yet</Text>
              </View>
            }
          />
        </View>
      </Modal>
    </Modal>
  );
});

// ─── Story viewer styles ──────────────────────────────────────────────────────
const sv = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topGradient: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 8 },
  progressBars: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', gap: 3, paddingHorizontal: 12, zIndex: 25,
  },
  progressBarTrack: { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: '100%', width: 0, backgroundColor: 'transparent', borderRadius: 2 },
  progressBarDone: { width: '100%', backgroundColor: '#fff' },
  header: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 4, paddingBottom: 12, zIndex: 25,
  },
  name: { color: '#fff', fontWeight: '700', fontSize: 14, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  time: { color: 'rgba(255,255,255,0.85)', fontSize: 11, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  eyeButton: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', marginRight: 4,
  },
  eyeCount: { color: '#fff', fontSize: 13, fontWeight: '700' },
  deleteButton: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', marginRight: 4,
  },
  mediaContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  media: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  navLeft: { position: 'absolute', left: 0, top: 0, bottom: 0, width: SCREEN_WIDTH * 0.35, zIndex: 10 },
  navRight: { position: 'absolute', right: 0, top: 0, bottom: 0, width: SCREEN_WIDTH * 0.65, zIndex: 10 },
  pausedOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 11 },
});

// ─── Full-screen Media Viewer Modal ──────────────────────────────────────────
const MediaViewerModal = memo(({ visible, post, initialIndex, onClose }) => {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(initialIndex || 0);
  const flatListRef = useRef(null);

  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex || 0);
    }
  }, [visible, initialIndex]);

  if (!visible || !post) return null;

  const media = post.media || [];
  const total = media.length;

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="fade"
      statusBarTranslucent
      hardwareAccelerated
    >
      <View style={mvStyles.container}>
        <StatusBar hidden />

        {/* ── Top bar ── */}
        <View style={[mvStyles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={mvStyles.backButton} onPress={onClose} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}>
            <View style={mvStyles.backButtonInner}>
              <MaterialCommunityIcons name="arrow-left" size={22} color="#fff" />
            </View>
          </TouchableOpacity>

          <View style={mvStyles.titleArea}>
            {post.userName ? (
              <Text style={mvStyles.titleText} numberOfLines={1}>{post.userName}</Text>
            ) : null}
            {total > 1 && (
              <Text style={mvStyles.counterText}>{currentIndex + 1} / {total}</Text>
            )}
          </View>
        </View>

        {/* ── Dot indicators (multi-image) ── */}
        {total > 1 && (
          <View style={mvStyles.dotsRow}>
            {media.map((_, i) => (
              <View
                key={i}
                style={[mvStyles.dot, i === currentIndex && mvStyles.dotActive]}
              />
            ))}
          </View>
        )}

        {/* ── Media pager ── */}
        <FlatList
          ref={flatListRef}
          data={media}
          horizontal
          pagingEnabled
          initialScrollIndex={initialIndex || 0}
          getItemLayout={(_, i) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * i, index: i })}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
            setCurrentIndex(idx);
          }}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => (
            <View style={mvStyles.page}>
              {item.type === 'video' ? (
                <Video
                  source={{ uri: item.url }}
                  style={mvStyles.mediaFill}
                  resizeMode="contain"
                  useNativeControls
                  shouldPlay
                  isLooping={false}
                />
              ) : (
                <ExpoImage
                  source={{ uri: item.url }}
                  style={mvStyles.mediaFill}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
              )}
            </View>
          )}
        />

        {/* ── Bottom close bar ── */}
        <View style={[mvStyles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity style={mvStyles.closeButton} onPress={onClose}>
            <MaterialCommunityIcons name="close" size={18} color="#fff" />
            <Text style={mvStyles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

const mvStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 10,
    // subtle gradient-like shadow using background
    backgroundColor: 'transparent',
  },
  backButton: {
    zIndex: 21,
  },
  backButtonInner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleArea: {
    flex: 1,
    marginLeft: 12,
  },
  titleText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  counterText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  dotsRow: {
    position: 'absolute',
    bottom: 72,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 18,
    borderRadius: 3,
  },
  page: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  mediaFill: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    alignItems: 'center',
    paddingTop: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  closeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 24,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

// ─── Main FeedScreen ──────────────────────────────────────────────────────────
export default function FeedScreen({ navigation }) {
  const { user, userProfile } = useContext(AuthContext);
const { activeOrgId: organizationId } = useActiveOrg();
  const { markFeedAsViewed } = useBadges();
  const insets = useSafeAreaInsets();

  const [posts, setPosts] = useState([]);
  const [allPosts, setAllPosts] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [groupedStories, setGroupedStories] = useState([]);
  const [sharedPosts, setSharedPosts] = useState([]);
  const [newPost, setNewPost] = useState('');
  const [posting, setPosting] = useState(false);
  const [showNewPostModal, setShowNewPostModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedPosts, setExpandedPosts] = useState({});
  const [filterMode, setFilterMode] = useState('all');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  // ── Per-user pin state ─────────────────────────────────────────────────────
  const [userPinnedPostIds, setUserPinnedPostIds] = useState(new Set());

  // Story viewer state
  const [storyViewerVisible, setStoryViewerVisible] = useState(false);
  const [selectedStoryGroup, setSelectedStoryGroup] = useState(null);
  const [storyInitialIndex, setStoryInitialIndex] = useState(0);

  const [commentText, setCommentText] = useState('');
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [selectedPostForComment, setSelectedPostForComment] = useState(null);
  const [showCommentsView, setShowCommentsView] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedPostForShare, setSelectedPostForShare] = useState(null);
  const [showUserMentions, setShowUserMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [menuVisible, setMenuVisible] = useState({});
  const [replyToComment, setReplyToComment] = useState(null);
  const [unreadSharedCount, setUnreadSharedCount] = useState(0);
  const [pendingStory, setPendingStory] = useState(null);
  const [showLikesModal, setShowLikesModal] = useState(false);
  const [selectedPostLikes, setSelectedPostLikes] = useState([]);
  const [mediaAttachments, setMediaAttachments] = useState([]);
  const [linkAttachments, setLinkAttachments] = useState([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // ── Media viewer state (replaced old boolean + post ref) ──────────────────
  const [mediaViewerPost, setMediaViewerPost] = useState(null);
  const [mediaViewerIndex, setMediaViewerIndex] = useState(0);
  const [mediaViewerVisible, setMediaViewerVisible] = useState(false);

  const [linkInput, setLinkInput] = useState('');
  const [showVideoPlayerModal, setShowVideoPlayerModal] = useState(false);
  const [videoPlayerOriginalUrl, setVideoPlayerOriginalUrl] = useState('');
  const [videoPlayerTitle, setVideoPlayerTitle] = useState('');
  const [youtubeVideoId, setYoutubeVideoId] = useState('');
  const [youtubePlayerReady, setYoutubePlayerReady] = useState(false);

  const linkInputRef = useRef(null);
  const scrollViewRef = useRef(null);
  const postsUnsubRef = useRef(null);
  const sharedUnsubRef = useRef(null);
  const storiesUnsubRef = useRef(null);
  const userPinsUnsubRef = useRef(null);

  const isAdmin = useMemo(() =>
    userProfile?.role === 'admin' || userProfile?.isAdmin === true,
    [userProfile?.role, userProfile?.isAdmin]
  );

  // ─── Navigation focus ──────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => { markFeedAsViewed(); });
    return unsub;
  }, [navigation, organizationId]);

  // ─── Subscriptions ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!organizationId) return;

    const postsQ = query(
      collection(db, 'organizations', organizationId, 'posts'),
      orderBy('createdAt', 'desc')
    );
    postsUnsubRef.current = onSnapshot(postsQ, snap => {
      setAllPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.error('Posts listener error:', err));

    const sharedQ = query(
      collection(db, 'organizations', organizationId, 'sharedPosts'),
      where('sharedWithUserId', '==', user.uid),
      orderBy('sharedAt', 'desc')
    );
    sharedUnsubRef.current = onSnapshot(sharedQ, snap => {
      setSharedPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      if (!err.message.includes('permission') && !err.message.includes('index'))
        console.error('Shared posts error:', err);
    });

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const storiesQ = collection(db, 'organizations', organizationId, 'stories');
    storiesUnsubRef.current = onSnapshot(storiesQ, snap => {
      const raw = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const valid = raw.filter(s => {
        const t = s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.createdAt);
        return t >= cutoff;
      });
      const grouped = {};
      valid.forEach(story => {
        if (!grouped[story.userId]) {
          grouped[story.userId] = {
            userId: story.userId, userName: story.userName,
            userAvatar: story.userAvatar, stories: []
          };
        }
        grouped[story.userId].stories.push(story);
      });
      Object.values(grouped).forEach(g => {
        g.stories.sort((a, b) => {
          const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
          const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
          return ta - tb;
        });
      });
      setGroupedStories(Object.values(grouped));
    }, err => {
      if (!err.message.includes('permission')) console.error('Stories error:', err);
    });

    userPinsUnsubRef.current = subscribeToUserPins(
      organizationId,
      user.uid,
      (pinSet) => setUserPinnedPostIds(pinSet)
    );

    loadNotificationSettings();
    loadUsers();
    InteractionManager.runAfterInteractions(() => { deleteExpiredStories(); });

    return () => {
      postsUnsubRef.current?.();
      sharedUnsubRef.current?.();
      storiesUnsubRef.current?.();
      userPinsUnsubRef.current?.();
    };
  }, [organizationId]);

  // ─── Filter / sort posts ───────────────────────────────────────────────────
  useEffect(() => {
    if (filterMode === 'shared') setUnreadSharedCount(0);
    filterPosts();
  }, [filterMode, allPosts, sharedPosts, userPinnedPostIds]);

  useEffect(() => {
    if (filterMode !== 'shared') {
      setUnreadSharedCount(sharedPosts.filter(s => !s.viewed).length);
    } else {
      setUnreadSharedCount(0);
    }
  }, [sharedPosts, filterMode]);

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const deleteExpiredStories = async () => {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const snap = await getDocs(collection(db, 'organizations', organizationId, 'stories'));
      const storage = getStorage();
      for (const d of snap.docs) {
        const data = d.data();
        const t = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
        if (t < cutoff) {
          if (data.mediaUrl?.includes('firebase')) {
            try {
              const path = decodeURIComponent(data.mediaUrl.split('/o/')[1]?.split('?')[0]);
              if (path) await deleteObject(ref(storage, path));
            } catch (_) { }
          }
          await deleteDoc(doc(db, 'organizations', organizationId, 'stories', d.id));
        }
      }
    } catch (e) { console.error('Cleanup error:', e); }
  };

  const loadUsers = async () => {
    try {
      const snap = await getDocs(collection(db, 'organizations', organizationId, 'users'));
      setAllUsers(snap.docs.map(d => ({ id: d.id, uid: d.data().uid || d.id, ...d.data() })));
    } catch (e) { console.error('loadUsers:', e); }
  };

  const loadNotificationSettings = async () => {
    try {
      const snap = await getDocs(query(
        collection(db, 'organizations', organizationId, 'users'),
        where('uid', '==', user.uid)
      ));
      if (!snap.empty) setNotificationsEnabled(snap.docs[0].data().notificationsEnabled !== false);
    } catch (e) { console.error('loadNotificationSettings:', e); }
  };

  const filterPosts = () => {
    let filtered = [...allPosts];
    if (filterMode === 'trending') {
      filtered.sort((a, b) =>
        (b.likeCount || 0) + (b.commentCount || 0) - ((a.likeCount || 0) + (a.commentCount || 0))
      );
    } else if (filterMode === 'shared') {
      markSharedPostsAsViewed();
      filtered = sharedPosts.map(shared => {
        const orig = allPosts.find(p => p.id === shared.postId);
        if (!orig) return null;
        return {
          ...orig,
          sharedBy: shared.sharedByUserName,
          sharedAt: shared.sharedAt,
          sharedId: shared.id,
          isShared: true,
        };
      }).filter(Boolean);
    } else {
      filtered = sortWithPinned(filtered, userPinnedPostIds);
    }
    setPosts(filtered);
  };

  const markSharedPostsAsViewed = async () => {
    try {
      const batch = writeBatch(db);
      const unviewed = sharedPosts.filter(s => !s.viewed);
      unviewed.forEach(s => batch.update(
        doc(db, 'organizations', organizationId, 'sharedPosts', s.id),
        { viewed: true }
      ));
      if (unviewed.length > 0) await batch.commit();
    } catch (e) { console.error('markSharedPostsAsViewed:', e); }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try { await Promise.all([loadUsers(), deleteExpiredStories()]); }
    catch (e) { console.error('Refresh error:', e); }
    finally { setRefreshing(false); }
  };

  // ─── Pin action ────────────────────────────────────────────────────────────
  const handleTogglePin = useCallback(async (post) => {
    const isAdminPinningOwnPost = isAdmin && post.userId === user.uid;
    const currentlyPinned = isAdminPinningOwnPost
      ? !!post.isAdminPinned
      : userPinnedPostIds.has(post.id);

    const newPin = !currentlyPinned;

    let title, message;
    if (isAdminPinningOwnPost) {
      title = newPin ? 'Pin for Everyone' : 'Unpin for Everyone';
      message = newPin
        ? 'This will pin your post at the top of every member\'s feed.'
        : 'This will remove the global pin. Members will no longer see it pinned.';
    } else {
      title = newPin ? 'Pin to My Feed' : 'Unpin from My Feed';
      message = newPin
        ? 'This post will appear pinned at the top of your feed. Other members will not see it pinned.'
        : 'This post will no longer be pinned on your feed.';
    }

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: newPin ? 'Pin' : 'Unpin',
        onPress: async () => {
          try {
            await togglePinPost({
              postId: post.id,
              postOwnerId: post.userId,
              currentlyPinned,
              organizationId,
              actingUserId: user.uid,
              actingUserIsAdmin: isAdmin,
            });
            setMenuVisible({});
          } catch (e) {
            Alert.alert('Error', 'Failed to update pin.');
          }
        },
      },
    ]);
  }, [user.uid, isAdmin, organizationId, userPinnedPostIds]);

  const isPostPinnedForUser = useCallback((post) => {
    return !!post.isAdminPinned || userPinnedPostIds.has(post.id);
  }, [userPinnedPostIds]);

  // ─── Post actions ──────────────────────────────────────────────────────────
  const handleDeletePost = useCallback(async (postId, postUserId, postMedia) => {
    if (postUserId !== user.uid && !isAdmin) {
      Alert.alert('Error', 'You can only delete your own posts');
      return;
    }
    Alert.alert('Delete Post', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            if (postMedia?.length) {
              const storage = getStorage();
              for (const m of postMedia) {
                if (m.url?.includes('firebase')) {
                  try {
                    const path = decodeURIComponent(m.url.split('/o/')[1]?.split('?')[0]);
                    if (path) await deleteObject(ref(storage, path));
                  } catch (_) { }
                }
              }
            }
            await deleteDoc(doc(db, 'organizations', organizationId, 'posts', postId));
            setMenuVisible({});
          } catch (e) { Alert.alert('Error', 'Failed to delete post'); }
        }
      }
    ]);
  }, [user.uid, isAdmin, organizationId]);

  const handleLike = useCallback(async (postId, likes) => {
    const liked = likes.includes(user.uid);
    try {
      const postRef = doc(db, 'organizations', organizationId, 'posts', postId);
      await updateDoc(postRef, liked
        ? { likes: arrayRemove(user.uid), likeCount: increment(-1) }
        : { likes: arrayUnion(user.uid), likeCount: increment(1) }
      );
      if (!liked && notificationsEnabled) {
        const post = allPosts.find(p => p.id === postId);
        if (post?.userId !== user.uid) sendNotificationToUser(post.userId, 'like', postId);
      }
    } catch (e) { console.error('handleLike:', e); }
  }, [user.uid, organizationId, notificationsEnabled, allPosts]);

  const handleComment = async () => {
    if (!commentText.trim() || !selectedPostForComment) return;
    try {
      const postRef = doc(db, 'organizations', organizationId, 'posts', selectedPostForComment.id);
      const postDoc = await getDoc(postRef);
      if (!postDoc.exists()) {
        Alert.alert('Error', 'Post no longer exists.');
        setShowCommentModal(false);
        return;
      }
      const comment = {
        id: Date.now().toString(),
        userId: user.uid,
        userName: `${userProfile.firstName} ${userProfile.lastName}`,
        userAvatar: userProfile.profilePicture || '',
        text: commentText.trim(),
        createdAt: new Date().toISOString(),
        replyToUserName: replyToComment?.userName || null,
        postId: selectedPostForComment.id,
      };
      await updateDoc(postRef, { comments: arrayUnion(comment), commentCount: increment(1) });
      if (selectedPostForComment.userId !== user.uid && notificationsEnabled)
        sendNotificationToUser(selectedPostForComment.userId, 'comment', selectedPostForComment.id);
      setCommentText('');
      setReplyToComment(null);
      setShowCommentModal(false);
      setShowUserMentions(false);
    } catch (e) { console.error('handleComment:', e); Alert.alert('Error', 'Failed to add comment'); }
  };

  const handleDeleteComment = async (postId, comment) => {
    if (comment.userId !== user.uid && !isAdmin) {
      Alert.alert('Error', 'You can only delete your own comments');
      return;
    }
    Alert.alert('Delete Comment', 'Delete this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            const postRef = doc(db, 'organizations', organizationId, 'posts', postId);
            const postDoc = await getDoc(postRef);
            if (!postDoc.exists()) { Alert.alert('Error', 'Post not found'); return; }
            const current = postDoc.data().comments || [];
            const updated = current.filter(c => c.id !== comment.id && c.replyTo !== comment.id);
            await updateDoc(postRef, {
              comments: updated,
              commentCount: increment(-(current.length - updated.length))
            });
            if (showCommentsView && selectedPostForComment?.id === postId) {
              const fresh = await getDoc(postRef);
              if (fresh.exists()) setSelectedPostForComment({ id: fresh.id, ...fresh.data() });
            }
          } catch (e) { Alert.alert('Error', 'Failed to delete comment'); }
        }
      }
    ]);
  };

  // ─── Story actions ─────────────────────────────────────────────────────────
  const handleStoryView = useCallback(async (story) => {
    if (!story?.views?.includes(user.uid)) {
      try {
        await updateDoc(doc(db, 'organizations', organizationId, 'stories', story.id), {
          views: arrayUnion(user.uid),
          viewCount: increment(1)
        });
      } catch (e) { console.error('handleStoryView:', e); }
    }
  }, [user.uid, organizationId]);

  const openStoryGroup = useCallback((group) => {
    setSelectedStoryGroup(group);
    setStoryInitialIndex(0);
    setStoryViewerVisible(true);
  }, []);

  const closeStoryViewer = useCallback(() => {
    setStoryViewerVisible(false);
  }, []);

  const handleDeleteStory = useCallback(async (story, onUpdated) => {
    if (story.userId !== user.uid && !isAdmin) {
      Alert.alert('Error', 'You can only delete your own stories');
      return;
    }
    Alert.alert('Delete Story', 'Delete this story?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteDoc(doc(db, 'organizations', organizationId, 'stories', story.id));
            if (story.mediaUrl?.includes('firebase')) {
              try {
                const path = decodeURIComponent(story.mediaUrl.split('/o/')[1]?.split('?')[0]);
                if (path) await deleteObject(ref(getStorage(), path));
              } catch (_) { }
            }
            const updatedGroup = {
              ...selectedStoryGroup,
              stories: (selectedStoryGroup?.stories || []).filter(s => s.id !== story.id)
            };
            setSelectedStoryGroup(updatedGroup);
            onUpdated(updatedGroup.stories);
          } catch (e) { Alert.alert('Error', `Failed to delete: ${e.message}`); }
        }
      }
    ]);
  }, [user.uid, isAdmin, organizationId, selectedStoryGroup]);

  // ─── Story upload ──────────────────────────────────────────────────────────
  const handleAddStory = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed'); return; }
    Alert.alert('Add Story', 'Choose how to add your story', [
      { text: 'Take Photo/Video', onPress: launchCamera },
      { text: 'Photo from Gallery', onPress: () => pickMediaForStory('image') },
      { text: 'Video from Gallery', onPress: () => pickMediaForStory('video') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [organizationId, userProfile, user.uid]);

  const launchCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed'); return; }
    Alert.alert('Camera', 'Capture:', [
      { text: 'Photo', onPress: () => captureMedia('image') },
      { text: 'Video', onPress: () => captureMedia('video') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const captureMedia = async (type) => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: type === 'image' ? ['images'] : ['videos'],
      allowsEditing: true, aspect: [9, 16],
      quality: type === 'image' ? 0.8 : 0.7, videoMaxDuration: 30,
    });
    if (!result.canceled && result.assets[0]) await uploadStory(result.assets[0].uri, type);
  };

  const pickMediaForStory = async (type) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: type === 'image' ? ['images'] : ['videos'],
      allowsEditing: true, aspect: [9, 16],
      quality: type === 'image' ? 0.8 : 0.7, videoMaxDuration: 30,
    });
    if (!result.canceled && result.assets[0]) await uploadStory(result.assets[0].uri, type);
  };

  const uploadStory = async (mediaUri, type) => {
    const pending = {
      id: 'pending', userId: user.uid,
      userName: `${userProfile.firstName} ${userProfile.lastName}`,
      userAvatar: userProfile.profilePicture || null,
      mediaUrl: mediaUri, mediaType: type,
      createdAt: new Date(), isUploading: true, uploadProgress: 0,
    };
    setPendingStory(pending);
    try {
      const storage = getStorage();
      const blob = await (await fetch(mediaUri)).blob();
      const filename = `stories/${user.uid}_${Date.now()}.${type === 'image' ? 'jpg' : 'mp4'}`;
      const storageRef = ref(storage, filename);
      setPendingStory(p => ({ ...p, uploadProgress: 30 }));
      await uploadBytes(storageRef, blob);
      setPendingStory(p => ({ ...p, uploadProgress: 70 }));
      const url = await getDownloadURL(storageRef);
      setPendingStory(p => ({ ...p, uploadProgress: 90 }));
      await addDoc(collection(db, 'organizations', organizationId, 'stories'), {
        userId: user.uid,
        userName: `${userProfile.firstName} ${userProfile.lastName}`,
        userAvatar: userProfile.profilePicture || null,
        mediaUrl: url, mediaType: type,
        createdAt: serverTimestamp(),
        views: [], viewCount: 0,
      });
      setPendingStory(p => ({ ...p, uploadProgress: 100 }));
      setTimeout(() => setPendingStory(null), 500);
    } catch (e) {
      setPendingStory(null);
      Alert.alert('Error', `Failed to upload story: ${e.message}`);
    }
  };

  // ─── Share ─────────────────────────────────────────────────────────────────
  const handleShareToUser = async (otherUser) => {
    if (!selectedPostForShare) return;
    try {
      await addDoc(collection(db, 'organizations', organizationId, 'sharedPosts'), {
        postId: selectedPostForShare.id,
        sharedByUserId: user.uid,
        sharedByUserName: `${userProfile.firstName} ${userProfile.lastName}`,
        sharedWithUserId: otherUser.uid,
        sharedWithUserName: `${otherUser.firstName} ${otherUser.lastName}`,
        sharedAt: serverTimestamp(), viewed: false,
      });
      const chatsRef = collection(db, 'organizations', organizationId, 'privateChats');
      const snap = await getDocs(query(chatsRef, where('participants', 'array-contains', user.uid)));
      let chatId = snap.docs.find(d => d.data().participants.includes(otherUser.uid))?.id;
      if (!chatId) {
        const nc = await addDoc(chatsRef, { participants: [user.uid, otherUser.uid], createdAt: serverTimestamp() });
        chatId = nc.id;
      }
      await addDoc(collection(db, 'organizations', organizationId, 'privateChats', chatId, 'messages'), {
        text: `Shared a post: ${selectedPostForShare.content?.substring(0, 100)}...`,
        type: 'shared_post', postId: selectedPostForShare.id,
        postContent: selectedPostForShare.content, postAuthor: selectedPostForShare.userName,
        userId: user.uid, userName: `${userProfile.firstName} ${userProfile.lastName}`,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'organizations', organizationId, 'posts', selectedPostForShare.id), {
        shares: increment(1)
      });
      setShowShareModal(false);
      setSelectedPostForShare(null);
      Alert.alert('Success', `Post shared with ${otherUser.firstName}!`);
    } catch (e) { Alert.alert('Error', 'Failed to share post'); }
  };

  // ─── Notifications ─────────────────────────────────────────────────────────
  const sendNotificationToUser = async (userId, type, postId) => {
    try {
      await addDoc(collection(db, 'organizations', organizationId, 'notifications'), {
        userId, fromUserId: user.uid,
        fromUserName: `${userProfile.firstName} ${userProfile.lastName}`,
        type, postId,
        message: type === 'like'
          ? `${userProfile.firstName} liked your post`
          : `${userProfile.firstName} commented on your post`,
        read: false, createdAt: serverTimestamp(),
      });
    } catch (e) { console.error('sendNotification:', e); }
  };

  const toggleNotifications = async () => {
    try {
      const snap = await getDocs(query(
        collection(db, 'organizations', organizationId, 'users'),
        where('uid', '==', user.uid)
      ));
      if (!snap.empty) {
        await updateDoc(doc(db, 'organizations', organizationId, 'users', snap.docs[0].id), {
          notificationsEnabled: !notificationsEnabled
        });
        setNotificationsEnabled(v => !v);
      }
    } catch (e) { console.error('toggleNotifications:', e); }
  };

  // ─── Misc helpers ──────────────────────────────────────────────────────────
  const getTimeAgo = useCallback((date) => {
    if (!date) return 'Just now';
    const s = Math.floor((Date.now() - (date?.toDate ? date.toDate() : new Date(date)).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
    return (date?.toDate ? date.toDate() : new Date(date)).toLocaleDateString();
  }, []);

  const toggleExpand = useCallback((id) => {
    setExpandedPosts(p => ({ ...p, [id]: !p[id] }));
  }, []);

  const viewUserProfile = useCallback((userId) => {
    const target = allUsers.find(u => u.uid === userId);
    if (target) navigation.navigate('UserProfile', { userId: target.uid, userProfile: target });
  }, [allUsers, navigation]);

  const handleShowLikes = useCallback((post) => {
    setSelectedPostLikes(allUsers.filter(u => post.likes?.includes(u.uid)));
    setShowLikesModal(true);
  }, [allUsers]);

  // ── Updated openMediaViewer to use new state ──────────────────────────────
  const openMediaViewer = useCallback((post, index) => {
    setMediaViewerPost(post);
    setMediaViewerIndex(index);
    setMediaViewerVisible(true);
  }, []);

  const closeMediaViewer = useCallback(() => {
    setMediaViewerVisible(false);
  }, []);

  const insertMention = useCallback((userName) => {
    setCommentText(prev => {
      const i = prev.lastIndexOf('@');
      return i === -1 ? prev + `@${userName} ` : prev.substring(0, i) + `@${userName} `;
    });
    setShowUserMentions(false);
    setMentionSearch('');
  }, []);

  const handleCommentTextChange = useCallback((text) => {
    setCommentText(text);
    const i = text.lastIndexOf('@');
    if (i !== -1) {
      const after = text.substring(i + 1);
      if (!after.includes(' ')) {
        setMentionSearch(after);
        setShowUserMentions(true);
        return;
      }
    }
    setShowUserMentions(false);
  }, []);

  const filteredMentionUsers = useMemo(() =>
    mentionSearch
      ? allUsers.filter(u => `${u.firstName} ${u.lastName}`.toLowerCase().includes(mentionSearch.toLowerCase())).slice(0, 5)
      : allUsers.slice(0, 5),
    [allUsers, mentionSearch]
  );

  // ─── YouTube helpers ───────────────────────────────────────────────────────
  const getYouTubeVideoId = (url) => {
    for (const p of [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ]) {
      const m = url?.match(p);
      if (m) return m[1];
    }
    return null;
  };

  const getYouTubeThumbnail = (url) => {
    const id = getYouTubeVideoId(url);
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
  };

  const getLinkDisplayName = (url) => {
    try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
  };

  const openVideoPlayer = (url) => {
    const ytId = getYouTubeVideoId(url);
    if (ytId) {
      setYoutubeVideoId(ytId);
      setVideoPlayerTitle('YouTube');
      setVideoPlayerOriginalUrl(url);
      setYoutubePlayerReady(false);
      setShowVideoPlayerModal(true);
    } else {
      Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open link'));
    }
  };

  // ─── Media grid ────────────────────────────────────────────────────────────
  const renderMediaGrid = useCallback((media, post) => {
    if (!media?.length) return null;
    const cols = media.length === 1 ? 1 : 2;
    const w = (SCREEN_WIDTH - 40) / cols - 5;
    return (
      <View style={styles.mediaGrid}>
        {media.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.mediaItem, {
              width: media.length === 3 && index === 0 ? SCREEN_WIDTH - 40 : w,
              height: w,
              marginRight: index % cols === 0 && media.length > 1 ? 5 : 0,
              marginBottom: media.length > 2 ? 5 : 0,
            }]}
            onPress={() => openMediaViewer(post, index)}
          >
            <ExpoImage source={{ uri: item.url }} style={styles.mediaImage} contentFit="cover" cachePolicy="memory-disk" />
            {item.type === 'video' && (
              <View style={styles.videoOverlay}>
                <MaterialCommunityIcons name="play-circle" size={36} color="white" />
              </View>
            )}
            {media.length > 4 && index === 3 && (
              <View style={styles.moreMediaOverlay}>
                <Text style={styles.moreMediaText}>+{media.length - 4}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  }, [openMediaViewer]);

  const renderLinks = useCallback((links) => {
    if (!Array.isArray(links) || !links.length) return null;
    const valid = links.filter(l => l?.trim?.().length > 0);
    if (!valid.length) return null;
    return (
      <View style={styles.linksContainer}>
        {valid.map((link, i) => {
          const ytId = getYouTubeVideoId(link);
          const thumb = getYouTubeThumbnail(link);
          const name = getLinkDisplayName(link);
          if (ytId && thumb) {
            return (
              <View key={i} style={styles.linkPreviewCard}>
                <TouchableOpacity style={styles.videoThumbnailContainer} onPress={() => openVideoPlayer(link)} activeOpacity={0.85}>
                  <ExpoImage source={{ uri: thumb }} style={styles.videoThumbnailImage} contentFit="cover" cachePolicy="memory-disk" />
                  <View style={styles.videoPlayOverlay}>
                    <View style={styles.videoPlayButton}>
                      <MaterialCommunityIcons name="play" size={28} color="#fff" />
                    </View>
                  </View>
                  <View style={styles.videoSourceBadge}>
                    <MaterialCommunityIcons name="youtube" size={14} color="#FF0000" />
                    <Text style={styles.videoSourceText}>YouTube</Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.linkPreviewCardFooter}>
                  <MaterialCommunityIcons name="play-circle-outline" size={15} color="#5C6BC0" />
                  <Text style={styles.linkPreviewCardUrl} numberOfLines={1}>{name}</Text>
                  <TouchableOpacity onPress={() => Linking.openURL(link).catch(() => { })}>
                    <MaterialCommunityIcons name="open-in-new" size={15} color="#90A4AE" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }
          return (
            <TouchableOpacity key={i} style={styles.linkItem} onPress={() => Linking.openURL(link).catch(() => { })}>
              <MaterialCommunityIcons name="link-variant" size={16} color="#5C6BC0" />
              <Text style={styles.postLinkText} numberOfLines={1}>{link}</Text>
              <MaterialCommunityIcons name="open-in-new" size={14} color="#5C6BC0" />
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }, []);

  // ─── Render post ───────────────────────────────────────────────────────────
  const renderPost = useCallback(({ item }) => {
    const hasLiked = item.likes?.includes(user.uid);
    const isExpanded = expandedPosts[item.id];
    const isLong = (item.content?.length || 0) > 200;
    const display = isLong && !isExpanded ? item.content.substring(0, 200) + '...' : item.content;

    const pinned = isPostPinnedForUser(item);

    const pinLabel = item.isAdminPinned
      ? 'Pinned for Everyone'
      : pinned
        ? 'Pinned by You'
        : null;

    const menuPinTitle = item.isAdminPinned && isAdmin && item.userId === user.uid
      ? (item.isAdminPinned ? 'Unpin for Everyone' : 'Pin for Everyone')
      : (pinned ? 'Unpin from My Feed' : 'Pin to My Feed');

    return (
      <Card style={[styles.postCard, pinned && styles.pinnedPostCard]} elevation={1}>
        {pinned && pinLabel && (
          <View style={[
            styles.pinnedBanner,
            item.isAdminPinned && styles.pinnedBannerAdmin,
          ]}>
            <MaterialCommunityIcons
              name="pin"
              size={13}
              color={item.isAdminPinned ? '#FF6B35' : '#5C6BC0'}
            />
            <Text style={[
              styles.pinnedText,
              item.isAdminPinned && styles.pinnedTextAdmin,
            ]}>
              {pinLabel}
            </Text>
          </View>
        )}

        {item.isShared && (
          <View style={styles.sharedBanner}>
            <MaterialCommunityIcons name="share" size={13} color="#78909C" />
            <Text style={styles.sharedText}>Shared by {item.sharedBy}</Text>
          </View>
        )}

        <View style={styles.postHeader}>
          <TouchableOpacity onPress={() => viewUserProfile(item.userId)}>
            {item.userAvatar
              ? <ExpoImage source={{ uri: item.userAvatar }} style={{ width: 42, height: 42, borderRadius: 21 }} cachePolicy="memory-disk" />
              : <Avatar.Text size={42} label={item.userName?.split(' ').map(n => n[0]).join('') || 'U'} style={styles.avatar} />}
          </TouchableOpacity>
          <View style={styles.postHeaderInfo}>
            <TouchableOpacity onPress={() => viewUserProfile(item.userId)}>
              <Text variant="titleMedium" style={styles.userName}>{item.userName}</Text>
            </TouchableOpacity>
            <View style={styles.timeRow}>
              <MaterialCommunityIcons name="clock-outline" size={11} color="#B0BEC5" />
              <Text variant="bodySmall" style={styles.timeText}>{getTimeAgo(item.createdAt)}</Text>
            </View>
          </View>
          <Menu
            visible={!!menuVisible[item.id]}
            onDismiss={() => setMenuVisible(v => ({ ...v, [item.id]: false }))}
            anchor={
              <IconButton icon="dots-vertical" size={18}
                onPress={() => setMenuVisible(v => ({ ...v, [item.id]: true }))} />
            }
          >
            <Menu.Item
              onPress={() => { setMenuVisible({}); handleTogglePin(item); }}
              title={menuPinTitle}
              leadingIcon={pinned ? 'pin-off' : 'pin'}
            />
            {(item.userId === user.uid || isAdmin) && (
              <Menu.Item
                onPress={() => { setMenuVisible({}); handleDeletePost(item.id, item.userId, item.media); }}
                title="Delete Post"
                leadingIcon="delete"
              />
            )}
            <Menu.Item
              onPress={() => { setMenuVisible({}); Alert.alert('Report', 'Coming soon'); }}
              title="Report"
              leadingIcon="flag"
            />
          </Menu>
        </View>

        <Card.Content style={styles.postContent}>
          {display ? (
            <>
              <Text variant="bodyLarge" style={styles.contentText}>{display}</Text>
              {isLong && (
                <TouchableOpacity onPress={() => toggleExpand(item.id)}>
                  <Text style={styles.readMore}>{isExpanded ? 'Read less' : 'Read more'}</Text>
                </TouchableOpacity>
              )}
            </>
          ) : null}
          {renderMediaGrid(item.media, item)}
          {renderLinks(item.links)}
        </Card.Content>

        <View style={styles.actionsContainer}>
          <View style={styles.statsRow}>
            {item.likeCount > 0 && (
              <TouchableOpacity style={styles.statItem} onPress={() => handleShowLikes(item)}>
                <MaterialCommunityIcons name="heart" size={13} color="#EC407A" />
                <Text style={styles.statText}>{item.likeCount}</Text>
              </TouchableOpacity>
            )}
            {item.commentCount > 0 && (
              <TouchableOpacity style={styles.statItem}
                onPress={() => { setSelectedPostForComment(item); setShowCommentsView(true); }}>
                <MaterialCommunityIcons name="comment" size={13} color="#5C6BC0" />
                <Text style={styles.statText}>{item.commentCount} comments</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.actionButton} onPress={() => handleLike(item.id, item.likes || [])}>
              <MaterialCommunityIcons name={hasLiked ? 'heart' : 'heart-outline'} size={20} color={hasLiked ? '#EC407A' : '#78909C'} />
              <Text style={[styles.actionText, hasLiked && styles.likedText]}>{hasLiked ? 'Liked' : 'Like'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton}
              onPress={() => { setSelectedPostForComment(item); setReplyToComment(null); setShowCommentModal(true); }}>
              <MaterialCommunityIcons name="comment-outline" size={20} color="#78909C" />
              <Text style={styles.actionText}>Comment</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton}
              onPress={() => { setSelectedPostForShare(item); setShowShareModal(true); }}>
              <MaterialCommunityIcons name="share-outline" size={20} color="#78909C" />
              <Text style={styles.actionText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Card>
    );
  }, [
    user.uid, isAdmin, expandedPosts, menuVisible, getTimeAgo,
    handleLike, handleTogglePin, handleDeletePost, handleShowLikes,
    viewUserProfile, toggleExpand, renderMediaGrid, renderLinks,
    isPostPinnedForUser, userPinnedPostIds,
  ]);

  // ─── Render comment ────────────────────────────────────────────────────────
  const renderComment = (comment, postId) => {
    const isReply = !!comment.replyTo;
    const userAvatar = comment.userAvatar || allUsers.find(u => u.uid === comment.userId)?.profilePicture || null;
    const canDelete = comment.userId === user.uid || isAdmin;
    return (
      <View key={comment.id} style={[styles.commentItem, isReply && styles.replyItem]}>
        {userAvatar
          ? <ExpoImage source={{ uri: userAvatar }} style={{ width: 32, height: 32, borderRadius: 16, marginRight: 11 }} cachePolicy="memory-disk" />
          : <Avatar.Text size={32} label={comment.userName?.split(' ').map(n => n[0]).join('') || 'U'} style={styles.commentAvatar} />}
        <View style={styles.commentContent}>
          <Text style={styles.commentUserName}>{comment.userName}</Text>
          {comment.replyToUserName && <Text style={styles.replyingTo}>Replying to @{comment.replyToUserName}</Text>}
          <Text style={styles.commentText}>{comment.text}</Text>
          <Text style={styles.commentTime}>{getTimeAgo(comment.createdAt)}</Text>
        </View>
        {canDelete && (
          <IconButton icon="delete-outline" size={16} iconColor="#EC407A"
            onPress={() => handleDeleteComment(postId, comment)} />
        )}
      </View>
    );
  };

  // ─── Header ────────────────────────────────────────────────────────────────
  const storyListData = useMemo(() => [
    { id: 'add', isAddButton: true, onPress: handleAddStory },
    ...(pendingStory ? [pendingStory] : []),
    ...groupedStories,
  ], [pendingStory, groupedStories, handleAddStory]);

  const renderHeader = useCallback(() => (
    <>
      <Surface style={styles.storiesContainer} elevation={1}>
        <View style={styles.storiesHeader}>
          <Text variant="titleSmall" style={styles.storiesTitle}>Stories</Text>
          <TouchableOpacity onPress={handleAddStory}>
            <MaterialCommunityIcons name="plus-circle" size={22} color="#5C6BC0" />
          </TouchableOpacity>
        </View>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={storyListData}
          renderItem={({ item }) => (
            <StoryThumbnail item={item} user={user} onPress={openStoryGroup} />
          )}
          keyExtractor={item => item.id || item.userId}
          removeClippedSubviews
        />
      </Surface>
      <View style={styles.filterContainer}>
        {['all', 'trending', 'shared'].map(mode => (
          <Chip key={mode}
            selected={filterMode === mode}
            onPress={() => {
              if (mode === 'shared') { setUnreadSharedCount(0); markSharedPostsAsViewed(); }
              setFilterMode(mode);
            }}
            style={styles.filterChip} textStyle={styles.filterText}
          >
            {mode === 'all' ? 'All Posts' : mode === 'trending' ? 'Trending' : 'Shared'}
            {mode === 'shared' && unreadSharedCount > 0 ? ` (${unreadSharedCount})` : ''}
          </Chip>
        ))}
        <Chip
          selected={filterMode === 'members'}
          onPress={() => navigation.navigate('UsersList')}
          style={[styles.filterChip, styles.membersChip]}
          textStyle={styles.membersText}
          icon="account-group-outline"
        >Members</Chip>
      </View>
    </>
  ), [storyListData, filterMode, unreadSharedCount, user, openStoryGroup]);

  // ─── Add media to new post ─────────────────────────────────────────────────
  const pickMedia = async () => {
    if (mediaAttachments.length >= MAX_MEDIA_ITEMS) {
      Alert.alert('Limit Reached', `Max ${MAX_MEDIA_ITEMS} items`); return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'], allowsMultipleSelection: true,
      quality: 0.8, videoMaxDuration: 60,
    });
    if (!result.canceled && result.assets) {
      const valid = [];
      for (const asset of result.assets) {
        const blob = await (await fetch(asset.uri)).blob();
        if (blob.size > MAX_FILE_SIZE) { Alert.alert('Too large', `${asset.fileName} exceeds 10MB`); continue; }
        if (mediaAttachments.length + valid.length < MAX_MEDIA_ITEMS)
          valid.push({ uri: asset.uri, type: asset.type === 'video' ? 'video' : 'image', fileName: asset.fileName || `media_${Date.now()}` });
      }
      setMediaAttachments(prev => [...prev, ...valid].slice(0, MAX_MEDIA_ITEMS));
    }
  };

  const addLink = () => {
    if (!linkInput.trim()) return;
    let url = linkInput.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    try { new URL(url); } catch { Alert.alert('Invalid URL'); return; }
    setLinkAttachments(prev => [...prev, url]);
    setLinkInput('');
  };

  const handleCreatePost = async () => {
    if (!newPost.trim() && !mediaAttachments.length && !linkAttachments.length) {
      Alert.alert('Error', 'Post cannot be empty'); return;
    }
    setPosting(true); setUploadingMedia(true); setUploadProgress(0);
    try {
      const uploaded = [];
      for (let i = 0; i < mediaAttachments.length; i++) {
        setUploadProgress(((i + 1) / mediaAttachments.length) * 100);
        const m = mediaAttachments[i];
        const storage = getStorage();
        const blob = await (await fetch(m.uri)).blob();
        const ext = m.type === 'video' ? 'mp4' : 'jpg';
        const fname = `posts/${user.uid}_${Date.now()}_${i}.${ext}`;
        const sref = ref(storage, fname);
        await uploadBytes(sref, blob);
        uploaded.push({ url: await getDownloadURL(sref), type: m.type });
      }
      await addDoc(collection(db, 'organizations', organizationId, 'posts'), {
        userId: user.uid,
        userName: `${userProfile.firstName} ${userProfile.lastName}`,
        userAvatar: userProfile.profilePicture || null,
        content: newPost.trim(), media: uploaded,
        links: linkAttachments.filter(l => l.trim()),
        likes: [], likeCount: 0,
        comments: [], commentCount: 0, shares: 0,
        createdAt: serverTimestamp(),
      });
      setNewPost(''); setMediaAttachments([]); setLinkAttachments([]);
      setUploadProgress(0); setUploadingMedia(false); setShowNewPostModal(false);
      Alert.alert('Success', 'Post created!');
    } catch (e) { Alert.alert('Error', 'Failed to create post'); }
    finally { setPosting(false); setUploadingMedia(false); }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#667EEA', '#764BA2']} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={styles.headerContent}>
          <Text variant="headlineSmall" style={styles.headerTitle}>Feed</Text>
          <TouchableOpacity onPress={toggleNotifications} style={styles.notificationButton}>
            <MaterialCommunityIcons name={notificationsEnabled ? 'bell' : 'bell-off'} size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <FlatList
        data={posts}
        keyExtractor={item => item.isShared ? `shared-${item.sharedId}-${item.id}` : item.id}
        renderItem={renderPost}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="post-outline" size={72} color="#CFD8DC" />
            <Text variant="titleLarge" style={styles.emptyTitle}>No posts yet</Text>
          </View>
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={Platform.OS === 'android'}
        maxToRenderPerBatch={5}
        windowSize={10}
        initialNumToRender={6}
        updateCellsBatchingPeriod={50}
      />

      {/* ── Story Viewer ── */}
      <StoryViewer
        visible={storyViewerVisible}
        storyGroup={selectedStoryGroup}
        initialIndex={storyInitialIndex}
        userId={user.uid}
        isAdmin={isAdmin}
        allUsers={allUsers}
        onClose={closeStoryViewer}
        onStoryView={handleStoryView}
        onDeleteStory={handleDeleteStory}
        getTimeAgo={getTimeAgo}
      />

      {/* ── Full-screen Media Viewer (new, with back button + centered image) ── */}
      <MediaViewerModal
        visible={mediaViewerVisible}
        post={mediaViewerPost}
        initialIndex={mediaViewerIndex}
        onClose={closeMediaViewer}
      />

      <Portal>
        {/* NEW POST MODAL */}
        <Modal
          visible={showNewPostModal}
          onDismiss={() => { if (!posting) { setShowNewPostModal(false); setNewPost(''); setMediaAttachments([]); setLinkAttachments([]); } }}
          contentContainerStyle={styles.fullScreenModal}
        >
          <View style={styles.fullScreenContainer}>
            <Surface style={styles.commentModalHeader} elevation={1}>
              <IconButton icon="close" size={22} disabled={posting}
                onPress={() => { setShowNewPostModal(false); setNewPost(''); setMediaAttachments([]); setLinkAttachments([]); }} />
              <Text variant="titleMedium" style={styles.modalTitle}>Create Post</Text>
              <Button mode="contained" onPress={handleCreatePost} loading={posting}
                disabled={posting || (!newPost.trim() && !mediaAttachments.length && !linkAttachments.length)}
                style={styles.postButton} buttonColor="#5C6BC0" compact>Post</Button>
            </Surface>
            <ScrollView style={{ flex: 1 }} ref={scrollViewRef}>
              <View style={{ padding: 18 }}>
                <View style={styles.userInfoRow}>
                  {userProfile?.profilePicture
                    ? <ExpoImage source={{ uri: userProfile.profilePicture }} style={{ width: 38, height: 38, borderRadius: 19 }} cachePolicy="memory-disk" />
                    : <Avatar.Text size={38} label={`${userProfile?.firstName?.[0]}${userProfile?.lastName?.[0]}`} />}
                  <Text style={styles.postingAsText}>{userProfile?.firstName} {userProfile?.lastName}</Text>
                </View>
                <TextInput value={newPost} onChangeText={setNewPost} placeholder="What's on your mind?"
                  mode="flat" multiline numberOfLines={6} maxLength={1000}
                  style={styles.newPostInput} disabled={posting} />
                {uploadingMedia && <ProgressBar progress={uploadProgress / 100} color="#5C6BC0" style={{ marginVertical: 8 }} />}
                {mediaAttachments.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
                    {mediaAttachments.map((m, i) => (
                      <View key={i} style={styles.mediaPreviewItem}>
                        <ExpoImage source={{ uri: m.uri }} style={styles.mediaPreviewImage} contentFit="cover" />
                        {m.type === 'video' && <View style={styles.videoPreviewOverlay}><MaterialCommunityIcons name="play" size={22} color="white" /></View>}
                        <TouchableOpacity style={styles.removeMediaButton} onPress={() => setMediaAttachments(p => p.filter((_, j) => j !== i))}>
                          <MaterialCommunityIcons name="close-circle" size={22} color="#EC407A" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                )}
                {linkAttachments.map((l, i) => (
                  <View key={i} style={styles.linkPreviewItem}>
                    <MaterialCommunityIcons name="link" size={18} color="#5C6BC0" />
                    <Text style={{ flex: 1, color: '#5C6BC0', fontSize: 12 }} numberOfLines={1}>{l}</Text>
                    <IconButton icon="close" size={16} onPress={() => setLinkAttachments(p => p.filter((_, j) => j !== i))} />
                  </View>
                ))}
                <TextInput ref={linkInputRef} value={linkInput} onChangeText={setLinkInput}
                  placeholder="Add a link..." mode="outlined" style={styles.linkInput}
                  disabled={posting} onSubmitEditing={addLink} returnKeyType="done"
                  autoCapitalize="none" keyboardType="url"
                  right={<TextInput.Icon icon="plus" onPress={addLink} disabled={!linkInput.trim() || posting} />} />
                <Text variant="bodySmall" style={{ color: '#B0BEC5', marginTop: 8 }}>{newPost.length}/1000</Text>
              </View>
            </ScrollView>
            <Surface style={styles.attachmentBar} elevation={1}>
              <TouchableOpacity style={styles.attachmentButton} onPress={pickMedia} disabled={posting || mediaAttachments.length >= MAX_MEDIA_ITEMS}>
                <MaterialCommunityIcons name="image-multiple" size={22} color={mediaAttachments.length >= MAX_MEDIA_ITEMS ? '#E0E0E0' : '#5C6BC0'} />
                <Text style={styles.attachmentButtonText}>Media</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.attachmentButton} onPress={() => { setTimeout(() => linkInputRef.current?.focus(), 200); }} disabled={posting}>
                <MaterialCommunityIcons name="link" size={22} color="#5C6BC0" />
                <Text style={styles.attachmentButtonText}>Link</Text>
              </TouchableOpacity>
            </Surface>
          </View>
        </Modal>

        {/* COMMENT MODAL */}
        <Modal
          visible={showCommentModal}
          onDismiss={() => { setShowCommentModal(false); setCommentText(''); setReplyToComment(null); setShowUserMentions(false); }}
          contentContainerStyle={styles.fullScreenModal}
        >
          <View style={styles.fullScreenContainer}>
            <Surface style={styles.commentModalHeader} elevation={1}>
              <IconButton icon="arrow-left" size={22} onPress={() => { setShowCommentModal(false); setCommentText(''); setReplyToComment(null); }} />
              <Text variant="titleMedium" style={styles.modalTitle}>{replyToComment ? `Reply to ${replyToComment.userName}` : 'Add Comment'}</Text>
              <View style={{ width: 36 }} />
            </Surface>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
              <View style={{ padding: 18 }}>
                {replyToComment && (
                  <View style={styles.replyingToBar}>
                    <Text style={{ fontSize: 12, color: '#5C6BC0' }}>Replying to {replyToComment.userName}</Text>
                    <IconButton icon="close" size={14} onPress={() => setReplyToComment(null)} />
                  </View>
                )}
                {showUserMentions && (
                  <Surface style={{ borderRadius: 8, marginBottom: 8, maxHeight: 138 }} elevation={1}>
                    <FlatList data={filteredMentionUsers} keyExtractor={item => item.id}
                      renderItem={({ item }) => (
                        <TouchableOpacity style={styles.mentionItem} onPress={() => insertMention(`${item.firstName} ${item.lastName}`)}>
                          {item.profilePicture
                            ? <ExpoImage source={{ uri: item.profilePicture }} style={{ width: 32, height: 32, borderRadius: 16, marginRight: 9 }} cachePolicy="memory-disk" />
                            : <Avatar.Text size={32} label={`${item.firstName?.[0] || ''}${item.lastName?.[0] || ''}`} style={{ marginRight: 9 }} />}
                          <Text style={styles.mentionName}>{item.firstName} {item.lastName}</Text>
                        </TouchableOpacity>
                      )} />
                  </Surface>
                )}
                <TextInput value={commentText} onChangeText={handleCommentTextChange}
                  placeholder="Write a comment... (@ to mention)" mode="outlined" multiline
                  numberOfLines={4} style={styles.input} autoFocus
                  outlineColor="#E0E0E0" activeOutlineColor="#5C6BC0" />
                <Button mode="contained" onPress={handleComment} disabled={!commentText.trim()}
                  style={{ borderRadius: 8, marginTop: 8 }} buttonColor="#5C6BC0">
                  {replyToComment ? 'Post Reply' : 'Post Comment'}
                </Button>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        {/* COMMENTS VIEW MODAL */}
        <Modal
          visible={showCommentsView}
          onDismiss={() => { setShowCommentsView(false); setSelectedPostForComment(null); }}
          contentContainerStyle={styles.fullScreenModal}
        >
          <View style={styles.fullScreenContainer}>
            <Surface style={styles.commentModalHeader} elevation={1}>
              <IconButton icon="arrow-left" size={22} onPress={() => { setShowCommentsView(false); setSelectedPostForComment(null); }} />
              <Text variant="titleMedium" style={styles.modalTitle}>Comments ({selectedPostForComment?.commentCount || 0})</Text>
              <IconButton icon="comment-plus" size={22} onPress={() => { setShowCommentsView(false); setTimeout(() => setShowCommentModal(true), 300); }} />
            </Surface>
            <FlatList
              data={selectedPostForComment?.comments || []}
              keyExtractor={(item, i) => item.id || i.toString()}
              renderItem={({ item }) => renderComment(item, selectedPostForComment.id)}
              contentContainerStyle={{ padding: 13, paddingBottom: 74 }}
              ListEmptyComponent={
                <View style={styles.emptyComments}>
                  <MaterialCommunityIcons name="comment-outline" size={54} color="#CFD8DC" />
                  <Text style={styles.emptyCommentsText}>No comments yet</Text>
                </View>
              }
            />
          </View>
        </Modal>

        {/* SHARE MODAL */}
        <Modal
          visible={showShareModal}
          onDismiss={() => { setShowShareModal(false); setSelectedPostForShare(null); }}
          contentContainerStyle={styles.fullScreenModal}
        >
          <View style={styles.fullScreenContainer}>
            <Surface style={styles.commentModalHeader} elevation={1}>
              <IconButton icon="arrow-left" size={22} onPress={() => { setShowShareModal(false); setSelectedPostForShare(null); }} />
              <Text variant="titleMedium" style={styles.modalTitle}>Share with</Text>
              <View style={{ width: 36 }} />
            </Surface>
            <FlatList
              data={allUsers.filter(u => u.uid !== user.uid)}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.shareUserItem} onPress={() => handleShareToUser(item)}>
                  {item.profilePicture
                    ? <ExpoImage source={{ uri: item.profilePicture }} style={{ width: 42, height: 42, borderRadius: 21, marginRight: 11 }} cachePolicy="memory-disk" />
                    : <Avatar.Text size={42} label={`${item.firstName?.[0]}${item.lastName?.[0]}`} style={styles.shareAvatar} />}
                  <View style={styles.shareUserInfo}>
                    <Text style={styles.shareUserName}>{item.firstName} {item.lastName}</Text>
                    <Text style={styles.shareUserOccupation}>{item.occupation || 'Member'}</Text>
                  </View>
                  <MaterialCommunityIcons name="send" size={22} color="#5C6BC0" />
                </TouchableOpacity>
              )}
              contentContainerStyle={{ padding: 13 }}
            />
          </View>
        </Modal>

        {/* LIKES MODAL */}
        <Modal
          visible={showLikesModal}
          onDismiss={() => { setShowLikesModal(false); setSelectedPostLikes([]); }}
          contentContainerStyle={styles.fullScreenModal}
        >
          <View style={styles.fullScreenContainer}>
            <Surface style={styles.commentModalHeader} elevation={1}>
              <IconButton icon="arrow-left" size={22} onPress={() => { setShowLikesModal(false); setSelectedPostLikes([]); }} />
              <Text variant="titleMedium" style={styles.modalTitle}>Likes ({selectedPostLikes.length})</Text>
              <View style={{ width: 36 }} />
            </Surface>
            <FlatList
              data={selectedPostLikes}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.likeUserItem} onPress={() => { setShowLikesModal(false); setTimeout(() => viewUserProfile(item.uid), 300); }}>
                  {item.profilePicture
                    ? <ExpoImage source={{ uri: item.profilePicture }} style={{ width: 42, height: 42, borderRadius: 21, marginRight: 11 }} cachePolicy="memory-disk" />
                    : <Avatar.Text size={42} label={`${item.firstName?.[0] || ''}${item.lastName?.[0] || ''}`} style={styles.likeAvatar} />}
                  <View style={styles.likeUserInfo}>
                    <Text style={styles.likeUserName}>{item.firstName} {item.lastName}</Text>
                    <Text style={styles.likeUserOccupation}>{item.occupation || 'Member'}</Text>
                  </View>
                </TouchableOpacity>
              )}
              contentContainerStyle={{ padding: 13 }}
            />
          </View>
        </Modal>

        {/* YOUTUBE PLAYER MODAL */}
        <Modal
          visible={showVideoPlayerModal}
          onDismiss={() => { setShowVideoPlayerModal(false); setYoutubeVideoId(''); setYoutubePlayerReady(false); }}
          contentContainerStyle={{ flex: 1, margin: 0, backgroundColor: '#000' }}
        >
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, paddingTop: Platform.OS === 'ios' ? 54 : 16, paddingBottom: 11, backgroundColor: '#1a1a2e' }}>
              <IconButton icon="close" iconColor="#fff" size={22} onPress={() => { setShowVideoPlayerModal(false); setYoutubeVideoId(''); setYoutubePlayerReady(false); }} />
              <Text style={{ flex: 1, color: '#fff', fontSize: 15, fontWeight: '600' }}>{videoPlayerTitle}</Text>
              <TouchableOpacity onPress={() => Linking.openURL(videoPlayerOriginalUrl).catch(() => { })}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                <MaterialCommunityIcons name="open-in-new" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
              {!youtubePlayerReady && (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0d0d1a' }}>
                  <ActivityIndicator size="large" color="#5C6BC0" />
                  <Text style={{ color: '#90A4AE', fontSize: 13, marginTop: 13 }}>Loading video...</Text>
                </View>
              )}
              {youtubeVideoId ? (
                <YoutubeIframe
                  videoId={youtubeVideoId}
                  height={SCREEN_WIDTH * (9 / 16)}
                  width={SCREEN_WIDTH}
                  play={youtubePlayerReady}
                  onReady={() => setYoutubePlayerReady(true)}
                  onError={() => { setShowVideoPlayerModal(false); Linking.openURL(videoPlayerOriginalUrl).catch(() => { }); }}
                  webViewProps={{ allowsFullscreenVideo: true, allowsInlineMediaPlayback: true, mediaPlaybackRequiresUserAction: false }}
                />
              ) : null}
            </View>
          </View>
        </Modal>
      </Portal>

      <FAB icon="plus" style={styles.fab} onPress={() => setShowNewPostModal(true)} label="New Post" />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontWeight: '700', color: '#fff', fontSize: 28 },
  notificationButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  storiesContainer: { backgroundColor: '#fff', padding: 13, marginBottom: 4 },
  storiesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 },
  storiesTitle: { fontWeight: '600', color: '#263238' },
  storyItem: { alignItems: 'center', marginRight: 13, width: 64 },
  storyAvatar: { padding: 2.5, borderRadius: 27, borderWidth: 2, borderColor: '#E0E0E0', position: 'relative' },
  storyAvatarUnviewed: { borderColor: '#667EEA', borderWidth: 3 },
  storyAvatarOwn: { borderColor: '#10B981' },
  storyCount: { position: 'absolute', bottom: -2, right: -2, backgroundColor: '#5C6BC0', borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  storyCountText: { color: '#fff', fontSize: 9, fontWeight: '700', paddingHorizontal: 3 },
  addStoryAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#E8EAF6', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#5C6BC0', borderStyle: 'dashed' },
  storyName: { marginTop: 4, fontSize: 11, textAlign: 'center', color: '#263238' },
  filterContainer: { flexDirection: 'row', paddingHorizontal: 13, paddingVertical: 9, backgroundColor: '#fff', gap: 7, marginBottom: 4 },
  filterChip: { height: 30 },
  filterText: { fontSize: 11 },
  membersChip: { backgroundColor: '#E8EAF6', borderColor: '#5C6BC0', borderWidth: 1 },
  membersText: { color: '#5C6BC0', fontWeight: '600' },
  list: { paddingBottom: 76 },
  postCard: { marginHorizontal: 16, marginVertical: 6, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  pinnedPostCard: { borderLeftWidth: 3, borderLeftColor: '#5C6BC0' },
  pinnedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 11, paddingVertical: 7,
    backgroundColor: '#E8EAF6',
  },
  pinnedText: { fontSize: 11, color: '#5C6BC0', fontWeight: '600' },
  pinnedBannerAdmin: { backgroundColor: '#FFF3E0' },
  pinnedTextAdmin: { color: '#FF6B35' },
  sharedBanner: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: '#F5F5F5' },
  sharedText: { fontSize: 11, color: '#78909C', fontStyle: 'italic' },
  postHeader: { flexDirection: 'row', alignItems: 'center', padding: 11 },
  avatar: { backgroundColor: '#667EEA' },
  postHeaderInfo: { flex: 1, marginLeft: 11 },
  userName: { fontWeight: '600', color: '#263238', fontSize: 15 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  timeText: { color: '#B0BEC5', fontSize: 11 },
  postContent: { paddingHorizontal: 11, paddingBottom: 11 },
  contentText: { color: '#263238', lineHeight: 20, fontSize: 14 },
  readMore: { color: '#5C6BC0', marginTop: 4, fontWeight: '600', fontSize: 13 },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 11 },
  mediaItem: { borderRadius: 8, overflow: 'hidden', backgroundColor: '#ECEFF1', position: 'relative' },
  mediaImage: { width: '100%', height: '100%' },
  videoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  moreMediaOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  moreMediaText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  linksContainer: { marginTop: 11, gap: 7 },
  linkItem: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#E8EAF6', padding: 11, borderRadius: 8 },
  postLinkText: { flex: 1, color: '#5C6BC0', fontSize: 13, fontWeight: '500' },
  actionsContainer: { borderTopWidth: 1, borderTopColor: '#ECEFF1' },
  statsRow: { flexDirection: 'row', paddingHorizontal: 11, paddingVertical: 7, gap: 13 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statText: { fontSize: 12, color: '#78909C' },
  actionButtons: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#ECEFF1' },
  actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 9, gap: 5 },
  actionText: { color: '#78909C', fontWeight: '600', fontSize: 13 },
  likedText: { color: '#EC407A' },
  fullScreenModal: { flex: 1, margin: 0 },
  fullScreenContainer: { flex: 1, backgroundColor: '#fff' },
  commentModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 7, paddingTop: 50, paddingBottom: 11, backgroundColor: '#fff' },
  modalTitle: { flex: 1, fontWeight: '600', textAlign: 'center', color: '#263238' },
  postButton: { borderRadius: 8, minWidth: 74 },
  newPostInput: { backgroundColor: '#fff', minHeight: 92, marginBottom: 9 },
  mediaPreviewItem: { width: 92, height: 92, marginRight: 9, borderRadius: 8, overflow: 'hidden', backgroundColor: '#ECEFF1', position: 'relative' },
  mediaPreviewImage: { width: '100%', height: '100%' },
  videoPreviewOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  removeMediaButton: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 11 },
  linkPreviewItem: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#E8EAF6', padding: 11, borderRadius: 8, marginBottom: 7 },
  linkInput: { backgroundColor: '#fff' },
  attachmentBar: { flexDirection: 'row', padding: 13, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#ECEFF1', gap: 18 },
  attachmentButton: { alignItems: 'center', gap: 3 },
  attachmentButtonText: { fontSize: 11, color: '#5C6BC0' },
  commentItem: { flexDirection: 'row', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  replyItem: { marginLeft: 36, backgroundColor: '#FAFAFA', paddingLeft: 9 },
  commentAvatar: { backgroundColor: '#667EEA', marginRight: 11 },
  commentContent: { flex: 1 },
  commentUserName: { fontWeight: '600', fontSize: 13, marginBottom: 3, color: '#263238' },
  replyingTo: { fontSize: 11, color: '#5C6BC0', marginBottom: 3, fontStyle: 'italic' },
  commentText: { fontSize: 13, color: '#263238', marginBottom: 3 },
  commentTime: { fontSize: 10, color: '#B0BEC5' },
  emptyComments: { padding: 36, alignItems: 'center' },
  emptyCommentsText: { color: '#B0BEC5', marginTop: 9, fontSize: 15 },
  shareUserItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  shareAvatar: { backgroundColor: '#667EEA', marginRight: 11 },
  shareUserInfo: { flex: 1 },
  shareUserName: { fontSize: 15, fontWeight: '600', marginBottom: 2, color: '#263238' },
  shareUserOccupation: { fontSize: 12, color: '#78909C' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 54 },
  emptyTitle: { marginTop: 13, fontWeight: '700', color: '#78909C' },
  fab: { position: 'absolute', margin: 15, right: 0, bottom: 0, backgroundColor: '#5C6BC0' },
  uploadingStoryContainer: { position: 'relative', width: 52, height: 52 },
  uploadProgressRing: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 28, borderWidth: 2.5, borderColor: '#5C6BC0', justifyContent: 'center', alignItems: 'center' },
  uploadProgressOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(92,107,192,0.3)', borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  uploadProgressCircle: { position: 'absolute', bottom: -7, right: -7, backgroundColor: '#5C6BC0', borderRadius: 13, width: 27, height: 27, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  uploadProgressText: { color: '#fff', fontSize: 8, fontWeight: '700' },
  likeUserItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  likeAvatar: { backgroundColor: '#667EEA', marginRight: 11 },
  likeUserInfo: { flex: 1 },
  likeUserName: { fontSize: 15, fontWeight: '600', marginBottom: 2, color: '#263238' },
  likeUserOccupation: { fontSize: 12, color: '#78909C' },
  userInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 13 },
  postingAsText: { fontSize: 14, fontWeight: '600', color: '#263238' },
  replyingToBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#E8EAF6', padding: 9, borderRadius: 8, marginBottom: 9 },
  mentionItem: { flexDirection: 'row', alignItems: 'center', padding: 9, borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  mentionName: { fontSize: 14, fontWeight: '500', color: '#263238' },
  input: { backgroundColor: '#fff', marginBottom: 9 },
  linkPreviewCard: { borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#E0E0E0', marginTop: 11, backgroundColor: '#FAFAFA' },
  videoThumbnailContainer: { width: '100%', height: 180, backgroundColor: '#000', position: 'relative' },
  videoThumbnailImage: { width: '100%', height: '100%' },
  videoPlayOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  videoPlayButton: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(92,107,192,0.92)', justifyContent: 'center', alignItems: 'center', paddingLeft: 4 },
  videoSourceBadge: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  videoSourceText: { fontSize: 11, fontWeight: '600', color: '#263238' },
  linkPreviewCardFooter: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 9, backgroundColor: '#F5F5F5', borderTopWidth: 1, borderTopColor: '#E0E0E0' },
  linkPreviewCardUrl: { flex: 1, fontSize: 12, color: '#5C6BC0', fontWeight: '500' },
});