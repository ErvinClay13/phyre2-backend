/**
 * Phyre Bot Seeding Script
 * Run from: C:\Users\ervin\phyre2-backend
 * Command: node seedBots.js
 * 
 * Creates 16 bot accounts:
 * - 8 male, 8 female
 * - 8 auto-likers (like everyone), 8 like-back only
 * - All based in Chicago / South Suburbs IL
 * - Marked with isBot: true for easy cleanup
 */

require('dotenv').config();
const { admin, db } = require('./src/firebase');

const MALE_BOTS = [
  { name: 'Marcus', age: 26, city: 'Chicago', sex: 'Man', sexInterest: 'Women', bio: 'Chi-town born and raised 🏙️ Love the Bulls, good food, and good vibes.' },
  { name: 'DeShawn', age: 29, city: 'Harvey', sex: 'Man', sexInterest: 'Women', bio: 'South side all day. Looking for someone real to vibe with 🔥' },
  { name: 'Jordan', age: 24, city: 'Chicago', sex: 'Man', sexInterest: 'Women', bio: 'Gym, music, and deep dish pizza. Let\'s see where this goes 😎' },
  { name: 'Khalil', age: 31, city: 'Calumet City', sex: 'Man', sexInterest: 'Women', bio: 'Old soul with new energy. Love late night drives and good conversations.' },
  { name: 'Tyrese', age: 27, city: 'Chicago', sex: 'Man', sexInterest: 'Everyone', bio: 'Foodie, traveler, music lover. Chicago is home but the world is my playground ✈️' },
  { name: 'Aaron', age: 23, city: 'Lansing', sex: 'Man', sexInterest: 'Women', bio: 'Just a chill guy from the south suburbs looking for genuine connections 💯' },
  { name: 'Elijah', age: 28, city: 'Chicago', sex: 'Man', sexInterest: 'Women', bio: 'Engineer by day, chef by night 🍳 Looking for my person.' },
  { name: 'Damien', age: 32, city: 'Dolton', sex: 'Man', sexInterest: 'Women', bio: 'Father, hustler, dreamer. Real recognize real out here.' },
];

const FEMALE_BOTS = [
  { name: 'Jasmine', age: 25, city: 'Chicago', sex: 'Woman', sexInterest: 'Men', bio: 'Pilates, brunch, and Sunday drives 🌸 Looking for someone who matches my energy.' },
  { name: 'Aaliyah', age: 28, city: 'Matteson', sex: 'Woman', sexInterest: 'Men', bio: 'South suburb girl with big city dreams ✨ Love to laugh and keep it real.' },
  { name: 'Simone', age: 26, city: 'Chicago', sex: 'Woman', sexInterest: 'Men', bio: 'Nurse, foodie, and beach lover 🌊 Chicago winters hit different but I make it work.' },
  { name: 'Keisha', age: 30, city: 'Homewood', sex: 'Woman', sexInterest: 'Men', bio: 'God first, family always. Looking for something real not something temporary 🙏' },
  { name: 'Brianna', age: 24, city: 'Chicago', sex: 'Woman', sexInterest: 'Everyone', bio: 'Artist and free spirit 🎨 Love deep talks, good music, and spontaneous adventures.' },
  { name: 'Tiana', age: 27, city: 'Lynwood', sex: 'Woman', sexInterest: 'Men', bio: 'Entrepreneur and mom boss 💼 Looking for a real partner in crime.' },
  { name: 'Monique', age: 29, city: 'Chicago', sex: 'Woman', sexInterest: 'Men', bio: 'Wine, books, and good company 🍷 Swipe right if you can hold a real conversation.' },
  { name: 'Destiny', age: 23, city: 'Markham', sex: 'Woman', sexInterest: 'Men', bio: 'College grad, dog mom, gym addict 🐾 South suburbs raised, Chicago educated.' },
];

// Chicago / South Suburbs approximate coordinates
const LOCATIONS = [
  { city: 'Chicago', lat: 41.8781, lng: -87.6298 },
  { city: 'Harvey', lat: 41.6100, lng: -87.6467 },
  { city: 'Calumet City', lat: 41.6153, lng: -87.5292 },
  { city: 'Lansing', lat: 41.5642, lng: -87.5381 },
  { city: 'Dolton', lat: 41.6370, lng: -87.6070 },
  { city: 'Matteson', lat: 41.5053, lng: -87.7145 },
  { city: 'Homewood', lat: 41.5598, lng: -87.6611 },
  { city: 'Lynwood', lat: 41.5248, lng: -87.5406 },
  { city: 'Markham', lat: 41.5959, lng: -87.6939 },
];

function getCoords(city) {
  const loc = LOCATIONS.find(l => l.city === city) || LOCATIONS[0];
  // Add slight random offset so bots aren't all at exact same coordinates
  return {
    lat: loc.lat + (Math.random() - 0.5) * 0.02,
    lng: loc.lng + (Math.random() - 0.5) * 0.02,
  };
}

// Placeholder profile photos (using UI Avatars for generated letter avatars)
function getProfilePhoto(name, sex) {
  const bg = sex === 'Man' ? '1a1a2e' : '2d1b4e';
  const color = 'FF6B00';
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${bg}&color=${color}&size=400&bold=true&font-size=0.4`;
}

async function seedBots() {
  console.log('🔥 Starting Phyre bot seeding...\n');

  const allBots = [
    // First 4 male = auto-like, last 4 = like-back only
    ...MALE_BOTS.map((bot, i) => ({ ...bot, autoLike: i < 4 })),
    // First 4 female = auto-like, last 4 = like-back only
    ...FEMALE_BOTS.map((bot, i) => ({ ...bot, autoLike: i < 4 })),
  ];

  const createdBots = [];

  for (const bot of allBots) {
    try {
      // Create Firebase Auth account
      const email = `bot.${bot.name.toLowerCase()}.phyre@apecode.dev`;
      let userRecord;
      try {
        userRecord = await admin.auth().createUser({
          email,
          password: 'PhyreBot2024!',
          displayName: bot.name,
        });
      } catch (e) {
        if (e.code === 'auth/email-already-exists') {
          // Already exists from a previous seed run — fetch and update instead
          userRecord = await admin.auth().getUserByEmail(email);
          console.log(`  ↩️  ${bot.name} already exists, updating...`);
        } else {
          throw e;
        }
      }

      const coords = getCoords(bot.city);
      const profilePhoto = getProfilePhoto(bot.name, bot.sex);

      // Create/update Firestore user doc
      await db.collection('users').doc(userRecord.uid).set({
        name: bot.name,
        age: bot.age,
        city: bot.city,
        coordinates: coords,
        sex: bot.sex,
        sexInterest: bot.sexInterest,
        bio: bot.bio,
        profilePhoto,
        photos: [profilePhoto],
        onboardingComplete: true,
        hawtDateAvailable: true,
        isPremium: false,
        isBot: true,
        botAutoLike: bot.autoLike,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      createdBots.push({ uid: userRecord.uid, name: bot.name, autoLike: bot.autoLike, sex: bot.sex });
      console.log(`  ✅ ${bot.name} (${bot.sex}, ${bot.city}) — ${bot.autoLike ? '⚡ Auto-like' : '❤️ Like-back'}`);
    } catch (error) {
      console.error(`  ❌ Failed to create ${bot.name}:`, error.message);
    }
  }

  console.log(`\n✅ Seeded ${createdBots.length}/16 bots successfully!`);
  console.log(`   ⚡ Auto-likers: ${createdBots.filter(b => b.autoLike).length}`);
  console.log(`   ❤️  Like-back:  ${createdBots.filter(b => !b.autoLike).length}`);
  console.log(`   👨 Male:        ${createdBots.filter(b => b.sex === 'Man').length}`);
  console.log(`   👩 Female:      ${createdBots.filter(b => b.sex === 'Woman').length}`);
  console.log('\n📋 Bot UIDs saved for reference:');
  createdBots.forEach(b => console.log(`   ${b.name}: ${b.uid}`));
  console.log('\n🎉 Done! Bots are now visible in the app.');
  console.log('   Run "node botLikeJob.js" to process pending likes.\n');
  process.exit(0);
}

seedBots().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});