import React, { useEffect, useContext } from 'react';
import { Provider as PaperProvider } from 'react-native-paper';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider } from './src/context/AuthContext';
import { OrganizationProvider } from './src/context/OrganizationContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { BadgeProvider } from './src/context/BadgeContext';
import { CallProvider, CallContext } from './src/context/CallContext';
import RootNavigator from './src/navigation/RootNavigator';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { navigationRef, navigate } from './src/navigation/navigationRef';
import { ActiveOrgProvider } from './src/context/ActiveOrgContext';

// ✅ ADD THIS (EmailJS init)
import { initEmailService } from './src/services/emailService';

try {
  const { registerGlobals } = require('@livekit/react-native');
  registerGlobals();
  console.log('✅ LiveKit registerGlobals success');
} catch (e) {
  console.log('❌ LiveKit registerGlobals error:', e.message);
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function handleNotificationData(data) {
  if (!data?.type) return;

  switch (data.type) {
    case 'incoming_call':
      navigate('IncomingCall', {
        callId:         data.callId,
        callerName:     data.callerName    || 'Unknown',
        callerAvatar:   data.callerAvatar  || '',
        callType:       data.callType      || 'voice',
        roomName:       data.roomName      || '',
        organizationId: data.orgId         || '',
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

function AppWithNavigation() {
  const { setNavigationRef } = useContext(CallContext);

  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response?.notification?.request?.content?.data) {
        setTimeout(() => {
          handleNotificationData(response.notification.request.content.data);
        }, 1000);
      }
    });
  }, []);

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        if (setNavigationRef && navigationRef.current) {
          setNavigationRef(navigationRef.current);
        }
      }}
    >
      <StatusBar style="auto" />
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  useEffect(() => {
    const setup = async () => {
      // ✅ INIT EMAILJS (THIS WAS MISSING)
      initEmailService();

      // ✅ Notifications permission
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log('Notification permissions not granted');
      }
    };

    setup();
  }, []);

  return (
    <PaperProvider>
      <OrganizationProvider>
        <AuthProvider>
          <ActiveOrgProvider> 
            <NotificationProvider>
              <BadgeProvider>
                <CallProvider>
                  <AppWithNavigation />
                </CallProvider>
              </BadgeProvider>
            </NotificationProvider>
          </ActiveOrgProvider> 
        </AuthProvider>
      </OrganizationProvider>
    </PaperProvider>
  );
}