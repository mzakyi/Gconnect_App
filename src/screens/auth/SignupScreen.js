import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, Image } from 'react-native';
import { TextInput, Button, Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { signUp } from '../../services/authService';
import { organizationService } from '../../services/organizationService';




export default function SignupScreen({ navigation }) {
  const [formData, setFormData] = useState({
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
    orgCode: '' // ⭐ NEW
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSignup = async () => {
    // ⭐ NEW: Added orgCode validation
    if (!formData.email || !formData.password || !formData.firstName || !formData.lastName || !formData.age || !formData.orgCode || !formData.phone || !formData.occupation || !formData.location ) {
      Alert.alert('Error', 'Please fill in all required fields including organization code');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    
    try {
      // ⭐ NEW: Validate organization code first
      const orgValidation = await organizationService.validateOrgCode(formData.orgCode.trim());
      
      if (!orgValidation.success) {
        Alert.alert('Invalid Organization Code', orgValidation.error || 'Organization code not found');
        setLoading(false);
        return;
      }

      // ⭐ NEW: Pass organizationId to signup
      await signUp(formData.email.trim(), formData.password, {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        age: formData.age,
        phone: formData.phone.trim(),
        bio: formData.bio.trim(),
        location: formData.location.trim(),
        occupation: formData.occupation.trim(),
        organizationId: orgValidation.organizationId, // ⭐ NEW
        organizationName: orgValidation.organizationName, // ⭐ NEW
      });

      Alert.alert(
        'Registration Submitted',
        `Your account for ${orgValidation.organizationName} has been created and is pending admin approval. You will be able to log in once an admin approves your account.`,
        [{ 
          text: 'OK', 
          onPress: () => navigation.replace('Login')
        }]
      );
      
    } catch (err) {
      let errorMessage = 'An error occurred during signup';
      
      if (err.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      } else if (err.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      Alert.alert('Signup Failed', errorMessage);
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
              resizeMode="cover"
            />
            </View>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.headerSection}>
              <Text variant="headlineLarge" style={styles.title}>
                Join GConnect
              </Text>
              <Text variant="bodyMedium" style={styles.subtitle}>
                Your account will be reviewed by an admin before you are given access. 
              </Text>
              <View style={styles.divider} />
            </View>

            <View style={styles.inputContainer}>
              {/* ⭐ NEW: Organization Code Field - ADDED AT TOP */}
              <TextInput
                label="Organization Code *"
                value={formData.orgCode}
                onChangeText={(val) => updateField('orgCode', val)}
                mode="outlined"
                autoCapitalize="none"
                style={styles.input}
                editable={!loading}
                placeholder="Enter your org code"
                left={<TextInput.Icon icon="domain" color="#5c6bc0" />}
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
                    icon={showPassword ? "eye-off-outline" : "eye-outline"}
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
                    icon={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
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
                multiline={true}
                numberOfLines={4}
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
                onPress={handleSignup}
                loading={loading}
                disabled={loading}
                style={styles.signupButton}
                contentStyle={styles.signupButtonContent}
                labelStyle={styles.signupButtonLabel}
                buttonColor="#5c6bc0"
              >
                {loading ? 'Creating Account...' : 'Create Account'}
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
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingVertical: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 30,
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
    height: 155,
  },
  formContainer: {
    paddingHorizontal: 25,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 25,
  },
  title: {
    color: '#1a237e',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    fontSize: 28,
  },
  subtitle: {
    color: '#3949ab',
    textAlign: 'center',
    marginBottom: 12,
    fontSize: 17,
  },
  divider: {
    width: 60,
    height: 4,
    backgroundColor: '#5c6bc0',
    borderRadius: 2,
    marginTop: 8,
  },
  inputContainer: {
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  input: {
    marginBottom: 14,
    backgroundColor: '#fff',
  },
  halfInput: {
    flex: 1,
  },
  requiredNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 15,
    paddingHorizontal: 5,
  },
  requiredText: {
    color: '#3949ab',
    fontSize: 13,
    fontStyle: 'italic',
  },
  signupButton: {
    marginTop: 5,
    borderRadius: 30,
    shadowColor: '#3f51b5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  signupButtonContent: {
    paddingVertical: 8,
  },
  signupButtonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  footer: {
    marginTop: 15,
    alignItems: 'center',
  },
  loginContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginText: {
    color: '#3949ab',
    fontSize: 15,
  },
  loginButtonLabel: {
    fontSize: 15,
    fontWeight: 'bold',
  },
});