const path = require('path');

let admin;

try {
  admin = require('firebase-admin');
} catch (err) {
  console.warn('⚠️  firebase-admin is not installed. Push notifications will be disabled.');
  module.exports = null;
  return;
}

/**
 * Initialize Firebase Admin SDK
 * 
 * Heroku Deployment Note:
 * On Heroku, we use the FIREBASE_SERVICE_ACCOUNT_JSON environment variable
 * to inject the credentials, since we don't commit the JSON file.
 */
let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  // Production / Heroku
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch (err) {
    console.error('⚠️  Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON string.');
  }
} else {
  // Local Development
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    || path.join(__dirname, '..', '..', 'firebase-service-account.json');
  try {
    serviceAccount = require(serviceAccountPath);
  } catch (err) {
    // Suppress warning if intentionally running locally without push notifications
  }
}

if (serviceAccount) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('✅ Firebase Admin SDK initialized');
  } catch(err) {
    console.warn('⚠️  Firebase Admin SDK initialization failed:', err.message);
  }
} else {
  console.warn('⚠️  No Firebase credentials found. Push notifications will be disabled.');
}

module.exports = admin;
