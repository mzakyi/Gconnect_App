// src/services/organizationService.js
import { db } from '../../firebase.config';
import { collection, query, where, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const storage = getStorage();

export const organizationService = {
  validateOrgCode: async (orgCode) => {
    try {
      const orgRef = collection(db, 'organizations');
      const q = query(orgRef, where('orgCode', '==', orgCode));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return { success: false, error: 'Organization code not found' };
      }

      const docData = snapshot.docs[0].data();
      return {
        success: true,
        organizationId: snapshot.docs[0].id,
        organizationName: docData.name || docData.organizationName,
      };
    } catch (err) {
      console.error('Error validating org code:', err);
      return { success: false, error: err.message };
    }
  },

  uploadOrgLogo: async (organizationId, imageUri) => {
    try {
      const response = await fetch(imageUri);
      const blob = await response.blob();

      const logoRef = ref(storage, `organizations/${organizationId}/logo/logo.jpg`);
      await uploadBytes(logoRef, blob);

      const downloadURL = await getDownloadURL(logoRef);

      const orgDocRef = doc(db, 'organizations', organizationId);
      await updateDoc(orgDocRef, { logoUrl: downloadURL });

      return { success: true, logoUrl: downloadURL };
    } catch (err) {
      console.error('Error uploading org logo:', err);
      return { success: false, error: err.message };
    }
  },

  getOrgLogo: async (organizationId) => {
    try {
      const orgDocRef = doc(db, 'organizations', organizationId);
      const orgDoc = await getDoc(orgDocRef);
      if (orgDoc.exists()) {
        return orgDoc.data().logoUrl || null;
      }
      return null;
    } catch (err) {
      console.error('Error fetching org logo:', err);
      return null;
    }
  },

  getOrgName: async (organizationId) => {
    try {
      const orgDocRef = doc(db, 'organizations', organizationId);
      const orgDoc = await getDoc(orgDocRef);
      if (orgDoc.exists()) {
        return orgDoc.data().name || orgDoc.data().organizationName || null;
      }
      return null;
    } catch (err) {
      console.error('Error fetching org name:', err);
      return null;
    }
  },
};