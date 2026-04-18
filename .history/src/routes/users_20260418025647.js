const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const verifyToken = require('../middleware/auth');

// Helper: calculate distance between two coordinates in miles
function getDistanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Helper: get coordinates from city name using Google Geocoding
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
  const {
    city, interestedIn, ageMin, ageMax,
    ethnicities, excludeSwiped, radius
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
        .collection('users').doc(userId).collection('swipes').get();
      swipedSnap.forEach(d => swipedIds.add(d.id));
    }

    const ethnicityList = ethnicities ? ethnicities.split(',').filter(Boolean) : [];
    const minAge = parseInt(ageMin) || 18;
    const maxAge = parseInt(ageMax) || 65;
    const radiusMiles = parseInt(radius) || 25;

    // Get coordinates for the filter city if provided
    let filterCoords = null;
    if (city && city.trim()) {
      filterCoords = await getCoordsFromCity(city);
    }

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

      // Radius filter using coordinates if available
      if (filterCoords && data.coordinates) {
        const dist = getDistanceMiles(
          filterCoords.lat, filterCoords.lng,
          data.coordinates.lat, data.coordinates.lng
        );
        if (dist > radiusMiles) return;
      } else if (city && city.trim()) {
        // Fallback to city name matching if no coordinates
        const userCity = (data.city || '').toLowerCase();
        const filterCity = city.toLowerCase().split(',')[0].trim();
        if (!userCity.includes(filterCity)) return;
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
      });
    });

    results = results.sort(() => Math.random() - 0.5);
    return res.status(200).json({ success: true, users: results });

  } catch (error) {
    console.error('Nearby users error:', error);
    return res.status(500).json({ error: 'Server error fetching users' });
  }
});

module.exports = router;