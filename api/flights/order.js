import AmadeusService from '../../backend/services/amadeusService.js';
import axios from 'axios';

// ARC Pay configuration
const ARC_PAY_CONFIG = {
    API_URL: process.env.ARC_PAY_API_URL || 'https://api.arcpay.travel/api/rest/version/77/merchant/TESTARC05511704',
    MERCHANT_ID: process.env.ARC_PAY_MERCHANT_ID || 'TESTARC05511704',
    API_USERNAME: process.env.ARC_PAY_API_USERNAME || 'TESTARC05511704',
    API_PASSWORD: process.env.ARC_PAY_API_PASSWORD || '4d41a81750f1ee3f6aa4adf0dfd6310c',
    BASE_URL: process.env.ARC_PAY_BASE_URL || 'https://api.arcpay.travel/api/rest/version/77',
    PORTAL_URL: process.env.ARC_PAY_PORTAL_URL || 'https://api.arcpay.travel/ma/'
};

// Helper function to get auth config for ARC Pay API
// ARC Pay uses merchant.MERCHANT_ID:password format for Basic Auth
const getArcPayAuthConfig = () => {
    const authString = `merchant.${ARC_PAY_CONFIG.MERCHANT_ID}:${ARC_PAY_CONFIG.API_PASSWORD}`;
    const authHeader = 'Basic ' + Buffer.from(authString).toString('base64');

    return {
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': authHeader
        },
        timeout: 30000
    };
};

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'POST') {
        return await createFlightOrder(req, res);
    } else if (req.method === 'GET') {
        return await getFlightOrder(req, res);
    } else {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });
    }
}

// Create flight order with Amadeus and process payment with ARC Pay
async function createFlightOrder(req, res) {
    try {
        console.log('📋 Flight order creation request received');

        const {
            flightOffer,
            travelers,
            contactInfo,
            paymentDetails,
            arcPayOrderId
        } = req.body;

        // Validate required fields
        if (!flightOffer || !travelers || !contactInfo) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: flightOffer, travelers, and contactInfo are required'
            });
        }

        console.log('Creating flight order with validated data');

        // Step 1: Verify payment with ARC Pay if provided
        let paymentVerified = false;
        if (arcPayOrderId) {
            try {
                console.log('Verifying payment with ARC Pay...');
                const paymentVerification = await axios.get(
                    `${ARC_PAY_CONFIG.API_URL}/order/${arcPayOrderId}`,
                    getArcPayAuthConfig()
                );

                if (paymentVerification.data.result === 'SUCCESS') {
                    paymentVerified = true;
                    console.log('✅ Payment verified successfully');
                } else {
                    console.warn('❌ Payment verification failed:', paymentVerification.data);
                }
            } catch (paymentError) {
                console.error('Payment verification error:', paymentError.message);
                // Continue without payment verification for now
            }
        }

        // Step 2: Format travelers for Amadeus API
        const formattedTravelers = travelers.map((traveler, index) => ({
            id: (index + 1).toString(),
            dateOfBirth: traveler.dateOfBirth || '1990-01-01',
            name: {
                firstName: traveler.firstName,
                lastName: traveler.lastName
            },
            gender: traveler.gender || 'MALE',
            contact: {
                emailAddress: contactInfo.email,
                phones: [{
                    deviceType: 'MOBILE',
                    countryCallingCode: contactInfo.countryCode || '1',
                    number: contactInfo.phoneNumber
                }]
            },
            documents: traveler.documents || []
        }));

        // Step 3: First price the flight offer to get the latest pricing
        console.log('Pricing flight offer...');
        let pricedOffer;
        try {
            const pricingResponse = await AmadeusService.priceFlightOffer(flightOffer);
            if (pricingResponse.success && pricingResponse.data?.flightOffers?.[0]) {
                pricedOffer = pricingResponse.data.flightOffers[0];
                console.log('✅ Flight offer priced successfully');
            } else {
                throw new Error('Failed to price flight offer');
            }
        } catch (pricingError) {
            console.warn('Failed to price flight offer, using original:', pricingError.message);
            pricedOffer = flightOffer;
        }

        // Step 4: Create flight order with Amadeus
        const flightOrderData = {
            data: {
                type: 'flight-order',
                flightOffers: [pricedOffer],
                travelers: formattedTravelers,
                contacts: [{
                    addresseeName: {
                        firstName: formattedTravelers[0].name.firstName,
                        lastName: formattedTravelers[0].name.lastName
                    },
                    purpose: 'STANDARD',
                    phones: formattedTravelers[0].contact.phones,
                    emailAddress: formattedTravelers[0].contact.emailAddress
                }],
                ticketingAgreement: {
                    option: 'DELAY_TO_CANCEL',
                    delay: 'P1D'
                }
            }
        };

        console.log('Creating flight order with Amadeus...');
        const orderResponse = await AmadeusService.createFlightOrder(flightOrderData);

        if (!orderResponse.success) {
            throw new Error(orderResponse.error);
        }

        console.log('✅ Flight order created successfully with Amadeus');

        // Step 5: Extract important information
        const orderData = orderResponse.data;
        const pnr = orderResponse.pnr || orderData?.associatedRecords?.[0]?.reference;
        const ticketingAgreement = orderData?.ticketingAgreement;
        const travelers_data = orderData?.travelers || formattedTravelers;

        // Step 6: Return comprehensive response
        const response = {
            success: true,
            data: {
                orderId: orderData.id,
                pnr: pnr,
                status: 'CONFIRMED',
                bookingReference: orderData.reference || `BOOK-${Date.now()}`,
                paymentStatus: paymentVerified ? 'VERIFIED' : 'PENDING',
                arcPayOrderId: arcPayOrderId,

                // Flight details
                flightOffers: orderData.flightOffers || [pricedOffer],
                travelers: travelers_data,

                // Contact and booking info
                contacts: orderData.contacts,
                ticketingAgreement: ticketingAgreement,

                // Pricing information
                totalPrice: {
                    amount: pricedOffer.price?.total || flightOffer.price?.total,
                    currency: pricedOffer.price?.currency || flightOffer.price?.currency || 'USD'
                },

                // Creation timestamp
                createdAt: orderData.creationDate || new Date().toISOString(),

                // Documents if available
                documents: orderData.documents || [],

                // Full order data for reference
                fullOrderData: orderData
            },
            message: 'Flight order created successfully'
        };

        console.log(`✅ Order created: ID=${response.data.orderId}, PNR=${response.data.pnr}`);

        return res.status(200).json(response);

    } catch (error) {
        console.error('❌ Flight order creation error:', error);

        return res.status(500).json({
            success: false,
            error: 'Failed to create flight order',
            details: error.message,
            code: error.code || 500
        });
    }
}

// Get flight order details
async function getFlightOrder(req, res) {
    try {
        const { orderId } = req.query;

        if (!orderId) {
            return res.status(400).json({
                success: false,
                error: 'Order ID is required'
            });
        }

        console.log(`Fetching flight order details for: ${orderId}`);

        const orderDetails = await AmadeusService.getFlightOrderDetails(orderId);

        if (!orderDetails.success) {
            throw new Error(orderDetails.error);
        }

        const orderData = orderDetails.data;
        const pnr = orderData?.associatedRecords?.[0]?.reference;

        return res.status(200).json({
            success: true,
            data: {
                orderId: orderData.id,
                pnr: pnr,
                status: orderData.status || 'CONFIRMED',
                bookingReference: orderData.reference,

                // Flight and traveler details
                flightOffers: orderData.flightOffers,
                travelers: orderData.travelers,
                contacts: orderData.contacts,

                // Pricing and documents
                totalPrice: orderData.flightOffers?.[0]?.price,
                documents: orderData.documents || [],

                // Timestamps
                createdAt: orderData.creationDate,
                lastModified: orderData.lastModificationDate,

                // Full order data
                fullOrderData: orderData
            },
            message: 'Flight order details retrieved successfully'
        });

    } catch (error) {
        console.error('❌ Error fetching flight order details:', error);

        return res.status(500).json({
            success: false,
            error: 'Failed to fetch flight order details',
            details: error.message
        });
    }
} 