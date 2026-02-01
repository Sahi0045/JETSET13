import axios from 'axios';

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
            console.log('🚀 Creating hosted checkout session...', checkoutData);
            const response = await this.api.post('?action=hosted-checkout', {
                amount: checkoutData.amount,
                currency: checkoutData.currency || 'USD',
                orderId: checkoutData.orderId,
                bookingType: checkoutData.bookingType || 'flight',
                customerEmail: checkoutData.customerEmail,
                customerName: checkoutData.customerName,
                customerPhone: checkoutData.customerPhone,
                description: checkoutData.description,
                returnUrl: checkoutData.returnUrl,
                cancelUrl: checkoutData.cancelUrl,
                bookingData: checkoutData.bookingData
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

    // Initialize Payment (Create Order)
    async initializePayment(paymentData) {
        try {
            console.log('💳 Initializing payment with data:', paymentData);

            const orderPayload = {
                amount: paymentData.amount,
                currency: paymentData.currency || 'USD',
                orderId: paymentData.orderId,
                customerEmail: paymentData.customerEmail,
                customerName: paymentData.customerName,
                description: paymentData.description || `Payment for ${paymentData.orderId}`,
                returnUrl: paymentData.returnUrl,
                cancelUrl: paymentData.cancelUrl
            };

            const response = await this.api.post('?action=order-create', orderPayload);

            return {
                success: true,
                orderId: response.data.orderId,
                orderData: response.data.orderData,
                message: response.data.message
            };
        } catch (error) {
            console.error('Payment initialization failed:', error);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

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