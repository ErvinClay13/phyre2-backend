const express = require('express');
const router = express.Router();
const { db, admin } = require('../firebase');
const verifyToken = require('../middleware/auth');





admin.firestore.FieldValue.serverTimestamp()


// POST /api/swipe
// Body: { targetUserId, direction }
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

    // Record the swipe
    const swipeRef = db
      .collection('users')
      .doc(userId)
      .collection('swipes')
      .doc(targetUserId);

    batch.set(swipeRef, {
      direction,
      swipedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    let isMatch = false;

    if (direction === 'right') {
      // Record the like
      const likeRef = db
        .collection('users')
        .doc(userId)
        .collection('likes')
        .doc(targetUserId);

      batch.set(likeRef, {
        likedAt: admin.firestore.FieldValue.serverTimestamp(),
        uid: targetUserId,
      });

      await batch.commit();

      // Check if the other user already liked us
      const theirLike = await db
        .collection('users')
        .doc(targetUserId)
        .collection('likes')
        .doc(userId)
        .get();

      if (theirLike.exists) {
        // It's a match — create match documents for both users
        const matchBatch = db.batch();

        const myMatchRef = db
          .collection('users')
          .doc(userId)
          .collection('matches')
          .doc(targetUserId);

        const theirMatchRef = db
          .collection('users')
          .doc(targetUserId)
          .collection('matches')
          .doc(userId);

        matchBatch.set(myMatchRef, {
          matchedAt: admin.firestore.FieldValue.serverTimestamp(),
          uid: targetUserId,
        });

        matchBatch.set(theirMatchRef, {
          matchedAt: admin.firestore.FieldValue.serverTimestamp(),
          uid: userId,
        });

        await matchBatch.commit();
        isMatch = true;
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
// For likes from Nearby screen (not swipes)
router.post('/like', verifyToken, async (req, res) => {
  const { targetUserId } = req.body;
  const userId = req.user.uid;

  if (!targetUserId) {
    return res.status(400).json({ error: 'Missing targetUserId' });
  }

  try {
    // Check if already liked — toggle
    const likeRef = db
      .collection('users')
      .doc(userId)
      .collection('likes')
      .doc(targetUserId);

    const existing = await likeRef.get();

    if (existing.exists) {
      // Unlike
      await likeRef.delete();
      return res.status(200).json({ success: true, liked: false, isMatch: false });
    }

    // Like
    await likeRef.set({ likedAt: admin.firestore.FieldValue.serverTimestamp(), uid: targetUserId });

    // Check for mutual match
    const theirLike = await db
      .collection('users')
      .doc(targetUserId)
      .collection('likes')
      .doc(userId)
      .get();

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

      await matchBatch.commit();
      isMatch = true;
    }

    return res.status(200).json({ success: true, liked: true, isMatch });

  } catch (error) {
    console.error('Like error:', error);
    return res.status(500).json({ error: 'Server error processing like' });
  }
});

module.exports = router;