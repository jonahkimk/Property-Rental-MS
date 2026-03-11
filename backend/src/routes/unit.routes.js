const router = require('express').Router();
const ctrl   = require('../controllers/unit.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get ('/vacant', ctrl.listVacant);
router.get ('/',       ctrl.list);
router.post('/',       authorize('manager', 'landlord'), ctrl.create);
router.put ('/:id',    authorize('manager', 'landlord'), ctrl.update);

module.exports = router;