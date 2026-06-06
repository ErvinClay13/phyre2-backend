const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const verifyToken = require('../middleware/auth');

function getDistanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function getCoordsFromCity(cityName) {
  try {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return null;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cityName)}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.results && data.results.length > 0) {
      const { lat, lng } = data.results[0].geometry.location;
      return { lat, lng };
    }
    return null;
  } catch {
    return null;
  }
}

// GET /api/users/nearby
router.get('/nearby', verifyToken, async (req, res) => {
  const userId = req.user.uid;
  const { city, interestedIn, ageMin, ageMax, ethnicities, excludeSwiped, radius } = req.query;

  try {
    const snapshot = await db.collection('users').where('onboardingComplete', '==', true).get();

    let swipedIds = new Set();
    if (excludeSwiped === 'true') {
      const swipedSnap = await db.collection('users').doc(userId).collection('swipes').get();
      swipedSnap.forEach(d => swipedIds.add(d.id));
    }

    const ethnicityList = ethnicities ? ethnicities.split(',').filter(Boolean) : [];
    const minAge = parseInt(ageMin) || 18;
    const maxAge = parseInt(ageMax) || 65;
    const radiusMiles = parseInt(radius) || 25;

    // Get current user's coordinates for distance calculation
    let currentUserCoords = null;
    const currentUserDoc = await db.collection('users').doc(userId).get();
    if (currentUserDoc.exists) {
      currentUserCoords = currentUserDoc.data().coordinates || null;
    }

    let filterCoords = null;
    if (city && city.trim()) {
      filterCoords = await getCoordsFromCity(city);
    }

    let results = [];
    snapshot.forEach(docSnap => {
      if (docSnap.id === userId) return;
      if (swipedIds.has(docSnap.id)) return;

      const data = docSnap.data();

      if (data.age < minAge || data.age > maxAge) return;

      if (interestedIn && interestedIn !== 'Everyone') {
        if (interestedIn === 'Men' && data.sex !== 'Man') return;
        if (interestedIn === 'Women' && data.sex !== 'Woman') return;
      }

      if (ethnicityList.length > 0 && !ethnicityList.includes(data.ethnicity)) return;

      // Calculate distance from filter city
      let distanceFromFilter = null;
      if (filterCoords && data.coordinates) {
        distanceFromFilter = getDistanceMiles(
          filterCoords.lat, filterCoords.lng,
          data.coordinates.lat, data.coordinates.lng
        );
        if (distanceFromFilter > radiusMiles) return;
      } else if (city && city.trim()) {
        const userCity = (data.city || '').toLowerCase();
        const filterCity = city.toLowerCase().split(',')[0].trim();
        if (!userCity.includes(filterCity)) return;
      }

      // Calculate distance from current user for display
      let distanceFromMe = null;
      if (currentUserCoords && data.coordinates) {
        distanceFromMe = getDistanceMiles(
          currentUserCoords.lat, currentUserCoords.lng,
          data.coordinates.lat, data.coordinates.lng
        );
      }

      // Check if user is boosted
      let isBoosted = false;
      if (data.boostExpiresAt) {
        const expiresAt = data.boostExpiresAt._seconds ? new Date(data.boostExpiresAt._seconds * 1000) : new Date(data.boostExpiresAt);
        isBoosted = expiresAt > new Date();
      }

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
        distance: distanceFromMe !== null ? Math.round(distanceFromMe) : null,
        isBoosted,
      });
    });

    // Boosted users first, then by distance
    results = results.sort((a, b) => {
      if (a.isBoosted && !b.isBoosted) return -1;
      if (!a.isBoosted && b.isBoosted) return 1;
      if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
      return Math.random() - 0.5;
    });

    return res.status(200).json({ success: true, users: results });
  } catch (error) {
    console.error('Nearby users error:', error);
    return res.status(500).json({ error: 'Server error fetching users' });
  }
});

module.exports = router;