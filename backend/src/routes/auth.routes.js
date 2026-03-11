const router = require('express').Router();
const ctrl   = require('../controllers/auth.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const rateLimit = require('express-rate-limit');
const { fail } = require('../utils/response');

// Stricter limiter for login to reduce brute force attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                  // per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const u = (req.body?.username || '').toString().trim().toLowerCase();
    return `${req.ip}:${u || 'unknown'}`;
  },
  handler: (req, res) =>
    fail(res, 'Too many login attempts. Please wait and try again.', 429),
});

router.post('/login', loginLimiter, ctrl.login);
router.get ('/me',   authenticate, ctrl.getMe);
router.put ('/change-password', authenticate, ctrl.changePassword);

// Manager supervision: impersonate a landlord (requires manager password confirmation)
router.post('/impersonate/landlord', authenticate, authorize('manager'), ctrl.impersonateLandlord);

module.exports = router;