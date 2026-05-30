const express = require('express');
const router = express.Router();
const { db, admin } = require('../firebase');
const verifyToken = require('../middleware/auth');
const { sendPushNotification, getUserPushToken } = require('../utils/notifications');

// POST /api/swipe
router.post('/', verifyToken, async (req, res) => {
  const { targetUserId, direction } = req.body;
  const userId = req.user.uid;

  if (!targetUserId || !direction) {
    return res.status(400).json({ error: 'Missing targetUserId or direction' });
  }
  if (!['left', 'right'].includes(direction)) {
    return res.status(400).json({ error: 'Direction must be left or right' });
  }
  if (userId === targetUserId) {
    return res.status(400).json({ error: 'Cannot swipe on yourself' });
  }

  try {
    const batch = db.batch();

    const swipeRef = db.collection('users').doc(userId).collection('swipes').doc(targetUserId);
    batch.set(swipeRef, {
      direction,
      swipedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    let isMatch = false;

    if (direction === 'right') {
      const likeRef = db.collection('users').doc(userId).collection('likes').doc(targetUserId);
      batch.set(likeRef, {
        likedAt: admin.firestore.FieldValue.serverTimestamp(),
        uid: targetUserId,
      });

      const likedByRef = db.collection('users').doc(targetUserId).collection('likedBy').doc(userId);
      batch.set(likedByRef, {
        likedAt: admin.firestore.FieldValue.serverTimestamp(),
        uid: userId,
      });

      await batch.commit();

      // Check for mutual match
      const theirLike = await db.collection('users').doc(targetUserId).collection('likes').doc(userId).get();

      if (theirLike.exists) {
        const matchBatch = db.batch();
        matchBatch.set(
          db.collection('users').doc(userId).collection('matches').doc(targetUserId),
          { matchedAt: admin.firestore.FieldValue.serverTimestamp(), uid: targetUserId }
        );
        matchBatch.set(
          db.collection('users').doc(targetUserId).collection('matches').doc(userId),
          { matchedAt: admin.firestore.FieldValue.serverTimestamp(), uid: userId }
        );
        matchBatch.delete(db.collection('users').doc(userId).collection('likedBy').doc(targetUserId));
        matchBatch.delete(db.collection('users').doc(targetUserId).collection('likedBy').doc(userId));
        await matchBatch.commit();
        isMatch = true;

        // Get both user profiles for notification names
        const [swiperDoc, targetDoc] = await Promise.all([
          db.collection('users').doc(userId).get(),
          db.collection('users').doc(targetUserId).get(),
        ]);
        const swiperName = swiperDoc.data()?.name || 'Someone';
        const targetName = targetDoc.data()?.name || 'Someone';

        // Send match notifications to BOTH users
        const [swiperToken, targetToken] = await Promise.all([
          getUserPushToken(db, userId),
          getUserPushToken(db, targetUserId),
        ]);

        if (swiperToken) {
          sendPushNotification({
            token: swiperToken,
            title: "🔥 It's a Match!",
            body: `You and ${targetName} liked each other! Say hi!`,
            data: { screen: 'Matches', userId: targetUserId },
          });
        }
        if (targetToken) {
          sendPushNotification({
            token: targetToken,
            title: "🔥 It's a Match!",
            body: `You and ${swiperName} liked each other! Say hi!`,
            data: { screen: 'Matches', userId: userId },
          });
        }
      } else {
        // Send "someone liked you" notification to target
        const swiperDoc = await db.collection('users').doc(userId).get();
        const swiperName = swiperDoc.data()?.name || 'Someone';
        const targetToken = await getUserPushToken(db, targetUserId);

        if (targetToken) {
          sendPushNotification({
            token: targetToken,
            title: '❤️ New Like!',
            body: `${swiperName} liked your profile!`,
            data: { screen: 'LikedYou' },
          });
        }
      }
    } else {
      await batch.commit();
    }

    return res.status(200).json({
      success: true,
      isMatch,
      message: isMatch ? "It's a match!" : direction === 'right' ? 'Liked!' : 'Passed',
    });
  } catch (error) {
    console.error('Swipe error:', error);
    return res.status(500).json({ error: 'Server error processing swipe' });
  }
});

// POST /api/swipe/like
router.post('/like', verifyToken, async (req, res) => {
  const { targetUserId } = req.body;
  const userId = req.user.uid;

  if (!targetUserId) {
    return res.status(400).json({ error: 'Missing targetUserId' });
  }

  try {
    const likeRef = db.collection('users').doc(userId).collection('likes').doc(targetUserId);
    const existing = await likeRef.get();

    if (existing.exists) {
      await likeRef.delete();
      await db.collection('users').doc(targetUserId).collection('likedBy').doc(userId).delete();
      return res.status(200).json({ success: true, liked: false, isMatch: false });
    }

    const likeBatch = db.batch();
    likeBatch.set(likeRef, {
      likedAt: admin.firestore.FieldValue.serverTimestamp(),
      uid: targetUserId,
    });
    likeBatch.set(
      db.collection('users').doc(targetUserId).collection('likedBy').doc(userId),
      { likedAt: admin.firestore.FieldValue.serverTimestamp(), uid: userId }
    );
    await likeBatch.commit();

    // Check for mutual match
    const theirLike = await db.collection('users').doc(targetUserId).collection('likes').doc(userId).get();
    let isMatch = false;

    if (theirLike.exists) {
      const matchBatch = db.batch();
      matchBatch.set(
        db.collection('users').doc(userId).collection('matches').doc(targetUserId),
        { matchedAt: admin.firestore.FieldValue.serverTimestamp(), uid: targetUserId }
      );
      matchBatch.set(
        db.collection('users').doc(targetUserId).collection('matches').doc(userId),
        { matchedAt: admin.firestore.FieldValue.serverTimestamp(), uid: userId }
      );
      matchBatch.delete(db.collection('users').doc(userId).collection('likedBy').doc(targetUserId));
      matchBatch.delete(db.collection('users').doc(targetUserId).collection('likedBy').doc(userId));
      await matchBatch.commit();
      isMatch = true;

      // Get names and send match notifications
      const [userDoc, targetDoc] = await Promise.all([
        db.collection('users').doc(userId).get(),
        db.collection('users').doc(targetUserId).get(),
      ]);
      const userName = userDoc.data()?.name || 'Someone';
      const targetName = targetDoc.data()?.name || 'Someone';

      const [userToken, targetToken] = await Promise.all([
        getUserPushToken(db, userId),
        getUserPushToken(db, targetUserId),
      ]);

      if (userToken) {
        sendPushNotification({
          token: userToken,
          title: "🔥 It's a Match!",
          body: `You and ${targetName} liked each other! Say hi!`,
          data: { screen: 'Matches', userId: targetUserId },
        });
      }
      if (targetToken) {
        sendPushNotification({
          token: targetToken,
          title: "🔥 It's a Match!",
          body: `You and ${userName} liked each other! Say hi!`,
          data: { screen: 'Matches', userId: userId },
        });
      }
    } else {
      // Send like notification
      const userDoc = await db.collection('users').doc(userId).get();
      const userName = userDoc.data()?.name || 'Someone';
      const targetToken = await getUserPushToken(db, targetUserId);

      if (targetToken) {
        sendPushNotification({
          token: targetToken,
          title: '❤️ New Like!',
          body: `${userName} liked your profile!`,
          data: { screen: 'LikedYou' },
        });
      }
    }

    return res.status(200).json({ success: true, liked: true, isMatch });
  } catch (error) {
    console.error('Like error:', error);
    return res.status(500).json({ error: 'Server error processing like' });
  }
});

module.exports = router;