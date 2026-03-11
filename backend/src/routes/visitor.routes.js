const router = require('express').Router();
const ctrl   = require('../controllers/visitor.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate, authorize('landlord', 'manager'));

router.get ('/',             ctrl.list);
router.post('/',             ctrl.create);
router.patch('/:id/checkout', ctrl.checkout);
router.delete('/:id',        ctrl.remove);

module.exports = router;