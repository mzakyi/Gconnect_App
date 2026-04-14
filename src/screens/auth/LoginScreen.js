import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, Image, Dimensions } from 'react-native';
import { TextInput, Button, Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { signIn } from '../../services/authService';
import { updateOnlineStatus } from '../../services/chatService';

const { width } = Dimensions.get('window');

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
      const { userCredential, userData, organizationId } = await signIn(email.trim(), password);
      await updateOnlineStatus(userCredential.user.uid, true, organizationId);
    } catch (err) {
      let errorMessage = 'Invalid email or password. Please try again.';
      
      const code = err.code || '';
      const msg = err.message || '';

      if (msg === 'BANNED') {
        errorMessage = 'Your account has been banned. Please contact support.';
      } else if (msg === 'PENDING') {
        errorMessage = 'Your account is awaiting admin approval. Please check back later.';
      } else if (msg === 'REJECTED') {
        errorMessage = 'Your account was not approved. Please contact support.';
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        errorMessage = 'Incorrect email or password. Please try again.';
      } else if (code === 'auth/invalid-email') {
        errorMessage = 'Please enter a valid email address.';
      } else if (code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please wait a few minutes and try again.';
      } else if (code === 'auth/network-request-failed') {
        errorMessage = 'No internet connection. Please check your network.';
      }

      Alert.alert('Login Failed', errorMessage);
    } finally {
      setLoading(false);
    }
      };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={['#e8eaf6', '#c5cae9', '#9fa8da']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoContainer}>
            <View style={styles.logoWrapper}>
            <Image
              source={require('../../../assets/AppIcon.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            </View>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.headerSection}>
              <Text variant="headlineLarge" style={styles.title}>
                GConnect
              </Text>
              <Text variant="titleMedium" style={styles.subtitle}>
                Welcome!
              </Text>
              <View style={styles.divider} />
            </View>

            <View style={styles.inputContainer}>
              <TextInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                mode="outlined"
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
                editable={!loading}
                left={<TextInput.Icon icon="email-outline" color="#5c6bc0" />}
                outlineColor="#9fa8da"
                activeOutlineColor="#5c6bc0"
                theme={{ colors: { background: '#ffffff' } }}
              />

              <TextInput
                label="Password"
                value={password}
                onChangeText={setPassword}
                mode="outlined"
                secureTextEntry={!showPassword}
                style={styles.input}
                editable={!loading}
                left={<TextInput.Icon icon="lock-outline" color="#5c6bc0" />}
                right={
                  <TextInput.Icon
                    icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    onPress={() => setShowPassword(!showPassword)}
                    color="#5c6bc0"
                  />
                }
                outlineColor="#9fa8da"
                activeOutlineColor="#5c6bc0"
                theme={{ colors: { background: '#ffffff' } }}
              />

              <Button
                mode="contained"
                onPress={handleLogin}
                loading={loading}
                disabled={loading}
                style={styles.loginButton}
                contentStyle={styles.loginButtonContent}
                labelStyle={styles.loginButtonLabel}
                buttonColor="#5c6bc0"
              >
                {loading ? 'Signing In...' : 'Sign In'}
              </Button>

              <Button
                mode="text"
                onPress={() => navigation.navigate('ForgotPassword')}
                disabled={loading}
                style={styles.forgotButton}
                textColor="#3949ab"
                labelStyle={styles.forgotButtonLabel}
              >
                Forgot Password?
              </Button>
            </View>

            <View style={styles.footer}>
              <Text style={styles.newAccountText}>New to GConnect?</Text>
              <Button
                mode="contained"
                onPress={() => navigation.navigate('CreateGroup')}
                disabled={loading}
                style={styles.createGroupButton}
                contentStyle={styles.groupButtonContent}
                labelStyle={styles.groupButtonLabel}
                buttonColor="#5c6bc0"
                icon="account-group"
              >
                Create New Group
              </Button>
              <Button
                mode="outlined"
                onPress={() => navigation.navigate('JoinGroup')}
                disabled={loading}
                style={styles.joinGroupButton}
                contentStyle={styles.groupButtonContent}
                labelStyle={styles.joinButtonLabel}
                textColor="#3949ab"
                icon="account-plus"
              >
                Join Existing Group
              </Button>
            </View>

          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 20,
  },
logoWrapper: {
  width: 110,
  height: 110,
  borderRadius: 55,
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  backgroundColor: '#fff', // optional but makes logo pop
  shadowColor: '#3f51b5',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.3,
  shadowRadius: 5,
  elevation: 8,
},
logo: {
  width: '140%',
  height: '150%',
},
  formContainer: {
    paddingHorizontal: 30,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#1a237e',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: '#3949ab',
    textAlign: 'center',
    marginBottom: 10,
    fontSize: 20,
  },
  divider: {
    width: 60,
    height: 4,
    backgroundColor: '#5c6bc0',
    borderRadius: 2,
    marginTop: 10,
  },
  inputContainer: {
    marginBottom: 20,
  },
  input: {
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  loginButton: {
    marginTop: 10,
    borderRadius: 30,
    shadowColor: '#3f51b5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  loginButtonContent: {
    paddingVertical: 8,
  },
  loginButtonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  forgotButton: {
    marginTop: 8,
  },
  forgotButtonLabel: {
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  footer: {
    marginTop: 10,
    alignItems: 'center',
    gap: 10,
  },
  newAccountText: {
    color: '#3949ab',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  createGroupButton: {
    width: '100%',
    borderRadius: 30,
    elevation: 4,
    shadowColor: '#3f51b5',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  joinGroupButton: {
    width: '100%',
    borderRadius: 30,
    borderColor: '#3949ab',
    borderWidth: 1.5,
  },
  groupButtonContent: {
    paddingVertical: 6,
  },
  groupButtonLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  joinButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});