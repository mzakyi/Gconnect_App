// src/screens/auth/GroupSuccessScreen.js
import React, { useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Share,
  Alert,
  Clipboard,
} from 'react-native';
import { Text, Button } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function GroupSuccessScreen({ navigation, route }) {
  const { orgCode, groupName } = route.params || {};

  const handleCopyCode = () => {
    Clipboard.setString(orgCode);
    Alert.alert('Copied!', `Code ${orgCode} copied to clipboard`);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join my group "${groupName}" on GConnect!\n\nUse this code to sign up: ${orgCode}\n\nDownload GConnect and select "Join Existing Group" at signup.`,
      });
    } catch (err) {
      console.error('Share error:', err);
    }
  };

  const handleGoToLogin = () => {
    // Navigate to Login — the creator still needs to log in
    // because signUp ends with a signOut (pending flow still signs out,
    // but the creator is auto-approved so login will work immediately)
    navigation.replace('Login');
  };

  return (
    <LinearGradient
      colors={['#e8eaf6', '#c5cae9', '#9fa8da']}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.container}>

        {/* Success icon */}
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name="check-circle" size={80} color="#4CAF50" />
        </View>

        <Text style={styles.congrats}>Group Created!</Text>
        <Text style={styles.groupName}>{groupName}</Text>

        <Text style={styles.instruction}>
          Share this code with anyone you want to invite to your group:
        </Text>

        {/* Big code display */}
        <TouchableOpacity style={styles.codeBox} onPress={handleCopyCode} activeOpacity={0.8}>
          <Text style={styles.codeText}>{orgCode}</Text>
          <View style={styles.copyRow}>
            <MaterialCommunityIcons name="content-copy" size={16} color="#5c6bc0" />
            <Text style={styles.copyLabel}>Tap to copy</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.codeNote}>
          Your members will enter this code when they sign up to join your group.
          You'll approve them once they register.
        </Text>

        {/* Action buttons */}
        <Button
          mode="contained"
          onPress={handleShare}
          style={styles.shareButton}
          contentStyle={styles.buttonContent}
          labelStyle={styles.buttonLabel}
          buttonColor="#5c6bc0"
          icon="share-variant"
        >
          Share Code
        </Button>

        <Button
          mode="outlined"
          onPress={handleGoToLogin}
          style={styles.loginButton}
          contentStyle={styles.buttonContent}
          labelStyle={styles.loginButtonLabel}
          textColor="#1a237e"
          icon="login"
        >
          Go to Login
        </Button>

        {/* Admin note */}
        <View style={styles.adminNote}>
          <MaterialCommunityIcons name="shield-crown" size={18} color="#FF9800" />
          <Text style={styles.adminNoteText}>
            You are the admin of this group. After logging in, you can approve members, promote admins, and manage your group.
          </Text>
        </View>

      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingVertical: 40,
  },
  iconContainer: {
    marginBottom: 16,
    backgroundColor: '#E8F5E9',
    borderRadius: 60,
    padding: 12,
  },
  congrats: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a237e',
    marginBottom: 6,
    textAlign: 'center',
  },
  groupName: {
    fontSize: 20,
    color: '#3949ab',
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: '600',
  },
  instruction: {
    fontSize: 15,
    color: '#3949ab',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  codeBox: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 50,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#3f51b5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 2,
    borderColor: '#5c6bc0',
    width: '80%',
  },
  codeText: {
    fontSize: 52,
    fontWeight: 'bold',
    color: '#1a237e',
    letterSpacing: 8,
    marginBottom: 8,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  copyLabel: {
    fontSize: 13,
    color: '#5c6bc0',
    fontWeight: '500',
  },
  codeNote: {
    fontSize: 13,
    color: '#3949ab',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  shareButton: {
    width: '100%',
    borderRadius: 30,
    marginBottom: 12,
    shadowColor: '#3f51b5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  loginButton: {
    width: '100%',
    borderRadius: 30,
    borderColor: '#1a237e',
    marginBottom: 24,
  },
  buttonContent: { paddingVertical: 8 },
  buttonLabel: { fontSize: 16, fontWeight: 'bold', letterSpacing: 0.5 },
  loginButtonLabel: { fontSize: 16, fontWeight: 'bold' },
  adminNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  adminNoteText: {
    flex: 1,
    fontSize: 13,
    color: '#3949ab',
    lineHeight: 19,
  },
});