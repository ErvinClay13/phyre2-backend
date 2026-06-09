require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const swipeRoutes = require('./src/routes/swipe');
const userRoutes = require('./src/routes/users');
const messageRoutes = require('./src/routes/messages');
const liveRoutes = require('./src/routes/live');
const pulseRoutes = require('./src/routes/pulse');
const boostRoutes = require('./src/routes/boost');
const { runCleanup } = require('./src/routes/live');

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Phyre2 backend is running 🔥' });
});

// Legal pages
app.get('/privacy-policy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy-policy.html'));
});
app.get('/terms-of-service', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms-of-service.html'));
});

// Routes
app.use('/api/swipe', swipeRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/pulse', pulseRoutes);
app.use('/api/boost', boostRoutes);

// Scheduled cleanup
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
runCleanup();
setInterval(runCleanup, CLEANUP_INTERVAL_MS);
console.log('[Cleanup] Scheduled cleanup running every 60 minutes');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Phyre2 backend running on port ${PORT}`);
});