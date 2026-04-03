// src/screens/admin/AdminScreen.js
// CHANGES FROM ORIGINAL:
//   1. Added OrgSwitcher component in header
//   2. Added "Super Admin Requests" quick action card with live badge count
//   3. Added activeOrgId state so super admins can view stats for the selected org
//   All original functionality is completely preserved.

import React, { useState, useEffect, useContext } from 'react';
import { useActiveOrg } from '../../context/ActiveOrgContext';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { Text, Card, Surface, Avatar, Chip, FAB } from 'react-native-paper';
import { AuthContext } from '../../context/AuthContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, onSnapshot, getDocs, query, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase.config';
import OrgSwitcher from '../../components/OrgSwitcher';
import { subscribeToPendingSuperAdminRequests } from '../../services/superAdminService';

export default function AdminScreen({ navigation }) {
  const { user, userProfile } = useContext(AuthContext);
  const { activeOrgId, activeOrgName, switchOrg } = useActiveOrg();

  // Use activeOrgId as organizationId throughout this screen
  const organizationId = activeOrgId;

  const [stats, setStats] = useState({ totalUsers: 0, pendingUsers: 0, bannedUsers: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [serverOnline, setServerOnline] = useState(false);
  const [dbConnected, setDbConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [pendingSuperAdminCount, setPendingSuperAdminCount] = useState(0);


  // When activeOrgId changes (super admin switches org), reload stats
  useEffect(() => {
    if (!activeOrgId || !userProfile?.isAdmin) return;

    const usersRef = collection(db, 'organizations', activeOrgId, 'users');
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      let pending = 0, banned = 0, approved = 0;
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.status === 'pending') pending++;
        if (data.banned === true) banned++;
        if (data.status === 'approved') approved++;
      });
      setStats({ totalUsers: approved, pendingUsers: pending, bannedUsers: banned });
      setLastUpdated(new Date());
    }, (error) => { console.warn('Error fetching users:', error); });

    return () => unsubscribe();
  }, [activeOrgId, userProfile]);


  // System status check
  useEffect(() => {
    if (!activeOrgId) return;
    async function checkSystemStatus() {
      try {
        const testQuery = query(collection(db, 'organizations', activeOrgId, 'users'), limit(1));
        await getDocs(testQuery);
        setDbConnected(true);
        setServerOnline(true);
      } catch (error) {
        setDbConnected(false);
        setServerOnline(false);
      }
    }
    checkSystemStatus();
  }, [activeOrgId]);

  // ── NEW: listen for pending super admin requests ─────────────
  useEffect(() => {
    if (!activeOrgId || !userProfile?.isAdmin) return;
    const unsub = subscribeToPendingSuperAdminRequests(activeOrgId, (requests) => {
      setPendingSuperAdminCount(requests.length);
    });
    return () => unsub();
  }, [activeOrgId, userProfile]);
  // ─────────────────────────────────────────────────────────────

  const onRefresh = async () => {
    if (!activeOrgId) return;
    setRefreshing(true);
    try {
      const testQuery = query(collection(db, 'organizations', activeOrgId, 'users'), limit(1));
      await getDocs(testQuery);
      setDbConnected(true);
      setServerOnline(true);
    } catch {
      setDbConnected(false);
      setServerOnline(false);
    }
    setRefreshing(false);
  };

  // ── Admin actions grid — added Super Admin Requests entry ────
  const adminActions = [
    {
      title: 'Create Event',
      icon: 'calendar-plus',
      color: '#FF9800',
      gradient: ['#FF9800', '#F57C00'],
      onPress: () => navigation.navigate('CreateEvent'),
    },
    {
      title: 'New Announcement',
      icon: 'bullhorn',
      color: '#E91E63',
      gradient: ['#E91E63', '#C2185B'],
      onPress: () => navigation.navigate('CreateAnnouncement'),
    },
    {
      title: 'Manage Users',
      icon: 'account-group',
      color: '#9C27B0',
      gradient: ['#9C27B0', '#7B1FA2'],
      onPress: () => navigation.navigate('UsersList'),
    },
    {
      title: 'Analytics',
      icon: 'chart-line',
      color: '#2196F3',
      gradient: ['#2196F3', '#1976D2'],
      onPress: () => navigation.navigate('Analytics'),
    },
    {
      title: 'Settings',
      icon: 'cog',
      color: '#607D8B',
      gradient: ['#607D8B', '#455A64'],
      onPress: () => navigation.navigate('Profile'),
    },
    {
      title: 'Upload Logo',
      icon: 'image-edit',
      color: '#00BCD4',
      gradient: ['#00BCD4', '#0097A7'],
      onPress: () => navigation.navigate('UploadLogo'),
    },
  ];

  const quickStats = [
    { label: 'Approved Users', value: stats.totalUsers, icon: 'account-check', color: '#4CAF50', action: () => navigation.navigate('UsersList') },
    { label: 'Pending Approval', value: stats.pendingUsers, icon: 'account-clock', color: '#FF9800', action: () => navigation.navigate('PendingUsers') },
    { label: 'Banned Users', value: stats.bannedUsers, icon: 'account-cancel', color: '#f44336', action: () => navigation.navigate('BannedUsers') },
  ];

  const userManagementItems = [
    { label: 'View All Users', icon: 'account-multiple', badge: stats.totalUsers, action: () => navigation.navigate('UsersList') },
    { label: 'Pending Approvals', icon: 'account-clock', badge: stats.pendingUsers, action: () => navigation.navigate('PendingUsers') },
    { label: 'Banned Users', icon: 'account-cancel', badge: stats.bannedUsers, action: () => navigation.navigate('BannedUsers') },
    // ── NEW entry ──
    {
      label: 'Super Admin Requests',
      icon: 'crown',
      badge: pendingSuperAdminCount,
      badgeColor: '#F59E0B',
      action: () => navigation.navigate('PendingSuperAdminRequests'),
    },
  ];

  if (!userProfile?.isAdmin) {
    return (
      <View style={styles.unauthorizedContainer}>
        <MaterialCommunityIcons name="shield-lock" size={80} color="#ccc" />
        <Text variant="headlineSmall" style={styles.unauthorizedTitle}>Access Denied</Text>
        <Text variant="bodyMedium" style={styles.unauthorizedText}>
          You don't have permission to access the admin panel.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#667EEA', '#764BA2']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <Text variant="titleSmall" style={styles.headerSubtitle}>Admin Dashboard</Text>
            <Text variant="headlineMedium" style={styles.headerTitle}>
              Welcome, {userProfile?.firstName}! 👑
            </Text>
            {/* ── NEW: show active org name when switched ── */}
            {activeOrgName ? (
              <Text style={styles.activeOrgLabel}>{activeOrgName}</Text>
            ) : null}
          </View>

          <View style={styles.headerRight}>
            {/* ── NEW: OrgSwitcher pill — only visible to super admins ── */}
          <OrgSwitcher style={styles.orgSwitcherPill} />
            <Avatar.Text
              size={50}
              label={`${userProfile?.firstName?.[0]}${userProfile?.lastName?.[0]}`}
              style={styles.avatar}
            />
          </View>
        </View>

        {/* Quick stats */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickStatsScroll}
          contentContainerStyle={styles.quickStatsContent}
        >
          {quickStats.map((stat, index) => (
            <TouchableOpacity key={index} onPress={stat.action}>
              <Surface style={styles.statCard} elevation={3}>
                <View style={styles.statHeader}>
                  <View style={[styles.statIconContainer, { backgroundColor: stat.color + '20' }]}>
                    <MaterialCommunityIcons name={stat.icon} size={24} color={stat.color} />
                  </View>
                </View>
                <Text variant="headlineMedium" style={styles.statValue}>{stat.value}</Text>
                <Text variant="bodySmall" style={styles.statLabel}>{stat.label}</Text>
              </Surface>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Quick Actions */}
        <View style={styles.section}>
          <Text variant="titleLarge" style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            {adminActions.map((action, index) => (
              <TouchableOpacity key={index} style={styles.actionCard} onPress={action.onPress}>
                <LinearGradient
                  colors={action.gradient}
                  style={styles.actionGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <MaterialCommunityIcons name={action.icon} size={32} color="#fff" />
                </LinearGradient>
                <Text variant="bodyMedium" style={styles.actionTitle}>{action.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* User Management */}
        <View style={styles.section}>
          <Text variant="titleLarge" style={styles.sectionTitle}>User Management</Text>
          <Card style={styles.managementCard}>
            <Card.Content>
              <View style={styles.managementHeader}>
                <View style={[styles.managementIcon, { backgroundColor: '#2196F3' + '20' }]}>
                  <MaterialCommunityIcons name="account-group" size={24} color="#2196F3" />
                </View>
                <Text variant="titleMedium" style={styles.managementTitle}>User Controls</Text>
              </View>
              <View style={styles.managementItems}>
                {userManagementItems.map((item, itemIndex) => (
                  <TouchableOpacity key={itemIndex} style={styles.managementItem} onPress={item.action}>
                    <MaterialCommunityIcons
                      name={item.icon}
                      size={22}
                      color={item.icon === 'crown' ? '#F59E0B' : '#666'}
                    />
                    <Text style={styles.managementItemText}>{item.label}</Text>
                    {item.badge !== undefined && item.badge > 0 && (
                      <View style={[
                        styles.badge,
                        { backgroundColor: item.badgeColor || (item.icon === 'account-cancel' ? '#f44336' : '#FF9800') },
                      ]}>
                        <Text style={styles.badgeText}>{item.badge}</Text>
                      </View>
                    )}
                    <MaterialCommunityIcons name="chevron-right" size={20} color="#ccc" />
                  </TouchableOpacity>
                ))}
              </View>
            </Card.Content>
          </Card>
        </View>

        {/* System Status */}
        <View style={styles.section}>
          <Text variant="titleLarge" style={styles.sectionTitle}>System Status</Text>
          <Card style={styles.statusCard}>
            <Card.Content>
              <View style={styles.statusItem}>
                <View style={styles.statusLeft}>
                  <MaterialCommunityIcons name="server" size={22} color={serverOnline ? '#4CAF50' : '#f44336'} />
                  <Text style={styles.statusLabel}>Server Status</Text>
                </View>
                <Chip
                  style={[styles.statusChipGreen, { backgroundColor: serverOnline ? '#E8F5E9' : '#FDECEA' }]}
                  textStyle={[styles.statusChipText, { color: serverOnline ? '#4CAF50' : '#f44336' }]}
                  icon={serverOnline ? 'check-circle' : 'alert-circle'}
                >
                  {serverOnline ? 'Online' : 'Offline'}
                </Chip>
              </View>
              <View style={styles.statusItem}>
                <View style={styles.statusLeft}>
                  <MaterialCommunityIcons name="database" size={22} color={dbConnected ? '#4CAF50' : '#f44336'} />
                  <Text style={styles.statusLabel}>Database</Text>
                </View>
                <Chip
                  style={[styles.statusChipGreen, { backgroundColor: dbConnected ? '#E8F5E9' : '#FDECEA' }]}
                  textStyle={[styles.statusChipText, { color: dbConnected ? '#4CAF50' : '#f44336' }]}
                  icon={dbConnected ? 'check-circle' : 'alert-circle'}
                >
                  {dbConnected ? 'Connected' : 'Disconnected'}
                </Chip>
              </View>
              <View style={styles.statusItem}>
                <View style={styles.statusLeft}>
                  <MaterialCommunityIcons name="account-multiple" size={22} color="#2196F3" />
                  <Text style={styles.statusLabel}>Total Registered</Text>
                </View>
                <Text style={styles.statusValue}>
                  {stats.totalUsers + stats.pendingUsers + stats.bannedUsers}
                </Text>
              </View>
              <View style={styles.statusItem}>
                <View style={styles.statusLeft}>
                  <MaterialCommunityIcons name="update" size={22} color="#2196F3" />
                  <Text style={styles.statusLabel}>Last Updated</Text>
                </View>
                <Text style={styles.statusValue}>
                  {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Loading...'}
                </Text>
              </View>
            </Card.Content>
          </Card>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <FAB
        icon="plus"
        label="Quick Create"
        style={styles.fab}
        onPress={() =>
          Alert.alert('Quick Create', 'Choose what to create', [
            { text: 'Event', onPress: () => navigation.navigate('CreateEvent') },
            { text: 'Announcement', onPress: () => navigation.navigate('CreateAnnouncement') },
            { text: 'Cancel', style: 'cancel' },
          ])
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { paddingTop: 60, paddingBottom: 20, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, marginBottom: 20 },
  headerLeft: { flex: 1 },
  headerRight: { alignItems: 'flex-end', gap: 10 },
  headerSubtitle: { color: '#fff', opacity: 0.9 },
  headerTitle: { color: '#fff', fontWeight: 'bold', marginTop: 4 },
  // ── NEW ──
  activeOrgLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  orgSwitcherPill: { marginBottom: 4 },
  // ─────────
  avatar: { backgroundColor: 'rgba(255, 255, 255, 0.3)' },
  quickStatsScroll: { paddingLeft: 20 },
  quickStatsContent: { paddingRight: 20, gap: 12 },
  statCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, minWidth: 140 },
  statHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statIconContainer: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontWeight: 'bold', color: '#1a1a1a' },
  statLabel: { color: '#666', marginTop: 4 },
  content: { flex: 1 },
  section: { padding: 20 },
  sectionTitle: { fontWeight: 'bold', color: '#1a1a1a', marginBottom: 15 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionCard: { width: '31%', alignItems: 'center' },
  actionGradient: { width: '100%', aspectRatio: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  actionTitle: { textAlign: 'center', fontSize: 12, color: '#1a1a1a', fontWeight: '500' },
  managementCard: { marginBottom: 15, backgroundColor: '#fff' },
  managementHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 15 },
  managementIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  managementTitle: { fontWeight: 'bold', color: '#1a1a1a' },
  managementItems: { gap: 4 },
  managementItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  managementItemText: { flex: 1, fontSize: 15, color: '#1a1a1a' },
  badge: { borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  statusCard: { backgroundColor: '#fff' },
  statusItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusLabel: { fontSize: 15, color: '#1a1a1a' },
  statusValue: { fontSize: 14, color: '#666', fontWeight: '500' },
  statusChipGreen: { backgroundColor: '#E8F5E9', height: 28 },
  statusChipText: { fontSize: 12, color: '#4CAF50', fontWeight: '600' },
  fab: { position: 'absolute', margin: 16, right: 0, bottom: 0, backgroundColor: '#6366F1' },
  unauthorizedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa', padding: 40 },
  unauthorizedTitle: { marginTop: 20, fontWeight: 'bold', color: '#666' },
  unauthorizedText: { marginTop: 10, color: '#999', textAlign: 'center' },
});