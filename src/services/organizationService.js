// src/services/organizationService.js
import { db } from '../../firebase.config';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const storage = getStorage();

// ─── HELPER: turn "Test Group 1" → "test-group-1" ──────────────────────────
const toSlug = (name) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')   // strip special characters
    .replace(/\s+/g, '-')            // spaces → hyphens
    .replace(/-+/g, '-')             // collapse multiple hyphens
    .slice(0, 40);                   // cap length so IDs stay manageable

export const organizationService = {

  // ─── EXISTING: validate org code when joining ───────────────────────────
  validateOrgCode: async (orgCode) => {
    try {
      const orgRef = collection(db, 'organizations');
      const q = query(orgRef, where('orgCode', '==', orgCode.toUpperCase()));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return { success: false, error: 'Organization code not found' };
      }

      const docData = snapshot.docs[0].data();
      return {
        success: true,
        organizationId: snapshot.docs[0].id,
        organizationName: docData.name || docData.organizationName,
      };
    } catch (err) {
      console.error('Error validating org code:', err);
      return { success: false, error: err.message };
    }
  },

  // ─── EXISTING: upload org logo ──────────────────────────────────────────
  uploadOrgLogo: async (organizationId, imageUri) => {
    try {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const logoRef = ref(storage, `organizations/${organizationId}/logo/logo.jpg`);
      await uploadBytes(logoRef, blob);
      const downloadURL = await getDownloadURL(logoRef);
      const orgDocRef = doc(db, 'organizations', organizationId);
      await updateDoc(orgDocRef, { logoUrl: downloadURL });
      return { success: true, logoUrl: downloadURL };
    } catch (err) {
      console.error('Error uploading org logo:', err);
      return { success: false, error: err.message };
    }
  },

  // ─── EXISTING: get org logo ─────────────────────────────────────────────
  getOrgLogo: async (organizationId) => {
    try {
      const orgDocRef = doc(db, 'organizations', organizationId);
      const orgDoc = await getDoc(orgDocRef);
      if (orgDoc.exists()) {
        return orgDoc.data().logoUrl || null;
      }
      return null;
    } catch (err) {
      console.error('Error fetching org logo:', err);
      return null;
    }
  },

  // ─── EXISTING: get org name ─────────────────────────────────────────────
  getOrgName: async (organizationId) => {
    try {
      const orgDocRef = doc(db, 'organizations', organizationId);
      const orgDoc = await getDoc(orgDocRef);
      if (orgDoc.exists()) {
        return orgDoc.data().name || orgDoc.data().organizationName || null;
      }
      return null;
    } catch (err) {
      console.error('Error fetching org name:', err);
      return null;
    }
  },

  // ─── EXISTING: generate a unique 4-digit org code ───────────────────────
  generateUniqueOrgCode: async () => {
    const orgsRef = collection(db, 'organizations');
    let attempts = 0;

    while (attempts < 20) {
      const code = String(Math.floor(1000 + Math.random() * 9000));
      const q = query(orgsRef, where('orgCode', '==', code));
      const snapshot = await getDocs(q);
      if (snapshot.empty) return code;
      attempts++;
    }

    // Safety fallback (virtually unreachable at small scale)
    return String(Date.now()).slice(-4);
  },

  // ─── UPDATED: create a brand-new organization ───────────────────────────
  // Document ID is now a human-readable slug: "test-group-1-3151"
  // This makes it trivial to find any org in the Firebase console.
  //
  // 💳 PAYMENT HOOK: When you add Stripe later, call your Stripe checkout
  // function BEFORE this, and only call createOrganization() after payment
  // succeeds. The org doc already has subscriptionStatus: 'active' built in,
  // so Firestore rules will work automatically once Stripe flips that field.
  createOrganization: async (groupName, creatorUid) => {
    try {
      if (!groupName || !groupName.trim()) {
        return { success: false, error: 'Group name is required' };
      }
      if (!creatorUid) {
        return { success: false, error: 'User must be signed in' };
      }

      // Step 1: Generate a unique 4-digit code
      const orgCode = await organizationService.generateUniqueOrgCode();

      // Step 2: Build a readable document ID: "test-group-1-3151"
      // The org code suffix guarantees uniqueness even when two groups
      // share the same name (e.g. two "Running Club" orgs → running-club-1234
      // and running-club-5678).
      const slug = toSlug(groupName);
      const orgDocId = `${slug}-${orgCode}`;

      // Step 3: Write the document with the readable ID
      const orgRef = doc(db, 'organizations', orgDocId);

      await setDoc(orgRef, {
        name: groupName.trim(),
        organizationName: groupName.trim(), // keep both for compatibility
        orgCode,
        createdBy: creatorUid,
        createdAt: serverTimestamp(),

        // 💳 PAYMENT FIELDS — set to 'active' for free tier now.
        // When Stripe is added, this will be set by the webhook instead.
        subscriptionStatus: 'active',
        subscriptionPlan: 'free',        // swap to 'monthly' or 'yearly' later
        activeUntil: null,               // Stripe will populate this field

        // First user tracking (used by authService to detect admin)
        firstUserUid: creatorUid,
      });

      return {
        success: true,
        organizationId: orgRef.id,   // "test-group-1-3151"
        orgCode,
        organizationName: groupName.trim(),
      };
    } catch (err) {
      console.error('Error creating organization:', err);
      return { success: false, error: err.message };
    }
  },
};