import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase.config';
import { getAuth } from 'firebase/auth';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function getUserOrganizationId(uid) {
  const userBootstrapRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userBootstrapRef);
  if (!userSnap.exists()) return null;
  return userSnap.data().organizationId || null;
}

export async function requestNotificationPermissions() {
  try {
    if (!Device.isDevice) {
      console.log('Must use physical device for Push Notifications');
      return false;
    }
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Push notification permission denied');
      return false;
    }
    return true;
  } catch (error) {
    console.error('Permission error:', error);
    return false;
  }
}

export async function registerForPushNotificationsAsync() {
  try {
    if (!Device.isDevice) {
      console.log('Must use physical device for Push Notifications');
      return null;
    }

    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId) throw new Error('Project ID not found');

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#5c6bc0',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });

      await Notifications.setNotificationChannelAsync('calls', {
        name: 'Incoming Calls',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 400, 200, 400],
        lightColor: '#22c55e',
        sound: 'default',
        enableVibrate: true,
        showBadge: false,
        bypassDnd: true,
      });
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    console.log('✅ Push token obtained:', token.data);
    return token.data;

  } catch (error) {
    console.error('Push registration error:', error);
    return null;
  }
}

export async function savePushTokenToFirestore(token) {
  try {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user || !token) return;

    const uid = user.uid;
    const organizationId = await getUserOrganizationId(uid);

    if (!organizationId) {
      console.log('No organizationId yet — skipping push token save');
      return;
    }

    const userRef = doc(db, 'organizations', organizationId, 'users', uid);
    const userDocSnap = await getDoc(userRef);

    const existingTokens =
      userDocSnap.exists() && userDocSnap.data().pushTokens
        ? userDocSnap.data().pushTokens
        : [];

    // Keep only valid expo tokens, then add current one if not already there
    const validTokens = existingTokens.filter(
      t => t && typeof t === 'string' && t.startsWith('ExponentPushToken[')
    );

    const tokens = validTokens.includes(token)
      ? validTokens
      : [...validTokens, token];

    await setDoc(
      userRef,
      { pushTokens: tokens, lastTokenUpdate: new Date() },
      { merge: true }
    );

    console.log('✅ Push token saved. Total tokens:', tokens.length);

  } catch (error) {
    console.error('Error saving push token:', error);
  }
}

export async function removePushTokenFromFirestore(token) {
  try {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user || !token) return;

    const uid = user.uid;
    const organizationId = await getUserOrganizationId(uid);
    if (!organizationId) return;

    const userRef = doc(db, 'organizations', organizationId, 'users', uid);
    const userDocSnap = await getDoc(userRef);
    if (!userDocSnap.exists()) return;

    const existingTokens = userDocSnap.data().pushTokens || [];
    const tokens = existingTokens.filter(t => t !== token);

    await setDoc(userRef, { pushTokens: tokens }, { merge: true });
    console.log('✅ Push token removed');

  } catch (error) {
    console.error('Error removing push token:', error);
  }
}

export async function clearBadge() {
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch (error) {
    console.error('Badge clear error:', error);
  }
}

export async function scheduleLocalNotification(title, body, data = {}) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title, body, data,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        vibrate: [0, 250, 250, 250],
      },
      trigger: null,
    });
  } catch (error) {
    console.error('Local notification error:', error);
  }
}

export function addNotificationResponseListener(handler) {
  return Notifications.addNotificationResponseReceivedListener(handler);
}

export function addNotificationReceivedListener(handler) {
  return Notifications.addNotificationReceivedListener(handler);
}