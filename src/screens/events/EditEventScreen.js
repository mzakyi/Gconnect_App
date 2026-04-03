// src/screens/events/EditEventScreen.js
import React, { useState, useContext } from 'react';
import { useActiveOrg } from '../../context/ActiveOrgContext';
import { AuthContext } from '../../context/AuthContext';
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
  Menu,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import { createEvent, updateEvent, addAttachmentToEvent, removeAttachmentFromEvent } from '../../services/eventService';

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

export default function EditEventScreen({ navigation, route }) {
  const { user, userProfile } = useContext(AuthContext);
  const { activeOrgId: organizationId } = useActiveOrg();

  const { event } = route.params || {};
  const isEditMode = !!event;

  const existingDateTime = event?.eventDateTime?.toDate
    ? event.eventDateTime.toDate()
    : event?.eventDateTime
    ? new Date(event.eventDateTime)
    : new Date();

  const [title, setTitle] = useState(event?.title || '');
  const [description, setDescription] = useState(event?.description || '');
  const [location, setLocation] = useState(event?.location || '');
  const [category, setCategory] = useState(event?.category || 'general');
  const [eventDate, setEventDate] = useState(existingDateTime);
  const [eventTime, setEventTime] = useState(existingDateTime);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timezone, setTimezone] = useState(event?.timezone || 'America/New_York');
  const [showTimezoneMenu, setShowTimezoneMenu] = useState(false);
  const [links, setLinks] = useState(event?.links?.join('\n') || '');
  const [maxAttendees, setMaxAttendees] = useState(event?.maxAttendees?.toString() || '');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [existingAttachments, setExistingAttachments] = useState(event?.attachments || []);
  const [loading, setLoading] = useState(false);

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
        const newFile = { uri: asset.uri, name: asset.name, type: asset.mimeType, size: asset.size };
        if (isEditMode) {
          setLoading(true);
          try {
            const uploadedFile = await addAttachmentToEvent(event.id, newFile, organizationId);
            if (uploadedFile) {
              setExistingAttachments([...existingAttachments, uploadedFile]);
              Alert.alert('Success', `${asset.name} uploaded`);
            }
          } catch (error) {
            Alert.alert('Error', 'Failed to upload file');
          } finally {
            setLoading(false);
          }
        } else {
          setSelectedFiles([...selectedFiles, newFile]);
          Alert.alert('Success', `${asset.name} added`);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const handleRemoveFile = (index) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  const handleRemoveExistingAttachment = async (attachment, index) => {
    Alert.alert('Remove Attachment', 'Are you sure you want to remove this attachment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await removeAttachmentFromEvent(event.id, attachment.storagePath, organizationId);
            setExistingAttachments(existingAttachments.filter((_, i) => i !== index));
            Alert.alert('Success', 'Attachment removed');
          } catch (error) {
            Alert.alert('Error', 'Failed to remove attachment');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
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
      };

      if (isEditMode) {
        await updateEvent(event.id, eventData, organizationId);
        Alert.alert('Success', 'Event updated successfully', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        eventData.createdBy = user.uid;
        eventData.createdByName = `${userProfile.firstName} ${userProfile.lastName}`;
        eventData.status = 'upcoming';
        eventData.isActive = true;
        await createEvent(eventData, selectedFiles, organizationId);
        Alert.alert('Success', 'Event created successfully', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      }
    } catch (error) {
      Alert.alert('Error', `Failed to ${isEditMode ? 'update' : 'create'} event: ` + (error.message || 'Unknown error'));
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
          <Text style={styles.headerTitle}>{isEditMode ? 'Edit Event' : 'Create Event'}</Text>
          <View style={{ width: 24 }} />
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
            {existingAttachments.length > 0 && (
              <View style={styles.filesList}>
                <Text style={styles.subsectionTitle}>Current Attachments</Text>
                {existingAttachments.map((attachment, index) => (
                  <Surface key={index} style={styles.fileItem} elevation={1}>
                    {attachment.fileType?.startsWith('image/') ? (
                      <Image source={{ uri: attachment.downloadURL }} style={styles.fileThumbnail} />
                    ) : (
                      <View style={styles.pdfThumbnail}><MaterialCommunityIcons name="file-pdf-box" size={28} color="#DC2626" /></View>
                    )}
                    <View style={styles.fileInfo}>
                      <Text style={styles.fileName} numberOfLines={1}>{attachment.fileName}</Text>
                      <Text style={styles.fileSize}>{formatFileSize(attachment.fileSize)}</Text>
                    </View>
                    <IconButton icon="close-circle" size={20} iconColor="#DC2626" onPress={() => handleRemoveExistingAttachment(attachment, index)} />
                  </Surface>
                ))}
              </View>
            )}
            {selectedFiles.length > 0 && (
              <View style={styles.filesList}>
                {isEditMode && <Text style={styles.subsectionTitle}>New Attachments</Text>}
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
            <Button mode="outlined" icon="paperclip" onPress={handlePickDocument} disabled={loading || (selectedFiles.length + existingAttachments.length >= 5)} style={styles.attachButton} textColor="#8B5CF6">Add Attachment</Button>
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
            <Button mode="contained" onPress={handleSubmit} loading={loading} disabled={loading} style={styles.createButton} buttonColor="#8B5CF6">{isEditMode ? 'Update Event' : 'Create Event'}</Button>
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