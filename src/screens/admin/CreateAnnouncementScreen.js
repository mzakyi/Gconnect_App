// src/screens/admin/CreateAnnouncementScreen.js
// CHANGES FROM ORIGINAL:
//   1. Super Users see an "Audience" selector at the top (This org / Other org / Both)
//   2. When "Both" or "Other org" is selected, the announcement is created in each
//      selected org via broadcastToOrgs() from superAdminService.
//   All original functionality is completely preserved.

import React, { useState, useContext, useEffect } from 'react';
import { useActiveOrg } from '../../context/ActiveOrgContext';
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
import { AuthContext } from '../../context/AuthContext';
import { createAnnouncement } from '../../services/announcementService';
import { getAllAdminOrgsForUser, broadcastToOrgs } from '../../services/superAdminService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase.config';

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

export default function CreateAnnouncementScreen({ navigation }) {
  const { userProfile } = useContext(AuthContext);
  const { activeOrgId: organizationId } = useActiveOrg();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState('normal');
  const [category, setCategory] = useState('general');
  const [links, setLinks] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  // ── NEW: broadcast state ──────────────────────────────────────
  const [allAdminOrgs, setAllAdminOrgs] = useState([]);   // [{id, name}]
  const [selectedOrgIds, setSelectedOrgIds] = useState(
    organizationId ? [organizationId] : []
  );
  const isSuperAdmin = userProfile?.isSuperAdmin === true;
  // ─────────────────────────────────────────────────────────────

  // ── NEW: load orgs for Super User ───────────────────────────
  useEffect(() => {
    if (!isSuperAdmin || !userProfile?.uid || !organizationId) return;

    const loadOrgs = async () => {
      try {
        // Current org name
        const currentSnap = await getDoc(doc(db, 'organizations', organizationId));
        const currentName = currentSnap.exists()
          ? currentSnap.data().name || currentSnap.data().organizationName || 'Your Org'
          : 'Your Org';

        const extraOrgs = await getAllAdminOrgsForUser(userProfile.uid);
        const all = [
          { id: organizationId, name: currentName },
          ...extraOrgs.filter((o) => o.id !== organizationId),
        ];
        setAllAdminOrgs(all);
        setSelectedOrgIds([organizationId]); // default: current org only
      } catch (e) {
        console.error('Failed to load orgs:', e);
      }
    };
    loadOrgs();
  }, [isSuperAdmin, userProfile?.uid, organizationId]);

  const toggleOrgSelection = (orgId) => {
    setSelectedOrgIds((prev) =>
      prev.includes(orgId) ? prev.filter((id) => id !== orgId) : [...prev, orgId]
    );
  };
  // ─────────────────────────────────────────────────────────────

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

  const validateForm = () => {
    if (!title.trim()) { Alert.alert('Validation Error', 'Please enter a title'); return false; }
    if (!content.trim()) { Alert.alert('Validation Error', 'Please enter content'); return false; }
    // ── NEW ──
    if (selectedOrgIds.length === 0) { Alert.alert('Validation Error', 'Please select at least one organization.'); return false; }
    return true;
  };

  const pickImage = async () => {
    const hasPermission = await requestImagePermission();
    if (!hasPermission) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (files.length >= 5) { Alert.alert('Limit Exceeded', 'You can only attach up to 5 files'); return; }
        setFiles([...files, { uri: asset.uri, name: `image_${Date.now()}.jpg`, type: 'image/jpeg', mimeType: 'image/jpeg', isImage: true }]);
      }
    } catch (error) { Alert.alert('Error', 'Failed to pick image'); }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        if (files.length >= 5) { Alert.alert('Limit Exceeded', 'You can only attach up to 5 files'); return; }
        setFiles([...files, { uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/pdf', mimeType: asset.mimeType || 'application/pdf', size: asset.size, isImage: false }]);
      }
    } catch (error) { Alert.alert('Error', 'Failed to pick document'); }
  };

  const handleRemoveFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleCreateAnnouncement = async () => {
    if (!validateForm()) return;
    if (!organizationId) {
      Alert.alert('Error', 'Organization not found. Please try logging in again.');
      return;
    }

    setLoading(true);
    try {
      const linksArray = links.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
      const announcementData = {
        title: title.trim(),
        content: content.trim(),
        priority,
        category,
        links: linksArray,
        author: {
          uid: userProfile.uid,
          name: userProfile.displayName || userProfile.email,
          email: userProfile.email,
        },
      };
      const filesToUpload = files.map((f) => ({ uri: f.uri, name: f.name, type: f.mimeType || f.type }));

      // ── NEW: broadcast or single-org post ───────────────────
      if (selectedOrgIds.length > 1) {
        await broadcastToOrgs(selectedOrgIds, (orgId) =>
          createAnnouncement(announcementData, filesToUpload, orgId)
        );
        Alert.alert(
          'Success',
          `Announcement sent to ${selectedOrgIds.length} organizations!`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        await createAnnouncement(announcementData, filesToUpload, selectedOrgIds[0] || organizationId);
        Alert.alert('Success', 'Announcement created successfully', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      }
      // ───────────────────────────────────────────────────────
    } catch (error) {
      console.error('Error creating announcement:', error);
      Alert.alert('Error', 'Failed to create announcement. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return mb < 1 ? `${(bytes / 1024).toFixed(1)} KB` : `${mb.toFixed(1)} MB`;
  };

  if (!organizationId) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#6366F1', '#4F46E5']} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
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
      <LinearGradient colors={['#6366F1', '#4F46E5']} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Announcement</Text>
          <View style={{ width: 24 }} />
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ── NEW: Audience selector — only for Super Users ── */}
          {isSuperAdmin && allAdminOrgs.length > 1 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Send To</Text>
              <Text style={styles.audienceSubtitle}>
                Select which organizations receive this announcement
              </Text>
              <View style={styles.orgChipsRow}>
                {allAdminOrgs.map((org) => {
                  const selected = selectedOrgIds.includes(org.id);
                  return (
                    <TouchableOpacity
                      key={org.id}
                      style={[styles.orgChip, selected && styles.orgChipSelected]}
                      onPress={() => toggleOrgSelection(org.id)}
                    >
                      <MaterialCommunityIcons
                        name={selected ? 'check-circle' : 'circle-outline'}
                        size={18}
                        color={selected ? '#6366F1' : '#94A3B8'}
                      />
                      <Text style={[styles.orgChipText, selected && styles.orgChipTextSelected]}>
                        {org.name}
                        {org.id === organizationId ? ' (Home)' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {selectedOrgIds.length > 1 && (
                <View style={styles.broadcastBanner}>
                  <MaterialCommunityIcons name="broadcast" size={16} color="#6366F1" />
                  <Text style={styles.broadcastBannerText}>
                    This will be sent to {selectedOrgIds.length} organizations
                  </Text>
                </View>
              )}
            </View>
          )}
          {/* ─────────────────────────────────────────────────── */}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Basic Information</Text>
            <TextInput label="Title *" value={title} onChangeText={setTitle} mode="outlined" style={styles.input} outlineColor="#E2E8F0" activeOutlineColor="#6366F1" maxLength={100} placeholder="Enter announcement title" />
            <HelperText type="info">{title.length}/100 characters</HelperText>
            <TextInput label="Content *" value={content} onChangeText={setContent} mode="outlined" multiline numberOfLines={6} style={[styles.input, styles.textArea]} outlineColor="#E2E8F0" activeOutlineColor="#6366F1" placeholder="Enter announcement details" />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Priority Level</Text>
            <View style={styles.chipsContainer}>
              {PRIORITIES.map((item) => (
                <Chip key={item.value} selected={priority === item.value} onPress={() => setPriority(item.value)}
                  style={[styles.chip, priority === item.value && { backgroundColor: item.color + '20', borderColor: item.color }]}
                  textStyle={[styles.chipText, priority === item.value && { color: item.color }]}
                  icon={item.icon}>{item.label}</Chip>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Category</Text>
            <View style={styles.chipsContainer}>
              {CATEGORIES.map((item) => (
                <Chip key={item.value} selected={category === item.value} onPress={() => setCategory(item.value)}
                  style={[styles.chip, category === item.value && styles.chipSelected]}
                  textStyle={[styles.chipText, category === item.value && styles.chipTextSelected]}
                  icon={item.icon}>{item.label}</Chip>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Attachments (Optional)</Text>
            <View style={styles.attachmentButtons}>
              <Button mode="outlined" icon="image" onPress={pickImage} style={styles.attachButton} textColor="#6366F1" disabled={files.length >= 5}>Add Image</Button>
              <Button mode="outlined" icon="file-pdf-box" onPress={pickDocument} style={styles.attachButton} textColor="#DC2626" disabled={files.length >= 5}>Add PDF</Button>
            </View>
            {files.length > 0 && (
              <View style={styles.filesList}>
                {files.map((file, index) => (
                  <Surface key={index} style={styles.fileItem} elevation={1}>
                    {file.isImage || file.mimeType?.startsWith('image/') ? (
                      <Image source={{ uri: file.uri }} style={styles.fileThumbnail} />
                    ) : (
                      <View style={styles.pdfThumbnail}><MaterialCommunityIcons name="file-pdf-box" size={32} color="#DC2626" /></View>
                    )}
                    <View style={styles.fileInfo}>
                      <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                      {file.size && <Text style={styles.fileSize}>{formatFileSize(file.size)}</Text>}
                    </View>
                    <IconButton icon="close" size={20} iconColor="#DC2626" onPress={() => handleRemoveFile(index)} />
                  </Surface>
                ))}
              </View>
            )}
            <HelperText type="info">Add event posters, flyers, or documents. Max 5 files.</HelperText>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Related Links (Optional)</Text>
            <TextInput label="Links (One per line)" value={links} onChangeText={setLinks} mode="outlined" multiline numberOfLines={4} style={[styles.input, styles.textArea]} outlineColor="#E2E8F0" activeOutlineColor="#6366F1" placeholder="https://example.com" />
            <HelperText type="info">Add relevant URLs, one per line</HelperText>
          </View>

          <View style={styles.buttonContainer}>
            <Button mode="outlined" onPress={() => navigation.goBack()} style={styles.cancelButton} textColor="#64748B">Cancel</Button>
            <Button mode="contained" onPress={handleCreateAnnouncement} loading={loading} disabled={loading} style={styles.publishButton} buttonColor="#6366F1">
              {selectedOrgIds.length > 1 ? 'Broadcast' : 'Publish'}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#fff', letterSpacing: -0.5 },
  keyboardView: { flex: 1 },
  content: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  section: { padding: 20, backgroundColor: '#fff', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 16 },
  // ── NEW ──
  audienceSubtitle: { fontSize: 13, color: '#64748B', marginBottom: 12, marginTop: -10 },
  orgChipsRow: { gap: 8 },
  orgChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12,
    backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0', marginBottom: 4,
  },
  orgChipSelected: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
  orgChipText: { fontSize: 14, color: '#64748B', fontWeight: '500', flex: 1 },
  orgChipTextSelected: { color: '#6366F1', fontWeight: '700' },
  broadcastBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#EEF2FF', borderRadius: 8, padding: 10, marginTop: 10,
  },
  broadcastBannerText: { fontSize: 13, color: '#6366F1', fontWeight: '600' },
  // ─────────
  input: { marginBottom: 4, backgroundColor: '#fff' },
  textArea: { minHeight: 120 },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  chipSelected: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  chipText: { color: '#64748B', fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
  filesList: { marginBottom: 16, gap: 8 },
  fileItem: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#F8FAFC', borderRadius: 12, gap: 12 },
  fileThumbnail: { width: 60, height: 60, borderRadius: 8 },
  pdfThumbnail: { width: 60, height: 60, borderRadius: 8, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '600', color: '#1E293B', marginBottom: 2 },
  fileSize: { fontSize: 12, color: '#64748B' },
  attachButton: { flex: 1 },
  attachmentButtons: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  buttonContainer: { flexDirection: 'row', padding: 20, gap: 12 },
  cancelButton: { flex: 1, borderColor: '#E2E8F0' },
  publishButton: { flex: 1 },
});