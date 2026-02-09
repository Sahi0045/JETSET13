import AmadeusService from '../../backend/services/amadeusService.js';

/**
 * Flight Analytics API Endpoint
 * Provides flight analytics data from Amadeus APIs
 * 
 * GET /api/flights/analytics?endpoint=booked&origin=DEL
 * GET /api/flights/analytics?endpoint=traveled&origin=DEL
 * GET /api/flights/analytics?endpoint=busiest&origin=DEL
 */

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { endpoint, origin, period, year, direction } = req.query;

    if (!origin) {
        return res.status(400).json({
            success: false,
            error: 'Origin city code is required (e.g., DEL, NYC)'
        });
    }

    try {
        let result;

        switch (endpoint) {
            case 'booked':
                console.log(`📊 Analytics API: Most booked from ${origin}`);
                result = await AmadeusService.getMostBookedDestinations(origin, period);
                break;

            case 'traveled':
                console.log(`📊 Analytics API: Most traveled from ${origin}`);
                result = await AmadeusService.getMostTraveledDestinations(origin, period);
                break;

            case 'busiest':
                console.log(`📈 Analytics API: Busiest period for ${origin}`);
                result = await AmadeusService.getBusiestTravelPeriod(
                    origin,
                    year || new Date().getFullYear().toString(),
                    direction || 'DEPARTING'
                );
                break;

            default:
                return res.status(400).json({
                    success: false,
                    error: 'Invalid endpoint. Use: booked, traveled, or busiest'
                });
        }

        if (!result.success) {
            console.warn('⚠️ Analytics API returned error:', result.error);
            return res.status(200).json({
                success: true,
                data: [],
                fallback: true,
                message: result.error
            });
        }

        return res.status(200).json({
            success: true,
            data: result.data,
            meta: result.meta
        });

    } catch (error) {
        console.error('❌ Analytics API Error:', error);
        return res.status(200).json({
            success: true,
            data: [],
            fallback: true,
            error: error.message
        });
    }
}
