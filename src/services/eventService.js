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
  arrayUnion,
  arrayRemove,
  deleteDoc,
  increment,
  getDoc
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';
import { getAuth } from 'firebase/auth';

// ⭐ NEW: Helper to get collection path
const getEventsCollection = (organizationId) => {
  if (organizationId) {
    return collection(db, 'organizations', organizationId, 'events');
  }
  // Fallback for backwards compatibility
  throw new Error('Organization ID required for events collection');
};

// ⭐ NEW: Helper to get document reference
const getEventDoc = (organizationId, eventId) => {
  if (organizationId) {
    return doc(db, 'organizations', organizationId, 'events', eventId);
  }
  throw new Error('Organization ID required for event document');
};

/**
 * Upload a file to Firebase Storage
 * ⭐ UPDATED: Now includes organizationId in storage path
 */
export const uploadEventFile = async (file, eventId, organizationId) => {
  try {
    const auth = getAuth();
    if (!auth.currentUser) {
      console.log('User not logged in. Skipping file upload.');
      return null;
    }

    const timestamp = Date.now();
    const fileName = `${timestamp}_${file.name}`;
    
    // ⭐ NEW: Organization-specific storage path
    const filePath = organizationId
      ? `organizations/${organizationId}/events/${eventId}/${fileName}`
      : `events/${eventId}/${fileName}`;
    
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
export const deleteEventFile = async (storagePath) => {
  try {
    const auth = getAuth();
    if (!auth.currentUser) {
      console.log('User not logged in. Skipping file deletion.');
      return;
    }

    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
};

/**
 * Create event with optional attachments
 * ⭐ UPDATED: Now requires organizationId
 */
export const createEvent = async (eventData, files = [], organizationId) => {
  try {
    if (!organizationId) {
      throw new Error('Organization ID is required');
    }

    const eventsCollection = getEventsCollection(organizationId);
    const docRef = await addDoc(eventsCollection, {
      ...eventData,
      attachments: [],
      rsvpYes: [],
      rsvpMaybe: [],
      rsvpNo: [],
      countYes: 0,
      countMaybe: 0,
      countNo: 0,
      organizationId: organizationId, // ⭐ NEW: Store orgId
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
    });

    if (files.length > 0) {
      const uploadedFiles = [];
      for (const file of files) {
        const fileData = await uploadEventFile(file, docRef.id, organizationId);
        if (fileData) uploadedFiles.push(fileData);
      }
      if (uploadedFiles.length > 0) {
        const eventDocRef = getEventDoc(organizationId, docRef.id);
        await updateDoc(eventDocRef, {
          attachments: uploadedFiles,
        });
      }
    }

    return docRef.id;
  } catch (error) {
    console.error('Error creating event:', error);
    throw error;
  }
};

/**
 * Subscribe to events (real-time updates)
 * ⭐ UPDATED: Now requires organizationId
 */
export const subscribeToEvents = (callback, organizationId) => {
  if (!organizationId) {
    console.error('Organization ID required for subscribeToEvents');
    callback([]);
    return () => {};
  }

  const eventsCollection = getEventsCollection(organizationId);
  const q = query(eventsCollection, orderBy('eventDateTime', 'asc'));

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(events);
  }, (error) => {
    console.error('Error in subscribeToEvents:', error);
    callback([]);
  });

  return unsubscribe;
};

/**
 * Update RSVP status
 * ⭐ UPDATED: Now requires organizationId
 */
export const updateRSVP = async (eventId, userId, oldStatus, newStatus, organizationId) => {
  if (!organizationId) {
    throw new Error('Organization ID is required');
  }

  const eventRef = getEventDoc(organizationId, eventId);
  const updates = {};

  if (oldStatus) {
    updates[`rsvp${oldStatus}`] = arrayRemove(userId);
    updates[`count${oldStatus}`] = increment(-1);
  }
  if (newStatus) {
    updates[`rsvp${newStatus}`] = arrayUnion(userId);
    updates[`count${newStatus}`] = increment(1);
  }

  await updateDoc(eventRef, updates);
};

/**
 * Update an existing event
 * ⭐ UPDATED: Now requires organizationId
 */
export const updateEvent = async (eventId, updates, organizationId) => {
  if (!organizationId) {
    throw new Error('Organization ID is required');
  }

  const eventDocRef = getEventDoc(organizationId, eventId);
  await updateDoc(eventDocRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
};

/**
 * Delete an event and its attachments safely
 * ⭐ UPDATED: Now requires organizationId
 */
export const deleteEvent = async (eventId, organizationId) => {
  try {
    if (!organizationId) {
      throw new Error('Organization ID is required');
    }

    const eventRef = getEventDoc(organizationId, eventId);
    const eventDoc = await getDoc(eventRef);

    if (!eventDoc.exists()) {
      throw new Error(`Event with ID ${eventId} not found`);
    }

    const eventData = eventDoc.data();

    // Delete all attachments safely
    if (Array.isArray(eventData.attachments) && eventData.attachments.length > 0) {
      for (const attachment of eventData.attachments) {
        if (attachment?.storagePath) {
          await deleteEventFile(attachment.storagePath);
        }
      }
    }

    // Delete the event document
    await deleteDoc(eventRef);
  } catch (error) {
    console.error('Error deleting event:', error);
    throw error;
  }
};

/**
 * Add attachment to existing event
 * ⭐ UPDATED: Now requires organizationId
 */
export const addAttachmentToEvent = async (eventId, file, organizationId) => {
  try {
    if (!organizationId) {
      throw new Error('Organization ID is required');
    }

    const fileData = await uploadEventFile(file, eventId, organizationId);
    if (!fileData) return null;

    const eventRef = getEventDoc(organizationId, eventId);
    const eventDoc = await getDoc(eventRef);
    const currentAttachments = eventDoc.data()?.attachments || [];

    await updateDoc(eventRef, {
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
 * Remove attachment from event
 * ⭐ UPDATED: Now requires organizationId
 */
export const removeAttachmentFromEvent = async (eventId, storagePath, organizationId) => {
  try {
    if (!organizationId) {
      throw new Error('Organization ID is required');
    }

    await deleteEventFile(storagePath);

    const eventRef = getEventDoc(organizationId, eventId);
    const eventDoc = await getDoc(eventRef);
    const currentAttachments = eventDoc.data()?.attachments || [];

    const updatedAttachments = currentAttachments.filter(att => att.storagePath !== storagePath);

    await updateDoc(eventRef, {
      attachments: updatedAttachments,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error removing attachment:', error);
    throw error;
  }
};