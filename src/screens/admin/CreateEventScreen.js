import React, { useState, useContext } from 'react';
import { 
  View, 
  StyleSheet, 
  ScrollView, 
  Alert, 
  TouchableOpacity,
  Platform,
  Image 
} from 'react-native';
import { 
  Text, 
  TextInput, 
  Button, 
  Card,
  IconButton,
  HelperText 
} from 'react-native-paper';
import { AuthContext } from '../../context/AuthContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { createEvent } from '../../services/eventService';

export default function CreateEventScreen({ navigation, route }) {
  const { user, userProfile } = useContext(AuthContext);
const { activeOrgId: organizationId } = useActiveOrg(); 
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [eventDate, setEventDate] = useState(new Date());
  const [eventTime, setEventTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [category, setCategory] = useState('general');
  const [maxAttendees, setMaxAttendees] = useState('');
  const [links, setLinks] = useState(['']);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);

  const categories = [
    { label: 'General', value: 'general', icon: 'calendar', color: '#2196F3' },
    { label: 'Sports', value: 'sports', icon: 'basketball', color: '#FF9800' },
    { label: 'Social', value: 'social', icon: 'account-group', color: '#E91E63' },
    { label: 'Academic', value: 'academic', icon: 'school', color: '#9C27B0' },
    { label: 'Workshop', value: 'workshop', icon: 'hammer-wrench', color: '#4CAF50' },
    { label: 'Meeting', value: 'meeting', icon: 'calendar-clock', color: '#00BCD4' },
  ];

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
        const asset = result.assets[0];
        const file = {
          uri: asset.uri,
          name: `image_${Date.now()}.jpg`,
          type: 'image/jpeg',
          isImage: true,
        };
        setAttachments([...attachments, file]);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const file = {
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || 'application/pdf',
          size: asset.size,
          isImage: false,
        };
        setAttachments([...attachments, file]);
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const removeAttachment = (index) => {
    const newAttachments = attachments.filter((_, i) => i !== index);
    setAttachments(newAttachments);
  };

  const addLinkField = () => {
    setLinks([...links, '']);
  };

  const updateLink = (index, value) => {
    const newLinks = [...links];
    newLinks[index] = value;
    setLinks(newLinks);
  };

  const removeLink = (index) => {
    const newLinks = links.filter((_, i) => i !== index);
    setLinks(newLinks.length === 0 ? [''] : newLinks);
  };

  const isValidUrl = (string) => {
    try {
      const url = new URL(string);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
      return false;
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown size';
    const mb = bytes / (1024 * 1024);
    return mb < 1 ? `${(bytes / 1024).toFixed(1)} KB` : `${mb.toFixed(1)} MB`;
  };

  const handleCreateEvent = async () => {
    if (!title.trim() || !description.trim() || !location.trim()) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    const validLinks = links.filter(link => link.trim() !== '');
    const invalidLinks = validLinks.filter(link => !isValidUrl(link));
    
    if (invalidLinks.length > 0) {
      Alert.alert('Invalid Links', 'Please check that all links start with http:// or https://');
      return;
    }

    setLoading(true);

    try {
      const combinedDateTime = new Date(eventDate);
      combinedDateTime.setHours(eventTime.getHours());
      combinedDateTime.setMinutes(eventTime.getMinutes());

      const eventData = {
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        eventDate: combinedDateTime.toLocaleDateString(),
        eventTime: combinedDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        eventDateTime: combinedDateTime,
        category,
        maxAttendees: maxAttendees ? parseInt(maxAttendees) : null,
        links: validLinks,
        createdBy: userProfile.uid,
        createdByName: `${userProfile.firstName} ${userProfile.lastName}`,
        status: 'upcoming',
        isActive: true,
      };

      await createEvent(eventData, attachments, organizationId);

      Alert.alert(
        'Success',
        'Event created successfully!',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error('Error creating event:', error);
      Alert.alert('Error', 'Failed to create event. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onDateChange = (event, selectedDate) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) setEventDate(selectedDate);
  };

  const onTimeChange = (event, selectedTime) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedTime) setEventTime(selectedTime);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text variant="headlineSmall" style={styles.headerTitle}>Create Event</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Event Details</Text>

            <TextInput
              label="Event Title *"
              value={title}
              onChangeText={setTitle}
              mode="outlined"
              style={styles.input}
              placeholder="e.g., Basketball Tournament"
              left={<TextInput.Icon icon="text" />}
            />

            <TextInput
              label="Description *"
              value={description}
              onChangeText={setDescription}
              mode="outlined"
              multiline
              numberOfLines={4}
              style={styles.input}
              placeholder="Describe your event..."
              left={<TextInput.Icon icon="text-box" />}
            />

            <TextInput
              label="Location *"
              value={location}
              onChangeText={setLocation}
              mode="outlined"
              style={styles.input}
              placeholder="e.g., Main Campus Gym"
              left={<TextInput.Icon icon="map-marker" />}
            />

            <TextInput
              label="Max Attendees (Optional)"
              value={maxAttendees}
              onChangeText={setMaxAttendees}
              mode="outlined"
              keyboardType="numeric"
              style={styles.input}
              placeholder="Leave empty for unlimited"
              left={<TextInput.Icon icon="account-multiple" />}
            />
          </Card.Content>
        </Card>

        {/* Links Section */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Text variant="titleMedium" style={styles.sectionTitle}>Links (Optional)</Text>
              <IconButton
                icon="plus"
                size={20}
                onPress={addLinkField}
                style={styles.addButton}
              />
            </View>
            
            {links.map((link, index) => (
              <View key={index} style={styles.linkInputContainer}>
                <TextInput
                  label={`Link ${index + 1}`}
                  value={link}
                  onChangeText={(value) => updateLink(index, value)}
                  mode="outlined"
                  style={styles.linkInput}
                  placeholder="https://example.com"
                  left={<TextInput.Icon icon="link" />}
                  keyboardType="url"
                  autoCapitalize="none"
                />
                {links.length > 1 && (
                  <IconButton
                    icon="delete"
                    size={20}
                    iconColor="#f44336"
                    onPress={() => removeLink(index)}
                  />
                )}
              </View>
            ))}
            
            <HelperText type="info">
              Add registration links, meeting URLs, or related resources
            </HelperText>
          </Card.Content>
        </Card>

        {/* Attachments Section */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Attachments (Optional)</Text>
            
            <View style={styles.attachmentButtons}>
              <Button
                mode="outlined"
                icon="image"
                onPress={pickImage}
                style={styles.attachButton}
                disabled={loading}
              >
                Add Image
              </Button>
              <Button
                mode="outlined"
                icon="file-pdf-box"
                onPress={pickDocument}
                style={styles.attachButton}
                disabled={loading}
              >
                Add PDF
              </Button>
            </View>

            {attachments.length > 0 && (
              <View style={styles.attachmentsList}>
                {attachments.map((file, index) => (
                  <View key={index} style={styles.attachmentItem}>
                    {file.isImage ? (
                      <Image source={{ uri: file.uri }} style={styles.attachmentImage} />
                    ) : (
                      <View style={styles.pdfIcon}>
                        <MaterialCommunityIcons name="file-pdf-box" size={40} color="#f44336" />
                      </View>
                    )}
                    <View style={styles.attachmentInfo}>
                      <Text variant="bodyMedium" numberOfLines={1} style={styles.attachmentName}>
                        {file.name}
                      </Text>
                      {file.size && (
                        <Text variant="bodySmall" style={styles.attachmentSize}>
                          {formatFileSize(file.size)}
                        </Text>
                      )}
                    </View>
                    <IconButton
                      icon="close"
                      size={20}
                      onPress={() => removeAttachment(index)}
                      iconColor="#f44336"
                    />
                  </View>
                ))}
              </View>
            )}

            <HelperText type="info">
              Add event posters, flyers, or agenda documents
            </HelperText>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Date & Time</Text>
            
            <TouchableOpacity
              style={styles.dateTimeButton}
              onPress={() => setShowDatePicker(true)}
            >
              <MaterialCommunityIcons name="calendar" size={24} color="#6366F1" />
              <View style={styles.dateTimeContent}>
                <Text style={styles.dateTimeLabel}>Event Date</Text>
                <Text style={styles.dateTimeValue}>
                  {eventDate.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={24} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dateTimeButton}
              onPress={() => setShowTimePicker(true)}
            >
              <MaterialCommunityIcons name="clock-outline" size={24} color="#6366F1" />
              <View style={styles.dateTimeContent}>
                <Text style={styles.dateTimeLabel}>Event Time</Text>
                <Text style={styles.dateTimeValue}>
                  {eventTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={24} color="#ccc" />
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={eventDate}
                mode="date"
                display="default"
                onChange={onDateChange}
                minimumDate={new Date()}
              />
            )}

            {showTimePicker && (
              <DateTimePicker
                value={eventTime}
                mode="time"
                display="default"
                onChange={onTimeChange}
              />
            )}
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Category</Text>
            <View style={styles.categoriesGrid}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.value}
                  style={[
                    styles.categoryChip,
                    category === cat.value && {
                      backgroundColor: cat.color + '20',
                      borderColor: cat.color
                    }
                  ]}
                  onPress={() => setCategory(cat.value)}
                >
                  <MaterialCommunityIcons
                    name={cat.icon}
                    size={20}
                    color={category === cat.value ? cat.color : '#666'}
                  />
                  <Text
                    style={[
                      styles.categoryText,
                      category === cat.value && { color: cat.color, fontWeight: '600' }
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card.Content>
        </Card>

        <View style={styles.buttonContainer}>
          <Button
            mode="outlined"
            onPress={() => navigation.goBack()}
            style={styles.cancelButton}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            mode="contained"
            onPress={handleCreateEvent}
            loading={loading}
            disabled={loading}
            style={styles.createButton}
            buttonColor="#6366F1"
          >
            Create Event
          </Button>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: '#6366F1',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    color: '#fff',
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1a1a1a',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  addButton: {
    margin: 0,
  },
  input: {
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  linkInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  linkInput: {
    flex: 1,
    backgroundColor: '#fff',
  },
  attachmentButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  attachButton: {
    flex: 1,
  },
  attachmentsList: {
    gap: 10,
    marginTop: 10,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    gap: 10,
  },
  attachmentImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  pdfIcon: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentInfo: {
    flex: 1,
  },
  attachmentName: {
    fontWeight: '600',
    color: '#333',
  },
  attachmentSize: {
    color: '#666',
    marginTop: 2,
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dateTimeContent: {
    flex: 1,
    marginLeft: 12,
  },
  dateTimeLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  dateTimeValue: {
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryText: {
    fontSize: 14,
    color: '#666',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
  },
  createButton: {
    flex: 1,
  },
});