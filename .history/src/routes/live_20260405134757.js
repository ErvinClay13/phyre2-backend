const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth');

// POST /api/live/token
// Will generate Agora token when we build Module 7
router.post('/token', verifyToken, async (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Live token generation coming in Module 7',
  });
});

module.exports = router;