const router = require('express').Router();
const ctrl   = require('../controllers/invoice.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get ('/my',               authorize('tenant'),                     ctrl.myInvoices);
router.get ('/summary',          authorize('landlord','manager'),         ctrl.summary);
router.get ('/penalty-settings', authorize('landlord','manager'),         ctrl.getPenaltySettings);
router.post('/penalty-settings', authorize('landlord','manager'),         ctrl.savePenaltySettings);
router.post('/run-overdue',      authorize('landlord','manager'),         ctrl.runOverdueManual);
router.get ('/',                 authorize('landlord','manager'),         ctrl.list);
router.post('/generate',         authorize('landlord','manager'),         ctrl.generate);

module.exports = router;