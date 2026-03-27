/**
 * Firebase Cloud Messaging (FCM) Service Worker
 * 
 * IMPORTANT ARCHITECTURE NOTE:
 * This file MUST remain in the `/public` directory and be named exactly `firebase-messaging-sw.js`.
 * 
 * What is a Service Worker?
 * It's a special JavaScript file that the browser runs in the background, completely 
 * separate from the React app. It stays alive even if the user closes all tabs of Knobull Chat.
 * 
 * Why `importScripts`?
 * Because this file runs outside the Webpack/Vite bundler build pipeline, we cannot 
 * use standard `import x from 'npm-package'` syntax. We must use the browser's native 
 * `importScripts` function to pull the Firebase SDK directly from Google's CDN.
 */

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Initialize the minimal Firebase app needed just for push notifications to work.
firebase.initializeApp({
  apiKey: 'AIzaSyBZDKqCLS2-9mWop1zVI9-15xcVPK0RUfE',
  authDomain: 'knobull-chat.firebaseapp.com',
  projectId: 'knobull-chat',
  storageBucket: 'knobull-chat.firebasestorage.app',
  messagingSenderId: '1050205487948',
  appId: '1:1050205487948:web:b6e54b35bb5d5b957a45e9',
});

const messaging = firebase.messaging();

/**
 * Background Message Handler
 * 
 * This ONLY fires when the user's browser tab is closed, minimized, or they are on another tab.
 * 
 * Note on "Data-Only" payloads:
 * Because our backend `notifyExperts()` sends a payload with ONLY a `data` object 
 * (and no `notification` object), Firebase doesn't automatically display an OS popup.
 * We must manually call `self.registration.showNotification` here to make the 
 * "ding!" happen on the user's desktop.
 */
messaging.onBackgroundMessage((payload) => {
  console.log('[Service Worker] Background message intercepted:', payload);

  const title = payload.data?.title || 'Knobull Chat';
  const options = {
    body: payload.data?.body || 'A student needs help!',
    icon: '/icons/icon-192.png', // PWA Icon
    badge: '/icons/icon-192.png',
    data: { url: payload.data?.url || '/' } // Tells the click handler where to navigate
  };

  // Tell the Operating System (Windows/Mac) to pop up a native notification banner
  self.registration.showNotification(title, options);
});

/**
 * Click Handler
 * 
 * What happens when the user clicks the native OS desktop notification?
 * 1. Close the notification banner.
 * 2. Force the browser to open the Knobull tab and focus it.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
