const router = require('express').Router();
const ctrl   = require('../controllers/property.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get ('/', ctrl.list);
router.post('/', authorize('manager'),            ctrl.create);
router.put ('/:id', authorize('manager', 'landlord'), ctrl.update);

module.exports = router;