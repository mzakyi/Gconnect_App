// src/screens/admin/UploadLogoScreen.js
import React, { useState, useEffect, useContext } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Alert, Image, ActivityIndicator
} from 'react-native';
import { Text, Button } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AuthContext } from '../../context/AuthContext';
import { organizationService } from '../../services/organizationService';

export default function UploadLogoScreen({ navigation }) {
  const { organizationId } = useContext(AuthContext);
  const [currentLogoUrl, setCurrentLogoUrl] = useState(null);
  const [newImageUri, setNewImageUri]       = useState(null);
  const [uploading, setUploading]           = useState(false);
  const [loadingCurrent, setLoadingCurrent] = useState(true);

  // Load the org's existing logo when screen opens
  useEffect(() => {
    const fetchLogo = async () => {
      const url = await organizationService.getOrgLogo(organizationId);
      setCurrentLogoUrl(url);
      setLoadingCurrent(false);
    };
    if (organizationId) fetchLogo();
  }, [organizationId]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access to upload a logo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],   // Square crop — looks best as a logo
      quality: 0.8,
    });

    if (!result.canceled) {
      setNewImageUri(result.assets[0].uri);
    }
  };

  const handleUpload = async () => {
    if (!newImageUri) {
      Alert.alert('No image selected', 'Please pick an image first.');
      return;
    }

    setUploading(true);
    const result = await organizationService.uploadOrgLogo(organizationId, newImageUri);
    setUploading(false);

    if (result.success) {
      setCurrentLogoUrl(result.logoUrl);
      setNewImageUri(null);
      Alert.alert(
        'Logo Updated!',
        'Your organization logo has been updated. All members will see it the next time they load the home screen.',
        [{ text: 'Done', onPress: () => navigation.goBack() }]
      );
    } else {
      Alert.alert('Upload Failed', result.error || 'Something went wrong. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient colors={['#667EEA', '#764BA2']} style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Organization Logo</Text>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      <View style={styles.content}>
        {/* Current logo */}
        <Text style={styles.sectionLabel}>Current Logo</Text>
        <View style={styles.logoPreviewContainer}>
          {loadingCurrent ? (
            <ActivityIndicator size="large" color="#667EEA" />
          ) : currentLogoUrl ? (
            <Image source={{ uri: currentLogoUrl }} style={styles.logoPreview} resizeMode="contain" />
          ) : (
            <View style={styles.logoPlaceholder}>
              <MaterialCommunityIcons name="image-off-outline" size={48} color="#B0BEC5" />
              <Text style={styles.placeholderText}>No logo set yet</Text>
            </View>
          )}
        </View>

        {/* New image preview */}
        {newImageUri && (
          <>
            <Text style={styles.sectionLabel}>New Logo Preview</Text>
            <View style={styles.logoPreviewContainer}>
              <Image source={{ uri: newImageUri }} style={styles.logoPreview} resizeMode="contain" />
            </View>
          </>
        )}

        {/* Pick button */}
        <TouchableOpacity style={styles.pickButton} onPress={pickImage} disabled={uploading}>
          <MaterialCommunityIcons name="image-plus" size={22} color="#667EEA" />
          <Text style={styles.pickButtonText}>
            {newImageUri ? 'Choose a different image' : 'Choose image from library'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          For best results use a square image (1:1 ratio). PNG or JPG, under 5 MB.
        </Text>

        {/* Upload button — only shown when a new image is chosen */}
        {newImageUri && (
          <Button
            mode="contained"
            onPress={handleUpload}
            loading={uploading}
            disabled={uploading}
            style={styles.uploadButton}
            contentStyle={styles.uploadButtonContent}
            labelStyle={styles.uploadButtonLabel}
            buttonColor="#667EEA"
            icon="cloud-upload"
          >
            {uploading ? 'Uploading...' : 'Save Logo'}
          </Button>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingTop: 55,
    paddingBottom: 18,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#78909C',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
    marginTop: 8,
  },
  logoPreviewContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    height: 180,
    marginBottom: 24,
    shadowColor: '#667EEA',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  logoPreview: {
    width: 140,
    height: 140,
    borderRadius: 12,
  },
  logoPlaceholder: {
    alignItems: 'center',
    gap: 8,
  },
  placeholderText: {
    color: '#B0BEC5',
    fontSize: 14,
  },
  pickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#667EEA',
    borderStyle: 'dashed',
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  pickButtonText: {
    color: '#667EEA',
    fontSize: 15,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    color: '#B0BEC5',
    marginBottom: 28,
    lineHeight: 18,
  },
  uploadButton: {
    borderRadius: 12,
    shadowColor: '#667EEA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  uploadButtonContent: {
    paddingVertical: 6,
  },
  uploadButtonLabel: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});