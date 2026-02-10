import express from 'express';
import amadeusService from '../services/amadeusService.js';

const router = express.Router();

// ===== POINTS OF INTEREST =====

/**
 * GET /api/destinations/poi
 * Get ranked Points of Interest near a location
 * Query: latitude (required), longitude (required), radius, categories, page_limit, page_offset
 * Categories: SIGHTS, NIGHTLIFE, RESTAURANT, SHOPPING, BEACH_PARK
 */
router.get('/poi', async (req, res) => {
    try {
        const { latitude, longitude, radius, categories, page_limit, page_offset } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                error: 'latitude and longitude are required query parameters'
            });
        }

        const options = {};
        if (radius) options.radius = parseInt(radius);
        if (page_limit) options.page_limit = parseInt(page_limit);
        if (page_offset) options.page_offset = parseInt(page_offset);
        if (categories) options.categories = categories.split(',').map(c => c.trim());

        const result = await amadeusService.getPointsOfInterest(
            parseFloat(latitude),
            parseFloat(longitude),
            options
        );

        res.json(result);
    } catch (error) {
        console.error('❌ POI route error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch Points of Interest'
        });
    }
});

/**
 * GET /api/destinations/poi/by-square
 * Get POIs within a geographic square area
 * Query: north, west, south, east (all required), categories, page_limit
 */
router.get('/poi/by-square', async (req, res) => {
    try {
        const { north, west, south, east, categories, page_limit } = req.query;

        if (!north || !west || !south || !east) {
            return res.status(400).json({
                success: false,
                error: 'north, west, south, and east boundary coordinates are required'
            });
        }

        const options = {};
        if (page_limit) options.page_limit = parseInt(page_limit);
        if (categories) options.categories = categories.split(',').map(c => c.trim());

        const result = await amadeusService.getPointsOfInterestBySquare(
            parseFloat(north),
            parseFloat(west),
            parseFloat(south),
            parseFloat(east),
            options
        );

        res.json(result);
    } catch (error) {
        console.error('❌ POI by-square route error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch POIs by square'
        });
    }
});

// ===== TOURS AND ACTIVITIES =====

/**
 * GET /api/destinations/activities
 * Get tours and activities near a location
 * Query: latitude (required), longitude (required), radius
 */
router.get('/activities', async (req, res) => {
    try {
        const { latitude, longitude, radius } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                error: 'latitude and longitude are required query parameters'
            });
        }

        const options = {};
        if (radius) options.radius = parseInt(radius);

        const result = await amadeusService.getToursAndActivities(
            parseFloat(latitude),
            parseFloat(longitude),
            options
        );

        res.json(result);
    } catch (error) {
        console.error('❌ Activities route error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch tours and activities'
        });
    }
});

/**
 * GET /api/destinations/activities/by-square
 * Get activities within a geographic square area
 * Query: north, west, south, east (all required)
 */
router.get('/activities/by-square', async (req, res) => {
    try {
        const { north, west, south, east } = req.query;

        if (!north || !west || !south || !east) {
            return res.status(400).json({
                success: false,
                error: 'north, west, south, and east boundary coordinates are required'
            });
        }

        const result = await amadeusService.getToursAndActivitiesBySquare(
            parseFloat(north),
            parseFloat(west),
            parseFloat(south),
            parseFloat(east)
        );

        res.json(result);
    } catch (error) {
        console.error('❌ Activities by-square route error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch activities by square'
        });
    }
});

// ===== LOCATION SCORE =====

/**
 * GET /api/destinations/location-score
 * Get category scores for a location (sight, restaurant, shopping, nightlife, beach)
 * Query: latitude (required), longitude (required), radius
 */
router.get('/location-score', async (req, res) => {
    try {
        const { latitude, longitude, radius } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                error: 'latitude and longitude are required query parameters'
            });
        }

        const options = {};
        if (radius) options.radius = parseInt(radius);

        const result = await amadeusService.getLocationScore(
            parseFloat(latitude),
            parseFloat(longitude),
            options
        );

        res.json(result);
    } catch (error) {
        console.error('❌ Location score route error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch location score'
        });
    }
});

// Health check
router.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'Destination API',
        endpoints: [
            'GET /poi - Points of Interest by coordinates',
            'GET /poi/by-square - POIs within geographic square',
            'GET /activities - Tours & Activities by coordinates',
            'GET /activities/by-square - Activities within geographic square',
            'GET /location-score - Location category scores'
        ],
        timestamp: new Date().toISOString()
    });
});

export default router;
