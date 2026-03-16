const axios = require('axios');

async function test() {
  try {
    const response = await axios.post('http://localhost:5000/api/payments?action=cancel-booking', {
      bookingReference: 'FLTMLXSQJJ4',
      email: null,
      reason: 'Testing user frontend route'
    });
    console.log("SUCCESS:", response.data);
  } catch(e) {
    console.log("ERROR:", e.response?.data || e.message);
  }
}
test();
