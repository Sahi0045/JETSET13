import AmadeusService from '../../backend/services/amadeusService.js';

/**
 * Cheapest Flight Dates API Endpoint
 * Find the cheapest dates to fly between two cities
 * 
 * GET /api/flights/cheapest-dates?origin=DEL&destination=BOM
 */

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { origin, destination, departureDate, oneWay, duration, nonStop, viewBy } = req.query;

    if (!origin || !destination) {
        return res.status(400).json({
            success: false,
            error: 'Origin and destination are required'
        });
    }

    try {
        console.log(`💰 Cheapest Dates API: ${origin} → ${destination}`);

        const result = await AmadeusService.getCheapestFlightDates(origin, destination, {
            departureDate,
            oneWay: oneWay === 'true',
            duration: duration ? parseInt(duration) : undefined,
            nonStop: nonStop === 'true',
            viewBy: viewBy || 'DATE'
        });

        if (!result.success) {
            console.warn('⚠️ Cheapest Dates API returned error:', result.error);
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
        console.error('❌ Cheapest Dates API Error:', error);
        return res.status(200).json({
            success: true,
            data: [],
            fallback: true,
            error: error.message
        });
    }
}
