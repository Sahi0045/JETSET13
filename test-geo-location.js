
import axios from 'axios';

const testGeoLocation = async () => {
    try {
        console.log('Testing /api/geo/location on port 5005...');
        const response = await axios.get('http://localhost:5005/api/geo/location');
        console.log('✅ Success! Response:', response.data);
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
    }
};

testGeoLocation();
