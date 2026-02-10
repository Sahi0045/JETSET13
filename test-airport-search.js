import axios from 'axios';

const API_URL = 'http://localhost:5004/api/airports/search';

async function testAirportSearch() {
    try {
        console.log('Testing airport search...');

        // Test 1: Search for London
        console.log('\n--- Test 1: Search for "London" ---');
        const response1 = await axios.post(API_URL, {
            keyword: 'London'
        });

        if (response1.data.success) {
            console.log(`✅ Success! Found ${response1.data.data.length} results.`);
            response1.data.data.forEach(loc => {
                console.log(`- ${loc.displayName} (${loc.code}) [${loc.type}]`);
            });
        } else {
            console.error('❌ Failed:', response1.data);
        }

        // Test 2: Search for unstructured query
        console.log('\n--- Test 2: Search for "New Y" ---');
        const response2 = await axios.post(API_URL, {
            keyword: 'New Y'
        });

        if (response2.data.success) {
            console.log(`✅ Success! Found ${response2.data.data.length} results.`);
            response2.data.data.slice(0, 3).forEach(loc => {
                console.log(`- ${loc.displayName} (${loc.code})`);
            });
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
            console.error('Response status:', error.response.status);
        }
    }
}

testAirportSearch();
