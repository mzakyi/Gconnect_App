// src/context/AuthContext.js

import React, { createContext, useState, useEffect } from 'react';
import { auth, db } from '../../firebase.config';
import { doc, getDoc } from 'firebase/firestore';
import { updateOnlineStatus } from '../services/chatService';
import { AppState } from 'react-native';
import { useOrganization } from './OrganizationContext';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const { organizationId, saveOrganizationId, clearOrganizationId, updateOrganizationData } = useOrganization();

  // ✅ Normalize user roles so they ALWAYS exist
  const normalizeProfile = (data) => {
    return {
      ...data,
      isAdmin: data?.isAdmin ?? false,
      isSuperAdmin: data?.isSuperAdmin ?? false,
    };
  };

  // 🔄 Refresh profile manually
  const refreshUserProfile = async () => {
    if (!user || !organizationId) return;

    try {
      const userDoc = await getDoc(
        doc(db, 'organizations', organizationId, 'users', user.uid)
      );

      if (userDoc.exists()) {
        const normalized = normalizeProfile(userDoc.data());
        setUserProfile(normalized);
      }
    } catch (error) {
      console.error('Error refreshing user profile:', error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {

      // 🚪 User logged out
      if (!firebaseUser) {
        setUser(null);
        setUserProfile(null);
        await clearOrganizationId();
        setLoading(false);
        return;
      }

      // 🟡 Prevent race condition during signup
      if (global.signupInProgress) {
        console.log('🟡 Signup in progress, skipping auth state logic');
        setLoading(false);
        return;
      }

      try {
        let fetchedOrgId = null;

        // 🔍 Step 1: Get organizationId from top-level users collection
        try {
          const topLevelDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (topLevelDoc.exists() && topLevelDoc.data()?.organizationId) {
            fetchedOrgId = topLevelDoc.data().organizationId;
            await saveOrganizationId(fetchedOrgId);
          }
        } catch (e) {
          console.log('No top-level user doc:', e.message);
        }

        // ❌ No org? force logout
        if (!fetchedOrgId) {
          console.warn('No organizationId found, signing out');
          setUser(null);
          setUserProfile(null);
          await clearOrganizationId();
          setLoading(false);
          await firebaseSignOut(auth);
          return;
        }

        // 🔍 Step 2: Get org-scoped user profile
        const userDocRef = doc(db, 'organizations', fetchedOrgId, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
          console.warn('No user profile found, signing out');
          setUser(null);
          setUserProfile(null);
          await clearOrganizationId();
          setLoading(false);
          await firebaseSignOut(auth);
          return;
        }

        const rawProfileData = userDoc.data();

        // 🚫 Block invalid users
        if (
          !rawProfileData ||
          rawProfileData.status === 'pending' ||
          rawProfileData.status === 'rejected' ||
          rawProfileData.banned === true ||
          rawProfileData.isBanned === true
        ) {
          console.log('🔴 User not approved, signing out. Status:', rawProfileData?.status);
          setUser(null);
          setUserProfile(null);
          await clearOrganizationId();
          setLoading(false);
          await firebaseSignOut(auth);
          return;
        }

        // ✅ Normalize roles (THIS IS THE FIX)
        const profileData = normalizeProfile(rawProfileData);

        // ✅ Set user + profile
        setUser(firebaseUser);
        setUserProfile(profileData);

        // 🔄 Ensure orgId stays synced
        if (profileData.organizationId) {
          await saveOrganizationId(profileData.organizationId);
        }

        // 🏢 Fetch organization metadata
        try {
          const orgDoc = await getDoc(doc(db, 'organizations', fetchedOrgId));
          if (orgDoc.exists()) {
            updateOrganizationData({
              id: orgDoc.id,
              name: orgDoc.data().name,
            });
          }
        } catch (e) {
          console.error('Error fetching org metadata:', e);
        }

      } catch (error) {
        console.error('Auth error:', error);
        setUser(null);
        setUserProfile(null);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // 🟢 Online / offline tracking
  useEffect(() => {
    if (!user || !organizationId) return;

    setTimeout(() => {
      updateOnlineStatus(user.uid, true, organizationId);
    }, 2000);

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        setTimeout(() => {
          updateOnlineStatus(user.uid, true, organizationId);
        }, 2000);
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        updateOnlineStatus(user.uid, false, organizationId);
      }
    });

    const capturedUid = user.uid;
    const capturedOrgId = organizationId;

    return () => {
      subscription?.remove();
      if (capturedUid && capturedOrgId) {
        updateOnlineStatus(capturedUid, false, capturedOrgId);
      }
    };
  }, [user, organizationId]);

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading: Boolean(loading),
        refreshUserProfile,
        organizationId,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};