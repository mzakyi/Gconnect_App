// firebase.config.js

import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getStorage } from 'firebase/storage';

// Firebase Production Config
const firebaseConfig = {
  apiKey: "AIzaSyDrG-QPRpYueWs2djnaXFp9NQZTnQqWxcU",
  authDomain: "sankatos-ai-app.firebaseapp.com",
  projectId: "sankatos-ai-app",
  storageBucket: "sankatos-ai-app.firebasestorage.app",
  messagingSenderId: "388893342855",
  appId: "1:388893342855:web:24e5f4a1689a38a6d38c22",
  measurementId: "G-V240HQWWG9"
};

// Initialize Firebase
// ✅ FIXED: export app so other files (callService, etc.) can pass it to getFunctions()
export const app = initializeApp(firebaseConfig);

// Initialize Auth with persistence
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Storage
export const storage = getStorage(app);

console.log('🔥 Firebase initialized in PRODUCTION mode');
console.log('📍 Project:', firebaseConfig.projectId);

if (__DEV__) {
  console.warn('⚠️ Running in DEV mode but using PRODUCTION Firebase');
}