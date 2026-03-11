const router = require('express').Router();
const ctrl   = require('../controllers/user.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get ('/',                    authorize('manager'),             ctrl.listUsers);
router.put ('/me',                                                    ctrl.updateMe);
router.post('/landlord',            authorize('manager'),             ctrl.createLandlord);
router.put ('/:id',                 authorize('manager'),             ctrl.updateUser);
router.patch('/:id/reset-password', authorize('manager'),            ctrl.resetPassword);
router.patch('/:id/activate',       authorize('manager'),            ctrl.activateUser);
router.patch('/:id/deactivate',     authorize('manager'),            ctrl.deactivateUser);

module.exports = router;