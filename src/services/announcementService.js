import { db, storage } from '../../firebase.config';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  doc,
  deleteDoc,
  getDoc
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';

// ==================== HELPERS ====================

const getAnnouncementsCollection = (organizationId) => {
  if (!organizationId) throw new Error('Organization ID required for announcements collection');
  return collection(db, 'organizations', organizationId, 'announcements');
};

const getAnnouncementDoc = (organizationId, announcementId) => {
  if (!organizationId) throw new Error('Organization ID required for announcement document');
  return doc(db, 'organizations', organizationId, 'announcements', announcementId);
};

// ==================== FILE UPLOAD ====================

/**
 * Upload a file to Firebase Storage
 */
export const uploadAnnouncementFile = async (file, announcementId, organizationId) => {
  try {
    const timestamp = Date.now();
    const fileName = `${timestamp}_${file.name}`;
    const filePath = organizationId
      ? `organizations/${organizationId}/announcements/${announcementId}/${fileName}`
      : `announcements/${announcementId}/${fileName}`;

    const storageRef = ref(storage, filePath);
    const response = await fetch(file.uri);
    const blob = await response.blob();

    await uploadBytes(storageRef, blob, { contentType: file.type });
    const downloadURL = await getDownloadURL(storageRef);

    return {
      downloadURL,
      fileName: file.name,
      fileType: file.type,
      fileSize: blob.size,
      storagePath: filePath,
      uploadedAt: new Date(),
    };
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
};

/**
 * Delete a file from Firebase Storage
 */
export const deleteAnnouncementFile = async (storagePath) => {
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
};

// ==================== CRUD ====================

/**
 * Create a new announcement with optional file attachments
 */
export const createAnnouncement = async (announcementData, files = [], organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');

    const docRef = await addDoc(getAnnouncementsCollection(organizationId), {
      ...announcementData,
      attachments: [],
      organizationId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (files.length > 0) {
      const uploadedFiles = [];
      for (const file of files) {
        const fileData = await uploadAnnouncementFile(file, docRef.id, organizationId);
        uploadedFiles.push(fileData);
      }
      await updateDoc(getAnnouncementDoc(organizationId, docRef.id), {
        attachments: uploadedFiles,
      });
    }

    return docRef.id;
  } catch (error) {
    console.error('Error creating announcement:', error);
    throw error;
  }
};

/**
 * Subscribe to announcements with real-time updates
 */
export const subscribeToAnnouncements = (callback, organizationId) => {
  if (!organizationId) {
    console.error('Organization ID required for subscribeToAnnouncements');
    callback([]);
    return () => {};
  }

  const q = query(
    getAnnouncementsCollection(organizationId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const announcements = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(announcements);
  }, (error) => {
    console.error('Error in subscribeToAnnouncements:', error);
    callback([]);
  });
};

/**
 * Update an existing announcement
 */
export const updateAnnouncement = async (announcementId, updates, organizationId) => {
  if (!organizationId) throw new Error('Organization ID is required');

  await updateDoc(getAnnouncementDoc(organizationId, announcementId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
};

/**
 * Delete an announcement and all its attachments
 */
export const deleteAnnouncement = async (announcementId, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');

    const announcementRef = getAnnouncementDoc(organizationId, announcementId);
    const announcementDoc = await getDoc(announcementRef);
    const announcementData = announcementDoc.data();

    if (announcementData?.attachments?.length > 0) {
      for (const attachment of announcementData.attachments) {
        if (attachment.storagePath) {
          await deleteAnnouncementFile(attachment.storagePath);
        }
      }
    }

    await deleteDoc(announcementRef);
  } catch (error) {
    console.error('Error deleting announcement:', error);
    throw error;
  }
};

/**
 * Add an attachment to an existing announcement
 */
export const addAttachmentToAnnouncement = async (announcementId, file, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');

    const fileData = await uploadAnnouncementFile(file, announcementId, organizationId);
    const announcementRef = getAnnouncementDoc(organizationId, announcementId);
    const announcementDoc = await getDoc(announcementRef);
    const currentAttachments = announcementDoc.data()?.attachments || [];

    await updateDoc(announcementRef, {
      attachments: [...currentAttachments, fileData],
      updatedAt: serverTimestamp(),
    });

    return fileData;
  } catch (error) {
    console.error('Error adding attachment:', error);
    throw error;
  }
};

/**
 * Remove an attachment from an announcement
 */
export const removeAttachmentFromAnnouncement = async (announcementId, storagePath, organizationId) => {
  try {
    if (!organizationId) throw new Error('Organization ID is required');

    await deleteAnnouncementFile(storagePath);

    const announcementRef = getAnnouncementDoc(organizationId, announcementId);
    const announcementDoc = await getDoc(announcementRef);
    const currentAttachments = announcementDoc.data()?.attachments || [];

    const updatedAttachments = currentAttachments.filter(
      att => att.storagePath !== storagePath
    );

    await updateDoc(announcementRef, {
      attachments: updatedAttachments,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error removing attachment:', error);
    throw error;
  }
};