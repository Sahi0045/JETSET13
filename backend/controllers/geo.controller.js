import axios from 'axios';

/**
 * Get user location from ipapi.co
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 */
export const getGeoLocation = async (req, res) => {
    try {
        // Try ipapi.co first
        try {
            const response = await axios.get('https://ipapi.co/json/', {
                headers: { 'User-Agent': 'JetSetGo/1.0' }
            });
            return res.status(200).json(response.data);
        } catch (primaryError) {
            console.warn('Primary geo service (ipapi.co) failed:', primaryError.message);
            // Fallback to ip-api.com
            const fallbackResponse = await axios.get('http://ip-api.com/json/');
            // Map ip-api.com response to match ipapi.co structure roughly
            const data = fallbackResponse.data;
            return res.status(200).json({
                country_name: data.country,
                country_code: data.countryCode,
                city: data.city,
                region: data.regionName,
                ip: data.query,
                currency: 'USD', // ip-api free doesn't give currency, verify if critical
                country_calling_code: '' // ip-api free doesn't give calling code
            });
        }
    } catch (error) {
        console.error('All geo services failed:', error.message);
        res.status(500).json({ error: 'Failed to fetch location data' });
    }
};

export const getGeoLocationByIp = async (req, res) => {
    try {
        const { ip } = req.params;
        const response = await axios.get(`https://ipapi.co/${ip}/json/`);
        res.status(200).json(response.data);
    } catch (error) {
        console.error('Error fetching location from ipapi.co for IP:', req.params.ip, error.message);
        res.status(500).json({ error: 'Failed to fetch location data' });
    }
};
