import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useOrganization } from '../../context/OrganizationContext';
import { organizationService } from '../../services/organizationService';

import Colors from '../../constants/Colors';

const OrgSelectionScreen = ({ navigation, route }) => {
  const [orgCode, setOrgCode] = useState('');
  const [loading, setLoading] = useState(false);
  const { saveOrganizationId, updateOrganizationData } = useOrganization();

  // Get parameters passed from previous screen (like user email after signup)
  const { userEmail, userId } = route.params || {};

  const handleContinue = async () => {
    if (!orgCode.trim()) {
      Alert.alert('Error', 'Please enter your organization code');
      return;
    }

    setLoading(true);

    try {
      // Validate the organization code
      const result = await organizationService.validateOrgCode(orgCode.trim());

      if (result.success) {
        // Save organization ID to context and storage
        await saveOrganizationId(result.organizationId);
        
        // Save organization data
        updateOrganizationData({
          id: result.organizationId,
          name: result.organizationName,
        });

        Alert.alert(
          'Success',
          `Welcome to ${result.organizationName}!`,
          [
            {
              text: 'Continue',
              onPress: () => {
                // Navigate based on where user came from
                if (route.params?.from === 'signup') {
                  // If coming from signup, go to login or home
                  navigation.replace('Login');
                } else {
                  // If coming from login, go to home
                  navigation.replace('App');
                }
              },
            },
          ]
        );
      } else {
        Alert.alert('Invalid Code', result.error || 'Organization code not found');
      }
    } catch (error) {
      console.error('Error validating organization:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Enter Organization Code</Text>
        <Text style={styles.subtitle}>
          Enter the code provided by your organization administrator
        </Text>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Organization Code"
            placeholderTextColor="#999"
            value={orgCode}
            onChangeText={setOrgCode}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Continue</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>

        <View style={styles.helpContainer}>
          <Text style={styles.helpText}>
            Don't have an organization code?
          </Text>
          <Text style={styles.helpText}>
            Contact your administrator for access.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.primary || '#007AFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  button: {
    backgroundColor: Colors.primary || '#007AFF',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  backButton: {
    padding: 15,
    alignItems: 'center',
  },
  backButtonText: {
    color: Colors.primary || '#007AFF',
    fontSize: 16,
  },
  helpContainer: {
    marginTop: 30,
    alignItems: 'center',
  },
  helpText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 5,
  },
});

export default OrgSelectionScreen;