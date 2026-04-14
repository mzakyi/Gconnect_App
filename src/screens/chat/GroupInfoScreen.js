import React, { useState, useEffect, useContext } from 'react';
import { useActiveOrg } from '../../context/ActiveOrgContext';
import {
  View, StyleSheet, ScrollView, Alert, TouchableOpacity,
  Image, FlatList, Dimensions, TextInput as RNTextInput
} from 'react-native';
import {
  Text, Avatar, Surface, List, Divider, Button,
  IconButton, Searchbar, Modal, Portal, ActivityIndicator
} from 'react-native-paper';
import { AuthContext } from '../../context/AuthContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  doc, getDoc, collection, query, where,
  getDocs, orderBy, onSnapshot
} from 'firebase/firestore';
import { db } from '../../../firebase.config';
import * as ImagePicker from 'expo-image-picker';
import {
  addGroupMembers,
  removeGroupMember,
  leaveGroup,
  makeGroupAdmin,
  removeGroupAdmin,
  updateGroupInfo,
  deleteGroup,
  muteGroupChat,
  unmuteGroupChat,
  setGroupChatBackgroundImage,
  removeGroupChatBackgroundImage,
  renameGroupChat,
  setGroupChatImage,
} from '../../services/chatService';

const { width } = Dimensions.get('window');
const MEDIA_SIZE = (width - 48) / 3;

const MUTE_OPTIONS = [
  { label: '8 hours', value: 8 * 60 * 60 * 1000 },
  { label: '1 week', value: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Always', value: 'forever' },
];

const getMuteDescription = (isMuted, mutedUntil) => {
  if (!isMuted || !mutedUntil) return 'Notifications are on';
  if (mutedUntil === 'forever') return 'Muted forever';
  const remaining = new Date(mutedUntil).getTime() - Date.now();
  if (remaining <= 0) return 'Notifications are on';
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  if (hours < 1) return 'Muted (less than 1h remaining)';
  if (hours < 24) return `Muted for ${hours} more hour${hours !== 1 ? 's' : ''}`;
  const days = Math.floor(hours / 24);
  return `Muted for ${days} more day${days !== 1 ? 's' : ''}`;
};

export default function GroupInfoScreen({ route, navigation }) {
  const { groupId } = route.params;
  const { user, userProfile } = useContext(AuthContext);
const { activeOrgId: organizationId } = useActiveOrg();

  // ── Core state ──────────────────────────────────────────────────────────
  const [groupData, setGroupData]           = useState(null);
  const [groupName, setGroupName]           = useState(route.params.groupName || '');
  const [members, setMembers]               = useState([]);
  const [mediaFiles, setMediaFiles]         = useState([]);
  const [allUsers, setAllUsers]             = useState([]);
  const [selectedTab, setSelectedTab]       = useState('members');

  // ── Modal / UI state ────────────────────────────────────────────────────
  const [showAddMember, setShowAddMember]       = useState(false);
  const [showRenameModal, setShowRenameModal]   = useState(false);
  const [newGroupName, setNewGroupName]         = useState('');
  const [searchQuery, setSearchQuery]           = useState('');
  const [selectedUsers, setSelectedUsers]       = useState([]);
  const [loading, setLoading]                   = useState(false);
  const [savingBackground, setSavingBackground] = useState(false);
  const [savingGroupImage, setSavingGroupImage] = useState(false);

  // ── Live-synced fields (from onSnapshot) ────────────────────────────────
  const [backgroundImage, setBackgroundImage] = useState(null);
  const [isMuted, setIsMuted]                 = useState(false);
  const [mutedUntil, setMutedUntil]           = useState(null);

  // ── Derived permission flags ─────────────────────────────────────────────
  // isGroupAdmin: user is in the group's admins array
  const isGroupAdmin = groupData?.admins?.includes(user.uid) ?? false;
  // isCreator: user created the group (always has full control)
  const isCreator    = groupData?.createdBy === user.uid;
  // canManage: either creator or group-level admin
  const canManage    = isCreator || isGroupAdmin;

  // ── Main live listener ───────────────────────────────────────────────────
  // Listens to the group doc in real time. Whenever the admins array,
  // members array, name, backgroundImage, or mutedFor changes we
  // re-resolve member profiles so the UI is always up to date.
  useEffect(() => {
    if (!organizationId) return;

    const groupRef = doc(db, 'organizations', organizationId, 'groupChats', groupId);

    const unsubscribe = onSnapshot(groupRef, async (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();

      // ── Sync scalar fields ────────────────────────────────────────────
      setGroupData(data);
      setGroupName(data.name || '');
      setBackgroundImage(data.backgroundImage || null);

      // ── Mute ─────────────────────────────────────────────────────────
      const mu = data.mutedFor?.[user.uid] ?? null;
      const currentlyMuted =
        mu === 'forever' || (mu && new Date(mu).getTime() > Date.now());
      setIsMuted(currentlyMuted);
      setMutedUntil(mu);

      // ── Resolve member profiles live ──────────────────────────────────
      const memberIds = data.members  || [];
      const admins    = data.admins   || [];
      const creator   = data.createdBy;

      const memberPromises = memberIds.map(async (memberId) => {
        try {
          const userDoc = await getDoc(
            doc(db, 'organizations', organizationId, 'users', memberId)
          );
          return {
            id: memberId,
            isCreator: memberId === creator,
            isAdmin:   admins.includes(memberId),
            ...(userDoc.exists() ? userDoc.data() : {}),
          };
        } catch {
          return {
            id: memberId,
            isCreator: memberId === creator,
            isAdmin:   admins.includes(memberId),
          };
        }
      });

      const membersData = await Promise.all(memberPromises);

      // Sort: creator first, then admins, then everyone else
      membersData.sort((a, b) => {
        if (a.isCreator) return -1;
        if (b.isCreator) return  1;
        if (a.isAdmin && !b.isAdmin) return -1;
        if (b.isAdmin && !a.isAdmin) return  1;
        return 0;
      });

      setMembers(membersData);
    }, (err) => {
      console.error('GroupInfo onSnapshot error:', err);
    });

    // Load supplementary data that doesn't need to be live
    loadMediaFiles();
    loadAllUsers();

    return () => unsubscribe();
  }, [groupId, organizationId]);

  // ── Media files (images/videos shared in the group) ──────────────────────
  const loadMediaFiles = async () => {
    try {
      const messagesRef = collection(
        db, 'organizations', organizationId, 'groupChats', groupId, 'messages'
      );
      const q = query(
        messagesRef,
        where('type', 'in', ['image', 'video']),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      setMediaFiles(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error('Error loading media:', error);
    }
  };

  // ── All org users (for the "add member" modal) ────────────────────────────
  // Re-run whenever groupData changes so already-added members are excluded
  const loadAllUsers = async () => {
    try {
      const usersSnapshot = await getDocs(
        collection(db, 'organizations', organizationId, 'users')
      );
      // Refresh current members from groupData so the exclusion list is fresh
      const groupDoc = await getDoc(
        doc(db, 'organizations', organizationId, 'groupChats', groupId)
      );
      const currentMembers = groupDoc.exists()
        ? groupDoc.data().members || []
        : [];

      const usersList = usersSnapshot.docs
        .filter(d => !currentMembers.includes(d.id))
        .map(d => ({ id: d.id, uid: d.data().uid || d.id, ...d.data() }))
        .sort((a, b) =>
          `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
        );
      setAllUsers(usersList);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  // ── Rename ────────────────────────────────────────────────────────────────
  const handleRename = async () => {
    if (!newGroupName.trim()) {
      Alert.alert('Error', 'Group name cannot be empty');
      return;
    }
    setLoading(true);
    try {
      await renameGroupChat(groupId, newGroupName.trim(), organizationId);
      setShowRenameModal(false);
      Alert.alert('Done', 'Group name updated!');
    } catch {
      Alert.alert('Error', 'Failed to rename group');
    } finally {
      setLoading(false);
    }
  };

  // ── Mute ──────────────────────────────────────────────────────────────────
  const handleMuteToggle = () => {
    if (isMuted) {
      Alert.alert('Unmute group', 'Turn notifications back on?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unmute',
          onPress: () => unmuteGroupChat(groupId, user.uid, organizationId),
        },
      ]);
    } else {
      Alert.alert('Mute notifications', 'For how long?', [
        { text: 'Cancel', style: 'cancel' },
        ...MUTE_OPTIONS.map(opt => ({
          text: opt.label,
          onPress: () => muteGroupChat(groupId, user.uid, opt.value, organizationId),
        })),
      ]);
    }
  };


  const handlePickGroupImage = async () => {
    if (!canManage) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;

    setSavingGroupImage(true);
    try {
      await setGroupChatImage(groupId, result.assets[0].uri, organizationId);
      Alert.alert('Done', 'Group photo updated!');
    } catch {
      Alert.alert('Error', 'Failed to update group photo');
    } finally {
      setSavingGroupImage(false);
    }
  };
  // ── Background image ──────────────────────────────────────────────────────
  // Any group member can set/change the background (it's shared for all).
  // If you want to restrict this to admins only, wrap the buttons in {canManage && ...}
  const handlePickBackground = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
    });
    if (result.canceled) return;

    setSavingBackground(true);
    try {
      await setGroupChatBackgroundImage(groupId, result.assets[0].uri, organizationId);
      Alert.alert('Done', 'Background updated for everyone in this group!');
    } catch {
      Alert.alert('Error', 'Failed to set background image');
    } finally {
      setSavingBackground(false);
    }
  };

  const handleRemoveBackground = () => {
    Alert.alert('Remove background', 'Remove the background image for everyone?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeGroupChatBackgroundImage(groupId, organizationId),
      },
    ]);
  };

  // ── Add members ───────────────────────────────────────────────────────────
  const handleAddMembers = async () => {
    if (selectedUsers.length === 0) {
      Alert.alert('Error', 'Please select at least one member');
      return;
    }
    setLoading(true);
    try {
      await addGroupMembers(groupId, selectedUsers, organizationId);
      Alert.alert('Success', 'Members added successfully');
      setShowAddMember(false);
      setSelectedUsers([]);
      loadAllUsers(); // refresh the "add" list
    } catch {
      Alert.alert('Error', 'Failed to add members');
    } finally {
      setLoading(false);
    }
  };

  // ── Remove member ─────────────────────────────────────────────────────────
  const handleRemoveMember = (memberId, memberName) => {
    Alert.alert('Remove Member', `Remove ${memberName} from this group?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeGroupMember(groupId, memberId, organizationId);
            // onSnapshot fires automatically — no manual reload needed
          } catch {
            Alert.alert('Error', 'Failed to remove member');
          }
        },
      },
    ]);
  };

  // ── Make / remove admin ───────────────────────────────────────────────────
  const handleMakeAdmin = (memberId, memberName) => {
    Alert.alert('Make Admin', `Make ${memberName} a group admin?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Make Admin',
        onPress: async () => {
          try {
            await makeGroupAdmin(groupId, memberId, organizationId);
            // onSnapshot updates the admins array → isAdmin recalculates live
          } catch {
            Alert.alert('Error', 'Failed to make admin');
          }
        },
      },
    ]);
  };

  const handleRemoveAdmin = (memberId, memberName) => {
    Alert.alert('Remove Admin', `Remove admin privileges from ${memberName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeGroupAdmin(groupId, memberId, organizationId);
          } catch {
            Alert.alert('Error', 'Failed to remove admin');
          }
        },
      },
    ]);
  };

  // ── Leave / delete group ──────────────────────────────────────────────────
  const handleLeaveGroup = () => {
    Alert.alert('Leave Group', 'Are you sure you want to leave this group?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await leaveGroup(groupId, user.uid, organizationId);
            Alert.alert('Success', 'You left the group', [
              { text: 'OK', onPress: () => navigation.navigate('ChatList') },
            ]);
          } catch {
            Alert.alert('Error', 'Failed to leave group');
          }
        },
      },
    ]);
  };

  const handleDeleteGroup = () => {
    Alert.alert('Delete Group', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteGroup(groupId, organizationId);
            Alert.alert('Success', 'Group deleted', [
              { text: 'OK', onPress: () => navigation.navigate('ChatList') },
            ]);
          } catch {
            Alert.alert('Error', 'Failed to delete group');
          }
        },
      },
    ]);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const toggleUserSelection = (userId) =>
    setSelectedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );

  const filteredUsers = allUsers.filter(u =>
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const adminCount = members.filter(m => m.isAdmin && !m.isCreator).length;

  // ── Member row renderer ───────────────────────────────────────────────────
  const renderMember = (member) => {
    const isCurrentUser  = member.id === user.uid;
    // canManage is already derived at the top; use it to show the action dots
    const showActionDots = canManage && !isCurrentUser && !member.isCreator;

    return (
      <TouchableOpacity
        key={member.id}
        style={[
          styles.memberItem,
          member.isCreator             && styles.memberItemCreator,
          member.isAdmin && !member.isCreator && styles.memberItemAdmin,
        ]}
        onPress={() => {
          if (!showActionDots) return;
          Alert.alert(
            `${member.firstName} ${member.lastName}`,
            'Choose an action',
            [
              { text: 'Cancel', style: 'cancel' },
              member.isAdmin
                ? {
                    text: 'Remove Admin',
                    onPress: () =>
                      handleRemoveAdmin(
                        member.id,
                        `${member.firstName} ${member.lastName}`
                      ),
                  }
                : {
                    text: 'Make Admin',
                    onPress: () =>
                      handleMakeAdmin(
                        member.id,
                        `${member.firstName} ${member.lastName}`
                      ),
                  },
              {
                text: 'Remove from Group',
                style: 'destructive',
                onPress: () =>
                  handleRemoveMember(
                    member.id,
                    `${member.firstName} ${member.lastName}`
                  ),
              },
            ]
          );
        }}
      >
        {/* Avatar + online dot */}
        <View style={styles.memberLeft}>
          <View style={styles.avatarWrapper}>
            {member.profilePicture ? (
              <Avatar.Image
                size={56}
                source={{ uri: member.profilePicture }}
                style={styles.memberAvatar}
              />
            ) : (
              <Avatar.Text
                size={56}
                label={`${member.firstName?.[0] || ''}${member.lastName?.[0] || ''}`}
                style={styles.memberAvatar}
              />
            )}
            {member.online && (
              <View style={styles.onlineBadge}>
                <View style={styles.onlineDot} />
              </View>
            )}
          </View>

          {/* Name + badges */}
          <View style={styles.memberInfo}>
            <View style={styles.memberNameContainer}>
              <Text style={styles.memberName} numberOfLines={1}>
                {member.firstName} {member.lastName}
              </Text>
              {isCurrentUser && (
                <View style={styles.youBadge}>
                  <Text style={styles.youBadgeText}>You</Text>
                </View>
              )}
            </View>
            <Text style={styles.memberOccupation} numberOfLines={1}>
              {member.occupation || 'RTD Alumni'}
            </Text>
            <View style={styles.roleBadgesContainer}>
              {member.isCreator && (
                <View style={styles.creatorBadge}>
                  <MaterialCommunityIcons name="crown" size={12} color="#D97706" />
                  <Text style={styles.creatorBadgeText}>Creator</Text>
                </View>
              )}
              {member.isAdmin && !member.isCreator && (
                <View style={styles.adminBadge}>
                  <MaterialCommunityIcons name="shield-account" size={12} color="#2563EB" />
                  <Text style={styles.adminBadgeText}>Admin</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {showActionDots && (
          <MaterialCommunityIcons name="dots-vertical" size={24} color="#64748B" />
        )}
      </TouchableOpacity>
    );
  };

  // ── Media item renderer ───────────────────────────────────────────────────
  const renderMediaItem = ({ item }) => (
    <TouchableOpacity
      style={styles.mediaItem}
      onPress={() => {
        if (item.type === 'image')
          navigation.navigate('ImageViewer', { uri: item.mediaUrl });
        else if (item.type === 'video')
          navigation.navigate('VideoViewer', { uri: item.mediaUrl });
      }}
    >
      <Image
        source={{ uri: item.mediaUrl }}
        style={styles.mediaThumbnail}
        resizeMode="cover"
      />
      {item.type === 'video' && (
        <View style={styles.videoOverlay}>
          <MaterialCommunityIcons name="play-circle" size={32} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );

  // ── Add-member list item renderer ─────────────────────────────────────────
  const renderAddMemberItem = ({ item }) => {
    const isSelected = selectedUsers.includes(item.id);
    return (
      <TouchableOpacity style={styles.userItem} onPress={() => toggleUserSelection(item.id)}>
        {item.profilePicture ? (
          <Avatar.Image size={48} source={{ uri: item.profilePicture }} />
        ) : (
          <Avatar.Text
            size={48}
            label={`${item.firstName?.[0] || ''}${item.lastName?.[0] || ''}`}
          />
        )}
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.firstName} {item.lastName}</Text>
          <Text style={styles.userOccupation}>{item.occupation || 'RTD Alumni'}</Text>
        </View>
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <MaterialCommunityIcons name="check" size={16} color="#fff" />}
        </View>
      </TouchableOpacity>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>

      {/* ── Header ── */}
      <LinearGradient colors={['#128C7E', '#075E54']} style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Group Info</Text>

          {/* Rename button visible to admins & creator */}
          {canManage ? (
            <TouchableOpacity
              onPress={() => { setNewGroupName(groupName); setShowRenameModal(true); }}
              style={styles.renameBtn}
            >
              <MaterialCommunityIcons name="pencil" size={20} color="#fff" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 24 }} />
          )}
        </View>
      </LinearGradient>

      <ScrollView>

        {/* ── Profile section ── */}
        <View style={styles.profileSection}>
<TouchableOpacity
            onPress={() => {
              if (groupData?.image) {
                navigation.navigate('ImageViewer', { uri: groupData.image });
              } else if (canManage) {
                handlePickGroupImage();
              }
            }}
            onLongPress={() => canManage && handlePickGroupImage()}
            style={styles.avatarTouchable}
          >
            {savingGroupImage ? (
              <View style={styles.avatarLoadingContainer}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            ) : groupData?.image ? (
              <Avatar.Image size={100} source={{ uri: groupData.image }} style={styles.avatar} />
            ) : (
              <Avatar.Icon size={100} icon="account-group" style={styles.avatar} />
            )}
            {canManage && (
              <View style={styles.avatarEditBadge}>
                <MaterialCommunityIcons name="camera" size={14} color="#fff" />
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.groupNameRow}>
            <Text style={styles.groupName}>{groupName}</Text>
            {canManage && (
              <TouchableOpacity
                onPress={() => { setNewGroupName(groupName); setShowRenameModal(true); }}
                style={styles.inlineRenameBtn}
              >
                <MaterialCommunityIcons name="pencil-outline" size={18} color="#128C7E" />
              </TouchableOpacity>
            )}
          </View>

          {groupData?.description ? (
            <Text style={styles.groupDescription}>{groupData.description}</Text>
          ) : null}

          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{members.length}</Text>
              <Text style={styles.statLabel}>Members</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{adminCount + 1}</Text>
              <Text style={styles.statLabel}>Admins</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{mediaFiles.length}</Text>
              <Text style={styles.statLabel}>Media</Text>
            </View>
          </View>
        </View>

        <Divider />

        {/* ── Mute ── */}
        <List.Section>
          <List.Subheader>Notifications</List.Subheader>
          <List.Item
            title="Mute Notifications"
            description={getMuteDescription(isMuted, mutedUntil)}
            left={props => (
              <List.Icon
                {...props}
                icon={isMuted ? 'bell-off' : 'bell'}
                color={isMuted ? '#F59E0B' : undefined}
              />
            )}
            right={() => (
              <View style={{ justifyContent: 'center' }}>
                <MaterialCommunityIcons
                  name={isMuted ? 'toggle-switch' : 'toggle-switch-off-outline'}
                  size={36}
                  color={isMuted ? '#128C7E' : '#CBD5E1'}
                  onPress={handleMuteToggle}
                />
              </View>
            )}
            onPress={handleMuteToggle}
          />
        </List.Section>

        <Divider />

        {/* ── Chat background ── */}
        {/* All members can see the background preview.               */}
        {/* The change/remove buttons are shown to ALL members here.  */}
        {/* To restrict to admins only, wrap buttons in {canManage && ...} */}
        <List.Section>
          <List.Subheader>Chat Background</List.Subheader>

          {backgroundImage ? (
            <View style={styles.bgPreviewContainer}>
              <Image
                source={{ uri: backgroundImage }}
                style={styles.bgPreview}
                resizeMode="cover"
              />
              <View style={styles.bgPreviewOverlay}>
                <Text style={styles.bgPreviewLabel}>
                  Current background (shared by all members)
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.bgPlaceholder}>
              <MaterialCommunityIcons name="image-outline" size={40} color="#CBD5E1" />
              <Text style={styles.bgPlaceholderText}>No background set</Text>
            </View>
          )}

          {/* Background buttons — visible to admins/creator only */}
          {canManage && (
            <>
              <View style={styles.bgButtonRow}>
                <TouchableOpacity
                  style={[styles.bgButton, styles.bgButtonPrimary]}
                  onPress={handlePickBackground}
                  disabled={savingBackground}
                >
                  {savingBackground ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="image-edit" size={18} color="#fff" />
                      <Text style={styles.bgButtonText}>
                        {backgroundImage ? 'Change background' : 'Set background'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {backgroundImage && (
                  <TouchableOpacity
                    style={[styles.bgButton, styles.bgButtonDanger]}
                    onPress={handleRemoveBackground}
                  >
                    <MaterialCommunityIcons name="image-remove" size={18} color="#fff" />
                    <Text style={styles.bgButtonText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.bgNote}>
                Admins can set a background image for all group members.
              </Text>
            </>
          )}
        </List.Section>

        <Divider />

        {/* ── Tabs: Members / Media ── */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, selectedTab === 'members' && styles.tabActive]}
            onPress={() => setSelectedTab('members')}
          >
            <MaterialCommunityIcons
              name="account-group"
              size={20}
              color={selectedTab === 'members' ? '#128C7E' : '#999'}
            />
            <Text style={[styles.tabText, selectedTab === 'members' && styles.tabTextActive]}>
              Members
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, selectedTab === 'media' && styles.tabActive]}
            onPress={() => setSelectedTab('media')}
          >
            <MaterialCommunityIcons
              name="image-multiple"
              size={20}
              color={selectedTab === 'media' ? '#128C7E' : '#999'}
            />
            <Text style={[styles.tabText, selectedTab === 'media' && styles.tabTextActive]}>
              Media
            </Text>
          </TouchableOpacity>
        </View>

        <Divider />

        {/* ── Members tab ── */}
        {selectedTab === 'members' && (
          <View style={styles.membersSection}>
            {/* Add member button — admins/creator only */}
            {canManage && (
              <TouchableOpacity
                style={styles.addMemberButton}
                onPress={() => setShowAddMember(true)}
              >
                <View style={styles.addMemberIconContainer}>
                  <MaterialCommunityIcons name="account-plus" size={24} color="#128C7E" />
                </View>
                <View style={styles.addMemberTextContainer}>
                  <Text style={styles.addMemberText}>Add Members</Text>
                  <Text style={styles.addMemberSubtext}>Invite more alumni to join</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={24} color="#128C7E" />
              </TouchableOpacity>
            )}

            {members.map(member => renderMember(member))}
          </View>
        )}

        {/* ── Media tab ── */}
        {selectedTab === 'media' && (
          <View style={styles.mediaSection}>
            {mediaFiles.length === 0 ? (
              <View style={styles.emptyMedia}>
                <MaterialCommunityIcons name="image-off" size={64} color="#ccc" />
                <Text style={styles.emptyMediaText}>No media shared yet</Text>
              </View>
            ) : (
              <FlatList
                data={mediaFiles}
                renderItem={renderMediaItem}
                keyExtractor={item => item.id}
                numColumns={3}
                scrollEnabled={false}
                contentContainerStyle={styles.mediaGrid}
              />
            )}
          </View>
        )}

        <Divider style={{ marginTop: 20 }} />

        {/* ── Group actions ── */}
        <List.Section>
          <List.Subheader>Group Actions</List.Subheader>

          {/* Leave group — any non-creator member */}
          {!isCreator && (
            <List.Item
              title="Leave Group"
              titleStyle={{ color: '#F44336' }}
              left={props => <List.Icon {...props} icon="exit-to-app" color="#F44336" />}
              right={props => <List.Icon {...props} icon="chevron-right" color="#F44336" />}
              onPress={handleLeaveGroup}
            />
          )}

          {/* Delete group — creator only */}
          {isCreator && (
            <List.Item
              title="Delete Group"
              titleStyle={{ color: '#F44336' }}
              left={props => <List.Icon {...props} icon="delete" color="#F44336" />}
              right={props => <List.Icon {...props} icon="chevron-right" color="#F44336" />}
              onPress={handleDeleteGroup}
            />
          )}
        </List.Section>

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ── Rename modal ── */}
      <Portal>
        <Modal
          visible={showRenameModal}
          onDismiss={() => setShowRenameModal(false)}
          contentContainerStyle={styles.renameModal}
        >
          <Text style={styles.renameModalTitle}>Rename Group</Text>
          <RNTextInput
            value={newGroupName}
            onChangeText={setNewGroupName}
            placeholder="Enter new group name"
            style={styles.renameInput}
            maxLength={50}
            autoFocus
          />
          <Text style={styles.renameCharCount}>{newGroupName.length}/50</Text>
          <View style={styles.renameModalButtons}>
            <Button
              mode="outlined"
              onPress={() => setShowRenameModal(false)}
              style={styles.renameModalBtn}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleRename}
              loading={loading}
              disabled={!newGroupName.trim() || loading}
              buttonColor="#128C7E"
              style={styles.renameModalBtn}
            >
              Save
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* ── Add members modal ── */}
      <Portal>
        <Modal
          visible={showAddMember}
          onDismiss={() => {
            setShowAddMember(false);
            setSelectedUsers([]);
            setSearchQuery('');
          }}
          contentContainerStyle={styles.modal}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Members</Text>
            <IconButton icon="close" size={24} onPress={() => setShowAddMember(false)} />
          </View>

          <Searchbar
            placeholder="Search alumni..."
            onChangeText={setSearchQuery}
            value={searchQuery}
            style={styles.searchBar}
          />

          <FlatList
            data={filteredUsers}
            renderItem={renderAddMemberItem}
            keyExtractor={item => item.id}
            style={styles.userList}
            contentContainerStyle={styles.userListContent}
          />

          <Button
            mode="contained"
            onPress={handleAddMembers}
            loading={loading}
            disabled={selectedUsers.length === 0 || loading}
            style={styles.addButton}
            buttonColor="#128C7E"
          >
            Add {selectedUsers.length}{' '}
            {selectedUsers.length === 1 ? 'Member' : 'Members'}
          </Button>
        </Modal>
      </Portal>

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#F8FAFC' },
  header:         { paddingTop: 50, paddingBottom: 15 },
  headerContent:  {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 15,
  },
  headerTitle:    { fontSize: 20, fontWeight: '700', color: '#fff' },
  renameBtn:      { padding: 4 },

  // Profile
  profileSection: { alignItems: 'center', paddingVertical: 30, backgroundColor: '#fff' },
  avatar:         { backgroundColor: '#128C7E', marginBottom: 0 },
  avatarTouchable: { marginBottom: 15, position: 'relative' },
  avatarLoadingContainer: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#128C7E', alignItems: 'center', justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: '#128C7E', borderRadius: 12,
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  groupNameRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  groupName:      {
    fontSize: 24, fontWeight: '700', color: '#1E293B',
    textAlign: 'center', paddingHorizontal: 20,
  },
  inlineRenameBtn:  { padding: 4 },
  groupDescription: {
    fontSize: 14, color: '#64748B', marginBottom: 20,
    textAlign: 'center', paddingHorizontal: 30,
  },
  statsContainer: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 30, marginTop: 10,
  },
  statItem:    { alignItems: 'center', paddingHorizontal: 20 },
  statNumber:  { fontSize: 24, fontWeight: '700', color: '#128C7E', marginBottom: 4 },
  statLabel:   { fontSize: 12, color: '#64748B', fontWeight: '500' },
  statDivider: { width: 1, height: 40, backgroundColor: '#E2E8F0' },

  // Background
  bgPreviewContainer: {
    marginHorizontal: 16, borderRadius: 12,
    overflow: 'hidden', height: 140, marginBottom: 12,
  },
  bgPreview: { width: '100%', height: '100%' },
  bgPreviewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end', padding: 10,
  },
  bgPreviewLabel:     { color: '#fff', fontSize: 12, fontWeight: '600' },
  bgPlaceholder:      {
    marginHorizontal: 16, height: 100, borderRadius: 12,
    backgroundColor: '#F8FAFC', borderWidth: 2, borderColor: '#E2E8F0',
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center',
    marginBottom: 12, gap: 6,
  },
  bgPlaceholderText:  { color: '#94A3B8', fontSize: 13 },
  bgButtonRow:        { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 8 },
  bgButton:           {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 7, paddingVertical: 11, borderRadius: 10,
  },
  bgButtonPrimary:    { backgroundColor: '#128C7E' },
  bgButtonDanger:     { backgroundColor: '#F44336' },
  bgButtonText:       { color: '#fff', fontSize: 14, fontWeight: '600' },
  bgNote:             {
    fontSize: 12, color: '#94A3B8',
    paddingHorizontal: 16, marginBottom: 8, fontStyle: 'italic',
  },

  // Tabs
  tabContainer: { flexDirection: 'row', backgroundColor: '#fff' },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingVertical: 15, gap: 8,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive:      { borderBottomColor: '#128C7E' },
  tabText:        { fontSize: 14, fontWeight: '600', color: '#999' },
  tabTextActive:  { color: '#128C7E' },

  // Members
  membersSection: { padding: 16, backgroundColor: '#F8FAFC' },
  addMemberButton: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    backgroundColor: '#fff', borderRadius: 16, marginBottom: 16,
    borderWidth: 2, borderColor: '#10B981', borderStyle: 'dashed',
  },
  addMemberIconContainer: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#ECFDF5',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  addMemberTextContainer: { flex: 1 },
  addMemberText:          { fontSize: 16, fontWeight: '600', color: '#128C7E', marginBottom: 2 },
  addMemberSubtext:       { fontSize: 12, color: '#64748B' },
  memberItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, backgroundColor: '#fff', borderRadius: 16, marginBottom: 12, elevation: 1,
  },
  memberItemCreator:  { borderWidth: 2, borderColor: '#FCD34D', backgroundColor: '#FFFBEB' },
  memberItemAdmin:    { borderWidth: 2, borderColor: '#93C5FD', backgroundColor: '#EFF6FF' },
  memberLeft:         { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarWrapper:      { position: 'relative', marginRight: 12 },
  memberAvatar:       { backgroundColor: '#128C7E' },
  onlineBadge: {
    position: 'absolute', bottom: 0, right: 0, backgroundColor: '#fff',
    borderRadius: 10, padding: 3, borderWidth: 2, borderColor: '#fff',
  },
  onlineDot:          { width: 10, height: 10, borderRadius: 5, backgroundColor: '#10B981' },
  memberInfo:         { flex: 1 },
  memberNameContainer:{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  memberName:         { fontSize: 16, fontWeight: '600', color: '#1E293B', maxWidth: '70%' },
  youBadge:           { backgroundColor: '#E0E7FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  youBadgeText:       { fontSize: 10, fontWeight: '700', color: '#4338CA' },
  memberOccupation:   { fontSize: 13, color: '#64748B', marginBottom: 6 },
  roleBadgesContainer:{ flexDirection: 'row', gap: 6 },
  creatorBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 4,
  },
  creatorBadgeText:   { fontSize: 11, fontWeight: '700', color: '#D97706' },
  adminBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#DBEAFE',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 4,
  },
  adminBadgeText:     { fontSize: 11, fontWeight: '700', color: '#2563EB' },

  // Media
  mediaSection:       { padding: 16 },
  mediaGrid:          { paddingBottom: 20 },
  mediaItem:          { width: MEDIA_SIZE, height: MEDIA_SIZE, margin: 2, borderRadius: 8, overflow: 'hidden' },
  mediaThumbnail:     { width: '100%', height: '100%' },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  emptyMedia:         { alignItems: 'center', paddingVertical: 60 },
  emptyMediaText:     { fontSize: 16, fontWeight: '600', color: '#64748B', marginTop: 15 },

  // Rename modal
  renameModal:        {
    backgroundColor: '#fff', marginHorizontal: 30,
    borderRadius: 20, padding: 24,
  },
  renameModalTitle:   { fontSize: 20, fontWeight: '700', color: '#1E293B', marginBottom: 20 },
  renameInput: {
    borderWidth: 2, borderColor: '#E2E8F0', borderRadius: 12,
    padding: 14, fontSize: 16, color: '#1E293B', backgroundColor: '#F8FAFC',
  },
  renameCharCount:    {
    fontSize: 12, color: '#94A3B8', textAlign: 'right',
    marginTop: 4, marginBottom: 20,
  },
  renameModalButtons: { flexDirection: 'row', gap: 12 },
  renameModalBtn:     { flex: 1 },

  // Add member modal
  modal:              {
    backgroundColor: '#fff', margin: 20,
    borderRadius: 20, maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', padding: 16,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  modalTitle:         { fontSize: 20, fontWeight: '700', color: '#1E293B' },
  searchBar:          { margin: 16, elevation: 0, backgroundColor: '#F8FAFC', borderRadius: 12 },
  userList:           { maxHeight: 400 },
  userListContent:    { padding: 16, paddingTop: 0 },
  userItem: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    backgroundColor: '#F8FAFC', borderRadius: 12, marginBottom: 8,
  },
  userInfo:           { flex: 1, marginLeft: 12 },
  userName:           { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  userOccupation:     { fontSize: 13, color: '#64748B', marginTop: 2 },
  checkbox: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center',
  },
  checkboxSelected:   { backgroundColor: '#128C7E', borderColor: '#128C7E' },
  addButton:          { margin: 16, marginTop: 8, borderRadius: 12 },
});