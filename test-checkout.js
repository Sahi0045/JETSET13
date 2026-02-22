const fetch = require('node-fetch');
const fs = require('fs');

async function test() {
  try {
    const payload = JSON.parse(fs.readFileSync('checkout-payload.json', 'utf8'));
    console.log('Sending request to checkout API...');
    const response = await fetch('http://localhost:5007/api/payments?action=hosted-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      console.log('Error status:', response.status);
    }
    const data = await response.text();
    console.log('Response:', data);
  } catch (err) {
    console.error('Request failed:', err);
  }
}

test();
