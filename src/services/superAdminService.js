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
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../../firebase.config';

// ─────────────────────────────────────────────────────────────
// REQUEST Super User access to another org
// Called by the admin who wants cross-org access.
// ─────────────────────────────────────────────────────────────
export async function requestSuperAdminAccess(requestingUser, joinCode, currentOrgId) {
  // 1. Find the org by orgCode
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

  // 3. Check if they already exist in target org (best-effort)
  try {
    const existingUserRef = doc(db, 'organizations', targetOrgId, 'users', requestingUser.uid);
    const existingUserSnap = await getDoc(existingUserRef);
    if (existingUserSnap.exists()) {
      throw new Error('You already have access to this organization.');
    }
  } catch (err) {
    if (err.message === 'You already have access to this organization.') throw err;
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


// 5. Create the request
  await setDoc(existingRequestRef, {
    uid: requestingUser.uid,
    email: requestingUser.email,
    firstName: requestingUser.firstName,
    lastName: requestingUser.lastName,
    profilePicture: requestingUser.profilePicture || null,
    fromOrgId: currentOrgId,
    fromOrgName: requestingUser.orgName || null,
    requesterIsAdmin: requestingUser.isAdmin || false,
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
// APPROVE a Super User request
// Called by any user
// ─────────────────────────────────────────────────────────────
export async function approveSuperAdminRequest(requestId, targetOrgId, makeAdmin = false) {
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

  // 1. Add the user to the target org — regular member by default, admin if makeAdmin=true
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
    isAdmin: makeAdmin,
    isSuperAdmin: makeAdmin,
    fromOrgId: request.fromOrgId,
    joinedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    banned: false,
    isBanned: false,
  });

  // 2. Update the top-level user doc — always add to superAdminOrgs so they can switch orgs
  const topLevelUserRef = doc(db, 'users', request.uid);
  await updateDoc(topLevelUserRef, {
    superAdminOrgs: arrayUnion(targetOrgId),
    ...(makeAdmin ? { isSuperAdmin: true } : {}),
  });

  // 3. Only stamp isSuperAdmin on home org if they're being made admin
  if (makeAdmin && request.fromOrgId) {
    const homeOrgUserRef = doc(db, 'organizations', request.fromOrgId, 'users', request.uid);
    await updateDoc(homeOrgUserRef, { isSuperAdmin: true });
  }

  // 4. Mark the request as approved
  await updateDoc(requestRef, {
    status: 'approved',
    approvedAt: serverTimestamp(),
    grantedAdmin: makeAdmin,
  });
}

// ─────────────────────────────────────────────────────────────
// REJECT a Super User request
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
// REVOKE a user's admin role in a specific org
// - Strips isAdmin + isSuperAdmin from that org's user doc
// - User stays in superAdminOrgs so they can still switch to the org
//   as a regular member
// - Updates top-level isSuperAdmin to reflect whether they're still
//   an admin in ANY org
// ─────────────────────────────────────────────────────────────
export async function revokeOrgAccess(targetUid, targetOrgId) {
  // 1. Strip admin flags in the target org — keep them as a regular member
  const userOrgRef = doc(db, 'organizations', targetOrgId, 'users', targetUid);
  const orgUserSnap = await getDoc(userOrgRef);
  if (!orgUserSnap.exists()) throw new Error('User not found in this organization.');

  await updateDoc(userOrgRef, {
    isAdmin: false,
    isSuperAdmin: false,
  });

  // 2. Check the top-level doc to see if they're still admin anywhere else
  const topLevelRef = doc(db, 'users', targetUid);
  const topSnap = await getDoc(topLevelRef);
  if (!topSnap.exists()) return;

  const topData = topSnap.data();
  const allSuperAdminOrgIds = topData.superAdminOrgs || [];
  const homeOrgId = topData.organizationId;

  // Check admin status in every org except the one we just revoked
  const otherOrgIds = allSuperAdminOrgIds.filter((id) => id !== targetOrgId);

  const adminChecks = await Promise.all(
    otherOrgIds.map(async (orgId) => {
      try {
        const ref = doc(db, 'organizations', orgId, 'users', targetUid);
        const s = await getDoc(ref);
        return s.exists() && s.data()?.isAdmin === true;
      } catch {
        return false;
      }
    })
  );

  // Check their home org too
  let homeOrgIsAdmin = false;
  if (homeOrgId && homeOrgId !== targetOrgId) {
    try {
      const homeRef = doc(db, 'organizations', homeOrgId, 'users', targetUid);
      const homeSnap = await getDoc(homeRef);
      homeOrgIsAdmin = homeSnap.exists() && homeSnap.data()?.isAdmin === true;
    } catch {
      homeOrgIsAdmin = false;
    }
  }

  const isStillAdminSomewhere = homeOrgIsAdmin || adminChecks.some(Boolean);

  // 3. Update top-level doc:
  //    - Keep superAdminOrgs intact (they can still switch to those orgs as a member)
  //    - Only clear isSuperAdmin if not admin in any org anymore
  await updateDoc(topLevelRef, {
    isSuperAdmin: isStillAdminSomewhere,
  });

  // 4. If the revoked org was NOT their home org, also clear isSuperAdmin
  //    on the home org's user doc if they're no longer Super User anywhere
  if (homeOrgId && homeOrgId !== targetOrgId && !isStillAdminSomewhere) {
    try {
      const homeOrgUserRef = doc(db, 'organizations', homeOrgId, 'users', targetUid);
      await updateDoc(homeOrgUserRef, { isSuperAdmin: false });
    } catch (e) {
      console.warn('Could not update home org isSuperAdmin:', e.message);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// SUBSCRIBE to pending Super User requests for an org
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
// GET all orgs a user has access to (including ones where they
// may have been demoted from admin — kept so they can still switch)
// ─────────────────────────────────────────────────────────────
export async function getAllAdminOrgsForUser(uid) {
  const topLevelRef = doc(db, 'users', uid);
  const topLevelSnap = await getDoc(topLevelRef);

  if (!topLevelSnap.exists()) return [];

  const data = topLevelSnap.data();
  // superAdminOrgs contains ALL orgs the user was ever approved into
  // via Super User flow — we keep them here even after demotion so
  // they can still switch to that org as a regular member.
  const superAdminOrgs = data.superAdminOrgs || [];

  const orgDetails = await Promise.all(
    superAdminOrgs.map(async (orgId) => {
      try {
        const orgSnap = await getDoc(doc(db, 'organizations', orgId));
        if (!orgSnap.exists()) return null;
        const orgData = orgSnap.data();

        // Also fetch the user's actual role in this org
        let isAdmin = false;
        try {
          const userOrgSnap = await getDoc(
            doc(db, 'organizations', orgId, 'users', uid)
          );
          isAdmin = userOrgSnap.exists()
            ? userOrgSnap.data()?.isAdmin === true
            : false;
        } catch (e) {
          // Permission denied on this org — skip silently
          isAdmin = false;
        }

        return {
          id: orgId,
          name: orgData.name || orgData.organizationName || orgId,
          logoUrl: orgData.logoUrl || null,
          isAdmin,
        };
      } catch {
        return null;
      }
    })
  );

  return orgDetails.filter(Boolean);
}

// ─────────────────────────────────────────────────────────────
// BROADCAST content to multiple orgs
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

// ─────────────────────────────────────────────────────────────
// ONE-TIME PATCH: Fix all existing Super User users missing
// isSuperAdmin: true on their home org doc.
// Call this once from an admin button then remove the button.
// ─────────────────────────────────────────────────────────────
export async function patchAllSuperAdminUsers() {
  const usersSnap = await getDocs(collection(db, 'users'));

  let patched = 0;
  let skipped = 0;

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();

    if (!data.superAdminOrgs || data.superAdminOrgs.length === 0) {
      skipped++;
      continue;
    }

    const uid = userDoc.id;
    const homeOrgId = data.organizationId;

    if (!homeOrgId) {
      skipped++;
      continue;
    }

    try {
      const homeOrgUserRef = doc(db, 'organizations', homeOrgId, 'users', uid);
      await updateDoc(homeOrgUserRef, { isSuperAdmin: true });
      patched++;
      console.log(`✅ Patched user ${uid} in org ${homeOrgId}`);
    } catch (err) {
      console.warn(`⚠️ Could not patch user ${uid}:`, err.message);
      skipped++;
    }
  }

  return { patched, skipped };
}