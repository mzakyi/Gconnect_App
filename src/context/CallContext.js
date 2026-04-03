// src/context/CallContext.js
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { AuthContext } from './AuthContext';
import { subscribeToIncomingCalls } from '../services/callService';
import { useNavigation } from '@react-navigation/native';

export const CallContext = createContext();

export const CallProvider = ({ children }) => {
  const { user, organizationId } = useContext(AuthContext);
  const [incomingCall, setIncomingCall] = useState(null);
  const navigationRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const currentCallIdRef = useRef(null); // prevent duplicate navigations

  useEffect(() => {
    if (!user?.uid || !organizationId) {
      cleanupSubscription();
      return;
    }

    setupIncomingCallListener();

    return () => cleanupSubscription();
  }, [user?.uid, organizationId]);

  const cleanupSubscription = () => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
  };

  const setupIncomingCallListener = () => {
    cleanupSubscription();

    unsubscribeRef.current = subscribeToIncomingCalls(
      user.uid,
      (callData) => {
        if (!callData) {
          setIncomingCall(null);
          currentCallIdRef.current = null;
          return;
        }

        // Avoid processing the same call twice
        if (callData.callId === currentCallIdRef.current) return;

        currentCallIdRef.current = callData.callId;
        setIncomingCall(callData);

        // Navigate to IncomingCallScreen
        // We use the navigationRef set by RootNavigator
        try {
          if (navigationRef.current) {
            navigationRef.current.navigate('IncomingCall', {
              callId: callData.callId,
              callerName: callData.callerName,
              callerAvatar: callData.callerAvatar,
              callType: callData.callType,
              roomName: callData.roomName,
            });
          }
        } catch (navError) {
          console.error('Navigation error for incoming call:', navError);
        }
      },
      organizationId
    );
  };

  // Expose setNavigationRef so RootNavigator can register the nav ref
  const setNavigationRef = (ref) => {
    navigationRef.current = ref;
  };

  return (
    <CallContext.Provider
      value={{
        incomingCall,
        setIncomingCall,
        setNavigationRef,
      }}
    >
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within CallProvider');
  }
  return context;
};