import React, { useState, useContext } from 'react';
import { useActiveOrg } from '../../context/ActiveOrgContext';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, Switch, List, Divider, Button } from 'react-native-paper';
import { AuthContext } from '../../context/AuthContext';

export default function ChatSettingsScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const [notifications, setNotifications] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [showReadReceipts, setShowReadReceipts] = useState(true);
  const [showOnlineStatus, setShowOnlineStatus] = useState(true);

  const handleClearChat = () => {
    Alert.alert(
      'Clear Chat History',
      'Are you sure you want to clear all messages? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            // TODO: Implement clear chat
            console.log('Clear chat');
          },
        },
      ]
    );
  };

  const handleLeaveGroup = () => {
    Alert.alert(
      'Leave Group',
      'Are you sure you want to leave RTD Alumni Chat?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            // TODO: Implement leave group
            navigation.goBack();
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chat Settings</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        
        <List.Item
          title="Notifications"
          description="Receive notifications for new messages"
          left={props => <List.Icon {...props} icon="bell" />}
          right={() => (
            <Switch
              value={notifications}
              onValueChange={setNotifications}
            />
          )}
        />

        <List.Item
          title="Sound"
          description="Play sound for new messages"
          left={props => <List.Icon {...props} icon="volume-high" />}
          right={() => (
            <Switch
              value={soundEnabled}
              onValueChange={setSoundEnabled}
              disabled={!notifications}
            />
          )}
        />

        <List.Item
          title="Vibration"
          description="Vibrate for new messages"
          left={props => <List.Icon {...props} icon="vibrate" />}
          right={() => (
            <Switch
              value={vibrationEnabled}
              onValueChange={setVibrationEnabled}
              disabled={!notifications}
            />
          )}
        />
      </View>

      <Divider />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacy</Text>
        
        <List.Item
          title="Read Receipts"
          description="Let others know when you've read their messages"
          left={props => <List.Icon {...props} icon="check-all" />}
          right={() => (
            <Switch
              value={showReadReceipts}
              onValueChange={setShowReadReceipts}
            />
          )}
        />

        <List.Item
          title="Online Status"
          description="Show when you're online"
          left={props => <List.Icon {...props} icon="circle" />}
          right={() => (
            <Switch
              value={showOnlineStatus}
              onValueChange={setShowOnlineStatus}
            />
          )}
        />
      </View>

      <Divider />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Chat Data</Text>
        
        <List.Item
          title="Media Auto-Download"
          description="Automatically download photos and videos"
          left={props => <List.Icon {...props} icon="download" />}
          onPress={() => navigation.navigate('MediaSettings')}
          right={props => <List.Icon {...props} icon="chevron-right" />}
        />

        <List.Item
          title="Storage Usage"
          description="Manage chat storage"
          left={props => <List.Icon {...props} icon="database" />}
          onPress={() => navigation.navigate('StorageSettings')}
          right={props => <List.Icon {...props} icon="chevron-right" />}
        />
      </View>

      <Divider />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Group Info</Text>
        
        <List.Item
          title="Group Members"
          description="View all members"
          left={props => <List.Icon {...props} icon="account-group" />}
          onPress={() => navigation.navigate('ChatMembers')}
          right={props => <List.Icon {...props} icon="chevron-right" />}
        />

        <List.Item
          title="Group Description"
          description="RTD Alumni community chat"
          left={props => <List.Icon {...props} icon="information" />}
        />
      </View>

      <Divider />

      <View style={styles.dangerSection}>
        <Button
          mode="outlined"
          onPress={handleClearChat}
          style={styles.dangerButton}
          textColor="#F44336"
        >
          Clear Chat History
        </Button>

        <Button
          mode="contained"
          onPress={handleLeaveGroup}
          style={[styles.dangerButton, { backgroundColor: '#F44336' }]}
        >
          Leave Group
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#007AFF',
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  section: {
    backgroundColor: '#fff',
    marginVertical: 8,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    paddingHorizontal: 16,
    paddingVertical: 8,
    textTransform: 'uppercase',
  },
  dangerSection: {
    padding: 20,
    gap: 12,
  },
  dangerButton: {
    borderColor: '#F44336',
  },
});