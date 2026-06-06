const express = require('express');
const router = express.Router();
const { db, admin } = require('../firebase');
const verifyToken = require('../middleware/auth');
const { sendPushNotification, getUserPushToken } = require('../utils/notifications');

const DAILY_SWIPE_LIMIT = 20;

// Helper: get today's date string in YYYY-MM-DD format
function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

// Helper: check and increment swipe count
async function checkSwipeLimit(userId) {
  const today = getTodayString();
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();

  // Premium users have unlimited swipes
  if (userData?.isPremium) return { allowed: true, remaining: 999 };

  const swipeData = userData?.dailySwipes || {};
  const todayCount = swipeData[today] || 0;

  if (todayCount >= DAILY_SWIPE_LIMIT) {
    return { allowed: false, remaining: 0, limit: DAILY_SWIPE_LIMIT };
  }

  // Increment count
  await db.collection('users').doc(userId).update({
    [`dailySwipes.${today}`]: admin.firestore.FieldValue.increment(1),
  });

  return { allowed: true, remaining: DAILY_SWIPE_LIMIT - todayCount - 1 };
}

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
    // Check daily swipe limit
    const limitCheck = await checkSwipeLimit(userId);
    if (!limitCheck.allowed) {
      return res.status(429).json({
        error: 'Daily swipe limit reached',
        limitReached: true,
        limit: DAILY_SWIPE_LIMIT,
        resetsAt: 'midnight',
      });
    }

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

        const [swiperDoc, targetDoc] = await Promise.all([
          db.collection('users').doc(userId).get(),
          db.collection('users').doc(targetUserId).get(),
        ]);
        const swiperName = swiperDoc.data()?.name || 'Someone';
        const targetName = targetDoc.data()?.name || 'Someone';

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
      remaining: limitCheck.remaining,
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

    // Unlike doesn't count against limit
    if (existing.exists) {
      await likeRef.delete();
      await db.collection('users').doc(targetUserId).collection('likedBy').doc(userId).delete();
      return res.status(200).json({ success: true, liked: false, isMatch: false });
    }

    // Check daily limit for new likes from Nearby screen
    const limitCheck = await checkSwipeLimit(userId);
    if (!limitCheck.allowed) {
      return res.status(429).json({
        error: 'Daily swipe limit reached',
        limitReached: true,
        limit: DAILY_SWIPE_LIMIT,
        resetsAt: 'midnight',
      });
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

    return res.status(200).json({ success: true, liked: true, isMatch, remaining: limitCheck.remaining });
  } catch (error) {
    console.error('Like error:', error);
    return res.status(500).json({ error: 'Server error processing like' });
  }
});

// GET /api/swipe/status — get current swipe count for today
router.get('/status', verifyToken, async (req, res) => {
  const userId = req.user.uid;
  try {
    const today = getTodayString();
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (userData?.isPremium) {
      return res.status(200).json({ isPremium: true, remaining: 999, limit: 999 });
    }

    const todayCount = userData?.dailySwipes?.[today] || 0;
    const remaining = Math.max(0, DAILY_SWIPE_LIMIT - todayCount);

    return res.status(200).json({
      remaining,
      used: todayCount,
      limit: DAILY_SWIPE_LIMIT,
      isPremium: false,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;