// src/utils/notifications.js
// Utility to send Expo push notifications

const fetch = require('node-fetch');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Send a single push notification
async function sendPushNotification({ token, title, body, data = {} }) {
  if (!token || !token.startsWith('ExponentPushToken')) {
    return;
  }

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        sound: 'default',
        title,
        body,
        data,
        priority: 'high',
        channelId: 'default',
      }),
    });

    const result = await response.json();
    if (result.data?.status === 'error') {
      console.log('Push notification error:', result.data.message);
    }
  } catch (error) {
    console.log('Push notification send error:', error);
  }
}

// Send to multiple tokens at once
async function sendPushNotifications(notifications) {
  if (!notifications.length) return;

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(notifications),
    });
    const result = await response.json();
    console.log('Bulk push result:', result);
  } catch (error) {
    console.log('Bulk push error:', error);
  }
}

// Get a user's push token from Firestore
async function getUserPushToken(db, userId) {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      return userDoc.data().expoPushToken || null;
    }
    return null;
  } catch {
    return null;
  }
}

module.exports = { sendPushNotification, sendPushNotifications, getUserPushToken };