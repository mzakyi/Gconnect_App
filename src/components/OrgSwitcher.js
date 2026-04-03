import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
} from 'react-native';
import { Text, Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { useActiveOrg } from '../context/ActiveOrgContext';
import { getAllAdminOrgsForUser } from '../services/superAdminService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase.config';

export default function OrgSwitcher({ onSwitch, style }) {
  const { user, userProfile, organizationId } = useContext(AuthContext); // ← organizationId from AUTH
  const { activeOrgId, switchOrg } = useActiveOrg();


  const [showModal, setShowModal] = useState(false);
  const [allOrgs, setAllOrgs] = useState([]);
  const [currentOrgName, setCurrentOrgName] = useState('');

  const isSuperAdmin = userProfile?.isSuperAdmin === true;

  useEffect(() => {
    if (!isSuperAdmin || !user?.uid || !organizationId) return;
    loadOrgs();
  }, [isSuperAdmin, user?.uid, organizationId]);

// Replace the entire loadOrgs function and the activeOrg line:

  const loadOrgs = async () => {
    try {
      const currentSnap = await getDoc(doc(db, 'organizations', organizationId));
      const currentName = currentSnap.exists()
        ? currentSnap.data().name || currentSnap.data().organizationName || 'Your Org'
        : 'Your Org';
      setCurrentOrgName(currentName);

      const superOrgs = await getAllAdminOrgsForUser(user.uid);
      
      // Always put home org first, then others — filter duplicates
      const currentOrgEntry = { id: organizationId, name: currentName };
      const others = superOrgs.filter((o) => o.id !== organizationId);
      setAllOrgs([currentOrgEntry, ...others]);
    } catch (error) {
      console.error('OrgSwitcher loadOrgs error:', error);
    }
  };

  // Change this line — use activeOrgId from context, not local state:
  const activeOrg = allOrgs.find((o) => o.id === activeOrgId) || allOrgs[0];

  const handleSelect = (org) => {
    setShowModal(false);
    switchOrg(org.id, org.name);          // ← updates ActiveOrgContext globally
    if (onSwitch) onSwitch(org.id, org.name); // ← still calls prop if provided
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
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setShowModal(false)}
        >
          <Surface style={styles.sheet} elevation={6}>
            <Text style={styles.sheetTitle}>Switch Organization</Text>
            <Text style={styles.sheetSubtitle}>
              Select the organization you want to manage
            </Text>

            <FlatList
              data={allOrgs}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isActive = item.id === activeOrgId;
                return (
                  <TouchableOpacity
                    style={[styles.orgItem, isActive && styles.orgItemActive]}
                    onPress={() => handleSelect(item)}
                  >
                    <View
                      style={[
                        styles.orgIcon,
                        { backgroundColor: isActive ? '#667EEA20' : '#F1F5F9' },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={item.id === organizationId ? 'home' : 'office-building'}
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
                      <Text style={styles.orgItemRole}>
                        {item.id === organizationId
                          ? 'Home Organization · Admin'
                          : 'Super Admin'}
                      </Text>
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
              }}
              scrollEnabled={false}
            />

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowModal(false)}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Surface>
        </TouchableOpacity>
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