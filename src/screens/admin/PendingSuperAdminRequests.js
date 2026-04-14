import React, { useState, useEffect, useContext } from 'react';
import { View, StyleSheet, FlatList, Alert, TouchableOpacity } from 'react-native';
import { Text, Card, Avatar, Button, Chip } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AuthContext } from '../../context/AuthContext';
import {
  subscribeToPendingSuperAdminRequests,
  approveSuperAdminRequest,
  rejectSuperAdminRequest,
} from '../../services/superAdminService';

export default function PendingSuperAdminRequests({ navigation }) {
  const { organizationId } = useContext(AuthContext);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    if (!organizationId) return;
    const unsub = subscribeToPendingSuperAdminRequests(organizationId, (data) => {
      setRequests(data);
      setLoading(false);
    });
    return () => unsub();
  }, [organizationId]);

const handleApprove = (request) => {
    Alert.alert(
      'Approve Request',
      `${request.firstName} ${request.lastName} wants to join your organization. What role should they have?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regular Member',
          onPress: async () => {
            setProcessingId(request.id);
            try {
              await approveSuperAdminRequest(request.id, organizationId, false);
              Alert.alert('Approved ✅', `${request.firstName} ${request.lastName} has been added as a regular member.`);
            } catch (error) {
              Alert.alert('Error', error.message);
            } finally {
              setProcessingId(null);
            }
          },
        },
        {
          text: 'Make Admin',
          onPress: async () => {
            setProcessingId(request.id);
            try {
              await approveSuperAdminRequest(request.id, organizationId, true);
              Alert.alert('Approved ✅', `${request.firstName} ${request.lastName} has been added as an admin.`);
            } catch (error) {
              Alert.alert('Error', error.message);
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]
    );
  };

  const handleReject = (request) => {
    Alert.alert(
      'Reject Request',
      `Reject ${request.firstName} ${request.lastName}'s request for Super User access?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setProcessingId(request.id);
            try {
              await rejectSuperAdminRequest(request.id, organizationId);
              Alert.alert('Rejected', 'The request has been rejected.');
            } catch (error) {
              Alert.alert('Error', error.message);
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]
    );
  };

  const renderRequest = ({ item }) => {
    const isProcessing = processingId === item.id;
    const initials = `${item.firstName?.[0] || '?'}${item.lastName?.[0] || '?'}`;

    return (
      <Card style={styles.card} elevation={2}>
        <Card.Content>
          <View style={styles.userHeader}>
            {item.profilePicture ? (
              <Avatar.Image size={54} source={{ uri: item.profilePicture }} />
            ) : (
              <Avatar.Text size={54} label={initials} style={styles.avatar} />
            )}
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{item.firstName} {item.lastName}</Text>
              <Text style={styles.userEmail}>{item.email}</Text>
              <View style={styles.pendingBadge}>
                <MaterialCommunityIcons name="clock-outline" size={11} color="#B45309" />
                <Text style={styles.pendingBadgeText}>Pending Review</Text>
              </View>
            </View>
          </View>

            <View style={styles.fromOrgRow}>
            <MaterialCommunityIcons name="office-building-outline" size={15} color="#64748B" />
            <Text style={styles.fromOrgText}>
              From:{' '}
              <Text style={styles.fromOrgName}>{item.fromOrgName || 'Another Organization'}</Text>
              {item.requesterIsAdmin ? '  👑 Admin in their org' : ''}
            </Text>
          </View>

          <View style={styles.requestInfo}>
            <MaterialCommunityIcons name="information-outline" size={15} color="#667EEA" style={{ marginTop: 1 }} />
            <Text style={styles.requestInfoText}>
              Requesting to join your organization. You can add them as a regular member or grant admin access.
            </Text>
          </View>

          <View style={styles.actions}>
            <Button
              mode="contained"
              onPress={() => handleApprove(item)}
              loading={isProcessing}
              disabled={isProcessing}
              style={styles.approveBtn}
              icon="check"
            >
              Approve
            </Button>
            <Button
              mode="outlined"
              onPress={() => handleReject(item)}
              disabled={isProcessing}
              style={styles.rejectBtn}
              textColor="#ef4444"
              icon="close"
            >
              Reject
            </Button>
          </View>
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      {/* Proper gradient header replacing the tiny grey bar */}
      <LinearGradient
        colors={['#667EEA', '#764BA2']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Super User Requests</Text>
            <Text style={styles.headerSubtitle}>Review and manage access requests</Text>
          </View>
          <View style={styles.countBadge}>
            <MaterialCommunityIcons name="crown" size={13} color="#FFD700" />
            <Text style={styles.countBadgeText}>
              {loading ? '...' : `${requests.length} pending`}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading requests...</Text>
        </View>
      ) : requests.length === 0 ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="crown-outline" size={72} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>No Pending Requests</Text>
          <Text style={styles.emptyText}>
            No one has requested to join your organization yet.
          </Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          renderItem={renderRequest}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  // Header
  header: { paddingTop: 55, paddingBottom: 18, paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  countBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  countBadgeText: { fontSize: 12, fontWeight: '600', color: '#fff' },

  // List
  list: { padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 14 },

  // User header
  userHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  avatar: { backgroundColor: '#667EEA' },
  userInfo: { flex: 1, gap: 3 },
  userName: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
  userEmail: { fontSize: 13, color: '#64748B' },
  pendingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', marginTop: 2,
    backgroundColor: '#FFF3E0', borderRadius: 20,
    paddingHorizontal: 9, paddingVertical: 3,
  },
  pendingBadgeText: { fontSize: 11, fontWeight: '600', color: '#B45309' },

  // From org
  fromOrgRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#F8FAFC', padding: 10,
    borderRadius: 8, marginBottom: 10,
  },
  fromOrgText: { fontSize: 13, color: '#64748B' },
  fromOrgName: { fontWeight: '700', color: '#1E293B' },

  // Request info
  requestInfo: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 7,
    backgroundColor: '#EEF2FF', padding: 10,
    borderRadius: 8, marginBottom: 14,
  },
  requestInfoText: { flex: 1, fontSize: 13, color: '#475569', lineHeight: 18 },

  // Buttons
  actions: { flexDirection: 'row', gap: 10 },
  approveBtn: { flex: 1, backgroundColor: '#4CAF50' },
  rejectBtn: { flex: 1, borderColor: '#ef4444' },

  // States
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  loadingText: { color: '#94A3B8', marginTop: 12 },
  emptyTitle: { marginTop: 16, fontSize: 17, fontWeight: '700', color: '#64748B' },
  emptyText: { marginTop: 8, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },
});