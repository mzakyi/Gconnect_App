// src/navigation/AuthNavigator.js
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import CreateGroupScreen from '../screens/auth/CreateGroupScreen';
import GroupSuccessScreen from '../screens/auth/GroupSuccessScreen';

// JoinGroup reuses your existing SignupScreen exactly as-is —
// it already has the org code field, which is exactly what joiners need.
// No new file needed.

const Stack = createNativeStackNavigator();

export default function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="JoinGroup" component={SignupScreen} />
      <Stack.Screen name="CreateGroup" component={CreateGroupScreen} />
      <Stack.Screen
        name="GroupSuccess"
        component={GroupSuccessScreen}
        options={{ gestureEnabled: false }} // prevent swipe-back from success screen
      />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}