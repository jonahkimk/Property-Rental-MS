const router = require('express').Router();
const ctrl   = require('../controllers/ticket.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get ('/my',               authorize('tenant'),                      ctrl.myTickets);
router.get ('/',                 authorize('landlord','manager'),          ctrl.list);
router.post('/',                 authorize('tenant'),                      ctrl.create);
router.patch('/:id/status',      authorize('landlord','manager'),         ctrl.updateStatus);
router.get ('/:id/replies',                                               ctrl.getReplies);
router.post('/:id/replies',                                               ctrl.addReply);

module.exports = router;
