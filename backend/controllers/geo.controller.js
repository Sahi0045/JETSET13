import axios from 'axios';

/**
 * Get user location from ipapi.co
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 */
export const getGeoLocation = async (req, res) => {
    try {
        const response = await axios.get('https://ipapi.co/json/');
        res.status(200).json(response.data);
    } catch (error) {
        console.error('Error fetching location from ipapi.co:', error.message);
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
