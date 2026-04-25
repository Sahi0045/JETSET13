const fs = require('fs');
const offerStr = fs.readFileSync('flight-offer-resp.json', 'utf8');
const offerResponse = JSON.parse(offerStr);
if (!offerResponse.data || !offerResponse.data.length) {
    console.log('No offers found');
    process.exit(1);
}
const offer = offerResponse.data[0];

const payload = {
    action: 'create-checkout',
    bookingType: 'flight',
    amount: parseFloat(offer.price.total),
    currency: offer.price.currency,
    bookingData: {
        selectedFlight: offer,
        passengerData: [
            {
                id: '1',
                title: 'MR',
                firstName: 'JOHN',
                lastName: 'DOE',
                dateOfBirth: '1990-01-01',
                gender: 'MALE',
                email: 'john.doe@example.com',
                phone: '1234567890'
            }
        ],
        bookingDetails: {
            contact: {
                email: 'john.doe@example.com',
                phone: '1234567890'
            }
        }
    }
};

fs.writeFileSync('checkout-payload.json', JSON.stringify(payload, null, 2));
console.log('Created checkout-payload.json with amount: ' + offer.price.total);