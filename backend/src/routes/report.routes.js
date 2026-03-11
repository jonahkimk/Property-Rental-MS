const router = require('express').Router();
const ctrl   = require('../controllers/report.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate, authorize('manager', 'landlord'));

router.get('/finance', ctrl.financeReport);
router.get('/utility', ctrl.utilityReport);

module.exports = router;