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

  const { organizationId, organizationName, groupName, ...userData } = profileData;

  const isCreatingGroup = !!groupName && !organizationId;

  if (!isCreatingGroup && !organizationId) {
    throw new Error('Organization ID required');
  }

  global.signupInProgress = true;

  let userCredential;
  try {
    userCredential = await createUserWithEmailAndPassword(auth, email, password);
    console.log('✅ [SIGNUP] Auth user created! UID:', userCredential.user.uid);
  } catch (authErr) {
    global.signupInProgress = false;
    throw authErr;
  }

  const user = userCredential.user;

  try {
    await user.getIdToken(true);
  } catch (tokenErr) {
    console.warn('🟡 [SIGNUP] Could not refresh token:', tokenErr.message);
  }

  try {
    let finalOrgId = organizationId;
    let finalOrgName = organizationName;
    let generatedOrgCode = null;

    // ── CREATE GROUP FLOW ──────────────────────────────────────────────
    if (isCreatingGroup) {
      console.log('🔵 [SIGNUP] Creating new organization:', groupName);

      const { organizationService } = require('./organizationService');
      const orgResult = await organizationService.createOrganization(groupName, user.uid);

      if (!orgResult.success) {
        throw new Error(orgResult.error || 'Failed to create organization');
      }

      finalOrgId = orgResult.organizationId;
      finalOrgName = orgResult.organizationName;
      generatedOrgCode = orgResult.orgCode;

      console.log('✅ [SIGNUP] Org created:', finalOrgId, '| code:', generatedOrgCode);
    }

    // ── READ ORG DOC ───────────────────────────────────────────────────
    const orgDocRef = doc(db, 'organizations', finalOrgId);
    const orgDoc = await getDoc(orgDocRef);
    const orgData = orgDoc.exists() ? orgDoc.data() : {};

    // Creator is always admin + approved. Joiners are pending.
    const isFirstUser = isCreatingGroup || !orgData.firstUserUid;
    const isAdmin = isFirstUser;
    const status = isFirstUser ? 'approved' : 'pending';

    console.log('🔵 [SIGNUP] isFirstUser:', isFirstUser, '| status:', status);

    // ── WRITE ORG-SCOPED USER DOC ──────────────────────────────────────
    await setDoc(getUserDocPath(finalOrgId, user.uid), {
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
      organizationId: finalOrgId,
      organizationName: finalOrgName,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
    });

    console.log('✅ [SIGNUP] Org user doc written');

    // ── WRITE TOP-LEVEL USER DOC ───────────────────────────────────────
  await setDoc(doc(db, 'users', user.uid), {
    uid: user.uid,
    email,
    firstName: userData.firstName || '',
    lastName: userData.lastName || '',
    organizationId: finalOrgId,
    organizationName: finalOrgName,

    // ⭐ IMPORTANT
    isAdmin,
    status,

    banned: false,
    isBanned: false,

    createdAt: serverTimestamp(),
  });

    console.log('✅ [SIGNUP] Top-level user doc written');

    // ── STAMP FIRST USER ON ORG (join flow only) ───────────────────────
    if (isFirstUser && !isCreatingGroup) {
      try {
        await updateDoc(orgDocRef, { firstUserUid: user.uid });
      } catch (e) {
        console.warn('🟡 Could not stamp firstUserUid:', e.message);
      }
    }

    // ── SIGN OUT (user must log in manually after) ─────────────────────
    await firebaseSignOut(auth);
    global.signupInProgress = false;

    console.log('✅ [SIGNUP] Complete — signed out');

    return {
      success: true,
      user: userCredential.user,
      status,
      isAdmin,
      orgCode: generatedOrgCode,
      organizationId: finalOrgId,
      organizationName: finalOrgName,
    };

  } catch (err) {
    global.signupInProgress = false;
    console.error('🔴 [SIGNUP] Failed:', err.message);
    try {
      await user.delete();
    } catch (deleteErr) {
      console.warn('🟡 Could not delete auth user:', deleteErr.message);
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