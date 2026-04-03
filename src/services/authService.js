// src/services/authService.js
import { auth, db } from '../../firebase.config';
import { updateOnlineStatus } from './chatService';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updatePassword 
} from 'firebase/auth';
import { 
  doc, setDoc, updateDoc, getDoc, serverTimestamp
} from 'firebase/firestore';

const getUserDocPath = (organizationId, userId) => {
  return doc(db, 'organizations', organizationId, 'users', userId);
};

// ================== SIGN UP ==================
export const signUp = async (email, password, profileData) => {
  console.log('🔵 [SIGNUP] Started for email:', email);
  
  const { organizationId, organizationName, ...userData } = profileData;

  if (!organizationId) {
    throw new Error('Organization ID required');
  }

  // ✅ Tell AuthContext to stay out of the way during signup
  global.signupInProgress = true;

  // Step 1: Create Firebase Auth user
  let userCredential;
  try {
    userCredential = await createUserWithEmailAndPassword(auth, email, password);
    console.log('✅ [SIGNUP] Auth user created! UID:', userCredential.user.uid);
  } catch (authErr) {
    global.signupInProgress = false;
    console.error('🔴 [SIGNUP] Auth creation failed:', authErr.code, authErr.message);
    throw authErr;
  }

  const user = userCredential.user;

  // Force token refresh so Firestore recognizes the new auth session
  try {
    await user.getIdToken(true);
    console.log('✅ [SIGNUP] Token refreshed, UID:', user.uid);
  } catch (tokenErr) {
    console.warn('🟡 [SIGNUP] Could not refresh token:', tokenErr.message);
  }

  try {
    // Step 2: Read org doc to check if first user
    console.log('🔵 [SIGNUP] Fetching org doc:', organizationId);
    const orgDocRef = doc(db, 'organizations', organizationId);
    const orgDoc = await getDoc(orgDocRef);
    console.log('✅ [SIGNUP] Org doc fetched, exists:', orgDoc.exists());
    const orgData = orgDoc.exists() ? orgDoc.data() : {};

    const isFirstUser = !orgData.firstUserUid;
    const isAdmin = isFirstUser;
    const status = 'pending';
    console.log('🔵 [SIGNUP] isFirstUser:', isFirstUser, '| isAdmin:', isAdmin, '| status:', status);

    // Step 3: Write org-scoped user doc
    console.log('🔵 [SIGNUP] Writing org user doc to: organizations/' + organizationId + '/users/' + user.uid);
    await setDoc(getUserDocPath(organizationId, user.uid), {
      uid: user.uid,
      email,
      firstName: userData.firstName || '',
      lastName: userData.lastName || '',
      age: userData.age || '',
      phone: userData.phone || '',
      bio: userData.bio || '',
      location: userData.location || '',
      occupation: userData.occupation || '',
      profilePicture: '',
      isAdmin,
      status,
      banned: false,
      isBanned: false,
      organizationId,
      organizationName,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp()
    });
    console.log('✅ [SIGNUP] Org user doc written successfully');

    // Step 4: Write top-level user doc
    console.log('🔵 [SIGNUP] Writing top-level user doc to: users/' + user.uid);
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      email,
      organizationId,
      status,
      createdAt: serverTimestamp(),
    });
    console.log('✅ [SIGNUP] Top-level user doc written successfully');

    // Step 5: Stamp org with firstUserUid if first user
    if (isFirstUser) {
      try {
        await updateDoc(orgDocRef, { firstUserUid: user.uid });
        console.log('✅ [SIGNUP] Org firstUserUid stamped');
      } catch (e) {
        console.warn('🟡 [SIGNUP] Could not stamp org firstUserUid (non-fatal):', e.message);
      }
    }

    // Step 6: Sign out — pending admin approval
    await firebaseSignOut(auth);
    global.signupInProgress = false;
    console.log('✅ [SIGNUP] Complete — signed out, pending approval');

    return { success: true, user: userCredential.user, status, isAdmin };

  } catch (err) {
    global.signupInProgress = false;
    console.error('🔴 [SIGNUP] Failed - code:', err.code, 'message:', err.message);
    try {
      await user.delete();
      console.log('🟡 [SIGNUP] Auth user deleted for clean retry');
    } catch (deleteErr) {
      console.warn('🟡 [SIGNUP] Could not delete auth user:', deleteErr.message);
    }
    throw new Error(err.message);
  }
};

// ================== SIGN IN ==================
export const signIn = async (email, password) => {

  let userCredential;
  try {
    userCredential = await signInWithEmailAndPassword(auth, email, password);
  } catch (authErr) {
    console.error('🔴 [SIGNIN] Auth failed:', authErr.code, authErr.message);
    throw authErr;
  }

  const uid = userCredential.user.uid;

  const topLevelDoc = await getDoc(doc(db, 'users', uid));

  if (!topLevelDoc.exists() || !topLevelDoc.data().organizationId) {
    await firebaseSignOut(auth);
    throw new Error('Organization not found. Contact support.');
  }

  const topData = topLevelDoc.data();

  if (topData.status === 'pending') {
    await firebaseSignOut(auth);
    throw new Error('PENDING');
  }
  if (topData.status === 'rejected') {
    await firebaseSignOut(auth);
    throw new Error('REJECTED');
  }

  const organizationId = topData.organizationId;

  const userDoc = await getDoc(getUserDocPath(organizationId, uid));

  if (!userDoc.exists()) {
    await firebaseSignOut(auth);
    throw new Error('User profile not found. Contact support.');
  }

  const userData = userDoc.data();

  if (userData.banned || userData.isBanned) {
    await firebaseSignOut(auth);
    throw new Error('BANNED');
  }
  if (userData.status === 'pending') {
    await firebaseSignOut(auth);
    throw new Error('PENDING');
  }
  if (userData.status === 'rejected') {
    await firebaseSignOut(auth);
    throw new Error('REJECTED');
  }

  try {
    await updateDoc(getUserDocPath(organizationId, uid), {
      lastSeen: serverTimestamp()
    });
  } catch (e) {
    console.warn('Could not update lastSeen:', e.message);
  }

  return { userCredential, userData, organizationId };
};

// ================== LOGOUT ==================
export const logout = async (userId, organizationId, clearOrganizationId) => {
  console.log('🔵 [LOGOUT] Signing out...');
  
  if (userId && organizationId) {
    try {
      await updateOnlineStatus(userId, false, organizationId);
    } catch (e) {
      console.warn('🟡 [LOGOUT] Could not update online status:', e.message);
    }
  }

  if (clearOrganizationId) {
    await clearOrganizationId();
  }

  await firebaseSignOut(auth);
  console.log('✅ [LOGOUT] Signed out');
};

// ================== PASSWORD ==================
export const resetPassword = async (email) => {
  await sendPasswordResetEmail(auth, email);
};

export const changePassword = async (newPassword) => {
  const user = auth.currentUser;
  if (!user) throw new Error('No signed-in user');
  await updatePassword(user, newPassword);
};