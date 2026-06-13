const express = require('express');
const router = express.Router();
const { db, admin } = require('../firebase');
const verifyToken = require('../middleware/auth');
const { RtcTokenBuilder, RtcRole } = require('agora-token');

// POST /api/live/token
router.post('/token', verifyToken, async (req, res) => {
  const { channelName } = req.body;
  const userId = req.user.uid;
  if (!channelName) return res.status(400).json({ error: 'Channel name required' });
  try {
    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE || '';
    if (!appCertificate) {
      return res.status(200).json({ success: true, token: null, appId, channelName, uid: 0 });
    }
    const role = RtcRole.PUBLISHER;
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId, appCertificate, channelName, 0, role, privilegeExpiredTs, privilegeExpiredTs
    );
    return res.status(200).json({ success: true, token, appId, channelName, uid: 0 });
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
      flagged: false,
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
    const snapshot = await db.collection('lives').where('isLive', '==', true).get();
    const lives = [];
    const hostIds = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      lives.push({ id: doc.id, ...data });
      hostIds.push(data.hostId);
    });
    lives.sort((a, b) => (b.viewerCount || 0) - (a.viewerCount || 0));
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

// POST /api/live/invite-cohost
// Note: only sent to users currently viewing the live (already in LiveRoom),
// so this notification is mostly informational — they'll see the invite
// popup via the Firebase 'cohost' listener already running on their screen.
router.post('/invite-cohost', verifyToken, async (req, res) => {
  const { targetUserId, channelName, hostName } = req.body;
  try {
    const { getUserPushToken, sendPushNotification } = require('../utils/notifications');
    const targetToken = await getUserPushToken(db, targetUserId);
    if (targetToken) {
      sendPushNotification({
        token: targetToken,
        title: '🎙 Co-host Invite!',
        body: `${hostName} invited you to co-host their live stream!`,
        data: { screen: 'LiveRoom', channelName },
      });
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Invite cohost error:', error);
    return res.status(500).json({ error: 'Could not send invite' });
  }
});

// ─── CLEANUP FUNCTIONS ─────────────────────────────────────────────────────

async function cleanupOldLives() {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoff);

    const endedSnapshot = await db.collection('lives')
      .where('isLive', '==', false)
      .where('flagged', '==', false)
      .where('endedAt', '<=', cutoffTimestamp)
      .get();

    const stuckSnapshot = await db.collection('lives')
      .where('isLive', '==', true)
      .where('flagged', '==', false)
      .where('startedAt', '<=', cutoffTimestamp)
      .get();

    const batch = db.batch();
    let count = 0;

    endedSnapshot.forEach(doc => { batch.delete(doc.ref); count++; });
    stuckSnapshot.forEach(doc => { batch.delete(doc.ref); count++; });

    if (count > 0) {
      await batch.commit();
      console.log(`[Cleanup] Deleted ${count} old live(s)`);
    } else {
      console.log('[Cleanup] No old lives to delete');
    }
  } catch (error) {
    console.error('[Cleanup] Lives cleanup error:', error);
  }
}

async function cleanupExpiredPulse() {
  try {
    const now = admin.firestore.Timestamp.fromDate(new Date());

    const snapshot = await db.collection('pulse')
      .where('flagged', '==', false)
      .where('expiresAt', '<=', now)
      .get();

    if (snapshot.empty) {
      console.log('[Cleanup] No expired pulse posts to delete');
      return;
    }

    const docs = snapshot.docs;
    for (let i = 0; i < docs.length; i += 500) {
      const chunk = docs.slice(i, i + 500);
      const batch = db.batch();
      chunk.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    console.log(`[Cleanup] Deleted ${docs.length} expired pulse post(s)`);

    const flaggedSnapshot = await db.collection('pulse')
      .where('flagged', '==', true)
      .where('expiresAt', '<=', now)
      .get();

    if (!flaggedSnapshot.empty) {
      console.log(`[Cleanup] Preserved ${flaggedSnapshot.size} flagged pulse post(s) — pending admin review`);
    }
  } catch (error) {
    console.error('[Cleanup] Pulse cleanup error:', error);
  }
}

async function runCleanup() {
  console.log('[Cleanup] Starting scheduled cleanup...');
  await Promise.all([cleanupOldLives(), cleanupExpiredPulse()]);
  console.log('[Cleanup] Cleanup complete');
}

module.exports = router;
module.exports.runCleanup = runCleanup;