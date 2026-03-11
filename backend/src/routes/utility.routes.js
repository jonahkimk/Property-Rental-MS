const router = require('express').Router();
const ctrl   = require('../controllers/utility.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);

// Tenant
router.get('/my-readings', authorize('tenant'), ctrl.myReadings);

// Landlord / Manager
router.get ('/rates',               authorize('landlord','manager'), ctrl.getRates);
router.post('/rates',               authorize('landlord','manager'), ctrl.setRate);
router.get ('/prev-readings',       authorize('landlord','manager'), ctrl.getPrevReadings);
router.post('/readings/bulk',       authorize('landlord','manager'), ctrl.bulkSave);

module.exports = router;