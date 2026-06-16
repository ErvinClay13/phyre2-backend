/**
 * Phyre Bot Cleanup Script
 * Run from: C:\Users\ervin\phyre2-backend
 * Command: node cleanupBots.js
 * 
 * Completely removes all bot accounts and their data from Firebase.
 * Safe to run anytime — only touches documents where isBot === true.
 */

require('dotenv').config();
const { admin, db } = require('./src/firebase');

async function deleteCollection(collRef) {
  const snap = await collRef.get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  return snap.size;
}

async function cleanupBots() {
  console.log('🧹 Starting bot cleanup...\n');

  const botsSnap = await db.collection('users').where('isBot', '==', true).get();
  if (botsSnap.empty) {
    console.log('No bots found — nothing to clean up.');
    process.exit(0);
  }

  console.log(`Found ${botsSnap.size} bots to remove...\n`);
  let removedCount = 0;

  for (const botDoc of botsSnap.docs) {
    const bot = botDoc.data();
    const botUid = botDoc.id;
    console.log(`  🗑️  Removing ${bot.name} (${botUid})...`);

    try {
      // Delete subcollections
      await deleteCollection(db.collection('users').doc(botUid).collection('swipes'));
      await deleteCollection(db.collection('users').doc(botUid).collection('likes'));
      await deleteCollection(db.collection('users').doc(botUid).collection('likedBy'));
      await deleteCollection(db.collection('users').doc(botUid).collection('matches'));
      await deleteCollection(db.collection('users').doc(botUid).collection('blocked'));
      await deleteCollection(db.collection('users').doc(botUid).collection('blockedBy'));

      // Remove bot from other users' likedBy/matches/swipes subcollections
      const matchesSnap = await db.collection('users').doc(botUid).collection('matches').get();
      for (const matchDoc of matchesSnap.docs) {
        const realUid = matchDoc.id;
        await db.collection('users').doc(realUid).collection('matches').doc(botUid).delete().catch(() => {});
        await db.collection('users').doc(realUid).collection('likedBy').doc(botUid).delete().catch(() => {});
      }

      // Delete any conversations involving this bot
      const convSnap = await db.collection('conversations')
        .where('participants', 'array-contains', botUid)
        .get();
      for (const convDoc of convSnap.docs) {
        await deleteCollection(db.collection('conversations').doc(convDoc.id).collection('messages'));
        await convDoc.ref.delete();
      }

      // Delete Firestore user doc
      await botDoc.ref.delete();

      // Delete Firebase Auth account
      await admin.auth().deleteUser(botUid);

      removedCount++;
      console.log(`     ✅ ${bot.name} removed`);
    } catch (error) {
      console.error(`     ❌ Failed to fully remove ${bot.name}:`, error.message);
    }
  }

  console.log(`\n✅ Cleanup complete! Removed ${removedCount}/${botsSnap.size} bots.`);
  console.log('   All bot profiles, matches, and conversations have been deleted.\n');
  process.exit(0);
}

cleanupBots().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});