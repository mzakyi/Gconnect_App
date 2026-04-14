// src/components/OrgSwitcher.js
import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { useActiveOrg } from '../context/ActiveOrgContext';
import { getAllAdminOrgsForUser } from '../services/superAdminService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase.config';

export default function OrgSwitcher({ onSwitch, style }) {
  const { user, userProfile, organizationId } = useContext(AuthContext);
  const { activeOrgId, switchOrg } = useActiveOrg();

  const [showModal, setShowModal] = useState(false);
  const [allOrgs, setAllOrgs] = useState([]);
  const [currentOrgName, setCurrentOrgName] = useState('');

  // Any admin (including Super Users that have been demoted in some orgs)
  // can see the switcher as long as they have more than one org to switch to.
// Any user who belongs to multiple orgs can switch between them
  const isAdmin = userProfile?.isAdmin === true;

  useEffect(() => {
    if (!user?.uid || !organizationId) return;
    loadOrgs();
  }, [user?.uid, organizationId]);

  const loadOrgs = async () => {
    try {
      // ── Home org ──────────────────────────────────────────────────────────
      const currentSnap = await getDoc(doc(db, 'organizations', organizationId));
      const currentName = currentSnap.exists()
        ? currentSnap.data().name || currentSnap.data().organizationName || 'Your Org'
        : 'Your Org';
      setCurrentOrgName(currentName);

      // Fetch the user's actual isAdmin in their HOME org
      const homeUserSnap = await getDoc(
        doc(db, 'organizations', organizationId, 'users', user.uid)
      );
      const homeIsAdmin = homeUserSnap.exists()
        ? homeUserSnap.data()?.isAdmin === true
        : false;

      // getAllAdminOrgsForUser now returns { id, name, logoUrl, isAdmin }
      // ── Super User orgs (all orgs ever approved into, including demoted) ─
      let superOrgs = [];
      try {
        superOrgs = await getAllAdminOrgsForUser(user.uid);
      } catch (e) {
        console.warn('OrgSwitcher: could not load extra orgs', e.message);
      }

      // Build the combined list: home org first, then the rest
      const others = superOrgs.filter((o) => o.id !== organizationId);

      const combined = [
        {
          id: organizationId,
          name: currentName,
          isAdmin: homeIsAdmin,
          isHome: true,
        },
        ...others.map((o) => ({ ...o, isHome: false })),
      ];

      setAllOrgs(combined);
    } catch (error) {
      console.error('OrgSwitcher loadOrgs error:', error);
    }
  };

  const activeOrg = allOrgs.find((o) => o.id === activeOrgId) || allOrgs[0];

  const handleSelect = (org) => {
    setShowModal(false);
    switchOrg(org.id, org.name);
    if (onSwitch) onSwitch(org.id, org.name);
  };

  // Only render if there's more than one org to switch between
  if (allOrgs.length <= 1) return null;

  // Role label shown in the list item
  const getRoleLabel = (org) => {
    const parts = [];
    if (org.isHome) parts.push('Home Organization');
    else parts.push('Member');
    if (org.isAdmin) parts.push('Admin');
    return parts.join(' · ');
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.pill, style]}
        onPress={() => setShowModal(true)}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons name="crown" size={14} color="#FFD700" />
        <Text style={styles.pillText} numberOfLines={1}>
          {activeOrg?.name || currentOrgName}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={16} color="#fff" />
      </TouchableOpacity>

      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
        statusBarTranslucent
      >
        {/* Outer pressable overlay to dismiss */}
        <Pressable
          style={styles.overlay}
          onPress={() => setShowModal(false)}
        >
          {/* Inner view stops press propagation so tapping sheet doesn't close */}
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Switch Organization</Text>
            <Text style={styles.sheetSubtitle}>
              Select the organization you want to view
            </Text>

            {allOrgs.map((item) => {
              const isActive = item.id === activeOrgId;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.orgItem, isActive && styles.orgItemActive]}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.orgIcon,
                      { backgroundColor: isActive ? '#667EEA20' : '#F1F5F9' },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={item.isHome ? 'home' : 'office-building'}
                      size={22}
                      color={isActive ? '#667EEA' : '#94A3B8'}
                    />
                  </View>
                  <View style={styles.orgItemInfo}>
                    <Text
                      style={[
                        styles.orgItemName,
                        isActive && styles.orgItemNameActive,
                      ]}
                    >
                      {item.name}
                    </Text>
                    <View style={styles.roleRow}>
                      <Text style={styles.orgItemRole}>
                        {getRoleLabel(item)}
                      </Text>
                      {/* Crown icon only if currently admin in this org */}
                      {item.isAdmin && (
                        <MaterialCommunityIcons
                          name="shield-crown"
                          size={13}
                          color="#F59E0B"
                          style={{ marginLeft: 4 }}
                        />
                      )}
                    </View>
                  </View>
                  {isActive && (
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={22}
                      color="#667EEA"
                    />
                  )}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowModal(false)}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    maxWidth: 180,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  pillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 20,
  },
  orgItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
    backgroundColor: '#F8FAFC',
  },
  orgItemActive: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: '#667EEA',
  },
  orgIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgItemInfo: {
    flex: 1,
  },
  orgItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
  },
  orgItemNameActive: {
    color: '#667EEA',
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orgItemRole: {
    fontSize: 12,
    color: '#94A3B8',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  cancelText: {
    fontSize: 15,
    color: '#94A3B8',
    fontWeight: '600',
  },
});