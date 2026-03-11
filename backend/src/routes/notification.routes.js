const router = require('express').Router();
const ctrl   = require('../controllers/notification.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get ('/sent', authorize('landlord','manager'), ctrl.listSent);
router.get ('/my',   authorize('tenant'),             ctrl.myNotifications);
router.post('/',     authorize('landlord','manager'), ctrl.send);

module.exports = router;