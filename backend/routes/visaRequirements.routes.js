import express from 'express';
import { 
  getVisaRequirements,
  getVisaRequirementsByDestination,
  getVisaRequirementsByOrigin,
  getPopularDestinations,
  getVisaTypes
} from '../services/visaRequirements.service.js';

const router = express.Router();

router.get('/requirements', async (req, res) => {
  try {
    const { origin, destination, type } = req.query;
    
    if (!origin || !destination) {
      return res.status(400).json({ 
        success: false, 
        message: 'origin and destination are required' 
      });
    }
    
    const requirements = await getVisaRequirements(origin, destination, type);
    res.json({ success: true, data: requirements });
  } catch (error) {
    console.error('[VisaReq] Get error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/by-destination/:destination', async (req, res) => {
  try {
    const requirements = await getVisaRequirementsByDestination(req.params.destination);
    res.json({ success: true, data: requirements });
  } catch (error) {
    console.error('[VisaReq] By destination error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/by-origin/:origin', async (req, res) => {
  try {
    const requirements = await getVisaRequirementsByOrigin(req.params.origin);
    res.json({ success: true, data: requirements });
  } catch (error) {
    console.error('[VisaReq] By origin error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/popular-destinations', async (req, res) => {
  try {
    const { limit } = req.query;
    const destinations = await getPopularDestinations(parseInt(limit) || 10);
    res.json({ success: true, data: destinations });
  } catch (error) {
    console.error('[VisaReq] Popular destinations error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/types', async (req, res) => {
  try {
    const types = getVisaTypes();
    res.json({ success: true, data: types });
  } catch (error) {
    console.error('[VisaReq] Types error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;