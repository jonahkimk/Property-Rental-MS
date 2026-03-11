const router = require('express').Router();
const ctrl   = require('../controllers/payment.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);

// Tenant
router.get ('/my',                    authorize('tenant'),                     ctrl.myPayments);
router.get ('/my-submissions',        authorize('tenant'),                     ctrl.mySubmissions);
router.post('/submit',                authorize('tenant'),                     ctrl.submit);

// Landlord / Manager
router.get ('/submissions',           authorize('landlord','manager'),         ctrl.listSubmissions);
router.post('/submissions/:id/confirm', authorize('landlord','manager'),       ctrl.confirm);
router.post('/submissions/:id/reject',  authorize('landlord','manager'),       ctrl.reject);
router.get ('/',                      authorize('landlord','manager'),         ctrl.list);
router.post('/',                      authorize('landlord','manager'),         ctrl.create);

module.exports = router;