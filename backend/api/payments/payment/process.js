export default async function handler(req, res) {
  // Set CORS headers
  const configuredOrigin = process.env.ALLOWED_ORIGIN || process.env.CORS_ORIGIN;
  const allowedOrigin = configuredOrigin && configuredOrigin !== '*'
    ? configuredOrigin
    : (process.env.NODE_ENV === 'development' ? req.headers.origin || '' : '');

  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      orderId,
      cardDetails,
      billingAddress,
      browserData
    } = req.body;

    // Validate required fields
    if (!orderId || !cardDetails) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: orderId, cardDetails'
      });
    }

    // Basic card validation
    const { cardNumber, expiryDate, cvv, cardHolder } = cardDetails;
    
    if (!cardNumber || !expiryDate || !cvv || !cardHolder) {
      return res.status(400).json({
        success: false,
        error: 'Incomplete card details'
      });
    }

    // Simulate payment processing
    // In a real implementation, this would integrate with ARC Pay API
    
    // Generate transaction ID
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate success (90% success rate for demo)
    const isSuccess = Math.random() > 0.1;
    
    if (!isSuccess) {
      return res.status(400).json({
        success: false,
        error: 'Payment declined by bank',
        errorCode: 'PAYMENT_DECLINED'
      });
    }

    const paymentData = {
      transactionId,
      orderId,
      status: 'COMPLETED',
      amount: 0, // This would come from the order
      currency: 'USD',
      paymentMethod: 'CREDIT_CARD',
      cardLast4: cardNumber.slice(-4),
      processedAt: new Date().toISOString(),
      authCode: `AUTH${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      merchantId: 'TESTARC05511704'
    };

    res.status(200).json({
      success: true,
      paymentData,
      transactionId,
      message: 'Payment processed successfully'
    });

  } catch (error) {
    console.error('Payment processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Payment processing failed',
      details: error.message
    });
  }
} 
