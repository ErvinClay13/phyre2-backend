const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const verifyToken = require('../middleware/auth');

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
    const matchDoc = await db
      .collection('users')
      .doc(fromUserId)
      .collection('matches')
      .doc(toUserId)
      .get();

    const isMatched = matchDoc.exists;

    // Check recipient's message privacy setting
    const recipientDoc = await db.collection('users').doc(toUserId).get();
    const recipientData = recipientDoc.data();
    const messagePrivacy = recipientData?.messagePrivacy || 'requests';

    // Determine if this goes to requests or direct messages
    const isRequest = messagePrivacy === 'requests' && !isMatched;

    // Create conversation ID (always smaller uid first for consistency)
    const conversationId = [fromUserId, toUserId].sort().join('_');

    const messageData = {
      fromUserId,
      toUserId,
      text,
      sentAt: new Date(),
      read: false,
      isRequest,
    };

    // Add message to conversation
    await db
      .collection('conversations')
      .doc(conversationId)
      .collection('messages')
      .add(messageData);

    // Update conversation metadata
    const admin = require('firebase-admin');

await db.collection('conversations').doc(conversationId).set({
  participants: [fromUserId, toUserId],
  lastMessage: text,
  lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
  lastMessageFrom: fromUserId,
  isRequest,
  [fromUserId + '_unread']: 0,
  [toUserId + '_unread']: (recipientData?.[toUserId + '_unread'] || 0) + 1,
}, { merge: true });

    return res.status(200).json({
      success: true,
      isRequest,
      conversationId,
      message: isRequest ? 'Message sent as request' : 'Message sent',
    });

  } catch (error) {
    console.error('Send message error:', error);
    return res.status(500).json({ error: 'Server error sending message' });
  }
});

// POST /api/messages/request/accept
router.post('/request/accept', verifyToken, async (req, res) => {
  const { conversationId } = req.body;
  const userId = req.user.uid;

  try {
    await db.collection('conversations').doc(conversationId).update({
      isRequest: false,
    });

    return res.status(200).json({ success: true, message: 'Request accepted' });
  } catch (error) {
    console.error('Accept request error:', error);
    return res.status(500).json({ error: 'Server error accepting request' });
  }
});

// POST /api/messages/request/deny
router.post('/request/deny', verifyToken, async (req, res) => {
  const { conversationId } = req.body;
  const userId = req.user.uid;

  try {
    await db.collection('conversations').doc(conversationId).delete();
    return res.status(200).json({ success: true, message: 'Request denied' });
  } catch (error) {
    console.error('Deny request error:', error);
    return res.status(500).json({ error: 'Server error denying request' });
  }
});

module.exports = router;