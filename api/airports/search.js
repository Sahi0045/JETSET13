import AmadeusService from '../../backend/services/amadeusService.js';

/**
 * Airport Search API Endpoint
 * Uses Amadeus Reference Data API for dynamic airport/city search
 * 
 * GET /api/airports/search?keyword=xxx&countryCode=XX
 * 
 * @see https://developers.amadeus.com/self-service/category/flights/api-doc/airport-and-city-search
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
    const { keyword, countryCode, subType = 'CITY,AIRPORT', limit = 10 } = params;

    // Validate input
    if (!keyword || keyword.trim().length < 2) {
        return res.status(400).json({
            success: false,
            error: 'Keyword must be at least 2 characters',
            data: []
        });
    }

    try {
        console.log(`🔍 Airport Search API: keyword="${keyword}", countryCode="${countryCode || 'any'}"`);

        // Use Amadeus searchLocations method with enhanced options
        const result = await AmadeusService.searchLocations(keyword.trim(), subType, {
            countryCode: countryCode,
            limit: parseInt(limit) || 10
        });

        if (!result.success) {
            console.warn('⚠️ Amadeus API returned error:', result.error);
            // Return empty array on API error, frontend will use fallback
            return res.status(200).json({
                success: true,
                data: [],
                fallback: true,
                message: 'Using fallback data'
            });
        }

        // Transform to match airports.js format
        let airports = result.data.map((loc, index) => ({
            id: index + 1,
            name: loc.cityName || loc.name,
            code: loc.code,
            country: loc.country || loc.countryCode,
            countryCode: loc.countryCode,
            type: loc.type === 'AIRPORT' ?
                (loc.countryCode === 'IN' ? 'domestic' : 'international') :
                'city',
            fullName: loc.displayName || `${loc.name}, ${loc.country}`,
            subType: loc.type,
            cityCode: loc.cityCode
        }));

        // Prioritize by country if countryCode is provided
        if (countryCode) {
            airports = airports.sort((a, b) => {
                const aMatch = a.countryCode === countryCode ? -1 : 0;
                const bMatch = b.countryCode === countryCode ? -1 : 0;
                return aMatch - bMatch;
            });
        }

        // Limit results
        airports = airports.slice(0, parseInt(limit) || 10);

        console.log(`✅ Found ${airports.length} airports for "${keyword}"`);

        return res.status(200).json({
            success: true,
            data: airports,
            count: airports.length,
            keyword
        });

    } catch (error) {
        console.error('❌ Airport Search Error:', error);

        // Return success with empty data - frontend will use fallback
        return res.status(200).json({
            success: true,
            data: [],
            fallback: true,
            error: error.message
        });
    }
}
