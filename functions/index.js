const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onRequest, onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

async function sendNotificationsToTokens(tokens, title, body, data) {
  if (!tokens || tokens.length === 0) { logger.log('No tokens to send to'); return null; }
  const validTokens = [...new Set(tokens.filter(t => t && typeof t === 'string'))];
  if (validTokens.length === 0) { logger.log('No valid tokens found'); return null; }

  const isCall = data && data.type === 'incoming_call';
  const messages = validTokens.map(token => ({
    to: token, title, body,
    sound: 'default', data: data || {}, priority: 'high',
    channelId: isCall ? 'calls' : 'default',
    android: { channelId: isCall ? 'calls' : 'default', priority: 'max', sound: 'default' },
    apns: { payload: { aps: { sound: 'default', 'content-available': 1 } } },
  }));

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    const result = await response.json();
    logger.log('Expo push result:', JSON.stringify(result));
    return result;
  } catch (error) {
    logger.error('Error sending Expo notifications:', error);
    return null;
  }
}

async function getAllPushTokensExcept(orgId, excludeUserIds) {
  excludeUserIds = excludeUserIds || [];
  const usersSnapshot = await admin.firestore().collection('organizations').doc(orgId).collection('users').get();
  const tokens = [];
  usersSnapshot.forEach(doc => {
    if (excludeUserIds.includes(doc.id)) return;
    const userData = doc.data();
    if (userData.status !== 'approved') return;
    if (userData.pushTokens && Array.isArray(userData.pushTokens)) tokens.push(...userData.pushTokens);
    else if (userData.pushToken) tokens.push(userData.pushToken);
  });
  return tokens;
}

// ═══════════════════════════════════════════════════════════════════════════
// POSTS
// ═══════════════════════════════════════════════════════════════════════════

exports.onPostCreated = onDocumentCreated('organizations/{orgId}/posts/{postId}', async event => {
  const snap = event.data;
  if (!snap) return null;
  const post = snap.data();
  const orgId = event.params.orgId;
  const postId = event.params.postId;
  logger.log('New post by ' + post.userName + ' in org ' + orgId);
  const tokens = await getAllPushTokensExcept(orgId, [post.userId]);
  return sendNotificationsToTokens(tokens, '📝 ' + post.userName,
    post.content ? post.content.substring(0, 100) + (post.content.length > 100 ? '...' : '') : 'New post',
    { type: 'posts', postId, orgId, screen: 'Feed' }
  );
});

exports.onCommentAdded = onDocumentUpdated('organizations/{orgId}/posts/{postId}', async event => {
  const data = event.data;
  if (!data) return null;
  const newData = data.after.data();
  const oldData = data.before.data();
  const orgId = event.params.orgId;
  const postId = event.params.postId;
  const newComments = newData.comments || [];
  const oldComments = oldData.comments || [];
  if (newComments.length <= oldComments.length) return null;
  const newComment = newComments[newComments.length - 1];
  logger.log('New comment by ' + newComment.userName + ' in org ' + orgId);
  const tokensToNotify = [];
  if (newData.userId && newData.userId !== newComment.userId) {
    const authorDoc = await admin.firestore().collection('organizations').doc(orgId).collection('users').doc(newData.userId).get();
    if (authorDoc.exists) {
      const authorData = authorDoc.data();
      if (authorData.pushTokens && Array.isArray(authorData.pushTokens)) tokensToNotify.push(...authorData.pushTokens);
      else if (authorData.pushToken) tokensToNotify.push(authorData.pushToken);
    }
  }
  if (tokensToNotify.length === 0) return null;
  return sendNotificationsToTokens(tokensToNotify,
    '💬 ' + newComment.userName + ' commented on your post',
    newComment.text ? newComment.text.substring(0, 100) + (newComment.text.length > 100 ? '...' : '') : 'New comment',
    { type: 'posts', postId, orgId, screen: 'Feed' }
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════════════════

exports.onEventCreated = onDocumentCreated('organizations/{orgId}/events/{eventId}', async event => {
  const snap = event.data;
  if (!snap) return null;
  const eventData = snap.data();
  const orgId = event.params.orgId;
  const eventId = event.params.eventId;
  logger.log('New event: ' + eventData.title + ' in org ' + orgId);
  const tokens = await getAllPushTokensExcept(orgId, [eventData.createdBy || '']);
  return sendNotificationsToTokens(tokens, '📅 New Event: ' + eventData.title,
    (eventData.location || 'Location TBA') + ' — ' + (eventData.eventDate || 'Date TBA'),
    { type: 'events', eventId, orgId, screen: 'Events' }
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ═══════════════════════════════════════════════════════════════════════════

exports.onAnnouncementCreated = onDocumentCreated('organizations/{orgId}/announcements/{announcementId}', async event => {
  const snap = event.data;
  if (!snap) return null;
  const announcement = snap.data();
  const orgId = event.params.orgId;
  const announcementId = event.params.announcementId;
  const priorityEmoji = announcement.priority === 'urgent' ? '🚨 ' : announcement.priority === 'high' ? '⚠️ ' : '📢 ';
  logger.log('New announcement in org ' + orgId + ': ' + announcement.title);
  const tokens = await getAllPushTokensExcept(orgId, [announcement.authorId || '']);
  return sendNotificationsToTokens(tokens, priorityEmoji + announcement.title,
    announcement.content ? announcement.content.substring(0, 100) + (announcement.content.length > 100 ? '...' : '') : '',
    { type: 'announcements', announcementId, orgId, screen: 'Announcements' }
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// PRIVATE MESSAGES
// ═══════════════════════════════════════════════════════════════════════════

exports.onPrivateMessageSent = onDocumentCreated(
  'organizations/{orgId}/privateChats/{chatId}/messages/{messageId}',
  async event => {
    const snap = event.data;
    if (!snap) return null;

    const message = snap.data();
    const orgId = event.params.orgId;
    const chatId = event.params.chatId;

    logger.log('=== onPrivateMessageSent triggered ===');
    logger.log('Message userId:', message.userId);
    logger.log('Message type:', message.type);

    if (!message.userId) {
      logger.log('SKIP: No userId on message');
      return null;
    }

    if (message.type === 'shared_post') {
      logger.log('SKIP: shared_post type');
      return null;
    }

    const chatDoc = await admin.firestore()
      .collection('organizations').doc(orgId)
      .collection('privateChats').doc(chatId)
      .get();

    if (!chatDoc.exists) { logger.log('SKIP: Chat not found'); return null; }

    const chatData = chatDoc.data();
    const participants = chatData.participants || [];

    logger.log('Participants:', JSON.stringify(participants));
    logger.log('Sender:', message.userId);

    const recipientId = participants.find(id => String(id) !== String(message.userId));

    logger.log('Recipient found:', recipientId);

    if (!recipientId) {
      logger.log('SKIP: No recipient found');
      return null;
    }

    if (String(recipientId) === String(message.userId)) {
      logger.log('SKIP: Recipient equals sender');
      return null;
    }

    const mutedUntil = chatData.mutedFor?.[recipientId];
    if (mutedUntil === 'forever') { logger.log('SKIP: Chat muted forever'); return null; }
    if (mutedUntil && new Date(mutedUntil).getTime() > Date.now()) { logger.log('SKIP: Chat muted until', mutedUntil); return null; }

    const recipientDoc = await admin.firestore()
      .collection('organizations').doc(orgId)
      .collection('users').doc(recipientId)
      .get();

    if (!recipientDoc.exists) { logger.log('SKIP: Recipient doc not found'); return null; }

    const recipientData = recipientDoc.data();
    const tokens = recipientData.pushTokens || (recipientData.pushToken ? [recipientData.pushToken] : []);

    logger.log('Recipient tokens count:', tokens.length);

    if (tokens.length === 0) { logger.log('SKIP: No tokens for recipient'); return null; }

    let messageBody = message.text || 'New message';
    if (message.type === 'image') messageBody = '📷 Photo';
    else if (message.type === 'video') messageBody = '🎥 Video';
    else if (message.type === 'audio') messageBody = '🎤 Voice message';
    else if (message.type === 'document') messageBody = '📄 Document';

    logger.log('Sending notification to:', recipientId);

    return sendNotificationsToTokens(tokens, '💬 ' + message.userName, messageBody,
      { type: 'messages', chatId, orgId, screen: 'PrivateChat' }
    );
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// GROUP MESSAGES
// ═══════════════════════════════════════════════════════════════════════════

exports.onGroupMessageSent = onDocumentCreated(
  'organizations/{orgId}/groupChats/{groupId}/messages/{messageId}',
  async event => {
    const snap = event.data;
    if (!snap) return null;

    const message = snap.data();
    const orgId = event.params.orgId;
    const groupId = event.params.groupId;

    logger.log('=== onGroupMessageSent triggered ===');
    logger.log('Message userId:', message.userId);

    if (!message.userId) { logger.log('SKIP: No userId'); return null; }

    const groupDoc = await admin.firestore()
      .collection('organizations').doc(orgId)
      .collection('groupChats').doc(groupId)
      .get();

    if (!groupDoc.exists) { logger.log('SKIP: Group not found'); return null; }

    const groupData = groupDoc.data();
    logger.log('Group members:', JSON.stringify(groupData.members));
    logger.log('Sender:', message.userId);

    const tokens = [];

    for (const memberId of groupData.members || []) {
      if (String(memberId) === String(message.userId)) {
        logger.log('SKIP member (sender):', memberId);
        continue;
      }

      const mutedUntil = groupData.mutedFor?.[memberId];
      if (mutedUntil === 'forever') continue;
      if (mutedUntil && new Date(mutedUntil).getTime() > Date.now()) continue;

      const memberDoc = await admin.firestore()
        .collection('organizations').doc(orgId)
        .collection('users').doc(memberId)
        .get();

      if (!memberDoc.exists) continue;

      const memberData = memberDoc.data();
      if (memberData.pushTokens && Array.isArray(memberData.pushTokens)) tokens.push(...memberData.pushTokens);
      else if (memberData.pushToken) tokens.push(memberData.pushToken);
    }

    logger.log('Total tokens to notify:', tokens.length);

    if (tokens.length === 0) { logger.log('SKIP: No tokens'); return null; }

    let messageBody = message.text || 'New message';
    if (message.type === 'image') messageBody = '📷 Photo';
    else if (message.type === 'video') messageBody = '🎥 Video';
    else if (message.type === 'audio') messageBody = '🎤 Voice message';
    else if (message.type === 'document') messageBody = '📄 Document';

    return sendNotificationsToTokens(tokens,
      '💬 ' + message.userName + ' in ' + groupData.name,
      messageBody,
      { type: 'messages', groupId, orgId, screen: 'GroupChatScreen' }
    );
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// INCOMING CALL
// ═══════════════════════════════════════════════════════════════════════════

exports.onCallCreated = onDocumentCreated('organizations/{orgId}/calls/{callId}', async event => {
  const snap = event.data;
  if (!snap) return null;
  const callData = snap.data();
  const orgId = event.params.orgId;
  const callId = event.params.callId;
  if (callData.status !== 'ringing') return null;
  const { callerId, callerName, callType, callerAvatar, roomName, isGroupCall } = callData;
  const recipientIds = isGroupCall
    ? (callData.recipientIds || []).filter(id => id !== callerId)
    : callData.receiverId ? [callData.receiverId] : [];
  if (recipientIds.length === 0) { logger.log('No recipients for call:', callId); return null; }
  const tokens = [];
  for (const recipientId of recipientIds) {
    const recipientDoc = await admin.firestore().collection('organizations').doc(orgId).collection('users').doc(recipientId).get();
    if (!recipientDoc.exists) continue;
    const recipientData = recipientDoc.data();
    const userTokens = recipientData.pushTokens || (recipientData.pushToken ? [recipientData.pushToken] : []);
    tokens.push(...userTokens);
  }
  if (tokens.length === 0) { logger.log('No tokens for call recipients'); return null; }
  return sendNotificationsToTokens(tokens,
    callType === 'video' ? '📹 Incoming Video Call' : '📞 Incoming Voice Call',
    (callerName || 'Someone') + ' is calling you...',
    { type: 'incoming_call', callId, callType: callType || 'voice', callerName: callerName || '', callerAvatar: callerAvatar || '', roomName: roomName || '', orgId }
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// LIVEKIT TOKEN
// ═══════════════════════════════════════════════════════════════════════════

exports.getLiveKitToken = onCall(async request => {
  if (!request.auth) throw new Error('unauthenticated: You must be signed in to join a call.');
  const { roomName, participantName } = request.data;
  if (!roomName || !participantName) throw new Error('invalid-argument: roomName and participantName are required.');
  const LIVEKIT_API_KEY    = process.env.LIVEKIT_API_KEY    || 'APIAM9ozdWZuGar';
  const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'st8EMHAsuHnaA5fT3pEAYDtIflD8puptKJ8WJfy4eSpA';
  const LIVEKIT_URL        = process.env.LIVEKIT_URL        || 'wss://rtd-alumni-yd0wxwwx.livekit.cloud';
  try {
    const { AccessToken } = require('livekit-server-sdk');
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity: request.auth.uid, name: participantName, ttl: '2h' });
    at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
    const token = await at.toJwt();
    logger.log('Token generated for room:', roomName);
    return { token, url: LIVEKIT_URL };
  } catch (err) {
    logger.error('getLiveKitToken error:', err.message);
    throw new Error('internal: ' + err.message);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE EVENT
// ═══════════════════════════════════════════════════════════════════════════

exports.deleteEvent = onCall(async request => {
  if (!request.auth) throw new Error('unauthenticated: User must be signed in.');
  const { eventId, orgId } = request.data;
  if (!eventId || !orgId) throw new Error('invalid-argument: Both eventId and orgId are required.');
  const callerDoc = await admin.firestore().collection('organizations').doc(orgId).collection('users').doc(request.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data().isAdmin !== true) throw new Error('permission-denied: Only admins can delete events.');
  const eventRef = admin.firestore().collection('organizations').doc(orgId).collection('events').doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) throw new Error('not-found: Event not found.');
  const eventData = eventSnap.data();
  const attachments = eventData.attachments || [];
  const bucket = admin.storage().bucket();
  for (const fileName of attachments) {
    try {
      await bucket.file('events/' + eventId + '/' + fileName).delete();
    } catch (err) {
      logger.warn('Failed to delete file ' + fileName + ': ' + err.message);
    }
  }
  await eventRef.delete();
  return { success: true, message: 'Event and attachments deleted successfully.' };
});

// ═══════════════════════════════════════════════════════════════════════════
// CLEANUP INVALID TOKENS
// ═══════════════════════════════════════════════════════════════════════════

exports.cleanupInvalidTokens = onRequest(async (req, res) => {
  logger.log('Starting token cleanup...');
  const targetOrgId = req.query.orgId || null;
  let totalRemoved = 0;
  let orgIds = [];
  if (targetOrgId) {
    orgIds = [targetOrgId];
  } else {
    const orgsSnapshot = await admin.firestore().collection('organizations').get();
    orgIds = orgsSnapshot.docs.map(doc => doc.id);
  }
  for (const orgId of orgIds) {
    const usersSnapshot = await admin.firestore().collection('organizations').doc(orgId).collection('users').get();
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      if (!userData.pushTokens || !Array.isArray(userData.pushTokens)) continue;
      const validTokens = userData.pushTokens.filter(t => t && typeof t === 'string' && t.startsWith('ExponentPushToken['));
      if (validTokens.length !== userData.pushTokens.length) {
        totalRemoved += userData.pushTokens.length - validTokens.length;
        await userDoc.ref.update({ pushTokens: validTokens });
      }
    }
  }
  logger.log('Cleanup complete. Removed ' + totalRemoved + ' invalid tokens.');
  res.send('Cleanup complete. Removed ' + totalRemoved + ' invalid tokens.');
});