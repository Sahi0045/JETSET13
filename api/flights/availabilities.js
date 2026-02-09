import AmadeusService from '../../backend/services/amadeusService.js';

/**
 * Flight Availabilities API Endpoint
 * Search for available seats on flights
 * 
 * POST /api/flights/availabilities
 * Body: { origin, destination, departureDate }
 */

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Accept both GET and POST
    const params = req.method === 'POST' ? req.body : req.query;
    const { origin, destination, departureDate } = params;

    if (!origin || !destination || !departureDate) {
        return res.status(400).json({
            success: false,
            error: 'Origin, destination, and departureDate are required'
        });
    }

    try {
        console.log(`🎫 Availabilities API: ${origin} → ${destination} on ${departureDate}`);

        const result = await AmadeusService.getFlightAvailabilities({
            origin,
            destination,
            departureDate
        });

        if (!result.success) {
            console.warn('⚠️ Availabilities API returned error:', result.error);
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
            dictionaries: result.dictionaries,
            meta: result.meta
        });

    } catch (error) {
        console.error('❌ Availabilities API Error:', error);
        return res.status(200).json({
            success: true,
            data: [],
            fallback: true,
            error: error.message
        });
    }
}
