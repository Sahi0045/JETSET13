import express from 'express';
import { bookingStaff, protect } from '../middleware/auth.middleware.js';
import { voucherRedeemLimiter } from '../middleware/security.js';
import { getWallet, redeem, staffReturn, voucherCheck } from '../controllers/wallet.controller.js';

const router = express.Router();

router.get('/', protect, getWallet);
router.post('/redeem', protect, voucherRedeemLimiter, redeem);
router.post('/voucher-check', protect, voucherRedeemLimiter, voucherCheck);
router.post('/staff-return', protect, bookingStaff, staffReturn);

export default router;
