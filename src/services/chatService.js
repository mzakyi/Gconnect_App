// services/chatService.js
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  doc,
  updateDoc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  increment,
  arrayUnion,
  arrayRemove,
  limit
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../../firebase.config';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

// ── Helper functions for organization-specific paths ──────────────────────────

const getUsersCollection = (organizationId) => {
  if (organizationId) return collection(db, 'organizations', organizationId, 'users');
  throw new Error('Organization ID required for users collection');
};

const getUserDoc = (organizationId, userId) => {
  if (organizationId) return doc(db, 'organizations', organizationId, 'users', userId);
  return doc(db, 'users', userId);
};

const getPrivateChatsCollection = (organizationId) => {
  if (organizationId) return collection(db, 'organizations', organizationId, 'privateChats');
  throw new Error('Organization ID required for privateChats collection');
};

const getPrivateChatDoc = (organizationId, chatId) => {
  if (organizationId) return doc(db, 'organizations', organizationId, 'privateChats', chatId);
  return doc(db, 'privateChats', chatId);
};

const getGroupChatsCollection = (organizationId) => {
  if (organizationId) return collection(db, 'organizations', organizationId, 'groupChats');
  throw new Error('Organization ID required for groupChats collection');
};

const getGroupChatDoc = (organizationId, groupId) => {
  if (organizationId) return doc(db, 'organizations', organizationId, 'groupChats', groupId);
  return doc(db, 'groupChats', groupId);
};

// ==================== ONLINE STATUS FUNCTIONS ====================

export const updateOnlineStatus = async (userId, isOnline, organizationId) => {
  try {
    const userRef = doc(db, 'onlineUsers', userId);
    await setDoc(userRef, {
      online: isOnline,
      lastSeen: serverTimestamp(),
      userId,
      organizationId: organizationId || null
    }, { merge: true });

    if (organizationId) {
      const userDocRef = getUserDoc(organizationId, userId);
      await updateDoc(userDocRef, { online: isOnline, lastSeen: serverTimestamp() });
    } else {
      const userDocRef = doc(db, 'users', userId);
      await updateDoc(userDocRef, { online: isOnline, lastSeen: serverTimestamp() });
    }
  } catch (error) {
    if (error.code !== 'permission-denied') {
      console.error('Error updating online status:', error);
    }
  }
};

// ==================== PRIVATE CHAT FUNCTIONS ====================

export const createPrivateChat = async (userId1, userId2, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');

    const chatId = [userId1, userId2].sort().join('_');
    const chatRef = getPrivateChatDoc(organizationId, chatId);
    const chatDoc = await getDoc(chatRef);

    if (!chatDoc.exists()) {
      const user1Doc = await getDoc(doc(db, 'organizations', organizationId, 'users', userId1));
      const user2Doc = await getDoc(doc(db, 'organizations', organizationId, 'users', userId2));

      if (!user1Doc.exists() || !user2Doc.exists()) throw new Error('User data not found');

      await setDoc(chatRef, {
        participants: [userId1, userId2],
        createdAt: serverTimestamp(),
        lastMessage: '',
        lastMessageTime: serverTimestamp(),
        unreadCount: { [userId1]: 0, [userId2]: 0 },
        participantData: {
          [userId1]: { online: false, typing: false },
          [userId2]: { online: false, typing: false }
        },
        backgroundImage: null,
      });
    }
    return chatId;
  } catch (error) {
    console.error('Error creating private chat:', error.code, error.message);
    throw error;
  }
};

export const subscribeToPrivateChats = (userId, callback, organizationId) => {
  if (!organizationId) { callback([]); return () => {}; }

  const chatsCollection = getPrivateChatsCollection(organizationId);
  const q = query(
    chatsCollection,
    where('participants', 'array-contains', userId),
    orderBy('lastMessageTime', 'desc')
  );

  return onSnapshot(q, async (snapshot) => {
    const now = Date.now();
    const chats = await Promise.all(
      snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();
        if (data.hiddenFor?.[userId]) return null;
        const otherUserId = data.participants.find(id => id !== userId);

        let otherUserName = 'Unknown';
        let otherUserAvatar = null;

        try {
          const userDocRef = getUserDoc(organizationId, otherUserId);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const userData = userDoc.data();
            otherUserName = `${userData.firstName} ${userData.lastName}`;
            otherUserAvatar = userData.profilePicture || null;
          }
        } catch (err) {
          console.error('Failed to fetch user data:', err);
        }

        const mutedUntil = data.mutedFor?.[userId] ?? null;
        const isMuted = mutedUntil === 'forever' || (mutedUntil && new Date(mutedUntil).getTime() > now);

        return {
          id: docSnap.id,
          ...data,
          otherUserId,
          otherUserName,
          otherUserAvatar,
          unreadCount: data.unreadCount?.[userId] || 0,
          isMuted,
          mutedUntil,
        };
      })
    );

    callback(chats.filter(Boolean));
  }, (error) => {
    console.error('Error in subscribeToPrivateChats:', error);
    callback([]);
  });
};

export const subscribeToPrivateChatMessages = (chatId, callback, organizationId) => {
  if (!organizationId) { callback([]); return () => {}; }

  const messagesRef = collection(db, 'organizations', organizationId, 'privateChats', chatId, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'asc'));

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(messages);
  }, (error) => {
    console.error('Error in subscribeToPrivateChatMessages:', error);
    callback([]);
  });
};

export const sendPrivateMessage = async (chatId, userId, userName, userAvatar, text, organizationId, type = 'text', mediaUrl = null, fileName = null, replyTo = null) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');

    const messagesRef = collection(db, 'organizations', organizationId, 'privateChats', chatId, 'messages');
    const messageData = {
      text: text.trim(),
      type, mediaUrl, fileName, userId, userName,
      userAvatar: userAvatar || '',
      createdAt: serverTimestamp(),
      delivered: false,
      read: false,
      replyTo: replyTo ? { id: replyTo.id, text: replyTo.text, userName: replyTo.userName, type: replyTo.type } : null,
      reactions: {}
    };

    const messageRef = await addDoc(messagesRef, messageData);

    const chatRef = getPrivateChatDoc(organizationId, chatId);
    const chatDoc = await getDoc(chatRef);
    const chatData = chatDoc.data();
    const otherUserId = chatData.participants.find(id => id !== userId);

    await updateDoc(chatRef, {
      lastMessage: text.trim() || getMediaTypeLabel(type),
      lastMessageTime: serverTimestamp(),
      [`unreadCount.${otherUserId}`]: increment(1)
    });

    return messageRef.id;
  } catch (error) {
    console.error('Error sending private message:', error);
    throw error;
  }
};

export const sendStoryReplyMessage = async (
  chatId, userId, userName, userAvatar,
  organizationId, story, replyText = ''
) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const messagesRef = collection(
      db, 'organizations', organizationId, 'privateChats', chatId, 'messages'
    );
    const messageData = {
      text: replyText || '↩ Replied to a story',
      type: 'story_reply',
      userId,
      userName,
      userAvatar: userAvatar || '',
      createdAt: serverTimestamp(),
      delivered: false,
      read: false,
      reactions: {},
      replyTo: null,
      storyPreview: {
        storyId:    story.id,
        mediaUrl:   story.mediaUrl,
        mediaType:  story.mediaType,
        userName:   story.userName,
        userId:     story.userId,
        createdAt:  story.createdAt,
      },
    };
    const messageRef = await addDoc(messagesRef, messageData);

    const chatRef = getPrivateChatDoc(organizationId, chatId);
    const chatDoc = await getDoc(chatRef);
    const chatData = chatDoc.data();
    const otherUserId = chatData.participants.find(id => id !== userId);
    await updateDoc(chatRef, {
      lastMessage: replyText || '↩ Replied to a story',
      lastMessageTime: serverTimestamp(),
      [`unreadCount.${otherUserId}`]: increment(1),
    });
    return messageRef.id;
  } catch (error) {
    console.error('Error sending story reply:', error);
    throw error;
  }
};

export const markMessagesAsRead = async (chatId, userId, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');

    const chatRef = getPrivateChatDoc(organizationId, chatId);
    await updateDoc(chatRef, { [`unreadCount.${userId}`]: 0 });

    const messagesRef = collection(db, 'organizations', organizationId, 'privateChats', chatId, 'messages');
    const q = query(messagesRef, where('read', '==', false));
    const snapshot = await getDocs(q);
    const updatePromises = snapshot.docs
      .filter(doc => doc.data().userId !== userId)
      .map(doc => updateDoc(doc.ref, { read: true }));
    await Promise.all(updatePromises);
  } catch (error) {
    console.error('Error marking messages as read:', error);
  }
};

export const updateChatOnlineStatus = async (chatId, userId, isOnline, organizationId) => {
  try {
    if (!organizationId) return;
    const chatRef = getPrivateChatDoc(organizationId, chatId);
    await updateDoc(chatRef, {
      [`participantData.${userId}.online`]: isOnline,
      [`participantData.${userId}.lastSeen`]: serverTimestamp()
    });
  } catch (error) {
    if (error.code !== 'permission-denied') console.error('Error updating online status:', error);
  }
};

export const updateTypingStatus = async (chatId, userId, isTyping, organizationId) => {
  try {
    if (!organizationId) return;
    const chatRef = getPrivateChatDoc(organizationId, chatId);
    await updateDoc(chatRef, {
      [`participantData.${userId}.typing`]: isTyping,
      [`participantData.${userId}.typingAt`]: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating typing status:', error);
  }
};

// ==================== GROUP CHAT FUNCTIONS ====================

export const subscribeToGroupMessages = (callback) => {
  const messagesRef = collection(db, 'groupChat');
  const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(100));
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(messages);
  }, (error) => {
    console.error('Error in subscribeToGroupMessages:', error);
    callback([]);
  });
};

export const sendGroupMessage = async (userId, userName, userAvatar, text, type = 'text', mediaUrl = null, fileName = null, replyTo = null) => {
  try {
    const messagesRef = collection(db, 'groupChat');
    const messageData = {
      text: text.trim(), type, mediaUrl, fileName, userId, userName,
      userAvatar: userAvatar || '',
      createdAt: serverTimestamp(),
      reactions: {},
      replyTo: replyTo ? { id: replyTo.id, text: replyTo.text, userName: replyTo.userName, type: replyTo.type } : null
    };
    const messageRef = await addDoc(messagesRef, messageData);
    return messageRef.id;
  } catch (error) {
    console.error('Error sending group message:', error);
    throw error;
  }
};

export const subscribeToOnlineUsers = (callback, organizationId) => {
  if (!organizationId) { callback(0); return () => {}; }
  const usersCollection = getUsersCollection(organizationId);
  const q = query(usersCollection, where('online', '==', true));
  return onSnapshot(q, (snapshot) => { callback(snapshot.size); }, (error) => {
    console.error('Error in subscribeToOnlineUsers:', error);
    callback(0);
  });
};

export const subscribeToGroupMembers = (callback, organizationId) => {
  if (!organizationId) { callback([]); return () => {}; }
  const usersCollection = getUsersCollection(organizationId);
  const q = query(usersCollection, orderBy('firstName'));
  return onSnapshot(q, (snapshot) => {
    const members = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(members);
  }, (error) => {
    console.error('Error in subscribeToGroupMembers:', error);
    callback([]);
  });
};

// ==================== MEDIA FUNCTIONS ====================

export const uploadMediaFile = async (uri, type, chatId, userId, organizationId) => {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const timestamp = Date.now();
    const fileExtension = uri.split('.').pop();
    const fileName = `${type}_${timestamp}.${fileExtension}`;
    const storagePath = organizationId
      ? `organizations/${organizationId}/chat-media/${chatId}/${userId}/${fileName}`
      : `chat-media/${chatId}/${userId}/${fileName}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, blob);
    const downloadURL = await getDownloadURL(storageRef);
    return { downloadURL, fileName, storagePath, fileSize: blob.size, fileType: blob.type };
  } catch (error) {
    console.error('Error uploading media:', error);
    throw error;
  }
};

export const deleteMediaFile = async (storagePath) => {
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (error) {
    console.error('Error deleting media:', error);
    throw error;
  }
};

// ==================== REACTION FUNCTIONS ====================

export const addReaction = async (chatId, messageId, userId, emoji, organizationId, isGroupChat = false) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const messageRef = isGroupChat
      ? doc(db, 'organizations', organizationId, 'groupChats', chatId, 'messages', messageId)
      : doc(db, 'organizations', organizationId, 'privateChats', chatId, 'messages', messageId);
    await updateDoc(messageRef, { [`reactions.${emoji}`]: arrayUnion(userId) });
  } catch (error) {
    console.error('Error adding reaction:', error);
    throw error;
  }
};

export const removeReaction = async (chatId, messageId, userId, emoji, organizationId, isGroupChat = false) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const messageRef = isGroupChat
      ? doc(db, 'organizations', organizationId, 'groupChats', chatId, 'messages', messageId)
      : doc(db, 'organizations', organizationId, 'privateChats', chatId, 'messages', messageId);
    await updateDoc(messageRef, { [`reactions.${emoji}`]: arrayRemove(userId) });
  } catch (error) {
    console.error('Error removing reaction:', error);
    throw error;
  }
};

// ==================== DELETE FUNCTIONS ====================
export const deleteMessageForEveryone = async (chatId, messageId, organizationId, isGroupChat = false) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const messageRef = isGroupChat
      ? doc(db, 'organizations', organizationId, 'groupChats', chatId, 'messages', messageId)
      : doc(db, 'organizations', organizationId, 'privateChats', chatId, 'messages', messageId);
    await updateDoc(messageRef, {
      deleted: true, deletedAt: serverTimestamp(),
      text: 'This message was deleted', type: 'deleted', mediaUrl: null
    });

    // Clear lastMessage on chat doc if this was the last visible message
    const chatRef = isGroupChat
      ? doc(db, 'organizations', organizationId, 'groupChats', chatId)
      : doc(db, 'organizations', organizationId, 'privateChats', chatId);
    const messagesRef = isGroupChat
      ? collection(db, 'organizations', organizationId, 'groupChats', chatId, 'messages')
      : collection(db, 'organizations', organizationId, 'privateChats', chatId, 'messages');
    const recentQ = query(messagesRef, orderBy('createdAt', 'desc'), limit(2));
    const recentSnap = await getDocs(recentQ);
    const lastVisible = recentSnap.docs.find(d => d.id !== messageId && d.data().type !== 'deleted');
    if (lastVisible) {
      const lastData = lastVisible.data();
      await updateDoc(chatRef, {
        lastMessage: lastData.text || getMediaTypeLabel(lastData.type),
        lastMessageTime: lastData.createdAt,
      });
    } else {
      await updateDoc(chatRef, { lastMessage: '' });
    }
  } catch (error) {
    console.error('Error deleting message:', error);
    throw error;
  }
};

export const deleteMessageForMe = async (chatId, messageId, userId, organizationId, isGroupChat = false) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const messageRef = isGroupChat
      ? doc(db, 'organizations', organizationId, 'groupChats', chatId, 'messages', messageId)
      : doc(db, 'organizations', organizationId, 'privateChats', chatId, 'messages', messageId);
    await updateDoc(messageRef, { [`deletedFor.${userId}`]: true });

    // Clear lastMessage on chat doc if this was the last visible message for this user
    const chatRef = isGroupChat
      ? doc(db, 'organizations', organizationId, 'groupChats', chatId)
      : doc(db, 'organizations', organizationId, 'privateChats', chatId);
    const messagesRef = isGroupChat
      ? collection(db, 'organizations', organizationId, 'groupChats', chatId, 'messages')
      : collection(db, 'organizations', organizationId, 'privateChats', chatId, 'messages');
    const recentQ = query(messagesRef, orderBy('createdAt', 'desc'), limit(5));
    const recentSnap = await getDocs(recentQ);
    const lastVisible = recentSnap.docs.find(
      d => d.id !== messageId && !d.data().deletedFor?.[userId] && d.data().type !== 'deleted'
    );
    if (lastVisible) {
      const lastData = lastVisible.data();
      await updateDoc(chatRef, {
        lastMessage: lastData.text || getMediaTypeLabel(lastData.type),
        lastMessageTime: lastData.createdAt,
      });
    } else {
      await updateDoc(chatRef, { lastMessage: '' });
    }
  } catch (error) {
    console.error('Error deleting message for me:', error);
    throw error;
  }
};

export const clearChatHistory = async (chatId, userId, organizationId, isGroupChat = false) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const messagesRef = isGroupChat
      ? collection(db, 'organizations', organizationId, 'groupChats', chatId, 'messages')
      : collection(db, 'organizations', organizationId, 'privateChats', chatId, 'messages');
    const snapshot = await getDocs(messagesRef);
    await Promise.all(snapshot.docs.map(doc => updateDoc(doc.ref, { [`deletedFor.${userId}`]: true })));
  } catch (error) {
    console.error('Error clearing chat history:', error);
    throw error;
  }
};

// ==================== SEARCH FUNCTIONS ====================

export const searchMessages = async (chatId, searchTerm, organizationId, isGroupChat = false) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const messagesRef = isGroupChat
      ? collection(db, 'organizations', organizationId, 'groupChats', chatId, 'messages')
      : collection(db, 'organizations', organizationId, 'privateChats', chatId, 'messages');
    const snapshot = await getDocs(messagesRef);
    return snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(msg => msg.text?.toLowerCase().includes(searchTerm.toLowerCase()));
  } catch (error) {
    console.error('Error searching messages:', error);
    throw error;
  }
};

// ==================== MUTE FUNCTIONS ====================

export const muteChat = async (chatId, userId, duration, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const mutedUntil = duration === 'forever'
      ? 'forever'
      : new Date(Date.now() + duration).toISOString();
    const chatRef = getPrivateChatDoc(organizationId, chatId);
    await updateDoc(chatRef, { [`mutedFor.${userId}`]: mutedUntil });
  } catch (error) {
    console.error('Error muting chat:', error);
    throw error;
  }
};

export const unmuteChat = async (chatId, userId, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const chatRef = getPrivateChatDoc(organizationId, chatId);
    await updateDoc(chatRef, { [`mutedFor.${userId}`]: null });
  } catch (error) {
    console.error('Error unmuting chat:', error);
    throw error;
  }
};

export const muteGroupChat = async (groupId, userId, duration, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const mutedUntil = duration === 'forever'
      ? 'forever'
      : new Date(Date.now() + duration).toISOString();
    const groupRef = getGroupChatDoc(organizationId, groupId);
    await updateDoc(groupRef, { [`mutedFor.${userId}`]: mutedUntil });
  } catch (error) {
    console.error('Error muting group chat:', error);
    throw error;
  }
};

export const unmuteGroupChat = async (groupId, userId, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const groupRef = getGroupChatDoc(organizationId, groupId);
    await updateDoc(groupRef, { [`mutedFor.${userId}`]: null });
  } catch (error) {
    console.error('Error unmuting group chat:', error);
    throw error;
  }
};

export const getMuteStatus = async (chatId, userId, organizationId, isGroupChat = false) => {
  try {
    if (!organizationId) return { isMuted: false, mutedUntil: null };
    const chatRef = isGroupChat
      ? getGroupChatDoc(organizationId, chatId)
      : getPrivateChatDoc(organizationId, chatId);
    const chatDoc = await getDoc(chatRef);
    if (!chatDoc.exists()) return { isMuted: false, mutedUntil: null };
    const mutedUntil = chatDoc.data().mutedFor?.[userId] ?? null;
    const isMuted = mutedUntil === 'forever' || (mutedUntil && new Date(mutedUntil).getTime() > Date.now());
    return { isMuted, mutedUntil };
  } catch (error) {
    console.error('Error getting mute status:', error);
    return { isMuted: false, mutedUntil: null };
  }
};

// ==================== BACKGROUND IMAGE ====================

export const setChatBackgroundImage = async (chatId, imageUri, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const response = await fetch(imageUri);
    const blob = await response.blob();
    const fileName = `bg_${Date.now()}.jpg`;
    const storagePath = `organizations/${organizationId}/chat-backgrounds/${chatId}/${fileName}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, blob);
    const downloadURL = await getDownloadURL(storageRef);
    const chatRef = getPrivateChatDoc(organizationId, chatId);
    await updateDoc(chatRef, { backgroundImage: downloadURL });
    return downloadURL;
  } catch (error) {
    console.error('Error setting chat background:', error);
    throw error;
  }
};

export const setGroupChatBackgroundImage = async (groupId, imageUri, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const response = await fetch(imageUri);
    const blob = await response.blob();
    const fileName = `bg_${Date.now()}.jpg`;
    const storagePath = `organizations/${organizationId}/chat-backgrounds/groups/${groupId}/${fileName}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, blob);
    const downloadURL = await getDownloadURL(storageRef);
    const groupRef = getGroupChatDoc(organizationId, groupId);
    await updateDoc(groupRef, { backgroundImage: downloadURL });
    return downloadURL;
  } catch (error) {
    console.error('Error setting group background:', error);
    throw error;
  }
};

export const setGroupChatImage = async (groupId, imageUri, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const response = await fetch(imageUri);
    const blob = await response.blob();
    const fileName = `group_icon_${Date.now()}.jpg`;
    const storagePath = `organizations/${organizationId}/group-icons/${groupId}/${fileName}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, blob);
    const downloadURL = await getDownloadURL(storageRef);
    const groupRef = getGroupChatDoc(organizationId, groupId);
    await updateDoc(groupRef, { image: downloadURL });
    return downloadURL;
  } catch (error) {
    console.error('Error setting group image:', error);
    throw error;
  }
};

export const removeChatBackgroundImage = async (chatId, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const chatRef = getPrivateChatDoc(organizationId, chatId);
    await updateDoc(chatRef, { backgroundImage: null });
  } catch (error) {
    console.error('Error removing chat background:', error);
    throw error;
  }
};

export const removeGroupChatBackgroundImage = async (groupId, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const groupRef = getGroupChatDoc(organizationId, groupId);
    await updateDoc(groupRef, { backgroundImage: null });
  } catch (error) {
    console.error('Error removing group background:', error);
    throw error;
  }
};

// ==================== GROUP RENAME ====================

export const renameGroupChat = async (groupId, newName, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    if (!newName?.trim()) throw new Error('Group name cannot be empty');
    const groupRef = getGroupChatDoc(organizationId, groupId);
    await updateDoc(groupRef, { name: newName.trim() });
  } catch (error) {
    console.error('Error renaming group:', error);
    throw error;
  }
};

// ==================== PIN MESSAGE ====================

/**
 * Pin a message in a group chat.
 * Stores a snapshot of the message on the group doc under `pinnedMessage`.
 * Any group member can pin. Only one message can be pinned at a time —
 * pinning a new message replaces the previous one.
 *
 * @param {string} groupId
 * @param {{ id: string, text: string, userName: string, type: string }} messageSnapshot
 * @param {string} organizationId
 */
export const pinMessage = async (groupId, messageSnapshot, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const groupRef = getGroupChatDoc(organizationId, groupId);
    await updateDoc(groupRef, {
      pinnedMessage: {
        id:        messageSnapshot.id,
        text:      messageSnapshot.text     || '',
        userName:  messageSnapshot.userName || '',
        type:      messageSnapshot.type     || 'text',
        pinnedAt:  serverTimestamp(),
      },
    });
  } catch (error) {
    console.error('Error pinning message:', error);
    throw error;
  }
};

/**
 * Remove the pinned message from a group chat.
 * Any group member can unpin.
 *
 * @param {string} groupId
 * @param {string} organizationId
 */
export const unpinMessage = async (groupId, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const groupRef = getGroupChatDoc(organizationId, groupId);
    await updateDoc(groupRef, { pinnedMessage: null });
  } catch (error) {
    console.error('Error unpinning message:', error);
    throw error;
  }
};

// ==================== HELPER FUNCTIONS ====================

const getMediaTypeLabel = (type) => {
  const labels = {
    image: '📷 Photo', video: '🎥 Video',
    audio: '🎤 Voice message', document: '📄 Document', location: '📍 Location'
  };
  return labels[type] || 'Message';
};

export const getAllUsers = async (currentUserId, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const usersCollection = getUsersCollection(organizationId);
    const snapshot = await getDocs(usersCollection);
    return snapshot.docs
      .filter(doc => doc.id !== currentUserId)
      .map(doc => ({ id: doc.id, uid: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting users:', error);
    throw error;
  }
};

export const blockUser = async (userId, blockedUserId, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const userRef = getUserDoc(organizationId, userId);
    await updateDoc(userRef, { blockedUsers: arrayUnion(blockedUserId) });
  } catch (error) {
    console.error('Error blocking user:', error);
    throw error;
  }
};

export const unblockUser = async (userId, blockedUserId, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const userRef = getUserDoc(organizationId, userId);
    await updateDoc(userRef, { blockedUsers: arrayRemove(blockedUserId) });
  } catch (error) {
    console.error('Error unblocking user:', error);
    throw error;
  }
};

// ==================== GROUP CHAT MANAGEMENT ====================

export const createGroupChat = async (creatorId, groupName, groupDescription, memberIds, organizationId, groupImage = null) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const groupChatsCollection = getGroupChatsCollection(organizationId);
    const groupRef = await addDoc(groupChatsCollection, {
      name: groupName,
      description: groupDescription || '',
      image: groupImage || '',
      createdBy: creatorId,
      createdAt: serverTimestamp(),
      admins: [creatorId],
      members: [creatorId, ...memberIds],
      organizationId,
      lastMessage: '',
      lastMessageTime: serverTimestamp(),
      unreadCount: {},
      backgroundImage: null,
      mutedFor: {},
      pinnedMessage: null,
    });

    const unreadCount = {};
    [creatorId, ...memberIds].forEach(memberId => { unreadCount[memberId] = 0; });
    await updateDoc(groupRef, { unreadCount });
    return groupRef.id;
  } catch (error) {
    console.error('Error creating group chat:', error);
    throw error;
  }
};

export const subscribeToUserGroupChats = (userId, callback, organizationId) => {
  try {
    if (!organizationId) { callback([]); return () => {}; }

    const groupChatsCollection = getGroupChatsCollection(organizationId);
    const q = query(
      groupChatsCollection,
      where('members', 'array-contains', userId),
      orderBy('lastMessageTime', 'desc')
    );

    const now = Date.now();

    return onSnapshot(q, (snapshot) => {
      const groups = snapshot.docs.map(doc => {
        const data = doc.data();
        const mutedUntil = data.mutedFor?.[userId] ?? null;
        const isMuted = mutedUntil === 'forever' || (mutedUntil && new Date(mutedUntil).getTime() > now);
        return {
          id: doc.id,
          ...data,
          isGroup: true,
          unreadCount: data.unreadCount?.[userId] || 0,
          isMuted,
          mutedUntil,
        };
      });
      callback(groups);
    }, (error) => {
      console.error('Error in subscribeToUserGroupChats:', error);
      callback([]);
    });
  } catch (error) {
    console.error('Error setting up group chat subscription:', error);
    callback([]);
    return () => {};
  }
};

export const subscribeToGroupChatMessages = (groupId, callback, organizationId) => {
  if (!organizationId) { callback([]); return () => {}; }

  const messagesRef = collection(db, 'organizations', organizationId, 'groupChats', groupId, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(100));
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(messages);
  }, (error) => {
    console.error('Error in subscribeToGroupChatMessages:', error);
    callback([]);
  });
};

export const sendGroupChatMessage = async (groupId, userId, userName, userAvatar, text, organizationId, type = 'text', mediaUrl = null, fileName = null, replyTo = null) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const messagesRef = collection(db, 'organizations', organizationId, 'groupChats', groupId, 'messages');
    const messageData = {
      text: text.trim(), type, mediaUrl, fileName, userId, userName,
      userAvatar: userAvatar || '',
      createdAt: serverTimestamp(),
      reactions: {},
      replyTo: replyTo ? { id: replyTo.id, text: replyTo.text, userName: replyTo.userName, type: replyTo.type } : null
    };

    const messageRef = await addDoc(messagesRef, messageData);
    const groupRef = getGroupChatDoc(organizationId, groupId);
    const groupDoc = await getDoc(groupRef);
    const groupData = groupDoc.data();

    const updates = {
      lastMessage: text.trim() || getMediaTypeLabel(type),
      lastMessageTime: serverTimestamp(),
    };
    groupData.members.forEach(memberId => {
      if (memberId !== userId) updates[`unreadCount.${memberId}`] = increment(1);
    });
    await updateDoc(groupRef, updates);
    return messageRef.id;
  } catch (error) {
    console.error('Error sending group message:', error);
    throw error;
  }
};

export const markGroupMessagesAsRead = async (groupId, userId, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const groupRef = getGroupChatDoc(organizationId, groupId);
    await updateDoc(groupRef, { [`unreadCount.${userId}`]: 0 });
  } catch (error) {
    console.error('Error marking group messages as read:', error);
  }
};

export const addGroupMembers = async (groupId, memberIds, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const groupRef = getGroupChatDoc(organizationId, groupId);
    await updateDoc(groupRef, { members: arrayUnion(...memberIds) });
    const updates = {};
    memberIds.forEach(memberId => { updates[`unreadCount.${memberId}`] = 0; });
    await updateDoc(groupRef, updates);
  } catch (error) {
    console.error('Error adding group members:', error);
    throw error;
  }
};

export const removeGroupMember = async (groupId, memberId, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const groupRef = getGroupChatDoc(organizationId, groupId);
    await updateDoc(groupRef, { members: arrayRemove(memberId) });
  } catch (error) {
    console.error('Error removing group member:', error);
    throw error;
  }
};

export const makeGroupAdmin = async (groupId, userId, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const groupRef = getGroupChatDoc(organizationId, groupId);
    await updateDoc(groupRef, { admins: arrayUnion(userId) });
  } catch (error) {
    console.error('Error making user admin:', error);
    throw error;
  }
};

export const removeGroupAdmin = async (groupId, userId, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const groupRef = getGroupChatDoc(organizationId, groupId);
    await updateDoc(groupRef, { admins: arrayRemove(userId) });
  } catch (error) {
    console.error('Error removing admin:', error);
    throw error;
  }
};

export const updateGroupInfo = async (groupId, updates, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const groupRef = getGroupChatDoc(organizationId, groupId);
    await updateDoc(groupRef, updates);
  } catch (error) {
    console.error('Error updating group info:', error);
    throw error;
  }
};

export const leaveGroup = async (groupId, userId, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const groupRef = getGroupChatDoc(organizationId, groupId);
    const groupDoc = await getDoc(groupRef);
    const groupData = groupDoc.data();
    await updateDoc(groupRef, {
      members: arrayRemove(userId),
      admins: arrayRemove(userId)
    });
    if (groupData.members.length === 1) await deleteDoc(groupRef);
  } catch (error) {
    console.error('Error leaving group:', error);
    throw error;
  }
};

export const deleteGroup = async (groupId, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const messagesRef = collection(db, 'organizations', organizationId, 'groupChats', groupId, 'messages');
    const messagesSnapshot = await getDocs(messagesRef);
    await Promise.all(messagesSnapshot.docs.map(doc => deleteDoc(doc.ref)));
    const groupRef = getGroupChatDoc(organizationId, groupId);
    await deleteDoc(groupRef);
  } catch (error) {
    console.error('Error deleting group:', error);
    throw error;
  }
};

// ==================== DELETE CHAT FUNCTIONS ====================

export const deletePrivateChat = async (chatId, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const messagesRef = collection(db, 'organizations', organizationId, 'privateChats', chatId, 'messages');
    const messagesSnapshot = await getDocs(messagesRef);
    await Promise.all(messagesSnapshot.docs.map(doc => deleteDoc(doc.ref)));
    const chatRef = getPrivateChatDoc(organizationId, chatId);
    await deleteDoc(chatRef);
  } catch (error) {
    console.error('Error deleting private chat:', error);
    throw error;
  }
};

export const hideChatForUser = async (chatId, userId, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const chatRef = getPrivateChatDoc(organizationId, chatId);
    await updateDoc(chatRef, { [`hiddenFor.${userId}`]: true });
  } catch (error) {
    console.error('Error hiding chat:', error);
    throw error;
  }
};

export const unhideChatForUser = async (chatId, userId, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');
    const chatRef = getPrivateChatDoc(organizationId, chatId);
    await updateDoc(chatRef, { [`hiddenFor.${userId}`]: false });
  } catch (error) {
    console.error('Error unhiding chat:', error);
    throw error;
  }
};

export const downloadMediaFile = async (url, fileName) => {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant media library permission to download files');
      return;
    }

    const fileUri = FileSystem.documentDirectory + fileName;
    const downloadResult = await FileSystem.downloadAsync(url, fileUri);
    if (downloadResult.status !== 200) throw new Error('Download failed with status: ' + downloadResult.status);

    const fileExtension = fileName.split('.').pop().toLowerCase();
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const videoExtensions = ['mp4', 'mov', 'avi', 'mkv'];

    if (imageExtensions.includes(fileExtension) || videoExtensions.includes(fileExtension)) {
      const asset = await MediaLibrary.createAssetAsync(downloadResult.uri);
      await MediaLibrary.createAlbumAsync('RTD Alumni', asset, false);
      Alert.alert('Success', 'Saved to gallery');
    } else {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(downloadResult.uri);
      } else {
        Alert.alert('Success', `File saved to ${fileUri}`);
      }
    }
    return downloadResult.uri;
  } catch (error) {
    console.error('Download error:', error);
    Alert.alert('Error', 'Failed to download file: ' + error.message);
    throw error;
  }
};

export default {
  updateOnlineStatus,
  downloadMediaFile,
  createPrivateChat,
  subscribeToPrivateChats,
  subscribeToPrivateChatMessages,
  sendPrivateMessage,
  sendStoryReplyMessage,
  markMessagesAsRead,
  updateChatOnlineStatus,
  updateTypingStatus,
  subscribeToGroupMessages,
  sendGroupMessage,
  subscribeToOnlineUsers,
  subscribeToGroupMembers,
  uploadMediaFile,
  deleteMediaFile,
  addReaction,
  removeReaction,
  deleteMessageForEveryone,
  deleteMessageForMe,
  clearChatHistory,
  searchMessages,
  getAllUsers,
  blockUser,
  unblockUser,
  muteChat,
  unmuteChat,
  muteGroupChat,
  unmuteGroupChat,
  getMuteStatus,
  setChatBackgroundImage,
  setGroupChatBackgroundImage,
  removeChatBackgroundImage,
  removeGroupChatBackgroundImage,
  renameGroupChat,
  setGroupChatImage,
  pinMessage,
  unpinMessage,
  createGroupChat,
  subscribeToUserGroupChats,
  subscribeToGroupChatMessages,
  sendGroupChatMessage,
  markGroupMessagesAsRead,
  addGroupMembers,
  removeGroupMember,
  makeGroupAdmin,
  removeGroupAdmin,
  updateGroupInfo,
  leaveGroup,
  deleteGroup,
  deletePrivateChat,
  hideChatForUser,
  unhideChatForUser,
};