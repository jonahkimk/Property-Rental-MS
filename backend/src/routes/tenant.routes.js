const router = require('express').Router();
const ctrl   = require('../controllers/tenant.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate, authorize('landlord', 'manager'));

router.get ('/',                     ctrl.list);
router.post('/',                     ctrl.create);
router.put ('/:id',                  ctrl.update);
router.patch('/:id/deactivate',      ctrl.deactivate);

module.exports = router;