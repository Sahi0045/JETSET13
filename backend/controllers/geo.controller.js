import axios from 'axios';

/**
 * Get user location from ipapi.co
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 */
export const getGeoLocation = async (req, res) => {
    try {
        // Extract the real client IP from proxy headers (Vercel, Nginx, etc.)
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
            || req.headers['x-real-ip']
            || req.headers['x-vercel-forwarded-for']?.split(',')[0]?.trim()
            || req.ip
            || req.connection?.remoteAddress;

        console.log('GeoService: Detected client IP:', clientIp);

        // Try ipapi.co first — pass the client IP explicitly
        try {
            const url = clientIp && !isPrivateIp(clientIp)
                ? `https://ipapi.co/${clientIp}/json/`
                : 'https://ipapi.co/json/';
            console.log('GeoService: Fetching from:', url);
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'JetSetGo/1.0' }
            });
            return res.status(200).json(response.data);
        } catch (primaryError) {
            console.warn('Primary geo service (ipapi.co) failed:', primaryError.message);
            // Fallback to ip-api.com — pass client IP explicitly
            const fallbackUrl = clientIp && !isPrivateIp(clientIp)
                ? `http://ip-api.com/json/${clientIp}`
                : 'http://ip-api.com/json/';
            const fallbackResponse = await axios.get(fallbackUrl);
            // Map ip-api.com response to match ipapi.co structure roughly
            const data = fallbackResponse.data;
            return res.status(200).json({
                country_name: data.country,
                country_code: data.countryCode,
                city: data.city,
                region: data.regionName,
                ip: data.query,
                currency: data.countryCode === 'IN' ? 'INR' : 'USD',
                country_calling_code: data.countryCode === 'IN' ? '+91' : ''
            });
        }
    } catch (error) {
        console.error('All geo services failed:', error.message);
        res.status(500).json({ error: 'Failed to fetch location data' });
    }
};

/**
 * Check if an IP is a private/local address (not useful for geolocation)
 */
function isPrivateIp(ip) {
    if (!ip) return true;
    return ip === '127.0.0.1'
        || ip === '::1'
        || ip === 'localhost'
        || ip.startsWith('10.')
        || ip.startsWith('172.16.') || ip.startsWith('172.17.') || ip.startsWith('172.18.')
        || ip.startsWith('172.19.') || ip.startsWith('172.2') || ip.startsWith('172.3')
        || ip.startsWith('192.168.')
        || ip.startsWith('fe80:')
        || ip.startsWith('::ffff:127.')
        || ip.startsWith('::ffff:10.')
        || ip.startsWith('::ffff:192.168.');
}

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
