const express = require("express");
const router = express.Router();
const { db, admin } = require("../firebase");
const verifyToken = require("../middleware/auth");



// Helper: get coordinates from city
async function getCoordsFromCity(cityName) {
  try {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return null;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cityName)}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.results?.[0]) {
      const { lat, lng } = data.results[0].geometry.location;
      return { lat, lng };
    }
    return null;
  } catch {
    return null;
  }
}

// Helper: distance in miles
function getDistanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GET /api/pulse - get feed
// Full updated GET / route in pulse.js
router.get('/', verifyToken, async (req, res) => {
  const { city, radius = 25 } = req.query;

  try {
    const snapshot = await db.collection('pulse')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    let posts = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      const expiresAt = data.expiresAt?.toDate
        ? data.expiresAt.toDate()
        : new Date(data.expiresAt);
      if (expiresAt > new Date()) {
        posts.push({ id: doc.id, ...data });
      }
    });

    // Filter by location if city provided
    if (city && city.trim()) {
      const filterCoords = await getCoordsFromCity(city);
      if (filterCoords) {
        posts = posts.filter(post => {
          if (post.coordinates) {
            const dist = getDistanceMiles(
              filterCoords.lat, filterCoords.lng,
              post.coordinates.lat, post.coordinates.lng
            );
            return dist <= parseInt(radius);
          }
          return (post.city || '').toLowerCase().includes(
            city.toLowerCase().split(',')[0].trim()
          );
        });
      }
    }

    // Get author profiles
    const authorIds = [...new Set(posts.map(p => p.userId))];
    const authorProfiles = {};
    await Promise.all(authorIds.map(async (uid) => {
      try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists) {
          const data = userDoc.data();
          authorProfiles[uid] = {
            name: data.name,
            profilePhoto: data.profilePhoto,
            city: data.city,
          };
        }
      } catch {}
    }));

    const postsWithAuthors = posts.map(post => ({
      ...post,
      author: authorProfiles[post.userId] || {},
    }));

    return res.status(200).json({ success: true, posts: postsWithAuthors });
  } catch (error) {
    console.error('Pulse feed error:', error);
    return res.status(500).json({ error: 'Could not fetch pulse feed' });
  }
});

// POST /api/pulse - create post
router.post("/", verifyToken, async (req, res) => {
  const { text, city, coordinates, imageUrl } = req.body;
  const userId = req.user.uid;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Text is required" });
  }

  if (text.length > 280) {
    return res
      .status(400)
      .json({ error: "Text must be 280 characters or less" });
  }

  try {
    // Check posting limit — max 2 posts per 6 hours
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const recentPosts = await db
      .collection("pulse")
      .where("userId", "==", userId)
      .where("createdAt", ">", sixHoursAgo)
      .get();

    if (recentPosts.size >= 2) {
      return res.status(429).json({
        error: "You can only post 2 Pulses every 6 hours. Try again later.",
      });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 6 * 60 * 60 * 1000);

    const postData = {
      userId,
      text: text.trim(),
      city: city || "",
      coordinates: coordinates || null,
      imageUrl: imageUrl || null,
      likes: [],
      commentCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
    };

    const docRef = await db.collection("pulse").add(postData);

    return res.status(200).json({
      success: true,
      postId: docRef.id,
      message: "Pulse posted!",
    });
  } catch (error) {
    console.error("Create pulse error:", error);
    return res.status(500).json({ error: "Could not create pulse post" });
  }
});

// POST /api/pulse/:postId/like - toggle like
router.post("/:postId/like", verifyToken, async (req, res) => {
  const { postId } = req.params;
  const userId = req.user.uid;

  try {
    const postRef = db.collection("pulse").doc(postId);
    const post = await postRef.get();

    if (!post.exists) {
      return res.status(404).json({ error: "Post not found" });
    }

    const likes = post.data().likes || [];
    const isLiked = likes.includes(userId);

    if (isLiked) {
      await postRef.update({
        likes: admin.firestore.FieldValue.arrayRemove(userId),
      });
    } else {
      await postRef.update({
        likes: admin.firestore.FieldValue.arrayUnion(userId),
      });
    }

    return res.status(200).json({ success: true, liked: !isLiked });
  } catch (error) {
    console.error("Like pulse error:", error);
    return res.status(500).json({ error: "Could not like post" });
  }
});

// GET /api/pulse/:postId/comments - get comments
router.get("/:postId/comments", verifyToken, async (req, res) => {
  const { postId } = req.params;

  try {
    const snapshot = await db
      .collection("pulse")
      .doc(postId)
      .collection("comments")
      .orderBy("createdAt", "asc")
      .get();

    const comments = [];
    const authorIds = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      comments.push({ id: doc.id, ...data });
      authorIds.push(data.userId);
    });

    // Get author profiles
    const profiles = {};
    await Promise.all(
      [...new Set(authorIds)].map(async (uid) => {
        try {
          const userDoc = await db.collection("users").doc(uid).get();
          if (userDoc.exists) {
            const data = userDoc.data();
            profiles[uid] = {
              name: data.name,
              profilePhoto: data.profilePhoto,
            };
          }
        } catch {}
      }),
    );

    const commentsWithAuthors = comments.map((c) => ({
      ...c,
      author: profiles[c.userId] || {},
    }));

    return res
      .status(200)
      .json({ success: true, comments: commentsWithAuthors });
  } catch (error) {
    console.error("Get comments error:", error);
    return res.status(500).json({ error: "Could not get comments" });
  }
});

// POST /api/pulse/:postId/comments - add comment
router.post("/:postId/comments", verifyToken, async (req, res) => {
  const { postId } = req.params;
  const { text } = req.body;
  const userId = req.user.uid;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Comment text is required" });
  }

  try {
    await db.collection("pulse").doc(postId).collection("comments").add({
      userId,
      text: text.trim(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db
      .collection("pulse")
      .doc(postId)
      .update({
        commentCount: admin.firestore.FieldValue.increment(1),
      });

    return res.status(200).json({ success: true, message: "Comment added" });
  } catch (error) {
    console.error("Add comment error:", error);
    return res.status(500).json({ error: "Could not add comment" });
  }
});

// DELETE /api/pulse/:postId - delete own post
router.delete("/:postId", verifyToken, async (req, res) => {
  const { postId } = req.params;
  const userId = req.user.uid;

  try {
    const post = await db.collection("pulse").doc(postId).get();
    if (!post.exists) return res.status(404).json({ error: "Post not found" });
    if (post.data().userId !== userId) {
      return res
        .status(403)
        .json({ error: "Not authorized to delete this post" });
    }

    await db.collection("pulse").doc(postId).delete();
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Delete pulse error:", error);
    return res.status(500).json({ error: "Could not delete post" });
  }
});

module.exports = router;
