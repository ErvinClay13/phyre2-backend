const express = require('express');
const router = express.Router();
const { db, admin } = require('../firebase');
const verifyToken = require('../middleware/auth');
const { sendPushNotification, getUserPushToken } = require('../utils/notifications');

const ALL_HAWT_DATE_QUESTIONS = [
  // Food & Drink
  { id: 'q1', question: "What's your favorite food?", options: ['🍕 Pizza', '🍣 Sushi', '🍔 Burgers', '🌮 Tacos'] },
  { id: 'q2', question: "Pick your go-to drink?", options: ['☕ Coffee', '🧃 Juice', '🧋 Boba', '💧 Water'] },
  { id: 'q3', question: "Favorite cuisine?", options: ['🇲🇽 Mexican', '🇯🇵 Japanese', '🇮🇹 Italian', '🇹🇭 Thai'] },
  { id: 'q4', question: "What's your brunch order?", options: ['🥞 Pancakes', '🥚 Eggs & bacon', '🥑 Avocado toast', '🍳 Omelette'] },
  { id: 'q5', question: "Sweet or savory?", options: ['🍫 Always sweet', '🧂 Always savory', '🤷 Depends on the mood', '🍭 Both equally'] },

  // Lifestyle
  { id: 'q6', question: "Ideal weekend?", options: ['🏠 Stay in', '🎉 Go out', '🌿 Nature', '🛍️ Shopping'] },
  { id: 'q7', question: "Are you a night or morning person?", options: ['🌙 Night owl', '☀️ Early bird', '😴 Depends on the day', '⚡ Both'] },
  { id: 'q8', question: "How do you handle stress?", options: ['🏃 Exercise', '🎮 Gaming', '🎵 Music', '😴 Sleep it off'] },
  { id: 'q9', question: "Your ideal Friday night?", options: ['🎬 Movie at home', '🍽️ Dinner out', '🎤 Karaoke', '🎲 Game night'] },
  { id: 'q10', question: "How clean is your space?", options: ['✨ Spotless always', '🧹 Clean enough', '📦 Organized chaos', '😅 Working on it'] },

  // Relationships
  { id: 'q11', question: "What are you looking for?", options: ['💍 Serious relationship', '😊 Casual dating', '🤝 Friends first', '🔥 See where it goes'] },
  { id: 'q12', question: "Your love language?", options: ['🤗 Physical touch', '🎁 Gift giving', '⏰ Quality time', '🗣️ Words of affirmation'] },
  { id: 'q13', question: "How do you show affection?", options: ['😘 Lots of kisses', '🤣 Humor & jokes', '🍳 Cooking for them', '📱 Constant texting'] },
  { id: 'q14', question: "First date idea?", options: ['🎳 Bowling', '☕ Coffee chat', '🍽️ Fancy dinner', '🎡 Amusement park'] },
  { id: 'q15', question: "Dealbreaker in a partner?", options: ['😤 Bad temper', '🚬 Smoking', '💸 Bad with money', '📱 Always on phone'] },

  // Entertainment
  { id: 'q16', question: "Favorite movie genre?", options: ['😂 Comedy', '😱 Horror', '💕 Romance', '🚀 Action'] },
  { id: 'q17', question: "Favorite music genre?", options: ['🎵 Hip Hop', '🎸 R&B', '🎤 Pop', '🎻 Other'] },
  { id: 'q18', question: "Binge-watch or one episode at a time?", options: ['📺 Full binge', '🗓️ One per week', '🎲 Depends on show', '⏸️ I pause too much'] },
  { id: 'q19', question: "Favorite type of music to vibe to?", options: ['🔥 Trap/Drill', '💜 Old school R&B', '🌊 Lo-fi chill', '🎹 Afrobeats'] },
  { id: 'q20', question: "Pick a Netflix genre?", options: ['🕵️ True crime', '😂 Stand-up comedy', '💕 Romance', '🌍 Documentaries'] },

  // Travel & Adventure
  { id: 'q21', question: "Dream vacation?", options: ['🏖️ Beach', '🏙️ City break', '🌄 Adventure', '🏡 Staycation'] },
  { id: 'q22', question: "Travel style?", options: ['🎒 Backpacker', '🏨 Luxury hotels', '🚗 Road trip', '✈️ All-inclusive'] },
  { id: 'q23', question: "Would you rather?", options: ['🏝️ Private island', '🗼 Paris trip', '🗻 Mountain cabin', '🚀 Space trip'] },
  { id: 'q24', question: "How far would you travel for love?", options: ['🏘️ Same city only', '🚗 Drive distance', '✈️ Different state', '🌍 Anywhere'] },

  // Sports & Fitness
  { id: 'q25', question: "Favorite sport to watch?", options: ['🏀 Basketball', '🏈 Football', '⚽ Soccer', '🎮 Esports'] },
  { id: 'q26', question: "How do you stay active?", options: ['🏋️ Gym', '🏃 Running', '🧘 Yoga', '😅 Not really'] },
  { id: 'q27', question: "Morning workout or evening?", options: ['🌅 Morning', '🌆 Evening', '🕛 Lunch break', '📅 Whenever I can'] },

  // Personality
  { id: 'q28', question: "Favorite season?", options: ['☀️ Summer', '🍂 Fall', '❄️ Winter', '🌸 Spring'] },
  { id: 'q29', question: "Pick your vibe?", options: ['😎 Laid back', '⚡ High energy', '🤓 Intellectual', '🎭 Unpredictable'] },
  { id: 'q30', question: "How do you make decisions?", options: ['🧠 Think it through', '❤️ Go with my heart', '🎲 Wing it', '👥 Ask others'] },
  { id: 'q31', question: "Are you an introvert or extrovert?", options: ['🏠 Total introvert', '🎉 Total extrovert', '⚖️ Right in the middle', '🔄 Depends on the day'] },
  { id: 'q32', question: "Your biggest flex?", options: ['💼 Career success', '😂 Sense of humor', '💪 Loyalty', '🧠 Intelligence'] },

  // Random & Fun
  { id: 'q33', question: "Dog or cat person?", options: ['🐶 Dog all day', '🐱 Cat lover', '🐾 Both!', '🚫 Neither'] },
  { id: 'q34', question: "Pick a superpower?", options: ['🦸 Invisibility', '⚡ Super speed', '🧠 Mind reading', '✈️ Flying'] },
  { id: 'q35', question: "Ideal Sunday morning?", options: ['😴 Sleep in', '🍳 Cook breakfast', '🏃 Morning run', '⛪ Church'] },
  { id: 'q36', question: "Social media habit?", options: ['📱 Always scrolling', '📸 Post occasionally', '👀 Lurker only', '🚫 Barely use it'] },
  { id: 'q37', question: "How do you spend money?", options: ['👗 Fashion & style', '🍽️ Food & dining', '✈️ Travel', '💰 Save everything'] },
  { id: 'q38', question: "Pick a car vibe?", options: ['🚗 Practical & reliable', '🏎️ Fast & flashy', '🚙 Big truck/SUV', '🚕 I Uber everywhere'] },
  { id: 'q39', question: "Tattoos and piercings?", options: ['✨ Love them', '👌 Fine in moderation', '😐 Not my thing', '💉 I have some'] },
  { id: 'q40', question: "What describes your humor?", options: ['😂 Sarcastic', '🤪 Goofy & random', '🧠 Dry & witty', '😇 Clean & wholesome'] },
];

// Randomly select 10 questions each time
function getRandomQuestions() {
  const shuffled = [...ALL_HAWT_DATE_QUESTIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 10).map((q, i) => ({ ...q, id: `q${i + 1}` }));
}

// GET /api/hawtdate/questions
router.get('/questions', verifyToken, (req, res) => {
  res.json({ success: true, questions: getRandomQuestions() });
});

// POST /api/hawtdate/toggle-available
// Toggle whether user is available for Hawt Dates
router.post('/toggle-available', verifyToken, async (req, res) => {
  const userId = req.user.uid;
  const { available } = req.body;
  try {
    await db.collection('users').doc(userId).update({
      hawtDateAvailable: available,
    });
    return res.json({ success: true, available });
  } catch (error) {
    console.error('Toggle available error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/hawtdate/start
// Find a compatible partner and create a Hawt Date
router.post('/start', verifyToken, async (req, res) => {
  const userId = req.user.uid;

  try {
    // Get current user profile
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });
    const userData = userDoc.data();

    // Check daily limit for free users
    if (!userData.isPremium) {
      const today = new Date().toISOString().split('T')[0];
      const dailyCount = userData.dailyHawtDates?.[today] || 0;
      if (dailyCount >= 1) {
        return res.status(429).json({
          error: 'You have used your free Hawt Date for today. Upgrade to Premium for unlimited!',
          limitReached: true,
        });
      }
    }

    // Check if user already has an active Hawt Date
    const activeSnap = await db.collection('hawtDates')
      .where('status', 'in', ['pending', 'answering'])
      .where('user1Id', '==', userId)
      .limit(1)
      .get();
    const activeSnap2 = await db.collection('hawtDates')
      .where('status', 'in', ['pending', 'answering'])
      .where('user2Id', '==', userId)
      .limit(1)
      .get();

    if (!activeSnap.empty || !activeSnap2.empty) {
      return res.status(400).json({ error: 'You already have an active Hawt Date!' });
    }

    // Find a compatible available user
    const interestedIn = userData.sexInterest || 'Everyone';
    let query = db.collection('users')
      .where('hawtDateAvailable', '==', true)
      .where('onboardingComplete', '==', true);

    const candidatesSnap = await query.get();

    // Filter candidates
    const candidates = [];
    candidatesSnap.forEach(doc => {
      if (doc.id === userId) return;

      const candidate = doc.data();

      // Gender preference filter
      if (interestedIn === 'Men' && candidate.sex !== 'Man') return;
      if (interestedIn === 'Women' && candidate.sex !== 'Woman') return;

      // Make sure candidate is also interested in the current user's gender
      const candidateInterest = candidate.sexInterest || 'Everyone';
      if (candidateInterest === 'Men' && userData.sex !== 'Man') return;
      if (candidateInterest === 'Women' && userData.sex !== 'Woman') return;

      // Don't pair with someone already in an active Hawt Date (rough check)
      candidates.push({ id: doc.id, ...candidate });
    });

    if (candidates.length === 0) {
      return res.status(404).json({
        error: 'No available partners found right now. Check back soon!',
        noPartner: true,
      });
    }

    // Pick a random candidate
    const partner = candidates[Math.floor(Math.random() * candidates.length)];

    // Create expiry 48 hours from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    // Create Hawt Date document
    const hawtDateRef = await db.collection('hawtDates').add({
      user1Id: userId,
      user2Id: partner.id,
      status: 'answering',
      user1Answers: {},
      user2Answers: {},
      user1Finished: false,
      user2Finished: false,
      matchScore: 0,
      isHawtMatch: false,
      user1Accepted: false,
      user2Accepted: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      revealedAt: null,
    });

    // Increment daily count for free users
    if (!userData.isPremium) {
      const today = new Date().toISOString().split('T')[0];
      await db.collection('users').doc(userId).update({
        [`dailyHawtDates.${today}`]: admin.firestore.FieldValue.increment(1),
      });
    }

    // Notify partner
    try {
      const partnerToken = await getUserPushToken(db, partner.id);
      if (partnerToken) {
        sendPushNotification({
          token: partnerToken,
          title: '🔥 You have a Hawt Date!',
          body: 'Someone wants a Hawt Date with you. Answer the questions to reveal your match!',
          data: { screen: 'HawtDate', hawtDateId: hawtDateRef.id },
        });
      }
    } catch (e) {
      console.log('Hawt date notification error (non-fatal):', e);
    }

    return res.json({
      success: true,
      hawtDateId: hawtDateRef.id,
      partnerId: partner.id,
      partnerName: partner.name,
    });
  } catch (error) {
    console.error('Start hawt date error:', error);
    return res.status(500).json({ error: 'Server error starting Hawt Date' });
  }
});

// POST /api/hawtdate/:hawtDateId/answer
// Submit answers for a Hawt Date
router.post('/:hawtDateId/answer', verifyToken, async (req, res) => {
  const userId = req.user.uid;
  const { hawtDateId } = req.params;
  const { answers } = req.body; // { q1: '🍕 Pizza', q2: '🏠 Stay in', ... }

  try {
    const hawtDateRef = db.collection('hawtDates').doc(hawtDateId);
    const hawtDateDoc = await hawtDateRef.get();

    if (!hawtDateDoc.exists) return res.status(404).json({ error: 'Hawt Date not found' });

    const hawtDate = hawtDateDoc.data();

    // Check user is part of this date
    const isUser1 = hawtDate.user1Id === userId;
    const isUser2 = hawtDate.user2Id === userId;
    if (!isUser1 && !isUser2) return res.status(403).json({ error: 'Not part of this Hawt Date' });

    // Check not expired
    const now = new Date();
    const expiresAt = hawtDate.expiresAt?.toDate ? hawtDate.expiresAt.toDate() : new Date(hawtDate.expiresAt);
    if (now > expiresAt) {
      await hawtDateRef.update({ status: 'expired' });
      return res.status(400).json({ error: 'This Hawt Date has expired' });
    }

    // Save answers
    const answerField = isUser1 ? 'user1Answers' : 'user2Answers';
    const finishedField = isUser1 ? 'user1Finished' : 'user2Finished';
    const otherFinishedField = isUser1 ? 'user2Finished' : 'user1Finished';

    const updates = {
      [answerField]: answers,
      [finishedField]: true,
    };

    // Check if both users have finished
    const otherFinished = hawtDate[otherFinishedField];

    if (otherFinished) {
      // Both finished — calculate score
      const otherAnswers = isUser1 ? hawtDate.user2Answers : hawtDate.user1Answers;
      let score = 0;
      const questionIds = Object.keys(answers);
      questionIds.forEach(qId => {
        if (answers[qId] && otherAnswers[qId] && answers[qId] === otherAnswers[qId]) {
          score++;
        }
      });

      const isHawtMatch = score >= 7;
      updates.matchScore = score;
      updates.isHawtMatch = isHawtMatch;
      updates.status = 'revealed';
      updates.revealedAt = admin.firestore.FieldValue.serverTimestamp();

      await hawtDateRef.update(updates);

      // Notify both users of reveal
      const partnerId = isUser1 ? hawtDate.user2Id : hawtDate.user1Id;
      try {
        const partnerToken = await getUserPushToken(db, partnerId);
        if (partnerToken) {
          sendPushNotification({
            token: partnerToken,
            title: isHawtMatch ? '🔥 It\'s a Hawt Match!' : '👀 Your Hawt Date reveal is ready!',
            body: isHawtMatch
              ? 'You and your Hawt Date scored 7+ matching answers! Check your reveal!'
              : 'Your Hawt Date answered the questions. See how you matched up!',
            data: { screen: 'HawtDate', hawtDateId },
          });
        }
      } catch (e) {
        console.log('Reveal notification error (non-fatal):', e);
      }

      return res.json({
        success: true,
        revealed: true,
        matchScore: score,
        isHawtMatch,
      });
    }

    // Other user hasn't finished yet
    await hawtDateRef.update(updates);

    // Notify partner to answer
    const partnerId = isUser1 ? hawtDate.user2Id : hawtDate.user1Id;
    try {
      const partnerToken = await getUserPushToken(db, partnerId);
      if (partnerToken) {
        sendPushNotification({
          token: partnerToken,
          title: '🔥 Your Hawt Date answered!',
          body: 'Your Hawt Date partner finished their questions. Answer yours to reveal the match!',
          data: { screen: 'HawtDate', hawtDateId },
        });
      }
    } catch (e) {
      console.log('Partner notification error (non-fatal):', e);
    }

    return res.json({ success: true, revealed: false });
  } catch (error) {
    console.error('Answer hawt date error:', error);
    return res.status(500).json({ error: 'Server error submitting answers' });
  }
});

// POST /api/hawtdate/:hawtDateId/accept
// Accept a Hawt Match (both must accept to be officially matched)
router.post('/:hawtDateId/accept', verifyToken, async (req, res) => {
  const userId = req.user.uid;
  const { hawtDateId } = req.params;

  try {
    const hawtDateRef = db.collection('hawtDates').doc(hawtDateId);
    const hawtDateDoc = await hawtDateRef.get();
    if (!hawtDateDoc.exists) return res.status(404).json({ error: 'Hawt Date not found' });

    const hawtDate = hawtDateDoc.data();
    const isUser1 = hawtDate.user1Id === userId;
    const isUser2 = hawtDate.user2Id === userId;
    if (!isUser1 && !isUser2) return res.status(403).json({ error: 'Not part of this Hawt Date' });

    const acceptField = isUser1 ? 'user1Accepted' : 'user2Accepted';
    const otherAcceptedField = isUser1 ? 'user2Accepted' : 'user1Accepted';
    const otherUserId = isUser1 ? hawtDate.user2Id : hawtDate.user1Id;

    const updates = { [acceptField]: true };
    const otherAccepted = hawtDate[otherAcceptedField];

    if (otherAccepted) {
      // Both accepted — create official match
      updates.status = 'matched';

      const batch = db.batch();
      batch.set(
        db.collection('users').doc(userId).collection('matches').doc(otherUserId),
        { matchedAt: admin.firestore.FieldValue.serverTimestamp(), fromHawtDate: true }
      );
      batch.set(
        db.collection('users').doc(otherUserId).collection('matches').doc(userId),
        { matchedAt: admin.firestore.FieldValue.serverTimestamp(), fromHawtDate: true }
      );
      await batch.commit();
      await hawtDateRef.update(updates);

      // Notify other user
      try {
        const partnerToken = await getUserPushToken(db, otherUserId);
        if (partnerToken) {
          sendPushNotification({
            token: partnerToken,
            title: '🔥 Hawt Match Confirmed!',
            body: 'You and your Hawt Date both accepted! You\'re now officially matched.',
            data: { screen: 'Matches' },
          });
        }
      } catch (e) {
        console.log('Match notification error (non-fatal):', e);
      }

      return res.json({ success: true, fullyMatched: true });
    }

    await hawtDateRef.update(updates);
    return res.json({ success: true, fullyMatched: false });
  } catch (error) {
    console.error('Accept hawt date error:', error);
    return res.status(500).json({ error: 'Server error accepting match' });
  }
});

// POST /api/hawtdate/:hawtDateId/like
// Like the other user's profile after a no-match reveal
router.post('/:hawtDateId/like', verifyToken, async (req, res) => {
  const userId = req.user.uid;
  const { hawtDateId } = req.params;

  try {
    const hawtDateDoc = await db.collection('hawtDates').doc(hawtDateId).get();
    if (!hawtDateDoc.exists) return res.status(404).json({ error: 'Hawt Date not found' });

    const hawtDate = hawtDateDoc.data();
    const isUser1 = hawtDate.user1Id === userId;
    const otherUserId = isUser1 ? hawtDate.user2Id : hawtDate.user1Id;

    // Create a regular like/swipe
    await db.collection('users').doc(userId).collection('swipes').doc(otherUserId).set({
      direction: 'right',
      swipedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Check if other user already liked back
    const otherLikeDoc = await db.collection('users').doc(otherUserId).collection('swipes').doc(userId).get();
    const isMatch = otherLikeDoc.exists && otherLikeDoc.data()?.direction === 'right';

    if (isMatch) {
      const batch = db.batch();
      batch.set(
        db.collection('users').doc(userId).collection('matches').doc(otherUserId),
        { matchedAt: admin.firestore.FieldValue.serverTimestamp() }
      );
      batch.set(
        db.collection('users').doc(otherUserId).collection('matches').doc(userId),
        { matchedAt: admin.firestore.FieldValue.serverTimestamp() }
      );
      await batch.commit();
    }

    return res.json({ success: true, isMatch });
  } catch (error) {
    console.error('Hawt date like error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/hawtdate/active
// Get user's active Hawt Dates
router.get('/active', verifyToken, async (req, res) => {
  const userId = req.user.uid;

  try {
    const [snap1, snap2] = await Promise.all([
      db.collection('hawtDates').where('user1Id', '==', userId).where('status', 'in', ['answering', 'revealed']).get(),
      db.collection('hawtDates').where('user2Id', '==', userId).where('status', 'in', ['answering', 'revealed']).get(),
    ]);

    const dates = [];
    const addDate = async (doc) => {
      const data = doc.data();
      const partnerId = data.user1Id === userId ? data.user2Id : data.user1Id;
      const partnerDoc = await db.collection('users').doc(partnerId).get();
      const partnerData = partnerDoc.exists ? partnerDoc.data() : {};
      dates.push({
        id: doc.id,
        ...data,
        partnerId,
        partnerName: partnerData.name || 'Mystery Person',
        partnerPhoto: data.status === 'revealed' ? (partnerData.profilePhoto || null) : null,
        isUser1: data.user1Id === userId,
        myFinished: data.user1Id === userId ? data.user1Finished : data.user2Finished,
        partnerFinished: data.user1Id === userId ? data.user2Finished : data.user1Finished,
        myAccepted: data.user1Id === userId ? data.user1Accepted : data.user2Accepted,
      });
    };

    await Promise.all([
      ...snap1.docs.map(addDate),
      ...snap2.docs.map(addDate),
    ]);

    return res.json({ success: true, dates });
  } catch (error) {
    console.error('Get active hawt dates error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;