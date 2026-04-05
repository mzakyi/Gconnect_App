// src/screens/auth/CreateGroupScreen.js
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Image,
} from 'react-native';
import { TextInput, Button, Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { organizationService } from '../../services/organizationService';
import { signUp } from '../../services/authService';
import { sendOrgCodeEmail } from '../../services/emailService'; // ✅ ADDED

export default function CreateGroupScreen({ navigation }) {
  const [formData, setFormData] = useState({
    groupName: '',
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    age: '',
    phone: '',
    bio: '',
    location: '',
    occupation: '',
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCreateGroup = async () => {
    const {
      groupName, email, password, confirmPassword,
      firstName, lastName, age, phone, location, occupation,
    } = formData;

    if (!groupName || !email || !password || !firstName || !lastName || !age || !phone || !location || !occupation) {
      Alert.alert('Missing Fields', 'Please fill in all required fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      // 💳 PAYMENT HOOK: Add Stripe checkout here before signUp in the future.

      const rawGroupName = groupName.trim();

      const result = await signUp(email.trim(), password, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        age,
        phone: phone.trim(),
        bio: formData.bio.trim(),
        location: location.trim(),
        occupation: occupation.trim(),
        groupName: rawGroupName,
        organizationName: rawGroupName,
      });

      // ✅ SEND THE ORG CODE EMAIL
      // Runs after signUp succeeds. If email fails we still navigate to
      // GroupSuccess — the code is shown on screen anyway so the user
      // is never stuck without their code.
      try {
        await sendOrgCodeEmail(
          email.trim(),                              // who to send to
          `${firstName.trim()} ${lastName.trim()}`,  // their full name
          result.orgCode,                            // the 4-digit code
          result.organizationName || rawGroupName,   // the group name
        );
        console.log('✅ Org code email sent to:', email.trim());
      } catch (emailErr) {
        // Non-fatal — log it but don't block navigation
        console.warn('⚠️ Email send failed (non-fatal):', emailErr?.text || emailErr);
      }

      navigation.replace('GroupSuccess', {
        orgCode: result.orgCode,
        groupName: result.organizationName || rawGroupName,
        organizationId: result.organizationId,
      });

    } catch (err) {
      let errorMessage = 'An error occurred. Please try again.';
      if (err.code === 'auth/email-already-in-use' || err.message?.includes('email-already-in-use')) {
        errorMessage = 'This email is already registered';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      } else if (err.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak';
      } else if (err.message) {
        errorMessage = err.message;
      }
      Alert.alert('Error', errorMessage);
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
                Create a Group
              </Text>
              <Text variant="bodyMedium" style={styles.subtitle}>
                You'll be the admin. Share your group code with others to invite them.
              </Text>
              <View style={styles.divider} />
            </View>

            <View style={styles.inputContainer}>

              <TextInput
                label="Group Name *"
                value={formData.groupName}
                onChangeText={(val) => updateField('groupName', val)}
                mode="outlined"
                style={styles.input}
                editable={!loading}
                placeholder="e.g. Orlando Runners Club"
                left={<TextInput.Icon icon="account-group" color="#5c6bc0" />}
                outlineColor="#9fa8da"
                activeOutlineColor="#5c6bc0"
                theme={{ colors: { background: '#ffffff' } }}
              />

              <View style={styles.row}>
                <TextInput
                  label="First Name *"
                  value={formData.firstName}
                  onChangeText={(val) => updateField('firstName', val)}
                  mode="outlined"
                  style={[styles.input, styles.halfInput]}
                  editable={!loading}
                  left={<TextInput.Icon icon="account-outline" color="#5c6bc0" />}
                  outlineColor="#9fa8da"
                  activeOutlineColor="#5c6bc0"
                  theme={{ colors: { background: '#ffffff' } }}
                />
                <TextInput
                  label="Last Name *"
                  value={formData.lastName}
                  onChangeText={(val) => updateField('lastName', val)}
                  mode="outlined"
                  style={[styles.input, styles.halfInput]}
                  editable={!loading}
                  outlineColor="#9fa8da"
                  activeOutlineColor="#5c6bc0"
                  theme={{ colors: { background: '#ffffff' } }}
                />
              </View>

              <TextInput
                label="Email *"
                value={formData.email}
                onChangeText={(val) => updateField('email', val)}
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
                label="Phone Number *"
                value={formData.phone}
                onChangeText={(val) => updateField('phone', val)}
                mode="outlined"
                keyboardType="phone-pad"
                style={styles.input}
                editable={!loading}
                placeholder="(123) 456-7890"
                left={<TextInput.Icon icon="phone-outline" color="#5c6bc0" />}
                outlineColor="#9fa8da"
                activeOutlineColor="#5c6bc0"
                theme={{ colors: { background: '#ffffff' } }}
              />

              <TextInput
                label="Password *"
                value={formData.password}
                onChangeText={(val) => updateField('password', val)}
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

              <TextInput
                label="Confirm Password *"
                value={formData.confirmPassword}
                onChangeText={(val) => updateField('confirmPassword', val)}
                mode="outlined"
                secureTextEntry={!showConfirmPassword}
                style={styles.input}
                editable={!loading}
                left={<TextInput.Icon icon="lock-check-outline" color="#5c6bc0" />}
                right={
                  <TextInput.Icon
                    icon={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    color="#5c6bc0"
                  />
                }
                outlineColor="#9fa8da"
                activeOutlineColor="#5c6bc0"
                theme={{ colors: { background: '#ffffff' } }}
              />

              <View style={styles.row}>
                <TextInput
                  label="Age *"
                  value={formData.age}
                  onChangeText={(val) => updateField('age', val)}
                  mode="outlined"
                  keyboardType="numeric"
                  style={[styles.input, styles.halfInput]}
                  editable={!loading}
                  left={<TextInput.Icon icon="calendar-outline" color="#5c6bc0" />}
                  outlineColor="#9fa8da"
                  activeOutlineColor="#5c6bc0"
                  theme={{ colors: { background: '#ffffff' } }}
                />
                <TextInput
                  label="Location *"
                  value={formData.location}
                  onChangeText={(val) => updateField('location', val)}
                  mode="outlined"
                  style={[styles.input, styles.halfInput]}
                  editable={!loading}
                  placeholder="City, State"
                  left={<TextInput.Icon icon="map-marker-outline" color="#5c6bc0" />}
                  outlineColor="#9fa8da"
                  activeOutlineColor="#5c6bc0"
                  theme={{ colors: { background: '#ffffff' } }}
                />
              </View>

              <TextInput
                label="Occupation *"
                value={formData.occupation}
                onChangeText={(val) => updateField('occupation', val)}
                mode="outlined"
                style={styles.input}
                editable={!loading}
                placeholder="What you do"
                left={<TextInput.Icon icon="briefcase-outline" color="#5c6bc0" />}
                outlineColor="#9fa8da"
                activeOutlineColor="#5c6bc0"
                theme={{ colors: { background: '#ffffff' } }}
              />

              <TextInput
                label="Bio (Optional)"
                value={formData.bio}
                onChangeText={(val) => updateField('bio', val)}
                mode="outlined"
                multiline
                numberOfLines={3}
                style={styles.input}
                editable={!loading}
                placeholder="Tell us about yourself"
                left={<TextInput.Icon icon="text-outline" color="#5c6bc0" />}
                outlineColor="#9fa8da"
                activeOutlineColor="#5c6bc0"
                theme={{ colors: { background: '#ffffff' } }}
              />

              <View style={styles.requiredNote}>
                <MaterialCommunityIcons name="information-outline" size={16} color="#3949ab" />
                <Text style={styles.requiredText}>* Required fields</Text>
              </View>

              <Button
                mode="contained"
                onPress={handleCreateGroup}
                loading={loading}
                disabled={loading}
                style={styles.createButton}
                contentStyle={styles.createButtonContent}
                labelStyle={styles.createButtonLabel}
                buttonColor="#5c6bc0"
              >
                {loading ? 'Creating Group...' : 'Create Group'}
              </Button>

              <View style={styles.footer}>
                <View style={styles.loginContainer}>
                  <Text style={styles.loginText}>Already have an account? </Text>
                  <Button
                    mode="text"
                    onPress={() => navigation.navigate('Login')}
                    disabled={loading}
                    textColor="#FF6B35"
                    labelStyle={styles.loginButtonLabel}
                    compact
                  >
                    Login
                  </Button>
                </View>
              </View>

            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingVertical: 40 },
  logoContainer: { alignItems: 'center', marginBottom: 20, marginTop: 30 },
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
  },
  logo: { width: 155, height: 200 },
  formContainer: { paddingHorizontal: 25 },
  headerSection: { alignItems: 'center', marginBottom: 25 },
  title: { color: '#1a237e', fontWeight: 'bold', textAlign: 'center', marginBottom: 8, fontSize: 28 },
  subtitle: { color: '#3949ab', textAlign: 'center', marginBottom: 12, fontSize: 15, paddingHorizontal: 10 },
  divider: { width: 60, height: 4, backgroundColor: '#5c6bc0', borderRadius: 2, marginTop: 8 },
  inputContainer: { marginBottom: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  input: { marginBottom: 14, backgroundColor: '#fff' },
  halfInput: { flex: 1 },
  requiredNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 15, paddingHorizontal: 5 },
  requiredText: { color: '#3949ab', fontSize: 13, fontStyle: 'italic' },
  createButton: { marginTop: 5, borderRadius: 30, shadowColor: '#3f51b5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },
  createButtonContent: { paddingVertical: 8 },
  createButtonLabel: { fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
  footer: { marginTop: 15, alignItems: 'center' },
  loginContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  loginText: { color: '#3949ab', fontSize: 15 },
  loginButtonLabel: { fontSize: 15, fontWeight: 'bold' },
});