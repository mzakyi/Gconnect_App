import React, { useContext } from 'react';
import { Platform, View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { useBadges } from '../context/BadgeContext';
import HomeScreen from '../screens/home/HomeScreen';
import FeedScreen from '../screens/feed/FeedScreen';
import EventsScreen from '../screens/events/EventsScreen';
import AnnouncementsScreen from '../screens/announcements/AnnouncementsScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import AdminScreen from '../screens/admin/AdminScreen';
import ChatListScreen from '../screens/chat/ChatListScreen';


const Tab = createBottomTabNavigator();

// Badge component
const TabBarBadge = ({ count }) => {
  if (!count || count === 0) return null;

  const displayCount = count > 99 ? '99+' : count.toString();

  return (
    <View style={{
      position: 'absolute',
      right: -6,
      top: -3,
      backgroundColor: '#FF3B30',
      borderRadius: 10,
      minWidth: 18,
      height: 18,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 4,
      borderWidth: 2,
      borderColor: '#FFF',
    }}>
      <Text style={{
        color: '#FFF',
        fontSize: 10,
        fontWeight: '700',
      }}>{displayCount}</Text>
    </View>
  );
};

export default function AppNavigator() {
  const { userProfile } = useContext(AuthContext);
  const { badges } = useBadges(); // FIXED: Use 'badges' object

  // Calculate badge counts from the badges object
  const feedBadgeCount = badges.feed || 0;
  const chatBadgeCount = badges.messages || 0;
  const eventsBadgeCount = badges.events || 0;
  const announcementsBadgeCount = badges.announcements || 0;
  const homeBadgeCount = (badges.homeScreen?.posts?.length || 0) + 
                         (badges.homeScreen?.events?.length || 0) + 
                         (badges.homeScreen?.announcements?.length || 0);

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#5c6bc0',
        tabBarInactiveTintColor: '#999',
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#e0e0e0',
          height: Platform.OS === 'ios' ? 85 : 65,
          paddingBottom: Platform.OS === 'ios' ? 25 : 10,
          paddingTop: 8,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 3,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
          marginBottom: Platform.OS === 'ios' ? 0 : 5,
        },
        tabBarIconStyle: {
          marginTop: Platform.OS === 'ios' ? 0 : 5,
        },
      }}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <View>
              <MaterialCommunityIcons 
                name="home" 
                size={size} 
                color={color}
                allowFontScaling={false}
              />
              <TabBarBadge count={homeBadgeCount} />
            </View>
          ),
        }}
      />
      <Tab.Screen 
        name="Feed" 
        component={FeedScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <View>
              <MaterialCommunityIcons 
                name="post" 
                size={size} 
                color={color}
                allowFontScaling={false}
              />
              <TabBarBadge count={feedBadgeCount} />
            </View>
          ),
        }}
      />
      <Tab.Screen 
        name="Chat" 
        component={ChatListScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <View>
              <MaterialCommunityIcons 
                name="chat" 
                size={size} 
                color={color}
                allowFontScaling={false}
              />
              <TabBarBadge count={chatBadgeCount} />
            </View>
          ),
        }}
      />
      <Tab.Screen 
        name="Events" 
        component={EventsScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <View>
              <MaterialCommunityIcons 
                name="calendar" 
                size={size} 
                color={color}
                allowFontScaling={false}
              />
              <TabBarBadge count={eventsBadgeCount} />
            </View>
          ),
        }}
      />
      <Tab.Screen 
        name="Announcements" 
        component={AnnouncementsScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <View>
              <MaterialCommunityIcons 
                name="bullhorn" 
                size={size} 
                color={color}
                allowFontScaling={false}
              />
              <TabBarBadge count={announcementsBadgeCount} />
            </View>
          ),
        }}
      />
      
      {/* Admin Tab - Only visible to admins */}
      {userProfile?.isAdmin && (
        <Tab.Screen 
          name="Admin" 
          component={AdminScreen}
          options={{
            headerShown: false,
            tabBarIcon: ({ color, size, focused }) => (
              <MaterialCommunityIcons 
                name="shield-crown" 
                size={size} 
                color={color}
                allowFontScaling={false}
              />
            ),
          }}
        />
      )}
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons 
              name="account" 
              size={size} 
              color={color}
              allowFontScaling={false}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}