const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const verifyToken = require('../middleware/auth');

// GET /api/users/nearby
router.get('/nearby', verifyToken, async (req, res) => {
  const userId = req.user.uid;
  const {
    city,
    interestedIn,
    ageMin,
    ageMax,
    ethnicities,
    excludeSwiped,
  } = req.query;

  try {
    const snapshot = await db
      .collection('users')
      .where('onboardingComplete', '==', true)
      .get();

    // Get swiped users if needed
    let swipedIds = new Set();
    if (excludeSwiped === 'true') {
      const swipedSnap = await db
        .collection('users')
        .doc(userId)
        .collection('swipes')
        .get();
      swipedSnap.forEach(d => swipedIds.add(d.id));
    }

    const ethnicityList = ethnicities ? ethnicities.split(',') : [];
    const minAge = parseInt(ageMin) || 18;
    const maxAge = parseInt(ageMax) || 65;

    let results = [];

    snapshot.forEach(docSnap => {
      if (docSnap.id === userId) return;
      if (swipedIds.has(docSnap.id)) return;

      const data = docSnap.data();

      // Age filter
      if (data.age < minAge || data.age > maxAge) return;

      // Sex interest filter
      if (interestedIn && interestedIn !== 'Everyone') {
        if (interestedIn === 'Men' && data.sex !== 'Man') return;
        if (interestedIn === 'Women' && data.sex !== 'Woman') return;
      }

      // Ethnicity filter
      if (ethnicityList.length > 0 && !ethnicityList.includes(data.ethnicity)) return;

      // City filter
      if (city) {
        const userCity = (data.city || '').toLowerCase();
        const filterCity = city.toLowerCase().split(',')[0].trim();
        if (!userCity.includes(filterCity)) return;
      }

      // Don't send sensitive fields to client
      results.push({
        id: docSnap.id,
        name: data.name,
        age: data.age,
        sex: data.sex,
        ethnicity: data.ethnicity,
        city: data.city,
        bio: data.bio,
        profilePhoto: data.profilePhoto,
        interests: data.interests,
      });
    });

    // Shuffle results
    results = results.sort(() => Math.random() - 0.5);

    return res.status(200).json({ success: true, users: results });

  } catch (error) {
    console.error('Nearby users error:', error);
    return res.status(500).json({ error: 'Server error fetching users' });
  }
});

module.exports = router;