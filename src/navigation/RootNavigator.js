// src/navigation/RootNavigator.js

import React, { useContext } from 'react';
import { View, Text } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Context
import { AuthContext } from '../context/AuthContext';
import { useActiveOrg } from '../context/ActiveOrgContext';

// Navigators
import AuthNavigator from './AuthNavigator';
import AppNavigator from './AppNavigator';

// Components
import LoadingSpinner from '../components/LoadingSpinner';

// ── ADMIN / CORE SCREENS ──
import EditEventScreen from '../screens/events/EditEventScreen';
import EditAnnouncementScreen from '../screens/announcements/EditannouncementScreen';
import UploadLogoScreen from '../screens/admin/UploadLogoScreen';
import OrgSelectionScreen from '../screens/auth/OrgSelectionScreen';

// 🔥 NEW SCREENS
import SuperAdminScreen from '../screens/admin/SuperAdminScreen';
import PendingSuperAdminRequests from '../screens/admin/PendingSuperAdminRequests';
import CreateEventScreen from '../screens/events/CreateEventScreen';

// Admin Screens
import CreateAnnouncementScreen from '../screens/admin/CreateAnnouncementScreen';
import UsersList from '../screens/admin/UsersList';
import UserProfile from '../screens/admin/UserProfile';
import PendingUsers from '../screens/admin/PendingUsers';
import BannedUsers from '../screens/admin/BannedUsers';
import Analytics from '../screens/admin/Analytics';

// Chat Screens
import ChatListScreen from '../screens/chat/ChatListScreen';
import NewChatScreen from '../screens/chat/NewChatScreen';
import PrivateChatScreen from '../screens/chat/PrivateChatScreen';
import ChatMembersScreen from '../screens/chat/ChatMembersScreen';
import ChatSettingsScreen from '../screens/chat/ChatSettingsScreen';
import ImageViewerScreen from '../screens/chat/ImageViewerScreen';
import ChatInfoScreen from '../screens/chat/ChatInfoScreen';
import CreateGroupScreen from '../screens/chat/CreateGroupScreen';
import GroupChatScreenNew from '../screens/chat/GroupChatScreenNew';
import GroupInfoScreen from '../screens/chat/GroupInfoScreen';

// Call Screens
import OutgoingCallScreen from '../screens/calls/OutgoingCallScreen';
import IncomingCallScreen from '../screens/calls/IncomingCallScreen';
import VoiceCallScreen from '../screens/calls/VoiceCallScreen';
import VideoCallScreen from '../screens/calls/VideoCallScreen';

// ── SIMPLE VIDEO VIEWER ──
const VideoViewerScreen = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
    <Text style={{ color: '#fff' }}>Video Viewer</Text>
  </View>
);

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { user, loading, userProfile } = useContext(AuthContext);
  const { activeOrgIsAdmin } = useActiveOrg();

  if (loading) return <LoadingSpinner />;

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      {user ? (
        <>
          {/* ── MAIN APP ── */}
          <Stack.Screen name="App" component={AppNavigator} />

          {/* ── USER SCREENS ── */}
          <Stack.Screen
            name="UserProfile"
            component={UserProfile}
            options={{ headerShown: true, title: 'User Profile' }}
          />
          <Stack.Screen
            name="UsersList"
            component={UsersList}
            options={{ headerShown: true, title: 'Members' }}
          />

          {/* ── CALL SCREENS ── */}
          <Stack.Screen name="OutgoingCall" component={OutgoingCallScreen} options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="IncomingCall" component={IncomingCallScreen} options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="VoiceCall" component={VoiceCallScreen} options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="VideoCall" component={VideoCallScreen} options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />

          {/* ── CHAT SCREENS ── */}
          <Stack.Screen name="ChatList" component={ChatListScreen} />
          <Stack.Screen name="NewChat" component={NewChatScreen} />
          <Stack.Screen name="PrivateChat" component={PrivateChatScreen} />
          <Stack.Screen name="ChatMembers" component={ChatMembersScreen} />
          <Stack.Screen name="ChatInfo" component={ChatInfoScreen} />
          <Stack.Screen name="ImageViewer" component={ImageViewerScreen} options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="VideoViewer" component={VideoViewerScreen} />
          <Stack.Screen name="ChatSettings" component={ChatSettingsScreen} options={{ headerShown: true, title: 'Chat Settings' }} />
          <Stack.Screen name="CreateGroup" component={CreateGroupScreen} />
          <Stack.Screen name="GroupChatScreen" component={GroupChatScreenNew} />
          <Stack.Screen name="GroupInfo" component={GroupInfoScreen} />

          {/* ── ADMIN SCREENS ── */}
          {/* Gated on activeOrgIsAdmin so secondary org admins can access these too */}
          {(userProfile?.isAdmin || activeOrgIsAdmin) && (
            <>
              <Stack.Screen name="CreateEvent" component={CreateEventScreen} options={{ presentation: 'modal' }} />
              <Stack.Screen name="EditEvent" component={EditEventScreen} />
              <Stack.Screen name="Analytics" component={Analytics} options={{ headerShown: true, title: 'Analytics' }} />
              <Stack.Screen name="UploadLogo" component={UploadLogoScreen} />
              <Stack.Screen name="CreateAnnouncement" component={CreateAnnouncementScreen} />
              <Stack.Screen name="EditAnnouncement" component={EditAnnouncementScreen} />
              <Stack.Screen name="PendingUsers" component={PendingUsers} options={{ headerShown: true, title: 'Pending Approvals' }} />
              <Stack.Screen name="BannedUsers" component={BannedUsers} options={{ headerShown: true, title: 'Banned Users' }} />
              <Stack.Screen name="PendingSuperAdminRequests" component={PendingSuperAdminRequests} options={{ headerShown: false }} />
            </>
          )}

          {/* ── ANY LOGGED-IN USER can join another org ── */}
          <Stack.Screen name="SuperAdmin" component={SuperAdminScreen} />
        </>
      ) : (
        <>
          {/* ── AUTH FLOW ── */}
          <Stack.Screen name="Auth" component={AuthNavigator} />
          <Stack.Screen
            name="OrgSelection"
            component={OrgSelectionScreen}
            options={{ headerShown: true, title: 'Select Organization' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}