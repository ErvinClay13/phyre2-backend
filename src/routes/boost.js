// src/routes/boost.js
const express = require('express');
const router = express.Router();
const { db, admin } = require('../firebase');
const verifyToken = require('../middleware/auth');

const BOOST_DURATION_MINUTES = 30;

// POST /api/boost/activate
router.post('/activate', verifyToken, async (req, res) => {
  const userId = req.user.uid;
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    // Check if already boosted
    if (userData?.boostExpiresAt) {
      const expiresAt = userData.boostExpiresAt.toDate ? userData.boostExpiresAt.toDate() : new Date(userData.boostExpiresAt);
      if (expiresAt > new Date()) {
        const minutesLeft = Math.ceil((expiresAt - new Date()) / 60000);
        return res.status(400).json({ error: 'Already boosted', minutesLeft });
      }
    }

    const expiresAt = new Date(Date.now() + BOOST_DURATION_MINUTES * 60 * 1000);
    await db.collection('users').doc(userId).update({
      boostExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      boostActivatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      success: true,
      expiresAt: expiresAt.toISOString(),
      minutesLeft: BOOST_DURATION_MINUTES,
    });
  } catch (error) {
    console.error('Boost error:', error);
    return res.status(500).json({ error: 'Server error activating boost' });
  }
});

// GET /api/boost/status
router.get('/status', verifyToken, async (req, res) => {
  const userId = req.user.uid;
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData?.boostExpiresAt) {
      return res.status(200).json({ isBoosted: false, minutesLeft: 0 });
    }

    const expiresAt = userData.boostExpiresAt.toDate ? userData.boostExpiresAt.toDate() : new Date(userData.boostExpiresAt);
    const isBoosted = expiresAt > new Date();
    const minutesLeft = isBoosted ? Math.ceil((expiresAt - new Date()) / 60000) : 0;

    return res.status(200).json({ isBoosted, minutesLeft, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;