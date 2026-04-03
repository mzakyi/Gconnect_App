import React, { createContext, useState, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const OrganizationContext = createContext();

export const useOrganization = () => {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within OrganizationProvider');
  }
  return context;
};

export const OrganizationProvider = ({ children }) => {
  const [organizationId, setOrganizationId] = useState(null);
  const [organizationData, setOrganizationData] = useState(null);

  // ⭐ No useEffect, no AsyncStorage load on startup
  // orgId is always resolved fresh from Firestore when a user logs in

  const saveOrganizationId = async (orgId) => {
    try {
      await AsyncStorage.setItem('organizationId', orgId);
      setOrganizationId(orgId);
    } catch (error) {
      console.error('Error saving organization ID:', error);
    }
  };

  const clearOrganizationId = async () => {
    try {
      await AsyncStorage.removeItem('organizationId');
      setOrganizationId(null);
      setOrganizationData(null);
    } catch (error) {
      console.error('Error clearing organization ID:', error);
    }
  };

  const updateOrganizationData = (data) => {
    setOrganizationData(data);
  };

  const value = {
    organizationId,
    organizationData,
    loading: false, // no async load needed anymore
    saveOrganizationId,
    clearOrganizationId,
    updateOrganizationData,
  };

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
};