const admin = require('firebase-admin');
const path = require('path');

/**
 * Initialize Firebase Admin SDK
 * 
 * To set this up:
 * 1. Go to Firebase Console → Project Settings → Service Accounts
 * 2. Click "Generate New Private Key"
 * 3. Save the JSON file as 'firebase-service-account.json' in the server/ root
 * 4. Add 'firebase-service-account.json' to your .gitignore!
 */
// __dirname = server/src/config/, so we go up 2 levels to reach server/
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  || path.join(__dirname, '..', '..', 'firebase-service-account.json');

try {
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log('✅ Firebase Admin SDK initialized');
} catch (err) {
  console.warn('⚠️  Firebase Admin SDK not initialized:', err.message);
  console.warn('   Push notifications will be disabled until you add firebase-service-account.json');
}

module.exports = admin;
