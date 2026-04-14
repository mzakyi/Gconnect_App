// src/screens/admin/SuperAdminScreen.js
import React, { useState, useEffect, useContext } from 'react';
import { useActiveOrg } from '../../context/ActiveOrgContext';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  Chip,
  Avatar,
  Divider,
  ActivityIndicator,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AuthContext } from '../../context/AuthContext';
import {
  requestSuperAdminAccess,
  getAllAdminOrgsForUser,
} from '../../services/superAdminService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase.config';

export default function SuperAdminScreen({ navigation }) {
  const { user, userProfile } = useContext(AuthContext);
const { activeOrgId: organizationId } = useActiveOrg();

  const [joinCode, setJoinCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [currentOrgName, setCurrentOrgName] = useState('');
  const [superAdminOrgs, setSuperAdminOrgs] = useState([]);

  // Load current org name and any orgs the user already has Super User access to
  useEffect(() => {
    if (!organizationId || !user?.uid) return;
    loadData();
  }, [organizationId, user?.uid]);

  const loadData = async () => {
    setLoadingOrgs(true);
    try {
      // Get current org name
      const orgSnap = await getDoc(doc(db, 'organizations', organizationId));
      if (orgSnap.exists()) {
        const orgData = orgSnap.data();
        setCurrentOrgName(orgData.name || orgData.organizationName || 'Your Organization');
      }

      // Get all orgs this user already has Super User access to
      const orgs = await getAllAdminOrgsForUser(user.uid);
      // Exclude the current org from the list (they're already a member there)
      setSuperAdminOrgs(orgs.filter((o) => o.id !== organizationId));
    } catch (error) {
      console.error('Error loading Super User data:', error);
    } finally {
      setLoadingOrgs(false);
    }
  };

  const handleSubmitRequest = async () => {
    if (!joinCode.trim()) {
      Alert.alert('Missing Code', 'Please enter the organization join code.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await requestSuperAdminAccess(
        {
          uid: user.uid,
          email: userProfile.email,
          firstName: userProfile.firstName,
          lastName: userProfile.lastName,
          profilePicture: userProfile.profilePicture || null,
          orgName: currentOrgName,
          isAdmin: userProfile.isAdmin || false,
        },
        joinCode.trim(),
        organizationId
      );

      setJoinCode('');
      Alert.alert(
        'Request Sent! ✅',
        `Your request to join "${result.targetOrgName}" has been sent. An admin from that organization will review your request.`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      Alert.alert('Request Failed', error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#667EEA', '#764BA2']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Super User</Text>
            <Text style={styles.headerSubtitle}>
              Manage cross-organization access
            </Text>
          </View>
          <MaterialCommunityIcons name="crown" size={32} color="#FFD700" />
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* What is Super User */}
        <Card style={styles.infoCard} elevation={2}>
          <Card.Content>
            <View style={styles.infoHeader}>
              <MaterialCommunityIcons
                name="information-outline"
                size={22}
                color="#667EEA"
              />
              <Text style={styles.infoTitle}>Join Another Organization</Text>
            </View>
            <Text style={styles.infoText}>
              You can be a member of multiple organizations with a single login.
              Request to join another organization using their join code. The
              organization's admin will review your request and decide your role.
            </Text>
          </Card.Content>
        </Card>

        {/* Current organization */}
        <Card style={styles.currentOrgCard} elevation={2}>
          <Card.Content>
            <Text style={styles.sectionLabel}>YOUR CURRENT ORGANIZATION</Text>
            <View style={styles.orgRow}>
              <View style={styles.orgIconContainer}>
                <MaterialCommunityIcons
                  name="office-building"
                  size={24}
                  color="#667EEA"
                />
              </View>
              <View style={styles.orgInfo}>
                <Text style={styles.orgName}>{currentOrgName}</Text>
                <Chip
                  style={styles.adminChip}
                  textStyle={styles.adminChipText}
                  icon="shield-crown"
                >
                  Admin
                </Chip>
              </View>
            </View>
          </Card.Content>
        </Card>

        {loadingOrgs ? (
          <ActivityIndicator
            size="small"
            color="#667EEA"
            style={styles.loader}
          />
        ) : superAdminOrgs.length > 0 ? (
          <Card style={styles.approvedOrgsCard} elevation={2}>
            <Card.Content>
              <Text style={styles.sectionLabel}>ORGANIZATIONS YOU'VE JOINED</Text>
              {superAdminOrgs.map((org, index) => (
                <View key={org.id}>
                  {index > 0 && <Divider style={styles.divider} />}
                  <View style={styles.orgRow}>
                    <View
                      style={[
                        styles.orgIconContainer,
                        { backgroundColor: org.isAdmin ? '#E8F5E9' : '#EEF2FF' },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={org.isAdmin ? 'office-building-check' : 'office-building'}
                        size={24}
                        color={org.isAdmin ? '#4CAF50' : '#667EEA'}
                      />
                    </View>
                    <View style={styles.orgInfo}>
                      <Text style={styles.orgName}>{org.name}</Text>
                      {org.isAdmin ? (
                        <Chip
                          style={styles.superAdminChip}
                          textStyle={styles.superAdminChipText}
                          icon="shield-crown"
                        >
                          Super User
                        </Chip>
                      ) : (
                        <Chip
                          style={styles.memberChip}
                          textStyle={styles.memberChipText}
                          icon="account"
                        >
                          Member
                        </Chip>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </Card.Content>
          </Card>
        ) : null}

        {/* Request access form */}
        <Card style={styles.requestCard} elevation={2}>
          <Card.Content>
            <View style={styles.requestHeader}>
              <MaterialCommunityIcons name="plus-circle" size={22} color="#667EEA" />
              <Text style={styles.requestTitle}>
                Request Access to Another Organization
              </Text>
            </View>

            <Text style={styles.requestInstructions}>
              Enter the join code of the organization you want to join. The
              organization's admin will review your request and decide your role.
            </Text>

            <TextInput
              label="Organization Join Code"
              value={joinCode}
              onChangeText={setJoinCode}
              mode="outlined"
              outlineColor="#E2E8F0"
              activeOutlineColor="#667EEA"
              style={styles.codeInput}
              autoCapitalize="characters"
              placeholder="e.g. RTD2025"
              left={<TextInput.Icon icon="key" />}
            />

            {/* Steps */}
            <View style={styles.stepsContainer}>
              <Text style={styles.stepsTitle}>How it works:</Text>
              {[
                'Enter the exact join code provided by the other organization',
                'Your request is sent to their admin for review',
                'Once approved, you\'ll be added as a member or admin',
                'Switch between your organizations from your profile',
              ].map((step, index) => (
                <View key={index} style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>

            <Button
              mode="contained"
              onPress={handleSubmitRequest}
              loading={submitting}
              disabled={submitting || !joinCode.trim()}
              style={styles.submitButton}
              buttonColor="#667EEA"
              icon="send"
            >
              Send Request
            </Button>
          </Card.Content>
        </Card>

        <View style={{ height: 40 }} />
      </ScrollView>
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
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 60,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 14,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  infoText: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 21,
  },
  currentOrgCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  orgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  orgIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgInfo: {
    flex: 1,
    gap: 6,
  },
  orgName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  adminChip: {
    backgroundColor: '#EEF2FF',
    alignSelf: 'flex-start',
    height: 26,
  },
  adminChipText: {
    color: '#667EEA',
    fontSize: 11,
    fontWeight: '700',
  },
  superAdminChip: {
    backgroundColor: '#FFF8DC',
    alignSelf: 'flex-start',
    height: 30,
  },
  superAdminChipText: {
    color: '#D97706',
    fontSize: 11,
    fontWeight: '700',
  },
  memberChip: {
    backgroundColor: '#EEF2FF',
    alignSelf: 'flex-start',
    height: 26,
  },
  memberChipText: {
    color: '#667EEA',
    fontSize: 11,
    fontWeight: '700',
  },
  approvedOrgsCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 14,
  },
  divider: {
    marginVertical: 12,
  },
  loader: {
    marginVertical: 20,
  },
  requestCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 14,
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  requestTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },
  requestInstructions: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
    marginBottom: 16,
  },
  codeInput: {
    backgroundColor: '#fff',
    marginBottom: 20,
    fontSize: 18,
    letterSpacing: 2,
  },
  stepsContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    gap: 10,
  },
  stepsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#667EEA',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumberText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  stepText: {
    flex: 1,
    fontSize: 13,
    color: '#475569',
    lineHeight: 19,
  },
  submitButton: {
    borderRadius: 10,
    paddingVertical: 4,
  },
});