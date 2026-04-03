import React, { useState, useContext } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  HelperText,
  Chip,
  IconButton,
  Surface,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { updateAnnouncement, addAttachmentToAnnouncement, removeAttachmentFromAnnouncement } from '../../services/announcementService';
import { AuthContext } from '../../context/AuthContext';

const PRIORITIES = [
  { label: 'Normal', value: 'normal', icon: 'bell', color: '#3B82F6' },
  { label: 'Low', value: 'low', icon: 'information', color: '#059669' },
  { label: 'High', value: 'high', icon: 'alert', color: '#EA580C' },
  { label: 'Urgent', value: 'urgent', icon: 'alert-circle', color: '#DC2626' },
];

const CATEGORIES = [
  { label: 'General', value: 'general', icon: 'bullhorn' },
  { label: 'Event', value: 'event', icon: 'calendar-star' },
  { label: 'Academic', value: 'academic', icon: 'school' },
  { label: 'Sports', value: 'sports', icon: 'basketball' },
  { label: 'Urgent', value: 'urgent', icon: 'alert-circle' },
];

export default function EditAnnouncementScreen({ navigation, route }) {
  const { announcement } = route.params;
  const { organizationId } = useContext(AuthContext);


  // Initialize form with existing announcement data
  const [title, setTitle] = useState(announcement.title || '');
  const [content, setContent] = useState(announcement.content || '');
  const [priority, setPriority] = useState(announcement.priority || 'normal');
  const [category, setCategory] = useState(announcement.category || 'general');
  const [links, setLinks] = useState(announcement.links?.join('\n') || '');
  const [attachments, setAttachments] = useState(announcement.attachments || []);
  const [loading, setLoading] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const validateForm = () => {
    if (!title.trim()) {
      Alert.alert('Validation Error', 'Please enter a title');
      return false;
    }
    if (!content.trim()) {
      Alert.alert('Validation Error', 'Please enter content');
      return false;
    }
    return true;
  };

  const requestImagePermission = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Sorry, we need access to your photos.');
        return false;
      }
    }
    return true;
  };

  const pickImage = async () => {
    const hasPermission = await requestImagePermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setUploadingAttachment(true);
        const asset = result.assets[0];
        
        // ⭐ UPDATED: Pass organizationId
        const fileData = await addAttachmentToAnnouncement(announcement.id, {
          uri: asset.uri,
          name: `image_${Date.now()}.jpg`,
          type: 'image/jpeg',
        }, organizationId);

        if (fileData) {
          setAttachments([...attachments, fileData]);
          Alert.alert('Success', 'Image uploaded successfully');
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to upload image');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        setUploadingAttachment(true);
        const asset = result.assets[0];

        const fileData = await addAttachmentToAnnouncement(announcement.id, {
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || 'application/pdf',
        }, organizationId);

        if (fileData) {
          setAttachments([...attachments, fileData]);
          Alert.alert('Success', 'PDF uploaded successfully');
        }
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to upload PDF');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleRemoveAttachment = async (attachment, index) => {
    Alert.alert(
      'Remove Attachment',
      'Are you sure you want to remove this attachment?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              if (attachment.storagePath) {
                // ⭐ UPDATED: Pass organizationId
                await removeAttachmentFromAnnouncement(announcement.id, attachment.storagePath, organizationId);
              }
              const newAttachments = attachments.filter((_, i) => i !== index);
              setAttachments(newAttachments);
              Alert.alert('Success', 'Attachment removed');
            } catch (error) {
              console.error('Error removing attachment:', error);
              Alert.alert('Error', 'Failed to remove attachment');
            }
          },
        },
      ]
    );
  };

  const handleUpdateAnnouncement = async () => {
      if (!validateForm()) return;

      // ⭐ NEW: Check for organizationId
      if (!organizationId) {
        Alert.alert('Error', 'Organization not found. Please try logging in again.');
        return;
      }

      setLoading(true);
    try {
      // Parse links
      const linksArray = links
        .split('\n')
        .map(link => link.trim())
        .filter(link => link.length > 0);

      // Prepare update data
      const updateData = {
        title: title.trim(),
        content: content.trim(),
        priority,
        category,
        links: linksArray,
        // Don't include attachments in the update - they're handled separately
      };

      // ⭐ UPDATED: Pass organizationId
      await updateAnnouncement(announcement.id, updateData, organizationId);

      Alert.alert('Success', 'Announcement updated successfully', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      console.error('Error updating announcement:', error);
      Alert.alert('Error', 'Failed to update announcement. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return mb < 1 ? `${(bytes / 1024).toFixed(1)} KB` : `${mb.toFixed(1)} MB`;
  };

  // ⭐ NEW: Show loading if no orgId
  if (!organizationId) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#6366F1', '#4F46E5']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Loading...</Text>
            <View style={{ width: 24 }} />
          </View>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#6366F1', '#4F46E5']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Announcement</Text>
          <View style={{ width: 24 }} />
        </View>
      </LinearGradient>

      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView 
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Basic Information</Text>

            <TextInput
              label="Title *"
              value={title}
              onChangeText={setTitle}
              mode="outlined"
              style={styles.input}
              outlineColor="#E2E8F0"
              activeOutlineColor="#6366F1"
              maxLength={100}
            />
            <HelperText type="info">
              {title.length}/100 characters
            </HelperText>

            <TextInput
              label="Content *"
              value={content}
              onChangeText={setContent}
              mode="outlined"
              multiline
              numberOfLines={10}
              style={[styles.input, styles.textArea]}
              outlineColor="#E2E8F0"
              activeOutlineColor="#6366F1"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Priority Level</Text>
            <View style={styles.chipsContainer}>
              {PRIORITIES.map((item) => (
                <Chip
                  key={item.value}
                  selected={priority === item.value}
                  onPress={() => setPriority(item.value)}
                  style={[
                    styles.chip,
                    priority === item.value && { backgroundColor: item.color + '20', borderColor: item.color },
                  ]}
                  textStyle={[
                    styles.chipText,
                    priority === item.value && { color: item.color },
                  ]}
                  icon={item.icon}
                >
                  {item.label}
                </Chip>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Category</Text>
            <View style={styles.chipsContainer}>
              {CATEGORIES.map((item) => (
                <Chip
                  key={item.value}
                  selected={category === item.value}
                  onPress={() => setCategory(item.value)}
                  style={[
                    styles.chip,
                    category === item.value && styles.chipSelected,
                  ]}
                  textStyle={[
                    styles.chipText,
                    category === item.value && styles.chipTextSelected,
                  ]}
                  icon={item.icon}
                >
                  {item.label}
                </Chip>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Attachments</Text>
            
            {attachments.length > 0 && (
              <View style={styles.attachmentsList}>
                {attachments.map((attachment, index) => (
                  <Surface key={index} style={styles.attachmentItem} elevation={1}>
                    {attachment.fileType?.startsWith('image/') ? (
                      <Image 
                        source={{ uri: attachment.downloadURL }} 
                        style={styles.attachmentThumbnail}
                      />
                    ) : (
                      <View style={styles.pdfThumbnail}>
                        <MaterialCommunityIcons name="file-pdf-box" size={32} color="#DC2626" />
                      </View>
                    )}
                    <View style={styles.attachmentInfo}>
                      <Text style={styles.attachmentName} numberOfLines={1}>
                        {attachment.fileName}
                      </Text>
                      {attachment.fileSize && (
                        <Text style={styles.attachmentSize}>
                          {formatFileSize(attachment.fileSize)}
                        </Text>
                      )}
                    </View>
                    <IconButton
                      icon="close"
                      size={20}
                      iconColor="#DC2626"
                      onPress={() => handleRemoveAttachment(attachment, index)}
                    />
                  </Surface>
                ))}
              </View>
            )}

            <View style={styles.attachmentButtons}>
              <Button
                mode="outlined"
                icon="image"
                onPress={pickImage}
                loading={uploadingAttachment}
                disabled={uploadingAttachment || attachments.length >= 5}
                style={styles.attachButton}
                textColor="#6366F1"
              >
                {uploadingAttachment ? 'Uploading...' : 'Add Image'}
              </Button>
              <Button
                mode="outlined"
                icon="file-pdf-box"
                onPress={pickDocument}
                loading={uploadingAttachment}
                disabled={uploadingAttachment || attachments.length >= 5}
                style={styles.attachButton}
                textColor="#DC2626"
              >
                {uploadingAttachment ? 'Uploading...' : 'Add PDF'}
              </Button>
            </View>
            <HelperText type="info">
              Add images or PDFs. Max 5 files, 10MB each.
            </HelperText>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Related Links</Text>

            <TextInput
              label="Links (One per line)"
              value={links}
              onChangeText={setLinks}
              mode="outlined"
              multiline
              numberOfLines={6}
              style={[styles.input, styles.textArea]}
              outlineColor="#E2E8F0"
              activeOutlineColor="#6366F1"
              placeholder="https://example.com&#10;https://docs.google.com/..."
            />
            <HelperText type="info">
              Add relevant URLs, one per line
            </HelperText>
          </View>

          <View style={styles.buttonContainer}>
            <Button
              mode="outlined"
              onPress={() => navigation.goBack()}
              style={styles.cancelButton}
              textColor="#64748B"
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleUpdateAnnouncement}
              loading={loading}
              disabled={loading}
              style={styles.updateButton}
              buttonColor="#6366F1"
            >
              Update
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.5,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  section: {
    padding: 20,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 16,
  },
  input: {
    marginBottom: 4,
    backgroundColor: '#fff',
  },
  textArea: {
    minHeight: 120,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipSelected: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  chipText: {
    color: '#64748B',
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#fff',
  },
  attachmentsList: {
    marginBottom: 16,
    gap: 8,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    gap: 12,
  },
  attachmentThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  pdfThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentInfo: {
    flex: 1,
  },
  attachmentName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
  },
  attachmentSize: {
    fontSize: 12,
    color: '#64748B',
  },
  attachmentButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  attachButton: {
    flex: 1,
  },
  buttonContainer: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    borderColor: '#E2E8F0',
  },
  updateButton: {
    flex: 1,
  },
});