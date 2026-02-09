import express from 'express';
import { getGeoLocation, getGeoLocationByIp } from '../controllers/geo.controller.js';

const router = express.Router();

// Get location for the requesting user (based on their IP as seen by ipapi.co)
router.get('/location', getGeoLocation);

// Get location for a specific IP
router.get('/location/:ip', getGeoLocationByIp);

export default router;
