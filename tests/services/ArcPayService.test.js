import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create mock axios instance externally so we can reference it
const mockAxiosInstance = {
  get: vi.fn(),
  post: vi.fn(),
};

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockAxiosInstance),
  },
}));

describe('ArcPayService', () => {
  let service;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-import to get the singleton with the mocked axios
    vi.resetModules();
    const mod = await import('../../resources/js/Services/ArcPayService.js');
    service = mod.default;
    // Override api with our mock
    service.api = mockAxiosInstance;
  });

  describe('constructor', () => {
    it('sets apiUrl to /api/payments', () => {
      expect(service.apiUrl).toBe('/api/payments');
    });
  });

  describe('checkGatewayStatus', () => {
    it('returns success when gateway is OPERATING', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          gatewayStatus: { status: 'OPERATING' }
        }
      });

      const result = await service.checkGatewayStatus();

      expect(result.success).toBe(true);
      expect(result.gatewayOperational).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('?action=gateway-status');
    });

    it('returns gatewayOperational=false when status is not OPERATING', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          gatewayStatus: { status: 'MAINTENANCE' }
        }
      });

      const result = await service.checkGatewayStatus();

      expect(result.success).toBe(true);
      expect(result.gatewayOperational).toBe(false);
    });

    it('handles errors gracefully', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network Error'));

      const result = await service.checkGatewayStatus();

      expect(result.success).toBe(false);
      expect(result.gatewayOperational).toBe(false);
    });
  });

  describe('createSession', () => {
    it('returns session data on success', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: {
          sessionData: { id: 'sess_123' },
          message: 'Session created'
        }
      });

      const result = await service.createSession();

      expect(result.success).toBe(true);
      expect(result.sessionData).toEqual({ id: 'sess_123' });
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('?action=session-create');
    });

    it('handles errors', async () => {
      mockAxiosInstance.post.mockRejectedValue({ response: { data: 'Session failed' } });

      const result = await service.createSession();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Session failed');
    });
  });

  describe('createHostedCheckout', () => {
    it('sends checkout data and returns checkout URL', async () => {
      const checkoutData = {
        amount: 500,
        currency: 'USD',
        orderId: 'ORD-001',
        customerEmail: 'test@test.com',
        customerName: 'John Doe',
        returnUrl: '/success',
        cancelUrl: '/cancel',
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: {
          success: true,
          sessionId: 'sess_456',
          checkoutUrl: 'https://pay.example.com/checkout',
          orderId: 'ORD-001',
          message: 'Checkout created'
        }
      });

      const result = await service.createHostedCheckout(checkoutData);

      expect(result.success).toBe(true);
      expect(result.checkoutUrl).toBe('https://pay.example.com/checkout');
      expect(result.orderId).toBe('ORD-001');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('?action=hosted-checkout', expect.objectContaining({
        amount: 500,
        currency: 'USD',
        orderId: 'ORD-001'
      }));
    });

    it('handles checkout failure', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('Checkout error'));

      const result = await service.createHostedCheckout({ amount: 100 });

      expect(result.success).toBe(false);
    });
  });

  describe('verifyPayment', () => {
    it('returns order data on success', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          orderData: { status: 'CAPTURED', amount: 100 },
          message: 'Verified'
        }
      });

      const result = await service.verifyPayment('ORD-001');

      expect(result.success).toBe(true);
      expect(result.orderData.status).toBe('CAPTURED');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('?action=payment-verify&orderId=ORD-001');
    });

    it('handles verification failure', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Not found'));

      const result = await service.verifyPayment('ORD-INVALID');

      expect(result.success).toBe(false);
    });
  });

  describe('refundPayment', () => {
    it('sends refund request with correct payload', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: {
          success: true,
          refundData: { status: 'REFUNDED' },
          refundReference: 'REF-001',
          message: 'Refund processed'
        }
      });

      const result = await service.refundPayment('ORD-001', 'TXN-001', 100, 'Changed mind');

      expect(result.success).toBe(true);
      expect(result.refundReference).toBe('REF-001');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('?action=payment-refund', {
        orderId: 'ORD-001',
        transactionId: 'TXN-001',
        amount: 100,
        reason: 'Changed mind'
      });
    });

    it('uses default reason', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { success: true } });

      await service.refundPayment('ORD-001', 'TXN-001', 100);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('?action=payment-refund', expect.objectContaining({
        reason: 'Customer request'
      }));
    });
  });

  describe('cancelBooking', () => {
    it('sends cancel request with booking reference', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: {
          success: true,
          message: 'Booking cancelled',
          cancellation: { amadeus: true, arcPay: true },
          booking: { id: 'BK-001', status: 'cancelled' }
        }
      });

      const result = await service.cancelBooking('BK-001', 'user@test.com', 'Test reason');

      expect(result.success).toBe(true);
      expect(result.cancellation.amadeus).toBe(true);
      expect(result.cancellation.arcPay).toBe(true);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('?action=cancel-booking', {
        bookingReference: 'BK-001',
        email: 'user@test.com',
        reason: 'Test reason'
      });
    });

    it('handles cancel failure', async () => {
      mockAxiosInstance.post.mockRejectedValue({
        response: { data: { error: 'Booking not found', details: 'No booking with ref' } }
      });

      const result = await service.cancelBooking('BK-INVALID');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Booking not found');
    });
  });

  describe('initializePayment', () => {
    it('creates order with payment data', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: {
          orderId: 'ORD-NEW',
          orderData: { status: 'CREATED' },
          message: 'Order created'
        }
      });

      const result = await service.initializePayment({
        amount: 250,
        currency: 'USD',
        orderId: 'ORD-NEW',
        customerEmail: 'buyer@test.com'
      });

      expect(result.success).toBe(true);
      expect(result.orderId).toBe('ORD-NEW');
    });
  });

  describe('processPayment', () => {
    it('processes payment with card details', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: {
          success: true,
          transactionId: 'TXN-999',
          message: 'Payment success'
        }
      });

      const result = await service.processPayment('ORD-001', {
        amount: 200,
        cardDetails: {
          cardNumber: '4111111111111111',
          expiryDate: '12/25',
          cvv: '123',
          cardHolder: 'John Doe'
        }
      });

      expect(result.success).toBe(true);
      expect(result.transactionId).toBe('TXN-999');
    });

    it('handles payment processing failure', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('Card declined'));

      const result = await service.processPayment('ORD-001', { amount: 200 });

      expect(result.success).toBe(false);
    });
  });
});
