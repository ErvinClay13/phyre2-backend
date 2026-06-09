const express = require('express');
const router = express.Router();
const { db, admin } = require('../firebase');
const verifyToken = require('../middleware/auth');
const { sendPushNotification, getUserPushToken } = require('../utils/notifications');

// POST /api/messages/send
router.post('/send', verifyToken, async (req, res) => {
  const { toUserId, text } = req.body;
  const fromUserId = req.user.uid;

  if (!toUserId || !text) {
    return res.status(400).json({ error: 'Missing toUserId or text' });
  }
  if (fromUserId === toUserId) {
    return res.status(400).json({ error: 'Cannot message yourself' });
  }

  try {
    // Check if users are matched
    const matchDoc = await db.collection('users').doc(fromUserId).collection('matches').doc(toUserId).get();
    const isMatched = matchDoc.exists;

    // Get recipient's privacy setting
    const recipientDoc = await db.collection('users').doc(toUserId).get();
    if (!recipientDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    const recipientData = recipientDoc.data();
    const messagePrivacy = recipientData?.messagePrivacy || 'requests';

    // Enforce privacy rules
    if (messagePrivacy === 'matches' && !isMatched) {
      return res.status(403).json({
        error: 'Sorry but you cannot message this user.',
        blocked: true,
      });
    }

    // Check if sender is blocked by recipient
    const blockDoc = await db.collection('users').doc(toUserId).collection('blocked').doc(fromUserId).get();
    if (blockDoc.exists) {
      return res.status(403).json({
        error: 'Sorry but you cannot message this user.',
        blocked: true,
      });
    }

    const isRequest = messagePrivacy === 'requests' && !isMatched;
    const conversationId = [fromUserId, toUserId].sort().join('_');

    const messageData = {
      fromUserId,
      toUserId,
      text,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
      isRequest,
    };

    await db.collection('conversations').doc(conversationId).collection('messages').add(messageData);
    await db.collection('conversations').doc(conversationId).set({
      participants: [fromUserId, toUserId],
      lastMessage: text,
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageFrom: fromUserId,
      isRequest,
      [fromUserId + '_unread']: 0,
      [toUserId + '_unread']: (recipientData?.[toUserId + '_unread'] || 0) + 1,
    }, { merge: true });

    // Send push notification to recipient
    try {
      const senderDoc = await db.collection('users').doc(fromUserId).get();
      const senderName = senderDoc.data()?.name || 'Someone';
      const recipientToken = await getUserPushToken(db, toUserId);
      if (recipientToken) {
        const preview = text.length > 50 ? text.substring(0, 50) + '...' : text;
        sendPushNotification({
          token: recipientToken,
          title: isRequest ? `💬 Message Request from ${senderName}` : `💬 ${senderName}`,
          body: preview,
          data: {
            screen: 'Chat',
            userId: fromUserId,
            userName: senderName,
            conversationId,
          },
        });
      }
    } catch (notifError) {
      console.log('Message notification error (non-fatal):', notifError);
    }

    return res.status(200).json({
      success: true,
      isRequest,
      conversationId,
      message: isRequest ? 'Message sent as request' : 'Message sent',
    });
  } catch (error) {
    console.error('Send message error:', error.message, error.stack);
    return res.status(500).json({ error: error.message || 'Server error sending message' });
  }
});

// POST /api/messages/request/accept
router.post('/request/accept', verifyToken, async (req, res) => {
  const { conversationId } = req.body;
  try {
    await db.collection('conversations').doc(conversationId).update({ isRequest: false });
    return res.status(200).json({ success: true, message: 'Request accepted' });
  } catch (error) {
    console.error('Accept request error:', error);
    return res.status(500).json({ error: 'Server error accepting request' });
  }
});

// POST /api/messages/request/deny
router.post('/request/deny', verifyToken, async (req, res) => {
  const { conversationId } = req.body;
  try {
    await db.collection('conversations').doc(conversationId).delete();
    return res.status(200).json({ success: true, message: 'Request denied' });
  } catch (error) {
    console.error('Deny request error:', error);
    return res.status(500).json({ error: 'Server error denying request' });
  }
});

module.exports = router;