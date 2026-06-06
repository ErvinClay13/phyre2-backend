const express = require('express');
const router = express.Router();
const { db, admin } = require('../firebase');
const verifyToken = require('../middleware/auth');
const { sendPushNotification, getUserPushToken } = require('../utils/notifications');

const DAILY_SWIPE_LIMIT = 20;
const DAILY_SUPER_LIKE_LIMIT = 5;

function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

async function checkSwipeLimit(userId) {
  const today = getTodayString();
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  if (userData?.isPremium) return { allowed: true, remaining: 999 };
  const todayCount = userData?.dailySwipes?.[today] || 0;
  if (todayCount >= DAILY_SWIPE_LIMIT) return { allowed: false, remaining: 0, limit: DAILY_SWIPE_LIMIT };
  await db.collection('users').doc(userId).update({
    [`dailySwipes.${today}`]: admin.firestore.FieldValue.increment(1),
  });
  return { allowed: true, remaining: DAILY_SWIPE_LIMIT - todayCount - 1 };
}

async function checkSuperLikeLimit(userId) {
  const today = getTodayString();
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  if (userData?.isPremium) return { allowed: true, remaining: 999 };
  const todayCount = userData?.dailySuperLikes?.[today] || 0;
  if (todayCount >= DAILY_SUPER_LIKE_LIMIT) return { allowed: false, remaining: 0, limit: DAILY_SUPER_LIKE_LIMIT };
  await db.collection('users').doc(userId).update({
    [`dailySuperLikes.${today}`]: admin.firestore.FieldValue.increment(1),
  });
  return { allowed: true, remaining: DAILY_SUPER_LIKE_LIMIT - todayCount - 1 };
}

// POST /api/swipe
router.post('/', verifyToken, async (req, res) => {
  const { targetUserId, direction } = req.body;
  const userId = req.user.uid;

  if (!targetUserId || !direction) return res.status(400).json({ error: 'Missing targetUserId or direction' });
  if (!['left', 'right'].includes(direction)) return res.status(400).json({ error: 'Direction must be left or right' });
  if (userId === targetUserId) return res.status(400).json({ error: 'Cannot swipe on yourself' });

  try {
    const limitCheck = await checkSwipeLimit(userId);
    if (!limitCheck.allowed) {
      return res.status(429).json({ error: 'Daily swipe limit reached', limitReached: true, limit: DAILY_SWIPE_LIMIT });
    }

    const batch = db.batch();
    batch.set(db.collection('users').doc(userId).collection('swipes').doc(targetUserId), {
      direction, swipedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    let isMatch = false;

    if (direction === 'right') {
      batch.set(db.collection('users').doc(userId).collection('likes').doc(targetUserId), {
        likedAt: admin.firestore.FieldValue.serverTimestamp(), uid: targetUserId,
      });
      batch.set(db.collection('users').doc(targetUserId).collection('likedBy').doc(userId), {
        likedAt: admin.firestore.FieldValue.serverTimestamp(), uid: userId,
      });
      await batch.commit();

      const theirLike = await db.collection('users').doc(targetUserId).collection('likes').doc(userId).get();
      if (theirLike.exists) {
        const matchBatch = db.batch();
        matchBatch.set(db.collection('users').doc(userId).collection('matches').doc(targetUserId), { matchedAt: admin.firestore.FieldValue.serverTimestamp(), uid: targetUserId });
        matchBatch.set(db.collection('users').doc(targetUserId).collection('matches').doc(userId), { matchedAt: admin.firestore.FieldValue.serverTimestamp(), uid: userId });
        matchBatch.delete(db.collection('users').doc(userId).collection('likedBy').doc(targetUserId));
        matchBatch.delete(db.collection('users').doc(targetUserId).collection('likedBy').doc(userId));
        await matchBatch.commit();
        isMatch = true;

        const [swiperDoc, targetDoc] = await Promise.all([db.collection('users').doc(userId).get(), db.collection('users').doc(targetUserId).get()]);
        const swiperName = swiperDoc.data()?.name || 'Someone';
        const targetName = targetDoc.data()?.name || 'Someone';
        const [swiperToken, targetToken] = await Promise.all([getUserPushToken(db, userId), getUserPushToken(db, targetUserId)]);
        if (swiperToken) sendPushNotification({ token: swiperToken, title: "🔥 It's a Match!", body: `You and ${targetName} liked each other! Say hi!`, data: { screen: 'Matches', userId: targetUserId } });
        if (targetToken) sendPushNotification({ token: targetToken, title: "🔥 It's a Match!", body: `You and ${swiperName} liked each other! Say hi!`, data: { screen: 'Matches', userId: userId } });
      } else {
        const swiperDoc = await db.collection('users').doc(userId).get();
        const swiperName = swiperDoc.data()?.name || 'Someone';
        const targetToken = await getUserPushToken(db, targetUserId);
        if (targetToken) sendPushNotification({ token: targetToken, title: '❤️ New Like!', body: `${swiperName} liked your profile!`, data: { screen: 'LikedYou' } });
      }
    } else {
      await batch.commit();
    }

    return res.status(200).json({ success: true, isMatch, remaining: limitCheck.remaining, message: isMatch ? "It's a match!" : direction === 'right' ? 'Liked!' : 'Passed' });
  } catch (error) {
    console.error('Swipe error:', error);
    return res.status(500).json({ error: 'Server error processing swipe' });
  }
});

// POST /api/swipe/superlike
router.post('/superlike', verifyToken, async (req, res) => {
  const { targetUserId } = req.body;
  const userId = req.user.uid;

  if (!targetUserId) return res.status(400).json({ error: 'Missing targetUserId' });
  if (userId === targetUserId) return res.status(400).json({ error: 'Cannot super like yourself' });

  try {
    const limitCheck = await checkSuperLikeLimit(userId);
    if (!limitCheck.allowed) {
      return res.status(429).json({ error: 'Daily super like limit reached', limitReached: true, limit: DAILY_SUPER_LIKE_LIMIT });
    }

    const batch = db.batch();
    // Record swipe
    batch.set(db.collection('users').doc(userId).collection('swipes').doc(targetUserId), {
      direction: 'right', isSuperLike: true, swipedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // Record like with superLike flag
    batch.set(db.collection('users').doc(userId).collection('likes').doc(targetUserId), {
      likedAt: admin.firestore.FieldValue.serverTimestamp(), uid: targetUserId, isSuperLike: true,
    });
    // Record in target's likedBy with superLike flag
    batch.set(db.collection('users').doc(targetUserId).collection('likedBy').doc(userId), {
      likedAt: admin.firestore.FieldValue.serverTimestamp(), uid: userId, isSuperLike: true,
    });
    await batch.commit();

    // Check for mutual match
    const theirLike = await db.collection('users').doc(targetUserId).collection('likes').doc(userId).get();
    let isMatch = false;

    if (theirLike.exists) {
      const matchBatch = db.batch();
      matchBatch.set(db.collection('users').doc(userId).collection('matches').doc(targetUserId), { matchedAt: admin.firestore.FieldValue.serverTimestamp(), uid: targetUserId });
      matchBatch.set(db.collection('users').doc(targetUserId).collection('matches').doc(userId), { matchedAt: admin.firestore.FieldValue.serverTimestamp(), uid: userId });
      matchBatch.delete(db.collection('users').doc(userId).collection('likedBy').doc(targetUserId));
      matchBatch.delete(db.collection('users').doc(targetUserId).collection('likedBy').doc(userId));
      await matchBatch.commit();
      isMatch = true;

      const [userDoc, targetDoc] = await Promise.all([db.collection('users').doc(userId).get(), db.collection('users').doc(targetUserId).get()]);
      const userName = userDoc.data()?.name || 'Someone';
      const targetName = targetDoc.data()?.name || 'Someone';
      const [userToken, targetToken] = await Promise.all([getUserPushToken(db, userId), getUserPushToken(db, targetUserId)]);
      if (userToken) sendPushNotification({ token: userToken, title: "🔥 It's a Match!", body: `You and ${targetName} liked each other! Say hi!`, data: { screen: 'Matches', userId: targetUserId } });
      if (targetToken) sendPushNotification({ token: targetToken, title: "🔥 It's a Match!", body: `You and ${userName} liked each other! Say hi!`, data: { screen: 'Matches', userId: userId } });
    } else {
      // Send super like notification
      const userDoc = await db.collection('users').doc(userId).get();
      const userName = userDoc.data()?.name || 'Someone';
      const targetToken = await getUserPushToken(db, targetUserId);
      if (targetToken) sendPushNotification({ token: targetToken, title: '⭐ Super Like!', body: `${userName} super liked your profile!`, data: { screen: 'LikedYou' } });
    }

    return res.status(200).json({ success: true, isMatch, remaining: limitCheck.remaining });
  } catch (error) {
    console.error('Super like error:', error);
    return res.status(500).json({ error: 'Server error processing super like' });
  }
});

// POST /api/swipe/like
router.post('/like', verifyToken, async (req, res) => {
  const { targetUserId } = req.body;
  const userId = req.user.uid;
  if (!targetUserId) return res.status(400).json({ error: 'Missing targetUserId' });

  try {
    const likeRef = db.collection('users').doc(userId).collection('likes').doc(targetUserId);
    const existing = await likeRef.get();

    if (existing.exists) {
      await likeRef.delete();
      await db.collection('users').doc(targetUserId).collection('likedBy').doc(userId).delete();
      return res.status(200).json({ success: true, liked: false, isMatch: false });
    }

    const limitCheck = await checkSwipeLimit(userId);
    if (!limitCheck.allowed) {
      return res.status(429).json({ error: 'Daily swipe limit reached', limitReached: true, limit: DAILY_SWIPE_LIMIT });
    }

    const likeBatch = db.batch();
    likeBatch.set(likeRef, { likedAt: admin.firestore.FieldValue.serverTimestamp(), uid: targetUserId });
    likeBatch.set(db.collection('users').doc(targetUserId).collection('likedBy').doc(userId), { likedAt: admin.firestore.FieldValue.serverTimestamp(), uid: userId });
    await likeBatch.commit();

    const theirLike = await db.collection('users').doc(targetUserId).collection('likes').doc(userId).get();
    let isMatch = false;

    if (theirLike.exists) {
      const matchBatch = db.batch();
      matchBatch.set(db.collection('users').doc(userId).collection('matches').doc(targetUserId), { matchedAt: admin.firestore.FieldValue.serverTimestamp(), uid: targetUserId });
      matchBatch.set(db.collection('users').doc(targetUserId).collection('matches').doc(userId), { matchedAt: admin.firestore.FieldValue.serverTimestamp(), uid: userId });
      matchBatch.delete(db.collection('users').doc(userId).collection('likedBy').doc(targetUserId));
      matchBatch.delete(db.collection('users').doc(targetUserId).collection('likedBy').doc(userId));
      await matchBatch.commit();
      isMatch = true;

      const [userDoc, targetDoc] = await Promise.all([db.collection('users').doc(userId).get(), db.collection('users').doc(targetUserId).get()]);
      const userName = userDoc.data()?.name || 'Someone';
      const targetName = targetDoc.data()?.name || 'Someone';
      const [userToken, targetToken] = await Promise.all([getUserPushToken(db, userId), getUserPushToken(db, targetUserId)]);
      if (userToken) sendPushNotification({ token: userToken, title: "🔥 It's a Match!", body: `You and ${targetName} liked each other! Say hi!`, data: { screen: 'Matches', userId: targetUserId } });
      if (targetToken) sendPushNotification({ token: targetToken, title: "🔥 It's a Match!", body: `You and ${userName} liked each other! Say hi!`, data: { screen: 'Matches', userId: userId } });
    } else {
      const userDoc = await db.collection('users').doc(userId).get();
      const userName = userDoc.data()?.name || 'Someone';
      const targetToken = await getUserPushToken(db, targetUserId);
      if (targetToken) sendPushNotification({ token: targetToken, title: '❤️ New Like!', body: `${userName} liked your profile!`, data: { screen: 'LikedYou' } });
    }

    return res.status(200).json({ success: true, liked: true, isMatch, remaining: limitCheck.remaining });
  } catch (error) {
    console.error('Like error:', error);
    return res.status(500).json({ error: 'Server error processing like' });
  }
});

// GET /api/swipe/status
router.get('/status', verifyToken, async (req, res) => {
  const userId = req.user.uid;
  try {
    const today = getTodayString();
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    if (userData?.isPremium) return res.status(200).json({ isPremium: true, remaining: 999, limit: 999, superLikesRemaining: 999 });
    const todayCount = userData?.dailySwipes?.[today] || 0;
    const superLikeCount = userData?.dailySuperLikes?.[today] || 0;
    return res.status(200).json({
      remaining: Math.max(0, DAILY_SWIPE_LIMIT - todayCount),
      used: todayCount,
      limit: DAILY_SWIPE_LIMIT,
      superLikesRemaining: Math.max(0, DAILY_SUPER_LIKE_LIMIT - superLikeCount),
      superLikeLimit: DAILY_SUPER_LIKE_LIMIT,
      isPremium: false,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;