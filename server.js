require('dotenv').config();
const express = require('express');
const cors = require('cors');
const swipeRoutes = require('./src/routes/swipe');
const userRoutes = require('./src/routes/users');
const messageRoutes = require('./src/routes/messages');
const liveRoutes = require('./src/routes/live');
const pulseRoutes = require('./src/routes/pulse');
const { runCleanup } = require('./src/routes/live');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/pulse', pulseRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Phyre2 backend is running 🔥' });
});

// Routes
app.use('/api/swipe', swipeRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/live', liveRoutes);

// ─── SCHEDULED CLEANUP (runs every hour) ──────────────────────────────────
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// Run once on startup to catch anything that piled up while server was down
runCleanup();

// Then run every hour
setInterval(runCleanup, CLEANUP_INTERVAL_MS);

console.log('[Cleanup] Scheduled cleanup running every 60 minutes');
// ──────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Phyre2 backend running on port ${PORT}`);
});