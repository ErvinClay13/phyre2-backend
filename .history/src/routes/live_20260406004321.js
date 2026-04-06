const express = require('express');
const router = express.Router();
const { db, admin } = require('../firebase');
const verifyToken = require('../middleware/auth');
const { RtcTokenBuilder, RtcRole } = require('agora-token');

// POST /api/live/token
router.post('/token', verifyToken, async (req, res) => {
  const { channelName } = req.body;
  const userId = req.user.uid;

  if (!channelName) {
    return res.status(400).json({ error: 'Channel name required' });
  }

  try {
    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE || '';

    if (!appCertificate) {
      return res.status(200).json({
        success: true,
        token: null,
        appId,
        channelName,
        uid: 0,
      });
    }

    const role = RtcRole.PUBLISHER;
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId, appCertificate, channelName, 0,
      role, privilegeExpiredTs, privilegeExpiredTs
    );

    return res.status(200).json({
      success: true,
      token,
      appId,
      channelName,
      uid: 0,
    });
  } catch (error) {
    console.error('Live token error:', error);
    return res.status(500).json({ error: 'Could not generate token' });
  }
});

// POST /api/live/start
router.post('/start', verifyToken, async (req, res) => {
  const { channelName } = req.body;
  const userId = req.user.uid;

  try {
    await db.collection('lives').doc(channelName).set({
      hostId: userId,
      channelName,
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      viewerCount: 0,
      isLive: true,
    });

    return res.status(200).json({ success: true, channelName });
  } catch (error) {
    console.error('Start live error:', error);
    return res.status(500).json({ error: 'Could not start live' });
  }
});

// POST /api/live/end
router.post('/end', verifyToken, async (req, res) => {
  const { channelName } = req.body;

  try {
    await db.collection('lives').doc(channelName).update({
      isLive: false,
      endedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('End live error:', error);
    return res.status(500).json({ error: 'Could not end live' });
  }
});

// POST /api/live/join
router.post('/join', verifyToken, async (req, res) => {
  const { channelName } = req.body;

  try {
    const liveDoc = await db.collection('lives').doc(channelName).get();
    if (!liveDoc.exists || !liveDoc.data().isLive) {
      return res.status(404).json({ error: 'Live not found or already ended' });
    }

    await db.collection('lives').doc(channelName).update({
      viewerCount: admin.firestore.FieldValue.increment(1),
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Join live error:', error);
    return res.status(500).json({ error: 'Could not join live' });
  }
});

// POST /api/live/leave
router.post('/leave', verifyToken, async (req, res) => {
  const { channelName } = req.body;

  try {
    const liveDoc = await db.collection('lives').doc(channelName).get();
    if (liveDoc.exists && liveDoc.data().isLive) {
      await db.collection('lives').doc(channelName).update({
        viewerCount: admin.firestore.FieldValue.increment(-1),
      });
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Could not leave live' });
  }
});

// GET /api/live/list
router.get('/list', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('lives')
      .where('isLive', '==', true)
      .get();

    const lives = [];
    const hostIds = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      lives.push({ id: doc.id, ...data });
      hostIds.push(data.hostId);
    });

    // Sort by viewer count in memory
    lives.sort((a, b) => (b.viewerCount || 0) - (a.viewerCount || 0));

    // Get host profiles
    const hostProfiles = {};
    await Promise.all(hostIds.map(async (hostId) => {
      try {
        const userDoc = await db.collection('users').doc(hostId).get();
        if (userDoc.exists) hostProfiles[hostId] = userDoc.data();
      } catch {}
    }));

    const livesWithHosts = lives.map(live => ({
      ...live,
      host: hostProfiles[live.hostId] || {},
    }));

    return res.status(200).json({ success: true, lives: livesWithHosts });
  } catch (error) {
    console.error('List lives error:', error);
    return res.status(500).json({ error: 'Could not fetch lives' });
  }
});

module.exports = router;