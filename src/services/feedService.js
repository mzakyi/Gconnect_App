import { db } from '../../firebase.config';
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  doc,
  arrayUnion,
  arrayRemove,
  deleteDoc,
  increment,
  setDoc,
  getDoc,
} from 'firebase/firestore';

// ─── Path helpers ─────────────────────────────────────────────────────────────

const getPostsCollection = (organizationId) => {
  if (!organizationId) throw new Error('Organization ID required for posts collection');
  return collection(db, 'organizations', organizationId, 'posts');
};

const getPostDoc = (organizationId, postId) => {
  if (!organizationId) throw new Error('Organization ID required for post document');
  return doc(db, 'organizations', organizationId, 'posts', postId);
};

/**
 * Returns the ref for a user's personal pin doc for a given post.
 * Path: organizations/{orgId}/userPins/{userId}/pins/{postId}
 */
const getUserPinDoc = (organizationId, userId, postId) =>
  doc(db, 'organizations', organizationId, 'userPins', userId, 'pins', postId);

// ─── Post CRUD ────────────────────────────────────────────────────────────────

export const createPost = async (userId, userName, userPhoto, content, organizationId) => {
  if (!organizationId) throw new Error('Organization ID is required');
  const postsCollection = getPostsCollection(organizationId);
  await addDoc(postsCollection, {
    userId,
    userName,
    userPhoto: userPhoto || '',
    content,
    likes: [],
    likeCount: 0,
    comments: [],
    commentCount: 0,
    organizationId,
    // isAdminPinned is only set to true when an admin globally pins the post.
    // It is NOT set here so it defaults to absent/false.
    timestamp: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
};

export const subscribeToPosts = (callback, organizationId) => {
  if (!organizationId) {
    console.error('Organization ID required for subscribeToPosts');
    callback([]);
    return () => {};
  }
  const postsCollection = getPostsCollection(organizationId);
  const q = query(postsCollection, orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const posts = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(posts);
    },
    (error) => {
      console.error('Error in subscribeToPosts:', error);
      callback([]);
    }
  );
};

export const likePost = async (postId, userId, organizationId) => {
  if (!organizationId) throw new Error('Organization ID is required');
  const postRef = getPostDoc(organizationId, postId);
  await updateDoc(postRef, { likes: arrayUnion(userId), likeCount: increment(1) });
};

export const unlikePost = async (postId, userId, organizationId) => {
  if (!organizationId) throw new Error('Organization ID is required');
  const postRef = getPostDoc(organizationId, postId);
  await updateDoc(postRef, { likes: arrayRemove(userId), likeCount: increment(-1) });
};

export const addComment = async (postId, userId, userName, userPhoto, commentText, organizationId) => {
  if (!organizationId) throw new Error('Organization ID is required');
  const comment = {
    id: Date.now().toString(),
    userId,
    userName,
    userPhoto: userPhoto || '',
    text: commentText,
    timestamp: new Date(),
  };
  const postRef = getPostDoc(organizationId, postId);
  await updateDoc(postRef, { comments: arrayUnion(comment), commentCount: increment(1) });
};

export const deletePost = async (postId, organizationId) => {
  if (!organizationId) throw new Error('Organization ID is required');
  const postRef = getPostDoc(organizationId, postId);
  await deleteDoc(postRef);
};

// ─── Pin logic ────────────────────────────────────────────────────────────────

/**
 * Toggle a pin for a specific user.
 *
 * - If the acting user IS an admin AND they are pinning their OWN post:
 *     → sets `isAdminPinned` on the post document (visible to everyone).
 *
 * - In every other case (admin pinning someone else's post, or any regular
 *   user pinning any post):
 *     → writes/deletes a personal pin doc under userPins/{userId}/pins/{postId}.
 *     → the post document is never touched, so other users are unaffected.
 *
 * @param {string}  postId
 * @param {string}  postOwnerId   - userId stored on the post
 * @param {boolean} currentlyPinned - whether the current user already has it pinned
 * @param {string}  organizationId
 * @param {string}  actingUserId  - the user performing the action
 * @param {boolean} actingUserIsAdmin
 */
export const togglePinPost = async (
  postId,
  postOwnerId,
  currentlyPinned,
  organizationId,
  actingUserId,
  actingUserIsAdmin
) => {
  if (!organizationId) throw new Error('Organization ID is required');

  const isAdminPinningOwnPost = actingUserIsAdmin && postOwnerId === actingUserId;

  if (isAdminPinningOwnPost) {
    // ── Global admin pin: toggle isAdminPinned on the post doc ────────────
    const postRef = getPostDoc(organizationId, postId);
    await updateDoc(postRef, { isAdminPinned: !currentlyPinned });
  } else {
    // ── Personal pin: write or delete the user's private pin doc ──────────
    const pinRef = getUserPinDoc(organizationId, actingUserId, postId);
    if (currentlyPinned) {
      await deleteDoc(pinRef);
    } else {
      await setDoc(pinRef, {
        postId,
        pinnedAt: serverTimestamp(),
      });
    }
  }
};

/**
 * Fetch the set of postIds that a given user has personally pinned.
 * Call once on mount (or subscribe with onSnapshot if you want live updates).
 *
 * Returns a Set<string> of postIds.
 */
export const fetchUserPins = async (organizationId, userId) => {
  const { getDocs } = await import('firebase/firestore');
  const pinsCol = collection(db, 'organizations', organizationId, 'userPins', userId, 'pins');
  const snap = await getDocs(pinsCol);
  return new Set(snap.docs.map((d) => d.id));
};

/**
 * Subscribe to a user's personal pins in real time.
 * Returns an unsubscribe function.
 * Calls callback(Set<postId>) on every change.
 */
export const subscribeToUserPins = (organizationId, userId, callback) => {
  const pinsCol = collection(db, 'organizations', organizationId, 'userPins', userId, 'pins');
  return onSnapshot(
    pinsCol,
    (snap) => callback(new Set(snap.docs.map((d) => d.id))),
    (err) => console.error('subscribeToUserPins error:', err)
  );
};