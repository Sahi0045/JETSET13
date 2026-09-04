import express from 'express';
import FlightProvider from '../services/flightProvider.js';

const router = express.Router();

/**
 * @route GET /api/airports/search
 * @desc Search for airports and cities by keyword (GET for frontend compatibility)
 * @access Public
 */
router.get('/search', async (req, res) => {
    try {
        const { keyword, subType, countryCode, limit } = req.query;

        if (!keyword || keyword.length < 1) {
            return res.status(400).json({
                success: false,
                error: 'Keyword is required'
            });
        }

        const type = subType || 'CITY,AIRPORT';
        const options = {
            limit: parseInt(limit) || 10,
            countryCode: countryCode || undefined
        };

        console.log(`✈️ Airport search (GET): "${keyword}" (${type})`);

        const result = await FlightProvider.searchLocations(keyword, type, options);

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

        const result = await FlightProvider.searchLocations(keyword, type, options);

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

        // Not implemented. The bundled airports dataset carries a geoCode for
        // every entry (backend/services/airportsIndex.js), so this could be a
        // real radius search without any supplier call - nothing consumes it
        // yet, so it stays an honest empty answer rather than a guess.
        return res.json({
            success: true,
            data: [],
            message: 'Nearby airport search is not available'
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
