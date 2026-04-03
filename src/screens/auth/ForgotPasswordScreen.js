import React, { useState } from 'react';
import { View, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { TextInput, Button, Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { resetPassword } from '../../services/authService';

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleResetPassword = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }

    setLoading(true);
    
    try {
      await resetPassword(email.trim());
      Alert.alert(
        'Success', 
        'Password reset email sent! Check your inbox.',
        [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
      );
    } catch (err) {
      Alert.alert('Error', err.message);
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
                source={require('../../../assets/sankatos.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.headerSection}>
              <Text variant="headlineLarge" style={styles.title}>
                Reset Password
              </Text>
              <Text variant="bodyMedium" style={styles.subtitle}>
                Enter your email and we'll send you a reset link
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
                theme={{
                  colors: {
                    background: '#ffffff',
                  }
                }}
              />

              <Button 
                mode="contained" 
                onPress={handleResetPassword}
                loading={loading}
                disabled={loading}
                style={styles.resetButton}
                contentStyle={styles.resetButtonContent}
                labelStyle={styles.resetButtonLabel}
                buttonColor="#5c6bc0"
              >
                {loading ? 'Sending...' : 'Send Reset Email'}
              </Button>

              <View style={styles.footer}>
                <View style={styles.backContainer}>
                  <MaterialCommunityIcons name="arrow-left" size={18} color="#3949ab" />
                  <Button 
                    mode="text" 
                    onPress={() => navigation.navigate('Login')}
                    disabled={loading}
                    textColor="#3949ab"
                    labelStyle={styles.backButtonLabel}
                    compact
                  >
                    Back to Login
                  </Button>
                </View>
              </View>

              <View style={styles.infoBox}>
                <MaterialCommunityIcons name="information-outline" size={20} color="#5c6bc0" />
                <Text style={styles.infoText}>
                  You'll receive an email with instructions to reset your password. 
                  Please check your spam folder if you don't see it.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

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
  borderRadius: 60,
  shadowColor: '#3f51b5',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.3,
  shadowRadius: 5,
  elevation: 8,
  width: 100,
  height: 90,
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  borderWidth: 0,
  borderColor: '#5c6bc0',
  },
  logo: {
    width: 155,
    height: 200,
  },
  formContainer: {
    paddingHorizontal: 30,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    color: '#1a237e',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    color: '#3949ab',
    textAlign: 'center',
    marginBottom: 15,
    fontSize: 20,
    paddingHorizontal: 20,
    lineHeight: 22,
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
    marginBottom: 20,
    backgroundColor: '#fff',
  },
  resetButton: {
    marginTop: 5,
    borderRadius: 30,
    shadowColor: '#3f51b5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  resetButtonContent: {
    paddingVertical: 8,
  },
  resetButtonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
  },
  backContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 15,
    marginTop: 25,
    borderLeftWidth: 4,
    borderLeftColor: '#5c6bc0',
    shadowColor: '#3f51b5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoText: {
    flex: 1,
    marginLeft: 10,
    color: '#3949ab',
    fontSize: 13,
    lineHeight: 20,
  },
});