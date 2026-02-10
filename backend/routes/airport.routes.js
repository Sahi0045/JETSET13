import express from 'express';
import AmadeusService from '../services/amadeusService.js';

const router = express.Router();

/**
 * @route POST /api/airports/search
 * @desc Search for airports and cities by keyword
 * @access Public
 */
router.post('/search', async (req, res) => {
    try {
        const { keyword, subType, countryCode, limit } = req.body;

        if (!keyword || keyword.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Keyword must be at least 2 characters long'
            });
        }

        // Default to searching both cities and airports
        const type = subType || 'CITY,AIRPORT';

        const options = {
            limit: parseInt(limit) || 10,
            countryCode: countryCode || undefined
        };

        console.log(`✈️ Airport search request: "${keyword}" (${type})`);

        const result = await AmadeusService.searchLocations(keyword, type, options);

        if (result.success) {
            return res.json({
                success: true,
                data: result.data,
                meta: result.meta
            });
        } else {
            return res.status(500).json({
                success: false,
                error: result.error || 'Failed to search locations'
            });
        }
    } catch (error) {
        console.error('❌ Error in airport search route:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});

/**
 * @route GET /api/airports/nearby
 * @desc Get airports near a specific location (geo-coordinates)
 * @access Public
 */
router.get('/nearby', async (req, res) => {
    try {
        const { latitude, longitude, radius } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                error: 'Latitude and longitude are required'
            });
        }

        // This would need a corresponding method in AmadeusService
        // For now we'll return a placeholder or implement if needed

        // Placeholder response
        return res.json({
            success: true,
            data: [],
            message: 'Nearby airport search not yet implemented in AmadeusService'
        });

    } catch (error) {
        console.error('❌ Error in nearby airports route:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
