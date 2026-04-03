// src/services/superAdminService.js
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  arrayUnion,
} from 'firebase/firestore';
import { db } from '../../firebase.config';

// ─────────────────────────────────────────────────────────────
// REQUEST super admin access to another org
// Called by the admin who wants cross-org access.
// ─────────────────────────────────────────────────────────────
export async function requestSuperAdminAccess(requestingUser, joinCode, currentOrgId) {
  // 1. Find the org by orgCode  ← already fixed from last step
  const orgsRef = collection(db, 'organizations');
  const q = query(orgsRef, where('orgCode', '==', joinCode.trim()));
  const snap = await getDocs(q);

  if (snap.empty) {
    throw new Error('No organization found with that code. Please check and try again.');
  }

  const targetOrgDoc = snap.docs[0];
  const targetOrgId = targetOrgDoc.id;
  const targetOrgData = targetOrgDoc.data();

  // 2. Prevent requesting access to your own org
  if (targetOrgId === currentOrgId) {
    throw new Error('You are already a member of this organization.');
  }

  // 3. Check if they already exist in target org (best-effort — may not have permission)
  try {
    const existingUserRef = doc(db, 'organizations', targetOrgId, 'users', requestingUser.uid);
    const existingUserSnap = await getDoc(existingUserRef);
    if (existingUserSnap.exists()) {
      throw new Error('You already have access to this organization.');
    }
  } catch (err) {
    // If it's our own "already has access" error, rethrow it
    if (err.message === 'You already have access to this organization.') throw err;
    // Otherwise it's a permissions error on the read — safe to continue
    console.log('Could not pre-check user existence (permissions), continuing...');
  }

  // 4. Check if there's already a pending request (best-effort)
  const existingRequestRef = doc(
    db, 'organizations', targetOrgId, 'superAdminRequests', requestingUser.uid
  );
  try {
    const existingRequestSnap = await getDoc(existingRequestRef);
    if (existingRequestSnap.exists()) {
      const existing = existingRequestSnap.data();
      if (existing.status === 'pending') {
        throw new Error('You already have a pending request for this organization.');
      }
      if (existing.status === 'rejected') {
        throw new Error('Your previous request to this organization was rejected.');
      }
    }
  } catch (err) {
    if (err.message.includes('pending') || err.message.includes('rejected')) throw err;
    console.log('Could not pre-check existing request (permissions), continuing...');
  }

  // 5. Create the request — rules allow create if isSignedIn()
  await setDoc(existingRequestRef, {
    uid: requestingUser.uid,
    email: requestingUser.email,
    firstName: requestingUser.firstName,
    lastName: requestingUser.lastName,
    profilePicture: requestingUser.profilePicture || null,
    fromOrgId: currentOrgId,
    fromOrgName: requestingUser.orgName || null,
    targetOrgId,
    targetOrgName: targetOrgData.name || targetOrgData.organizationName || '',
    status: 'pending',
    requestedAt: serverTimestamp(),
  });

  return {
    targetOrgName: targetOrgData.name || targetOrgData.organizationName || 'that organization',
  };
}

// ─────────────────────────────────────────────────────────────
// APPROVE a super admin request
// Called by an admin of the target org.
// ─────────────────────────────────────────────────────────────
export async function approveSuperAdminRequest(requestId, targetOrgId) {
  const requestRef = doc(
    db,
    'organizations',
    targetOrgId,
    'superAdminRequests',
    requestId
  );
  const requestSnap = await getDoc(requestRef);

  if (!requestSnap.exists()) {
    throw new Error('Request not found.');
  }

  const request = requestSnap.data();

  // 1. Add the user as an approved admin in the target org's users subcollection
  const newUserRef = doc(
    db,
    'organizations',
    targetOrgId,
    'users',
    request.uid
  );
  await setDoc(newUserRef, {
    uid: request.uid,
    email: request.email,
    firstName: request.firstName,
    lastName: request.lastName,
    profilePicture: request.profilePicture || null,
    status: 'approved',
    isAdmin: true,
    isSuperAdmin: true,          // flag so we know this came via super admin
    fromOrgId: request.fromOrgId,
    joinedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    banned: false,
    isBanned: false,
  });

  // 2. Update the top-level user doc to record which orgs they admin
  const topLevelUserRef = doc(db, 'users', request.uid);
  await updateDoc(topLevelUserRef, {
    superAdminOrgs: arrayUnion(targetOrgId),
    isSuperAdmin: true,
  });

  // 3. Mark the request as approved
  await updateDoc(requestRef, {
    status: 'approved',
    approvedAt: serverTimestamp(),
  });
}

// ─────────────────────────────────────────────────────────────
// REJECT a super admin request
// ─────────────────────────────────────────────────────────────
export async function rejectSuperAdminRequest(requestId, targetOrgId) {
  const requestRef = doc(
    db,
    'organizations',
    targetOrgId,
    'superAdminRequests',
    requestId
  );
  await updateDoc(requestRef, {
    status: 'rejected',
    rejectedAt: serverTimestamp(),
  });
}

// ─────────────────────────────────────────────────────────────
// SUBSCRIBE to pending super admin requests for an org
// Used by the admin panel to show pending approvals.
// ─────────────────────────────────────────────────────────────
export function subscribeToPendingSuperAdminRequests(orgId, callback) {
  const requestsRef = collection(
    db,
    'organizations',
    orgId,
    'superAdminRequests'
  );
  const q = query(requestsRef, where('status', '==', 'pending'));

  return onSnapshot(q, (snap) => {
    const requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(requests);
  });
}

// ─────────────────────────────────────────────────────────────
// GET all orgs a user is an admin of (their home org + any super admin orgs)
// ─────────────────────────────────────────────────────────────
export async function getAllAdminOrgsForUser(uid) {
  const topLevelRef = doc(db, 'users', uid);
  const topLevelSnap = await getDoc(topLevelRef);

  if (!topLevelSnap.exists()) return [];

  const data = topLevelSnap.data();
  const superAdminOrgs = data.superAdminOrgs || [];

  // Fetch org names for all orgs
  const orgDetails = await Promise.all(
    superAdminOrgs.map(async (orgId) => {
      const orgSnap = await getDoc(doc(db, 'organizations', orgId));
      if (!orgSnap.exists()) return null;
      const orgData = orgSnap.data();
      return {
        id: orgId,
        name: orgData.name || orgData.organizationName || orgId,
        logoUrl: orgData.logoUrl || null,
      };
    })
  );

  return orgDetails.filter(Boolean);
}

// ─────────────────────────────────────────────────────────────
// BROADCAST content to multiple orgs
// Used when a super admin wants to post to both orgs at once.
// Pass in a function that creates the content for a given orgId.
// ─────────────────────────────────────────────────────────────
export async function broadcastToOrgs(orgIds, createFn) {
  const results = await Promise.allSettled(
    orgIds.map((orgId) => createFn(orgId))
  );

  const failures = results
    .map((r, i) => (r.status === 'rejected' ? orgIds[i] : null))
    .filter(Boolean);

  if (failures.length > 0) {
    throw new Error(
      `Failed to post to some organizations. Successful orgs received the content.`
    );
  }

  return results;
}