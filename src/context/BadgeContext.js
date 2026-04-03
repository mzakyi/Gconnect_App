// context/BadgeContext.js
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { doc, updateDoc, arrayUnion, onSnapshot, Timestamp, query, collection, where, getDocs, getCountFromServer, orderBy, getDoc } from 'firebase/firestore';
import { db } from '../../firebase.config';
import { AuthContext } from './AuthContext';

const BadgeContext = createContext();

export function BadgeProvider({ children }) {
  const { user, userProfile, organizationId, refreshUserProfile } = useContext(AuthContext);
  const userProfileRef = useRef(userProfile);
  const privateChatsSnapshotRef = useRef(null);
  const groupChatsSnapshotRef = useRef(null);

  useEffect(() => {
    userProfileRef.current = userProfile;
  }, [userProfile]);

  const [badges, setBadges] = useState({
    feed: 0,
    events: 0,
    announcements: 0,
    messages: 0,
    homeScreen: {
      posts: [],
      events: [],
      announcements: [],
      messages: [],
    }
  });
  const [loading, setLoading] = useState(true);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const toTimestamp = (date) => {
    try {
      if (!date) return Timestamp.now();
      if (date instanceof Timestamp) return date;
      if (date.toDate && typeof date.toDate === 'function') {
        return Timestamp.fromDate(date.toDate());
      }
      if (date instanceof Date) return Timestamp.fromDate(date);
      if (typeof date === 'string' || typeof date === 'number') {
        const parsedDate = new Date(date);
        if (!isNaN(parsedDate.getTime())) {
          return Timestamp.fromDate(parsedDate);
        }
      }
      return Timestamp.now();
    } catch (error) {
      return Timestamp.now();
    }
  };

  // ─── Count helpers ────────────────────────────────────────────────────────

  const countNewItems = async (collectionName, lastViewedTime) => {
    if (!organizationId) return 0;
    try {
      const timestamp = toTimestamp(lastViewedTime);
      const q = query(
        collection(db, 'organizations', organizationId, collectionName),
        where('createdAt', '>', timestamp)
      );
      const snapshot = await getCountFromServer(q);
      return snapshot.data().count;
    } catch (error) {
      console.error('Error counting new ' + collectionName + ':', error);
      return 0;
    }
  };

  // Reads directly from snapshot refs — no extra network call, always current
  const countUnreadMessagesFromRefs = (userId) => {
    let totalUnread = 0;
    if (privateChatsSnapshotRef.current) {
      privateChatsSnapshotRef.current.forEach(doc => {
        totalUnread += doc.data().unreadCount?.[userId] || 0;
      });
    }
    if (groupChatsSnapshotRef.current) {
      groupChatsSnapshotRef.current.forEach(doc => {
        totalUnread += doc.data().unreadCount?.[userId] || 0;
      });
    }
    return totalUnread;
  };

  const getRecentItems = async (collectionName, accountCreatedAt, dismissedIds) => {
    if (!organizationId) return [];
    try {
      const timestamp = toTimestamp(accountCreatedAt);
      const q = query(
        collection(db, 'organizations', organizationId, collectionName),
        where('createdAt', '>', timestamp)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(item => !dismissedIds.includes(item.id))
        .sort((a, b) => {
          try {
            return toTimestamp(b.createdAt).toMillis() - toTimestamp(a.createdAt).toMillis();
          } catch { return 0; }
        })
        .slice(0, 5);
    } catch (error) {
      console.error('Error getting recent ' + collectionName + ':', error);
      return [];
    }
  };

  const getUnreadMessagePreviewsFromRefs = (userId) => {
    if (!userId) return [];
    const previews = [];

    if (privateChatsSnapshotRef.current) {
      privateChatsSnapshotRef.current.forEach(chatDoc => {
        const chatData = chatDoc.data();
        const unreadCount = chatData.unreadCount?.[userId] || 0;
        if (unreadCount === 0) return;

        const otherUserId = chatData.participants?.find(id => id !== userId);
        previews.push({
          id: chatDoc.id,
          type: 'private',
          chatId: chatDoc.id,
          senderName: 'Someone',
          avatar: null,
          snippet: chatData.lastMessage || 'New message',
          unreadCount,
          lastMessageTime: chatData.lastMessageTime,
          otherUserId,
          isGroup: false,
        });
      });
    }

    if (groupChatsSnapshotRef.current) {
      groupChatsSnapshotRef.current.forEach(groupDoc => {
        const groupData = groupDoc.data();
        const unreadCount = groupData.unreadCount?.[userId] || 0;
        if (unreadCount === 0) return;

        previews.push({
          id: groupDoc.id,
          type: 'group',
          chatId: groupDoc.id,
          senderName: groupData.name || 'Group Chat',
          avatar: groupData.image || null,
          snippet: groupData.lastMessage || 'New message',
          unreadCount,
          lastMessageTime: groupData.lastMessageTime,
          isGroup: true,
        });
      });
    }

    return previews
      .sort((a, b) => {
        try {
          return toTimestamp(b.lastMessageTime).toMillis() - toTimestamp(a.lastMessageTime).toMillis();
        } catch { return 0; }
      })
      .slice(0, 5);
  };

  // ─── Main badge calculator ────────────────────────────────────────────────

  const calculateBadges = useCallback(async (userData) => {
    if (!organizationId || !user?.uid || !userData) return;

    try {
      const lastViewed = userData.lastViewedTimestamps || {};
      const dismissals = userData.homeScreenDismissals || {
        posts: [], events: [], announcements: []
      };
      const accountCreatedAt = toTimestamp(userData.createdAt);

      // Message count is read synchronously from snapshot refs
      const newMessagesCount = countUnreadMessagesFromRefs(user.uid);
      const messagePreviews = getUnreadMessagePreviewsFromRefs(user.uid);

      const [newFeedCount, newEventsCount, newAnnouncementsCount] = await Promise.all([
        countNewItems('posts', lastViewed.feed ? toTimestamp(lastViewed.feed) : accountCreatedAt),
        countNewItems('events', lastViewed.events ? toTimestamp(lastViewed.events) : accountCreatedAt),
        countNewItems('announcements', lastViewed.announcements ? toTimestamp(lastViewed.announcements) : accountCreatedAt),
      ]);

      const [recentPosts, recentEvents, recentAnnouncements] = await Promise.all([
        getRecentItems('posts', accountCreatedAt, dismissals.posts || []),
        getRecentItems('events', accountCreatedAt, dismissals.events || []),
        getRecentItems('announcements', accountCreatedAt, dismissals.announcements || []),
      ]);

      setBadges(prev => ({
        ...prev,
        feed: newFeedCount,
        events: newEventsCount,
        announcements: newAnnouncementsCount,
        messages: newMessagesCount,
        homeScreen: {
          posts: recentPosts,
          events: recentEvents,
          announcements: recentAnnouncements,
          messages: messagePreviews,
        }
      }));

      setLoading(false);
    } catch (error) {
      console.error('Error calculating badges:', error);
      setLoading(false);
    }
  }, [user?.uid, organizationId]);

  // ─── Trigger on profile load ──────────────────────────────────────────────

  useEffect(() => {
    if (!userProfile || !organizationId) return;
    calculateBadges(userProfile);
  }, [userProfile, organizationId, calculateBadges]);

  // ─── Real-time listeners for posts, announcements, events ─────────────────

  useEffect(() => {
    if (!user?.uid || !organizationId || !userProfile) return;

    const postsUnsub = onSnapshot(
      query(collection(db, 'organizations', organizationId, 'posts'), orderBy('createdAt', 'desc')),
      () => { if (userProfileRef.current) calculateBadges(userProfileRef.current); },
      (error) => console.error('Posts listener error:', error)
    );

    const announcementsUnsub = onSnapshot(
      query(collection(db, 'organizations', organizationId, 'announcements'), orderBy('createdAt', 'desc')),
      () => { if (userProfileRef.current) calculateBadges(userProfileRef.current); },
      (error) => console.error('Announcements listener error:', error)
    );

    const eventsUnsub = onSnapshot(
      query(collection(db, 'organizations', organizationId, 'events'), orderBy('createdAt', 'desc')),
      () => { if (userProfileRef.current) calculateBadges(userProfileRef.current); },
      (error) => console.error('Events listener error:', error)
    );

    return () => {
      postsUnsub();
      announcementsUnsub();
      eventsUnsub();
    };
  }, [user?.uid, organizationId, userProfile, calculateBadges]);

  // ─── Real-time listeners for messages ─────────────────────────────────────
  // Stores full snapshot docs in refs so calculateBadges reads them
  // synchronously — no stale data, no second network round-trip

  useEffect(() => {
    if (!user?.uid || !organizationId) return;

    const unsubPrivate = onSnapshot(
      query(
        collection(db, 'organizations', organizationId, 'privateChats'),
        where('participants', 'array-contains', user.uid)
      ),
      (snapshot) => {
        privateChatsSnapshotRef.current = snapshot.docs;
        if (userProfileRef.current) calculateBadges(userProfileRef.current);
      },
      (error) => console.error('Private chats listener error:', error)
    );

    const unsubGroups = onSnapshot(
      query(
        collection(db, 'organizations', organizationId, 'groupChats'),
        where('members', 'array-contains', user.uid)
      ),
      (snapshot) => {
        groupChatsSnapshotRef.current = snapshot.docs;
        if (userProfileRef.current) calculateBadges(userProfileRef.current);
      },
      (error) => console.error('Group chats listener error:', error)
    );

    return () => {
      unsubPrivate();
      unsubGroups();
    };
  }, [user?.uid, organizationId, calculateBadges]);

  // ─── Initialize timestamps for new users ─────────────────────────────────

  useEffect(() => {
    const initializeUser = async () => {
      if (!userProfile?.uid || !organizationId || userProfile.lastViewedTimestamps) return;
      try {
        const userRef = doc(db, 'organizations', organizationId, 'users', userProfile.uid);
        const now = Timestamp.now();
        await updateDoc(userRef, {
          lastViewedTimestamps: { feed: now, events: now, announcements: now, messages: now },
          homeScreenDismissals: { posts: [], events: [], announcements: [] }
        });
      } catch (error) {
        console.error('Error initializing user timestamps:', error);
      }
    };
    initializeUser();
  }, [userProfile?.uid, organizationId]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const markScreenAsViewed = async (screenName) => {
    if (!userProfile?.uid || !organizationId) return;
    try {
      const now = Timestamp.now();
      const userRef = doc(db, 'organizations', organizationId, 'users', userProfile.uid);
      await updateDoc(userRef, { ['lastViewedTimestamps.' + screenName]: now });
      setBadges(prev => ({ ...prev, [screenName]: 0 }));
    } catch (error) {
      console.error('Error marking ' + screenName + ' as viewed:', error);
    }
  };

  const dismissHomeScreenItem = async (type, itemId) => {
    if (!userProfile?.uid || !organizationId) return;
    try {
      const userRef = doc(db, 'organizations', organizationId, 'users', userProfile.uid);
      await updateDoc(userRef, { ['homeScreenDismissals.' + type]: arrayUnion(itemId) });
      setBadges(prev => ({
        ...prev,
        homeScreen: {
          ...prev.homeScreen,
          [type]: prev.homeScreen[type].filter(item => item.id !== itemId)
        }
      }));
      refreshUserProfile();
    } catch (error) {
      console.error('Error dismissing item:', error);
    }
  };

  const clearAllHomeScreenItems = async (type) => {
    if (!userProfile?.uid || !organizationId) return;
    const itemsToClear = badges.homeScreen[type] || [];
    if (!itemsToClear.length) return;
    try {
      const userRef = doc(db, 'organizations', organizationId, 'users', userProfile.uid);
      const itemIds = itemsToClear.map(item => item.id);
      await updateDoc(userRef, { ['homeScreenDismissals.' + type]: arrayUnion(...itemIds) });
      setBadges(prev => ({
        ...prev,
        homeScreen: { ...prev.homeScreen, [type]: [] }
      }));
      refreshUserProfile();
    } catch (error) {
      console.error('Error clearing all items:', error);
    }
  };

  const dismissMessagePreview = (chatId) => {
    setBadges(prev => ({
      ...prev,
      homeScreen: {
        ...prev.homeScreen,
        messages: prev.homeScreen.messages.filter(m => m.chatId !== chatId)
      }
    }));
  };

  return (
    <BadgeContext.Provider value={{
      badges,
      loading,
      markFeedAsViewed: () => markScreenAsViewed('feed'),
      markEventsAsViewed: () => markScreenAsViewed('events'),
      markAnnouncementsAsViewed: () => markScreenAsViewed('announcements'),
      markMessagesAsViewed: () => markScreenAsViewed('messages'),
      dismissHomeScreenItem,
      clearAllHomeScreenItems,
      dismissMessagePreview,
      refreshBadges: () => {
        const profile = userProfileRef.current;
        if (profile && organizationId) calculateBadges(profile);
      }
    }}>
      {children}
    </BadgeContext.Provider>
  );
}

export const useBadges = () => {
  const context = useContext(BadgeContext);
  if (!context) throw new Error('useBadges must be used within BadgeProvider');
  return context;
};