const router = require('express').Router();
const ctrl   = require('../controllers/message.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get ('/',              ctrl.myMessages);
router.get ('/my',            ctrl.myMessages);
router.get ('/unread-count',  ctrl.unreadCount);
router.get ('/:id/thread',    ctrl.getThread);
router.post('/',              ctrl.send);
router.post('/:id/reply',     ctrl.reply);
router.patch('/:id/status',   authorize('landlord','manager'), ctrl.updateStatus);
router.patch('/:id/read',     ctrl.markRead);

module.exports = router;