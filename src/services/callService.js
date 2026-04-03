// src/services/callService.js
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import { db, app } from '../../firebase.config';
import { httpsCallable, getFunctions } from 'firebase/functions';

const functions = getFunctions(app);

/* =========================================================
   HELPERS
========================================================= */

const getCallsCollection = (organizationId) =>
  collection(db, 'organizations', organizationId, 'calls');

const getCallDoc = (organizationId, callId) =>
  doc(db, 'organizations', organizationId, 'calls', callId);

/* =========================================================
   GENERATE ROOM NAME
========================================================= */

export const generateRoomName = (callerId, receiverId) => {
  return `call_${[callerId, receiverId].sort().join('_')}_${Date.now()}`;
};

/* =========================================================
   INITIATE CALL
   - groupMemberIds: array of member UIDs excluding the caller
   - Leave as [] for 1:1 calls
========================================================= */

export const initiateCall = async (
  callerId,
  receiverId,
  callType,
  organizationId,
  callerInfo,
  receiverInfo,
  groupMemberIds = []
) => {
  try {
    const callId = `call_${Date.now()}_${callerId}`;
    const roomName = generateRoomName(callerId, receiverId);

    const isGroupCall = groupMemberIds.length > 0;

    // participants = everyone in the call (caller + all members)
    const participants = isGroupCall
      ? [callerId, ...groupMemberIds]
      : [callerId, receiverId];

    // recipientIds = everyone who should receive the notification (no caller)
    const recipientIds = isGroupCall ? groupMemberIds : [receiverId];

    const callData = {
      callId,
      roomName,
      callType,
      callerId,
      callerName: callerInfo.callerName || '',
      callerAvatar: callerInfo.callerAvatar || '',
      receiverId,
      receiverName: receiverInfo.receiverName || '',
      receiverAvatar: receiverInfo.receiverAvatar || '',
      participants,
      recipientIds,
      isGroupCall,
      status: 'ringing',
      organizationId,
      startedAt: serverTimestamp(),
      endedAt: null,
    };

    await setDoc(getCallDoc(organizationId, callId), callData);

    return { callId, roomName };
  } catch (error) {
    console.error('Error initiating call:', error);
    throw error;
  }
};

/* =========================================================
   ACCEPT CALL
========================================================= */

export const acceptCall = async (callId, organizationId) => {
  try {
    await updateDoc(getCallDoc(organizationId, callId), {
      status: 'active',
      answeredAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error accepting call:', error);
    throw error;
  }
};

/* =========================================================
   DECLINE CALL
========================================================= */

export const declineCall = async (callId, organizationId) => {
  try {
    await updateDoc(getCallDoc(organizationId, callId), {
      status: 'declined',
      endedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error declining call:', error);
    throw error;
  }
};

/* =========================================================
   END CALL
========================================================= */

export const endCall = async (callId, organizationId) => {
  try {
    await updateDoc(getCallDoc(organizationId, callId), {
      status: 'ended',
      endedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error ending call:', error);
    throw error;
  }
};

/* =========================================================
   MARK AS MISSED
========================================================= */

export const markCallMissed = async (callId, organizationId) => {
  try {
    await updateDoc(getCallDoc(organizationId, callId), {
      status: 'missed',
      endedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error marking call as missed:', error);
  }
};

/* =========================================================
   SUBSCRIBE TO INCOMING CALLS

   Uses array-contains on `participants` so it works for
   both 1:1 calls and group calls.
   Filters out calls where this user is the caller.
========================================================= */

export const subscribeToIncomingCalls = (userId, callback, organizationId) => {
  if (!organizationId || !userId) {
    callback(null);
    return () => {};
  }

  const q = query(
    getCallsCollection(organizationId),
    where('participants', 'array-contains', userId),
    where('status', '==', 'ringing')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        callback(null);
        return;
      }

      const calls = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((call) => call.callerId !== userId); // exclude own outgoing calls

      if (calls.length === 0) {
        callback(null);
        return;
      }

      calls.sort((a, b) => {
        const aTime = a.startedAt?.toMillis?.() || 0;
        const bTime = b.startedAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

      callback(calls[0]);
    },
    (error) => {
      console.error('Error subscribing to incoming calls:', error);
      callback(null);
    }
  );
};

/* =========================================================
   SUBSCRIBE TO CALL STATUS
========================================================= */

export const subscribeToCallStatus = (callId, callback, organizationId) => {
  if (!callId || !organizationId) {
    callback(null);
    return () => {};
  }

  return onSnapshot(
    getCallDoc(organizationId, callId),
    (snap) => {
      if (snap.exists()) {
        callback({ id: snap.id, ...snap.data() });
      } else {
        callback(null);
      }
    },
    (error) => {
      console.error('Error subscribing to call status:', error);
      callback(null);
    }
  );
};

/* =========================================================
   GET LIVEKIT TOKEN
========================================================= */

export const getLiveKitToken = async (roomName, participantName) => {
  try {
    console.log('[callService] Calling getLiveKitToken function...');
    const getLiveKitTokenFn = httpsCallable(functions, 'getLiveKitToken');
    const result = await getLiveKitTokenFn({ roomName, participantName });
    console.log('[callService] getLiveKitToken result:', result.data);
    return result.data;
  } catch (error) {
    console.error('[callService] Error getting LiveKit token:', error);
    throw error;
  }
};

/* =========================================================
   GET CALL DATA
========================================================= */

export const getCallData = async (callId, organizationId) => {
  try {
    const snap = await getDoc(getCallDoc(organizationId, callId));
    if (snap.exists()) return { id: snap.id, ...snap.data() };
    return null;
  } catch (error) {
    console.error('Error getting call data:', error);
    return null;
  }
};

/* =========================================================
   INVITE USER TO AN EXISTING CALL
   Call this from an active VoiceCall or VideoCall screen
   to pull another participant in.
========================================================= */
export const inviteToCall = async (
  callId,
  roomName,
  callType,
  organizationId,
  callerInfo,      // { callerName, callerAvatar }
  invitedUserId,
  invitedUserInfo  // { receiverName, receiverAvatar }
) => {
  try {
    // Create a NEW call doc for the invited user so they get an IncomingCall notification
    const newCallId = `call_${Date.now()}_invite_${invitedUserId}`;
    await setDoc(
      doc(db, 'organizations', organizationId, 'calls', newCallId),
      {
        callId: newCallId,
        roomName,           // same room — LiveKit allows multi-participant
        callType,
        callerId: callerInfo.callerId,
        callerName: callerInfo.callerName,
        callerAvatar: callerInfo.callerAvatar || '',
        receiverId: invitedUserId,
        receiverName: invitedUserInfo.receiverName || '',
        receiverAvatar: invitedUserInfo.receiverAvatar || '',
        participants: [callerInfo.callerId, invitedUserId],
        recipientIds: [invitedUserId],
        isGroupCall: false,
        status: 'ringing',
        organizationId,
        parentCallId: callId,  // link back to original call
        startedAt: serverTimestamp(),
        endedAt: null,
      }
    );
    return newCallId;
  } catch (error) {
    console.error('Error inviting to call:', error);
    throw error;
  }
};

export default {
  initiateCall,
  acceptCall,
  declineCall,
  endCall,
  markCallMissed,
  subscribeToIncomingCalls,
  subscribeToCallStatus,
  getLiveKitToken,
  getCallData,
  inviteToCall,
  generateRoomName,
};