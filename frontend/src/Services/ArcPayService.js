import axios from 'axios';

/**
 * How a booking is cancelled, and how long the page waits for the answer.
 *
 * One request cancels with the supplier, refunds the payment and writes the
 * booking, and it can take far longer than the 10 seconds every other call here
 * allows. The page gave up at 10 seconds while the cancel carried on, and told
 * the customer "timeout of 10000ms exceeded" about a booking that was, in fact,
 * cancelled. Flights cancel on the flights host (flightCancelPath, below); any
 * other booking at this path on the payments endpoint, through the service's
 * own client like every other payments call.
 */
export const CANCEL_BOOKING_PATH = '?action=cancel-booking';
export const CANCEL_TIMEOUT_MS = 60000;

/**
 * Where a flight booking is cancelled: the flights host, which can reach the
 * airline. The payments endpoint runs where Amadeus cannot be reached, and
 * refuses a flight with a PNR (409 CANCEL_VIA_FLIGHTS_API).
 */
export const flightCancelPath = (bookingReference) => `flights/order/${encodeURIComponent(bookingReference)}/cancel`;

/**
 * A cancel that did not succeed, as the page shows it.
 *
 * No answer in time is not a failed cancel: the server may have finished it,
 * so the page reloads the booking to find out. Otherwise the server's own words
 * and its code - never the raw network message ("Failed to fetch"), which
 * tells a customer nothing.
 */
function cancelFailure(error) {
    if (error?.code === 'ECONNABORTED') {
        return {
            success: false,
            timedOut: true,
            error: 'We did not get an answer in time, so we are checking whether your booking was cancelled.'
        };
    }
    const data = error?.response?.data && typeof error.response.data === 'object' ? error.response.data : {};
    return {
        success: false,
        code: data.code || null,
        retryable: data.retryable === true,
        needsReview: data.needsReview === true,
        error: data.error || data.message
            || 'We could not reach our servers to cancel this booking. Please check your connection and try again, or call (877) 538-7380.',
        details: data.details
    };
}

// Use the API endpoints for ARC Pay integration - use relative URLs to go through Vite proxy
class ArcPayService {
    constructor() {
        this.apiUrl = '/api/payments';
        this.api = axios.create({
            baseURL: this.apiUrl,
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000 // 10 second timeout
        });
    }

    // Check ARC Pay Gateway Status
    async checkGatewayStatus() {
        try {
            console.log('🔍 Checking ARC Pay Gateway status...');
            const response = await this.api.get('?action=gateway-status');
            return {
                success: true,
                data: response.data,
                gatewayOperational: response.data.gatewayStatus?.status === 'OPERATING'
            };
        } catch (error) {
            console.error('Gateway status check failed:', error);
            return {
                success: false,
                error: error.response?.data || error.message,
                gatewayOperational: false
            };
        }
    }

    // Create Payment Session
    async createSession() {
        try {
            console.log('🚀 Creating payment session...');
            const response = await this.api.post('?action=session-create');
            return {
                success: true,
                sessionData: response.data.sessionData,
                message: response.data.message
            };
        } catch (error) {
            console.error('Session creation failed:', error);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    // Create Hosted Checkout Session (redirects to ARC Pay payment page)
    async createHostedCheckout(checkoutData) {
        try {
            // Not `checkoutData`: its `bookingData` carries every traveller's
            // passport number, expiry and date of birth, for all four product
            // lines, and the production build strips no console calls.
            console.log('🚀 Creating hosted checkout session...', {
                amount: checkoutData.amount,
                currency: checkoutData.currency || 'USD',
                orderId: checkoutData.orderId,
                bookingType: checkoutData.bookingType,
            });
            const response = await this.api.post('?action=hosted-checkout', {
                amount: checkoutData.amount,
                currency: checkoutData.currency || 'USD',
                orderId: checkoutData.orderId,
                bookingType: checkoutData.bookingType || 'flight',
                // Evaluated by the server on the total it computes itself.
                couponCode: checkoutData.couponCode,
                customerEmail: checkoutData.customerEmail,
                customerName: checkoutData.customerName,
                customerPhone: checkoutData.customerPhone,
                description: checkoutData.description,
                returnUrl: checkoutData.returnUrl,
                cancelUrl: checkoutData.cancelUrl,
                bookingData: checkoutData.bookingData,
                flightData: checkoutData.flightData
            }, {
                // Checkout prices the fare with the airline (up to 25 seconds)
                // and then opens the ARC payment session (up to 30). The 10
                // seconds the other calls here allow gave up on it while it was
                // still working, and the customer's retry started over.
                timeout: 60000
            });

            return {
                success: response.data.success,
                sessionId: response.data.sessionId,
                checkoutUrl: response.data.checkoutUrl || response.data.paymentPageUrl,
                orderId: response.data.orderId,
                message: response.data.message
            };
        } catch (error) {
            console.error('Hosted checkout creation failed:', error);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    // initializePayment was removed: it posted to an `order-create` action that
    // no handler serves, reported success for any 2xx without reading the
    // body, and nothing called it.

    // Process Payment
    async processPayment(orderId, paymentData) {
        try {
            console.log('💳 Processing payment for order:', orderId);

            const paymentPayload = {
                orderId: orderId,
                amount: paymentData.amount || 100,
                cardDetails: {
                    cardNumber: paymentData.cardDetails?.cardNumber,
                    expiryDate: paymentData.cardDetails?.expiryDate,
                    cvv: paymentData.cardDetails?.cvv,
                    cardHolder: paymentData.cardDetails?.cardHolder
                },
                customerInfo: {
                    firstName: paymentData.customerInfo?.firstName || paymentData.cardDetails?.cardHolder?.split(' ')[0] || 'Test',
                    lastName: paymentData.customerInfo?.lastName || paymentData.cardDetails?.cardHolder?.split(' ').slice(1).join(' ') || 'User',
                    email: paymentData.customerInfo?.email || 'test@jetsetgo.com',
                    phone: paymentData.customerInfo?.phone || '1234567890'
                },
                billingAddress: paymentData.billingAddress || {
                    street: "123 Test Street",
                    city: "Test City",
                    state: "Test State",
                    countryCode: "US",
                    postalCode: "12345"
                },
                browserData: paymentData.browserData
            };

            const response = await this.api.post('?action=payment-process', paymentPayload);

            return {
                success: response.data.success,
                paymentData: response.data.paymentData,
                transactionId: response.data.transactionId,
                message: response.data.message
            };
        } catch (error) {
            console.error('Payment processing failed:', error);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    // Verify Payment Status
    async verifyPayment(orderId) {
        try {
            console.log('🔍 Verifying payment for order:', orderId);

            const response = await this.api.get(`?action=payment-verify&orderId=${orderId}`);

            return {
                success: true,
                orderData: response.data.orderData,
                message: response.data.message
            };
        } catch (error) {
            console.error('Payment verification failed:', error);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    // Refund Payment
    async refundPayment(orderId, transactionId, amount, reason = 'Customer request') {
        try {
            console.log('💰 Processing refund for order:', orderId);

            const refundPayload = {
                orderId: orderId,
                transactionId: transactionId,
                amount: amount,
                reason: reason
            };

            const response = await this.api.post('?action=payment-refund', refundPayload);

            return {
                success: response.data.success,
                refundData: response.data.refundData,
                refundReference: response.data.refundReference,
                message: response.data.message
            };
        } catch (error) {
            console.error('Refund processing failed:', error);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    // Cancel Booking - Orchestrated cancellation (Amadeus + ARC Pay refund/void + DB)
    async cancelBooking(bookingReference, email = null, reason = 'Customer request') {
        try {
            console.log('🚫 Cancelling booking:', bookingReference);

            const response = await this.api.post(CANCEL_BOOKING_PATH, {
                bookingReference,
                email,
                reason
            }, {
                timeout: CANCEL_TIMEOUT_MS
            });

            return {
                success: response.data.success,
                message: response.data.message,
                cancellation: response.data.cancellation,
                booking: response.data.booking
            };
        } catch (error) {
            console.error('Cancel booking failed:', error);
            return cancelFailure(error);
        }
    }

    // Cancel a flight booking on the flights host (see flightCancelPath). A
    // signed-in owner is known from the session; a guest proves the booking is
    // theirs with its email. The same 60-second wait and the same answers as
    // cancelBooking. authHeaders is loaded here, not at the top, so pages that
    // only take payments do not load the Supabase client for it.
    async cancelFlightBooking(bookingReference, email = null, reason = 'Customer request') {
        try {
            console.log('🚫 Cancelling flight booking:', bookingReference);
            const [{ getApiUrl }, { authHeaders }] = await Promise.all([
                import('../utils/apiHelper'),
                import('../utils/authHeaders')
            ]);

            const response = await axios.post(getApiUrl(flightCancelPath(bookingReference)), {
                ...(email ? { email } : {}),
                reason
            }, {
                headers: await authHeaders({ 'Content-Type': 'application/json' }),
                withCredentials: true,
                timeout: CANCEL_TIMEOUT_MS
            });

            return {
                success: response.data.success,
                message: response.data.message,
                cancellation: response.data.cancellation,
                booking: response.data.booking
            };
        } catch (error) {
            console.error('Cancel flight booking failed:', error);
            return cancelFailure(error);
        }
    }

    // Test ARC Pay Integration
    async testIntegration() {
        try {
            console.log('🧪 Testing ARC Pay integration...');

            const response = await this.api.post('?action=test');

            return {
                success: true,
                testResults: response.data.testResults,
                message: response.data.message
            };
        } catch (error) {
            console.error('Integration test failed:', error);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    // Helper method to format amount for ARC Pay
    formatAmount(amount) {
        // ARC Pay expects amounts in the smallest currency unit (e.g., cents for USD)
        return Math.round(parseFloat(amount) * 100);
    }

    // Helper method to format card number
    formatCardNumber(cardNumber) {
        return cardNumber.replace(/\s/g, '');
    }

    // Helper method to validate card details
    validateCardDetails(cardDetails) {
        const errors = [];

        if (!cardDetails.cardNumber || !this.formatCardNumber(cardDetails.cardNumber).match(/^\d{13,19}$/)) {
            errors.push('Invalid card number');
        }

        if (!cardDetails.expiryDate || !cardDetails.expiryDate.match(/^(0[1-9]|1[0-2])\/\d{2}$/)) {
            errors.push('Invalid expiry date (MM/YY format required)');
        }

        if (!cardDetails.cvv || !cardDetails.cvv.match(/^\d{3,4}$/)) {
            errors.push('Invalid CVV');
        }

        if (!cardDetails.cardHolder || cardDetails.cardHolder.trim().length < 2) {
            errors.push('Invalid cardholder name');
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    // Helper method to get card type
    getCardType(cardNumber) {
        const cleanNumber = this.formatCardNumber(cardNumber);

        if (cleanNumber.match(/^4/)) return 'Visa';
        if (cleanNumber.match(/^5[1-5]/)) return 'Mastercard';
        if (cleanNumber.match(/^3[47]/)) return 'American Express';
        if (cleanNumber.match(/^6/)) return 'Discover';

        return 'Unknown';
    }
}

export default new ArcPayService(); 