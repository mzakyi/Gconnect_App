// src/screens/events/CreateEventScreen.js
import React, { useState, useContext, useEffect } from 'react';
import { useActiveOrg } from '../../context/ActiveOrgContext';
import { AuthContext } from '../../context/AuthContext';
import {
  View, ScrollView, StyleSheet, Alert, TouchableOpacity,
  KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import {
  Text, TextInput, Button, HelperText, Chip, IconButton, Surface, Menu,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import { createEvent } from '../../services/eventService';
import { getAllAdminOrgsForUser, broadcastToOrgs } from '../../services/superAdminService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase.config';

const CATEGORIES = [
  { label: 'General', value: 'general', icon: 'calendar' },
  { label: 'Sports', value: 'sports', icon: 'basketball' },
  { label: 'Social', value: 'social', icon: 'account-group' },
  { label: 'Academic', value: 'academic', icon: 'school' },
  { label: 'Workshop', value: 'workshop', icon: 'tools' },
  { label: 'Meeting', value: 'meeting', icon: 'briefcase' },
];

const TIMEZONES = [
  { label: 'Eastern Time (ET)', value: 'America/New_York', abbr: 'ET' },
  { label: 'Central Time (CT)', value: 'America/Chicago', abbr: 'CT' },
  { label: 'Mountain Time (MT)', value: 'America/Denver', abbr: 'MT' },
  { label: 'Pacific Time (PT)', value: 'America/Los_Angeles', abbr: 'PT' },
  { label: 'Alaska Time (AKT)', value: 'America/Anchorage', abbr: 'AKT' },
  { label: 'Hawaii Time (HST)', value: 'Pacific/Honolulu', abbr: 'HST' },
  { label: 'Greenwich Mean Time (GMT)', value: 'GMT', abbr: 'GMT' },
  { label: 'Central European Time (CET)', value: 'Europe/Paris', abbr: 'CET' },
  { label: 'India Standard Time (IST)', value: 'Asia/Kolkata', abbr: 'IST' },
  { label: 'China Standard Time (CST)', value: 'Asia/Shanghai', abbr: 'CST' },
  { label: 'Japan Standard Time (JST)', value: 'Asia/Tokyo', abbr: 'JST' },
  { label: 'Australian Eastern Time (AET)', value: 'Australia/Sydney', abbr: 'AET' },
];

export default function CreateEventScreen({ navigation }) {
  const { user, userProfile } = useContext(AuthContext);
  const { activeOrgId: organizationId } = useActiveOrg();

  const now = new Date();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('general');
  const [eventDate, setEventDate] = useState(now);
  const [eventTime, setEventTime] = useState(now);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timezone, setTimezone] = useState('America/New_York');
  const [showTimezoneMenu, setShowTimezoneMenu] = useState(false);
  const [links, setLinks] = useState('');
  const [maxAttendees, setMaxAttendees] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  // Super admin org selector
  const [allAdminOrgs, setAllAdminOrgs] = useState([]);
  const [selectedOrgIds, setSelectedOrgIds] = useState(organizationId ? [organizationId] : []);
  const isSuperAdmin = userProfile?.isSuperAdmin === true;

  useEffect(() => {
    if (!isSuperAdmin || !userProfile?.uid || !organizationId) return;
    const loadOrgs = async () => {
      try {
        const currentSnap = await getDoc(doc(db, 'organizations', organizationId));
        const currentName = currentSnap.exists()
          ? currentSnap.data().name || 'Your Org'
          : 'Your Org';
        const extraOrgs = await getAllAdminOrgsForUser(userProfile.uid);
        const all = [
          { id: organizationId, name: currentName },
          ...extraOrgs.filter((o) => o.id !== organizationId),
        ];
        setAllAdminOrgs(all);
        setSelectedOrgIds([organizationId]);
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

  const handleDateChange = (e, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) setEventDate(selectedDate);
  };

  const handleTimeChange = (e, selectedTime) => {
    setShowTimePicker(false);
    if (selectedTime) setEventTime(selectedTime);
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setSelectedFiles([...selectedFiles, { uri: asset.uri, name: asset.name, type: asset.mimeType, size: asset.size }]);
        Alert.alert('Success', `${asset.name} added`);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const handleRemoveFile = (index) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return mb < 1 ? `${(bytes / 1024).toFixed(1)} KB` : `${mb.toFixed(1)} MB`;
  };

  const validateForm = () => {
    if (!title.trim()) { Alert.alert('Validation Error', 'Please enter an event title'); return false; }
    if (!description.trim()) { Alert.alert('Validation Error', 'Please enter a description'); return false; }
    if (!location.trim()) { Alert.alert('Validation Error', 'Please enter a location'); return false; }
    if (isSuperAdmin && selectedOrgIds.length === 0) { Alert.alert('Validation Error', 'Please select at least one organization.'); return false; }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    if (!organizationId) {
      Alert.alert('Error', 'Organization not found. Please try logging in again.');
      return;
    }
    setLoading(true);
    try {
      const combinedDateTime = new Date(
        eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(),
        eventTime.getHours(), eventTime.getMinutes()
      );
      const linksArray = links.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const eventData = {
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        category,
        eventDateTime: combinedDateTime,
        eventDate: combinedDateTime.toLocaleDateString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric' }),
        eventTime: combinedDateTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        timezone,
        links: linksArray,
        maxAttendees: maxAttendees ? parseInt(maxAttendees) : null,
        createdBy: user.uid,
        createdByName: `${userProfile.firstName} ${userProfile.lastName}`,
        status: 'upcoming',
        isActive: true,
      };

      const targetOrgs = isSuperAdmin && selectedOrgIds.length > 0 ? selectedOrgIds : [organizationId];

      if (targetOrgs.length > 1) {
        await broadcastToOrgs(targetOrgs, (orgId) => createEvent(eventData, selectedFiles, orgId));
        Alert.alert('Success', `Event created for ${targetOrgs.length} organizations!`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        await createEvent(eventData, selectedFiles, targetOrgs[0]);
        Alert.alert('Success', 'Event created successfully', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to create event: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  if (!organizationId) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#8B5CF6', '#7C3AED']} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
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
      <LinearGradient colors={['#8B5CF6', '#7C3AED']} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Event</Text>
          <View style={{ width: 24 }} />
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Org selector for super admins */}
          {isSuperAdmin && allAdminOrgs.length > 1 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Post To</Text>
              <Text style={styles.audienceSubtitle}>Select which organizations receive this event</Text>
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
                        color={selected ? '#8B5CF6' : '#94A3B8'}
                      />
                      <Text style={[styles.orgChipText, selected && styles.orgChipTextSelected]}>
                        {org.name}{org.id === organizationId ? ' (Home)' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {selectedOrgIds.length > 1 && (
                <View style={styles.broadcastBanner}>
                  <MaterialCommunityIcons name="broadcast" size={16} color="#8B5CF6" />
                  <Text style={styles.broadcastBannerText}>
                    This event will be sent to {selectedOrgIds.length} organizations
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Event Details</Text>
            <TextInput label="Event Title *" value={title} onChangeText={setTitle} mode="outlined" style={styles.input} outlineColor="#E2E8F0" activeOutlineColor="#8B5CF6" />
            <TextInput label="Description *" value={description} onChangeText={setDescription} mode="outlined" multiline numberOfLines={4} style={[styles.input, styles.textArea]} outlineColor="#E2E8F0" activeOutlineColor="#8B5CF6" />
            <TextInput label="Location *" value={location} onChangeText={setLocation} mode="outlined" style={styles.input} outlineColor="#E2E8F0" activeOutlineColor="#8B5CF6" left={<TextInput.Icon icon="map-marker" />} />
            <Text style={styles.label}>Category</Text>
            <View style={styles.categoryContainer}>
              {CATEGORIES.map((cat) => (
                <Chip key={cat.value} selected={category === cat.value} onPress={() => setCategory(cat.value)} style={[styles.categoryChip, category === cat.value && styles.categoryChipSelected]} textStyle={[styles.categoryChipText, category === cat.value && styles.categoryChipTextSelected]} icon={cat.icon}>
                  {cat.label}
                </Chip>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Date & Time</Text>
            <TouchableOpacity style={styles.dateTimeButton} onPress={() => setShowDatePicker(true)}>
              <MaterialCommunityIcons name="calendar" size={24} color="#8B5CF6" />
              <Text style={styles.dateTimeText}>{eventDate.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dateTimeButton} onPress={() => setShowTimePicker(true)}>
              <MaterialCommunityIcons name="clock-outline" size={24} color="#8B5CF6" />
              <Text style={styles.dateTimeText}>{eventTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</Text>
            </TouchableOpacity>
            <Menu
              visible={showTimezoneMenu}
              onDismiss={() => setShowTimezoneMenu(false)}
              anchor={
                <TouchableOpacity style={styles.dateTimeButton} onPress={() => setShowTimezoneMenu(true)}>
                  <MaterialCommunityIcons name="earth" size={24} color="#8B5CF6" />
                  <View style={styles.timezoneTextContainer}>
                    <Text style={styles.dateTimeText}>{TIMEZONES.find(tz => tz.value === timezone)?.label || 'Select Timezone'}</Text>
                    <Text style={styles.timezoneAbbr}>{TIMEZONES.find(tz => tz.value === timezone)?.abbr || ''}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-down" size={20} color="#64748B" />
                </TouchableOpacity>
              }
              contentStyle={styles.timezoneMenu}
            >
              <ScrollView style={styles.timezoneScroll}>
                {TIMEZONES.map((tz) => (
                  <Menu.Item key={tz.value} onPress={() => { setTimezone(tz.value); setShowTimezoneMenu(false); }} title={tz.label} titleStyle={timezone === tz.value ? styles.selectedTimezone : undefined} leadingIcon={timezone === tz.value ? 'check' : undefined} />
                ))}
              </ScrollView>
            </Menu>
            {showDatePicker && <DateTimePicker value={eventDate} mode="date" display="default" onChange={handleDateChange} minimumDate={new Date()} />}
            {showTimePicker && <DateTimePicker value={eventTime} mode="time" display="default" onChange={handleTimeChange} />}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Attachments</Text>
            {selectedFiles.length > 0 && (
              <View style={styles.filesList}>
                {selectedFiles.map((file, index) => (
                  <Surface key={index} style={styles.fileItem} elevation={1}>
                    {file.type?.startsWith('image/') ? (
                      <Image source={{ uri: file.uri }} style={styles.fileThumbnail} />
                    ) : (
                      <View style={styles.pdfThumbnail}><MaterialCommunityIcons name="file-pdf-box" size={28} color="#DC2626" /></View>
                    )}
                    <View style={styles.fileInfo}>
                      <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                      <Text style={styles.fileSize}>{formatFileSize(file.size)}</Text>
                    </View>
                    <IconButton icon="close-circle" size={20} iconColor="#DC2626" onPress={() => handleRemoveFile(index)} />
                  </Surface>
                ))}
              </View>
            )}
            <Button mode="outlined" icon="paperclip" onPress={handlePickDocument} disabled={loading || selectedFiles.length >= 5} style={styles.attachButton} textColor="#8B5CF6">Add Attachment</Button>
            <HelperText type="info">PDF and images only. Max 5 files, 10MB each.</HelperText>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Additional Options</Text>
            <TextInput label="Max Attendees (Optional)" value={maxAttendees} onChangeText={setMaxAttendees} mode="outlined" keyboardType="number-pad" style={styles.input} outlineColor="#E2E8F0" activeOutlineColor="#8B5CF6" left={<TextInput.Icon icon="account-group" />} />
            <HelperText type="info">Leave empty for unlimited attendees</HelperText>
            <TextInput label="Links (One per line)" value={links} onChangeText={setLinks} mode="outlined" multiline numberOfLines={3} style={[styles.input, styles.textArea]} outlineColor="#E2E8F0" activeOutlineColor="#8B5CF6" />
            <HelperText type="info">Add registration forms, Zoom links, etc.</HelperText>
          </View>

          <View style={styles.buttonContainer}>
            <Button mode="outlined" onPress={() => navigation.goBack()} style={styles.cancelButton} textColor="#64748B">Cancel</Button>
            <Button mode="contained" onPress={handleSubmit} loading={loading} disabled={loading} style={styles.createButton} buttonColor="#8B5CF6">
              {selectedOrgIds.length > 1 ? 'Broadcast Event' : 'Create Event'}
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
  subsectionTitle: { fontSize: 14, fontWeight: '600', color: '#64748B', marginBottom: 12 },
  audienceSubtitle: { fontSize: 13, color: '#64748B', marginBottom: 12, marginTop: -10 },
  orgChipsRow: { gap: 8 },
  orgChip: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0', marginBottom: 4 },
  orgChipSelected: { borderColor: '#8B5CF6', backgroundColor: '#F5F3FF' },
  orgChipText: { fontSize: 14, color: '#64748B', fontWeight: '500', flex: 1 },
  orgChipTextSelected: { color: '#8B5CF6', fontWeight: '700' },
  broadcastBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F3FF', borderRadius: 8, padding: 10, marginTop: 10 },
  broadcastBannerText: { fontSize: 13, color: '#8B5CF6', fontWeight: '600' },
  input: { marginBottom: 12, backgroundColor: '#fff' },
  textArea: { minHeight: 100 },
  label: { fontSize: 14, fontWeight: '600', color: '#475569', marginBottom: 12, marginTop: 8 },
  categoryContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  categoryChipSelected: { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
  categoryChipText: { color: '#64748B', fontWeight: '600' },
  categoryChipTextSelected: { color: '#fff' },
  dateTimeButton: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 12 },
  dateTimeText: { fontSize: 16, color: '#1E293B', marginLeft: 12, fontWeight: '600' },
  timezoneTextContainer: { flex: 1, marginLeft: 12 },
  timezoneAbbr: { fontSize: 12, color: '#64748B', marginLeft: 12, marginTop: 2 },
  timezoneMenu: { maxHeight: 400, marginTop: 8 },
  timezoneScroll: { maxHeight: 350 },
  selectedTimezone: { color: '#8B5CF6', fontWeight: '700' },
  filesList: { marginBottom: 16, gap: 8 },
  fileItem: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#F8FAFC', borderRadius: 12, gap: 12 },
  fileThumbnail: { width: 48, height: 48, borderRadius: 8 },
  pdfThumbnail: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '600', color: '#1E293B', marginBottom: 2 },
  fileSize: { fontSize: 12, color: '#64748B' },
  attachButton: { borderColor: '#E2E8F0', marginBottom: 4 },
  buttonContainer: { flexDirection: 'row', padding: 20, gap: 12 },
  cancelButton: { flex: 1, borderColor: '#E2E8F0' },
  createButton: { flex: 1 },
});