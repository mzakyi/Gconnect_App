// src/services/emailService.js
import emailjs from '@emailjs/react-native';

// ── CONFIG ───────────────────────────────────────────────────────────────────
const EMAILJS_SERVICE_ID  = 'service_wox936a';
const EMAILJS_PUBLIC_KEY  = 'noauI-HIjYU9gEPvM';
const TEMPLATE_ORG_CODE   = 'template_oqd7s8y'; 
const TEMPLATE_WELCOME    = 'template_oqd7s8y';  

/**
 * Initialize EmailJS — still called in App.js but the real fix is passing
 * the public key directly inside every send() call below, which is the
 * reliable approach for React Native.
 */
export const initEmailService = () => {
  try {
    emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
    console.log('✅ EmailJS initialized');
  } catch (error) {
    console.error('EmailJS init failed:', error);
  }
};


/**
 * Send org code email after group creation.
 * Public key is passed directly in send() — this is what actually makes
 * it work in React Native regardless of whether init() ran first.
 */
export const sendOrgCodeEmail = async (toEmail, toName, orgCode, groupName) => {
  console.log('📧 [EMAIL] Attempting to send org code email to:', toEmail);

  try {
    if (!toEmail) {
      console.warn('📧 [EMAIL] No email provided, skipping.');
      return { success: false };
    }

    const templateParams = {
      to_email:   toEmail,
      to_name:    toName || 'User',
      org_code:   orgCode,
      group_name: groupName,
    };

    console.log('📧 [EMAIL] Template params:', JSON.stringify(templateParams));

    // ✅ Pass publicKey as the 4th argument — this is required for React Native
    const result = await emailjs.send(
      EMAILJS_SERVICE_ID,
      TEMPLATE_ORG_CODE,
      templateParams,
      { publicKey: EMAILJS_PUBLIC_KEY },   // ← THE KEY FIX
    );

    console.log('✅ [EMAIL] Org code email sent! Status:', result?.status);
    return { success: true };

  } catch (error) {
    console.error('❌ [EMAIL] Org code email failed:', error?.text || error?.message || error);
    return { success: false, error };
  }
};


/**
 * Send approval email when admin approves a member (optional).
 */
export const sendApprovalEmail = async (toEmail, toName, groupName) => {
  console.log('📧 [EMAIL] Attempting to send approval email to:', toEmail);

  try {
    if (!toEmail) {
      console.warn('📧 [EMAIL] No email provided, skipping.');
      return { success: false };
    }

    const result = await emailjs.send(
      EMAILJS_SERVICE_ID,
      TEMPLATE_WELCOME,
      {
        to_email:   toEmail,
        to_name:    toName || 'User',
        group_name: groupName,
      },
      { publicKey: EMAILJS_PUBLIC_KEY },   // ← same fix here
    );

    console.log('✅ [EMAIL] Approval email sent! Status:', result?.status);
    return { success: true };

  } catch (error) {
    console.error('❌ [EMAIL] Approval email failed:', error?.text || error?.message || error);
    return { success: false, error };
  }
};