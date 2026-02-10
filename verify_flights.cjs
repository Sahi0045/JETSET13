const http = require('http');

const postData = JSON.stringify({
    from: 'DEL',
    to: 'LHR',
    departDate: '2026-02-14',
    travelers: 1,
    travelClass: 'BUSINESS'
});

const options = {
    hostname: 'localhost',
    port: 5005,
    path: '/api/flights/search',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    }
};

console.log('Sending request:', postData);

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json.success) {
                console.log(`Success! Found ${json.data.length} flights.`);
                if (json.data.length > 0) {
                    const firstFlight = json.data[0];
                    console.log('First flight preview:');
                    console.log('- Airline:', firstFlight.airline);
                    console.log('- Class:', firstFlight.cabin);
                    console.log('- Stops:', firstFlight.stops);
                    console.log('- Stop Details:', JSON.stringify(firstFlight.stopDetails, null, 2));

                    // Verify class
                    if (firstFlight.cabin === 'BUSINESS' || firstFlight.cabin === 'FIRST') {
                        console.log('TEST PASSED: Cabin class is ' + firstFlight.cabin);
                    } else {
                        console.log('TEST WARNING: Cabin class is ' + firstFlight.cabin);
                    }

                    // Verify layovers
                    if (firstFlight.stops > 0 && firstFlight.stopDetails.length > 0) {
                        console.log('TEST PASSED: Stop details present for flight with stops');
                        if (firstFlight.stopDetails[0].duration) {
                            console.log('TEST PASSED: Layover duration is calculated:', firstFlight.stopDetails[0].duration);
                        } else {
                            console.log('TEST FAILED: Layover duration missing');
                        }
                    } else if (firstFlight.stops === 0) {
                        console.log('Flight is non-stop, so no stop details expected.');
                    }
                }
            } else {
                console.log('API returned error:', json);
            }
        } catch (e) {
            console.log('Error parsing response:', e);
            console.log('Raw response:', data);
        }
    });
});

req.on('error', (e) => {
    console.error('Request error:', e);
});

req.write(postData);
req.end();
