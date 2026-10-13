import express from 'express';
import { admin, protect } from '../middleware/auth.middleware.js';
import { createVoucher, listRedemptions, listVouchers, updateVoucher } from '../controllers/vouchers.controller.js';

const router = express.Router();

router.get('/', protect, admin, listVouchers);
router.post('/', protect, admin, createVoucher);
router.put('/:id', protect, admin, updateVoucher);
router.get('/:id/redemptions', protect, admin, listRedemptions);

export default router;
