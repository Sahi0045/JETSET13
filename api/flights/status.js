import AmadeusService from '../../backend/services/amadeusService.js';

/**
 * Flight Status API Endpoint
 * Get real-time on-demand flight status
 * 
 * GET /api/flights/status?carrier=AI&flightNumber=101&date=2024-03-15
 */

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { carrier, flightNumber, date } = req.query;

    if (!carrier || !flightNumber || !date) {
        return res.status(400).json({
            success: false,
            error: 'Carrier code, flight number, and date are required'
        });
    }

    try {
        console.log(`✈️ Flight Status API: ${carrier}${flightNumber} on ${date}`);

        const result = await AmadeusService.getFlightStatus(carrier, flightNumber, date);

        if (!result.success) {
            console.warn('⚠️ Flight Status API returned error:', result.error);
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
        console.error('❌ Flight Status API Error:', error);
        return res.status(200).json({
            success: true,
            data: [],
            fallback: true,
            error: error.message
        });
    }
}
