import axios from 'axios';

class SubscriptionService {
    constructor() {
        this.apiUrl = '/api/subscription';
        // Check if we are running in production and need full URL instead of proxy
        if (import.meta.env.PROD && import.meta.env.VITE_API_BASE_URL) {
            this.apiUrl = `${import.meta.env.VITE_API_BASE_URL}/api/subscription`;
        }
    }

    // Initialize checkout
    async createCheckoutSession(checkoutData) {
        try {
            console.log('🚀 Creating subscription checkout session...', checkoutData);
            const response = await axios.post(`${this.apiUrl}?action=checkout`, checkoutData);
            return response.data;
        } catch (error) {
            console.error('Subscription checkout creation failed:', error);
            return {
                success: false,
                message: error.response?.data?.message || error.message
            };
        }
    }

    // Get Subscription Status
    async getStatus(userId) {
        try {
            if (!userId) return { success: false, message: 'User ID required' };
            const response = await axios.get(`${this.apiUrl}?action=status&userId=${userId}`);
            return response.data;
        } catch (error) {
            console.error('Failed to fetch subscription status:', error);
            return {
                success: false,
                message: error.response?.data?.message || 'Failed to fetch status'
            };
        }
    }
}

export default new SubscriptionService();
