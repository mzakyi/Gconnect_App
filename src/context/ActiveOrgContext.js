import React, { createContext, useState, useContext, useEffect } from 'react';
import { AuthContext } from './AuthContext';

export const ActiveOrgContext = createContext();

export const ActiveOrgProvider = ({ children }) => {
  const { organizationId } = useContext(AuthContext);
  const [activeOrgId, setActiveOrgId] = useState(organizationId || '');
  const [activeOrgName, setActiveOrgName] = useState('');

  useEffect(() => {
    if (organizationId) {
      setActiveOrgId(organizationId);
    }
  }, [organizationId]);

  const switchOrg = (orgId, orgName = '') => {
    setActiveOrgId(orgId);
    setActiveOrgName(orgName);
  };

  // Use activeOrgId if set, otherwise fall back to organizationId from auth
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