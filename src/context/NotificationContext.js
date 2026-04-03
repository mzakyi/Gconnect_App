import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import {
  registerForPushNotificationsAsync,
  savePushTokenToFirestore,
  removePushTokenFromFirestore,
  requestNotificationPermissions,
  clearBadge
} from '../services/notificationService';
import { AuthContext } from './AuthContext';
import { navigate } from '../navigation/navigationRef';

export const NotificationContext = createContext();

// Shared routing logic — used for background taps (minimized state).
// Cold-start (killed state) is handled in App.js via getLastNotificationResponseAsync.
function handleNotificationData(data) {
  if (!data?.type) return;

  switch (data.type) {
    case 'incoming_call':
      navigate('IncomingCall', {
        callId:         data.callId,
        callerName:     data.callerName   || 'Unknown',
        callerAvatar:   data.callerAvatar || '',
        callType:       data.callType     || 'voice',
        roomName:       data.roomName     || '',
        organizationId: data.orgId        || '',
      });
      break;
    case 'messages':
      if (data.chatId) {
        navigate('PrivateChat', { chatId: data.chatId, organizationId: data.orgId });
      } else if (data.groupId) {
        navigate('GroupChatScreen', { groupId: data.groupId, organizationId: data.orgId });
      } else {
        navigate('Chat');
      }
      break;
    case 'posts':
      navigate('Feed');
      break;
    case 'events':
      navigate('Events');
      break;
    case 'announcements':
      navigate('Announcements');
      break;
    default:
      break;
  }
}

export const NotificationProvider = ({ children }) => {
  const { user } = useContext(AuthContext);
  const [expoPushToken, setExpoPushToken] = useState('');
  const [notification, setNotification] = useState(null);
  const notificationListener = useRef(null);
  const responseListener = useRef(null);

  useEffect(() => {
    if (!user) {
      cleanupListeners();
      clearBadge();
      return;
    }

    setupNotifications();
    return () => cleanupListeners();
  }, [user]);

  const setupNotifications = async () => {
    try {
      const hasPermission = await requestNotificationPermissions();
      if (!hasPermission) return;

      const token = await registerForPushNotificationsAsync();
      if (token) {
        setExpoPushToken(token);
        await savePushTokenToFirestore(token);
      }

      // Fires when a notification arrives while the app is in the foreground.
      // We store it in state so screens can react if needed, but we do NOT
      // auto-navigate — the user is already in the app.
      notificationListener.current =
        Notifications.addNotificationReceivedListener(notif => {
          setNotification(notif);
        });

      // Fires when the user taps a notification while the app is backgrounded
      // (minimized). This is the key handler for the minimized case.
      responseListener.current =
        Notifications.addNotificationResponseReceivedListener(response => {
          clearBadge();
          const data = response.notification.request.content.data;
          handleNotificationData(data);
        });

    } catch (error) {
      console.error('Error setting up notifications:', error);
    }
  };

  const cleanupListeners = () => {
    notificationListener.current?.remove();
    notificationListener.current = null;
    responseListener.current?.remove();
    responseListener.current = null;
  };

  useEffect(() => {
    if (!user && expoPushToken) {
      removePushTokenFromFirestore(expoPushToken);
    }
  }, [user]);

  return (
    <NotificationContext.Provider value={{ expoPushToken, notification }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within NotificationProvider');
  return context;
};