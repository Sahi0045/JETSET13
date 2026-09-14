import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import {
  deleteSavedTraveller,
  listSavedTravellers,
  saveTravellers,
} from '../controllers/savedTravellers.controller.js';

// The signed-in customer's own saved travellers. Mounted at
// /api/users/me/travellers, ahead of the /api/users routes.
const router = express.Router();

router.get('/', protect, listSavedTravellers);
router.post('/', protect, saveTravellers);
router.delete('/:id', protect, deleteSavedTraveller);

export default router;
