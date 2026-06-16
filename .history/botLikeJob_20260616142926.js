/**
 * Phyre Bot Like Job
 * Run from: C:\Users\ervin\phyre2-backend
 * Command: node botLikeJob.js
 * 
 * - Auto-like bots: like every real user they haven't swiped on yet
 * - Like-back bots: like any real user who has liked them
 * 
 * Run this manually whenever you want bots to process likes,
 * or add it to a cron job / setInterval on Render.
 */

require('dotenv').config();
const { admin, db } = require('./src/firebase');

async function createMatch(uid1, uid2) {
  const batch = db.batch();
  batch.set(
    db.collection('users').doc(uid1).collection('matches').doc(uid2),
    { matchedAt: admin.firestore.FieldValue.serverTimestamp(), fromBot: true }
  );
  batch.set(
    db.collection('users').doc(uid2).collection('matches').doc(uid1),
    { matchedAt: admin.firestore.FieldValue.serverTimestamp(), fromBot: true }
  );
  await batch.commit();
}

async function botLike(botUid, targetUid) {
  // Record the bot's swipe
  await db.collection('users').doc(botUid).collection('swipes').doc(targetUid).set({
    direction: 'right',
    swipedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Add to target's likedBy
  await db.collection('users').doc(targetUid).collection('likedBy').doc(botUid).set({
    likedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Check if target already liked the bot back
  const targetSwipe = await db.collection('users').doc(targetUid).collection('swipes').doc(botUid).get();
  if (targetSwipe.exists && targetSwipe.data()?.direction === 'right') {
    await createMatch(botUid, targetUid);
    return true; // it's a match
  }
  return false;
}

async function runBotLikeJob() {
  console.log('🤖 Running bot like job...\n');

  // Get all bot accounts
  const botsSnap = await db.collection('users').where('isBot', '==', true).get();
  if (botsSnap.empty) {
    console.log('No bots found. Run seedBots.js first.');
    process.exit(0);
  }

  // Get all onboarded users, then filter out bots in memory
  // (Firestore != operator excludes docs where field doesn't exist,
  //  so real users without isBot field would be missed)
  const realUsersSnap = await db.collection('users')
    .where('onboardingComplete', '==', true)
    .get();

  const realUsers = [];
  realUsersSnap.forEach(doc => {
    const data = doc.data();
    if (!data.isBot) realUsers.push({ uid: doc.id, ...data });
  });
  console.log(`Found ${botsSnap.size} bots and ${realUsers.length} real users\n`);

  let totalLikes = 0;
  let totalMatches = 0;

  for (const botDoc of botsSnap.docs) {
    const bot = botDoc.data();
    const botUid = botDoc.id;
    console.log(`Processing ${bot.name} (${bot.botAutoLike ? 'auto-like' : 'like-back'})...`);

    // Get who this bot has already swiped on
    const existingSwipesSnap = await db.collection('users').doc(botUid).collection('swipes').get();
    const alreadySwiped = new Set(existingSwipesSnap.docs.map(d => d.id));

    if (bot.botAutoLike) {
      // Auto-like: like every real user this bot hasn't swiped on yet
      for (const realUser of realUsers) {
        if (alreadySwiped.has(realUser.uid)) continue;

        // Basic gender preference filter
        if (bot.sexInterest === 'Men' && realUser.sex !== 'Man') continue;
        if (bot.sexInterest === 'Women' && realUser.sex !== 'Woman') continue;

        const isMatch = await botLike(botUid, realUser.uid);
        totalLikes++;
        if (isMatch) {
          totalMatches++;
          console.log(`  💘 Match: ${bot.name} ↔ ${realUser.name}`);
        }
      }
    } else {
      // Like-back: only like users who have already liked this bot
      const likedBySnap = await db.collection('users').doc(botUid).collection('likedBy').get();
      for (const likeDoc of likedBySnap.docs) {
        const likerUid = likeDoc.id;
        if (alreadySwiped.has(likerUid)) continue;

        // Check this liker is a real user (not another bot)
        const likerDoc = await db.collection('users').doc(likerUid).get();
        if (!likerDoc.exists || likerDoc.data().isBot) continue;

        const isMatch = await botLike(botUid, likerUid);
        totalLikes++;
        if (isMatch) {
          totalMatches++;
          console.log(`  💘 Match: ${bot.name} ↔ ${likerDoc.data().name}`);
        }
      }
    }
  }

  console.log(`\n✅ Bot like job complete!`);
  console.log(`   ❤️  Likes processed: ${totalLikes}`);
  console.log(`   💘 New matches:      ${totalMatches}`);
  process.exit(0);
}

runBotLikeJob().catch(err => {
  console.error('Bot like job failed:', err);
  process.exit(1);
});