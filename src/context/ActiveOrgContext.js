// src/context/ActiveOrgContext.js
import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { AuthContext } from './AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase.config';

export const ActiveOrgContext = createContext();

export const ActiveOrgProvider = ({ children }) => {
  const { organizationId, user } = useContext(AuthContext);

  const [activeOrgId, setActiveOrgId]       = useState(organizationId || '');
  const [activeOrgName, setActiveOrgName]   = useState('');
  const [activeOrgIsAdmin, setActiveOrgIsAdmin] = useState(false);

  // Track whether the Super User has manually picked a different org
  const hasManuallySwitch = useRef(false);

  // ─── Re-fetch the user's role whenever activeOrgId or user changes ───────
  // This is what makes the UI react correctly after a demotion:
  // the next time the org is visited (or on app resume) the role is fresh.
  useEffect(() => {
    if (!activeOrgId || !user?.uid) {
      setActiveOrgIsAdmin(false);
      return;
    }

    let cancelled = false;

    const fetchRole = async () => {
      try {
        const snap = await getDoc(
          doc(db, 'organizations', activeOrgId, 'users', user.uid)
        );
        if (!cancelled) {
          setActiveOrgIsAdmin(snap.exists() ? snap.data()?.isAdmin === true : false);
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('Could not fetch active org role:', e.message);
          setActiveOrgIsAdmin(false);
        }
      }
    };

    fetchRole();
    return () => { cancelled = true; };
  }, [activeOrgId, user?.uid]);

  // ─── Reset to home org on login / org change (unless manually switched) ──
  useEffect(() => {
    if (!organizationId) {
      setActiveOrgId('');
      setActiveOrgName('');
      setActiveOrgIsAdmin(false);
      hasManuallySwitch.current = false;
      return;
    }

    if (!hasManuallySwitch.current) {
      setActiveOrgId(organizationId);

      const fetchOrgName = async () => {
        try {
          const orgSnap = await getDoc(doc(db, 'organizations', organizationId));
          if (orgSnap.exists()) {
            const data = orgSnap.data();
            setActiveOrgName(data.name || data.organizationName || '');
          }
        } catch (e) {
          console.warn('Could not fetch org name:', e.message);
        }
      };

      fetchOrgName();
    }
  }, [organizationId]);

  // ─── Switch to a different org ────────────────────────────────────────────
  // Role is re-fetched automatically by the effect above.
  const switchOrg = (orgId, orgName = '') => {
    hasManuallySwitch.current = true;
    setActiveOrgId(orgId);
    setActiveOrgName(orgName);
    // setActiveOrgIsAdmin will be updated by the useEffect on activeOrgId change
  };

  return (
    <ActiveOrgContext.Provider
      value={{ activeOrgId, activeOrgName, activeOrgIsAdmin, switchOrg }}
    >
      {children}
    </ActiveOrgContext.Provider>
  );
};

export const useActiveOrg = () => {
  const context = useContext(ActiveOrgContext);
  if (!context) {
    throw new Error('useActiveOrg must be used within ActiveOrgProvider');
  }
  return context;
};