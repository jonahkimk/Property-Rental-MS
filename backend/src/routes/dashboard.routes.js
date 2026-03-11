const router = require('express').Router();
const ctrl   = require('../controllers/dashboard.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/tenant/dashboard',   authorize('tenant'),   ctrl.tenantDashboard);
router.get('/landlord/dashboard', authorize('landlord'), ctrl.landlordDashboard);
router.get('/manager/dashboard',  authorize('manager'),  ctrl.managerDashboard);

module.exports = router;