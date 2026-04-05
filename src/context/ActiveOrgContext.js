import React, { createContext, useState, useContext, useEffect } from 'react';
import { AuthContext } from './AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase.config';


export const ActiveOrgContext = createContext();

export const ActiveOrgProvider = ({ children }) => {
  const { organizationId } = useContext(AuthContext);
  const [activeOrgId, setActiveOrgId] = useState(organizationId || '');
  const [activeOrgName, setActiveOrgName] = useState('');

  // Whenever the auth organizationId changes (login/logout),
  // sync activeOrgId and fetch the correct org name
  useEffect(() => {
    if (!organizationId) {
      setActiveOrgId('');
      setActiveOrgName('');
      return;
    }

    setActiveOrgId(organizationId);

    // Fetch the org name fresh from Firestore
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
  }, [organizationId]);

  // Used by super admins to manually switch orgs
  const switchOrg = (orgId, orgName = '') => {
    setActiveOrgId(orgId);
    setActiveOrgName(orgName);
  };

  const resolvedOrgId = activeOrgId || organizationId || '';

  return (
    <ActiveOrgContext.Provider value={{ activeOrgId: resolvedOrgId, activeOrgName, switchOrg }}>
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