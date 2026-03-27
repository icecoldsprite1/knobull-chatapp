import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

// Firebase config — get these values from:
// Firebase Console → Project Settings → General → Your Apps → Config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

// Get the messaging instance (only works in browsers that support it)
let messaging = null;
if ('Notification' in window && 'serviceWorker' in navigator) {
  messaging = getMessaging(app);
}

/**
 * Asks the user for notification permission, then returns the FCM device token.
 * This token must be saved to the backend so the server can send pushes to this device.
 * 
 * @param {string} vapidKey - The VAPID key from Firebase Console → Cloud Messaging → Web Push Certificates
 * @returns {string|null} The device token, or null if permission was denied
 */
export const requestNotificationPermission = async (vapidKey) => {
  if (!messaging) {
    console.warn('Push messaging is not supported in this browser.');
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    
    if (permission !== 'granted') {
      console.log('Notification permission denied.');
      return null;
    }

    // Explicitly register the service worker ourselves so Firebase doesn't 
    // try to auto-register (which fails on React StrictMode double-mount)
    const swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    
    // Get the FCM token using our pre-registered service worker
    const token = await getToken(messaging, { 
      vapidKey,
      serviceWorkerRegistration: swRegistration 
    });
    console.log('FCM Device Token:', token);
    return token;
  } catch (err) {
    console.error('Error getting notification token:', err);
    return null;
  }
};

/**
 * Listens for incoming push messages while the app is in the FOREGROUND.
 * (Background messages are handled by the service worker.)
 */
export const onForegroundMessage = (callback) => {
  if (!messaging) return;
  onMessage(messaging, (payload) => {
    console.log('Foreground message received:', payload);
    callback(payload);
  });
};
