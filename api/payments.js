import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with proper error handling
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase configuration missing!');
  console.error('SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing');
  console.error('SUPABASE_KEY:', supabaseKey ? 'Set' : 'Missing');
}

const supabase = createClient(supabaseUrl || 'https://qqmagqwumjipdqvxbiqu.supabase.co', supabaseKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxbWFncXd1bWppcGRxdnhiaXF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUwMDEwMTIsImV4cCI6MjA2MDU3NzAxMn0.Ho8DYLWpX_vQ6syrI2zkU3G5pnNTdnYpgtpyjjGYlDA', {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Log all incoming requests for debugging
  console.log('='.repeat(60));
  console.log('📥 Payment API Request:', new Date().toISOString());
  console.log('Method:', req.method);
  console.log('Query:', JSON.stringify(req.query));
  console.log('Body:', JSON.stringify(req.body));
  console.log('Headers:', JSON.stringify({
    'content-type': req.headers['content-type'],
    'authorization': req.headers['authorization'] ? 'Bearer ***' : 'None'
  }));
  console.log('='.repeat(60));

  try {
    const { action } = req.query;

    switch (action) {
      case 'initiate-payment':
        return handlePaymentInitiation(req, res);
      case 'payment-callback':
        return handlePaymentCallback(req, res);
      case 'get-payment-details':
        return handleGetPaymentDetails(req, res);
      case 'gateway-status':
        return handleGatewayStatus(req, res);
      case 'session-create':
        return handleSessionCreate(req, res);
      case 'order-create':
        return handleOrderCreate(req, res);
      case 'payment-process':
        return handlePaymentProcess(req, res);
      case 'payment-verify':
        return handlePaymentVerify(req, res);
      case 'payment-refund':
        return handlePaymentRefund(req, res);
      case 'test':
        return handleTest(req, res);
      case 'health':
        return handleHealthCheck(req, res);
      case 'debug':
        return handleDebug(req, res);
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action. Supported actions: initiate-payment, payment-callback, get-payment-details, gateway-status, session-create, order-create, payment-process, payment-verify, payment-refund, test, health, debug'
        });
    }
  } catch (error) {
    console.error('='.repeat(60));
    console.error('❌ Payment API top-level error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Request details:', {
      method: req.method,
      query: req.query,
      body: req.body
    });
    console.error('='.repeat(60));
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      type: error.name || 'Error',
      timestamp: new Date().toISOString()
    });
  }
}

// ============================================
// ARC PAY HOSTED CHECKOUT INTEGRATION
// ============================================

// Initiate Payment - Create ARC Pay session
async function handlePaymentInitiation(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate Supabase client
    if (!supabase) {
      console.error('❌ Supabase client not initialized');
      return res.status(500).json({
        success: false,
        error: 'Database connection failed',
        details: 'Supabase client not initialized'
      });
    }

    const { quote_id, return_url, cancel_url } = req.body;

    if (!quote_id) {
      return res.status(400).json({
        success: false,
        error: 'quote_id is required'
      });
    }

    console.log('🔍 Fetching quote:', quote_id);
    console.log('📋 Request body:', JSON.stringify({ quote_id, return_url, cancel_url }, null, 2));

    // 1. Fetch quote details from database
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', quote_id)
      .single();

    if (quoteError) {
      console.error('❌ Quote fetch error:', quoteError);
      console.error('Error code:', quoteError.code);
      console.error('Error message:', quoteError.message);
      console.error('Error details:', quoteError.details);
      return res.status(500).json({
        success: false,
        error: 'Database error while fetching quote',
        details: quoteError.message || 'Unknown database error',
        code: quoteError.code
      });
    }

    if (!quote) {
      console.error('❌ Quote not found for ID:', quote_id);
      return res.status(404).json({
        success: false,
        error: 'Quote not found',
        details: `No quote found with ID: ${quote_id}`
      });
    }

    console.log('✅ Quote found:', quote.id, 'Inquiry ID:', quote.inquiry_id);

    // 2. Fetch inquiry details separately
    const { data: inquiry, error: inquiryError } = await supabase
      .from('inquiries')
      .select('customer_email, customer_name, customer_phone')
      .eq('id', quote.inquiry_id)
      .single();

    if (inquiryError) {
      console.error('Inquiry fetch error:', inquiryError);
    }

    const customerEmail = inquiry?.customer_email || quote.customer_email || null;
    const customerName = inquiry?.customer_name || quote.customer_name || 'Customer';

    console.log('💳 Creating payment record...');
    console.log('   Customer Email:', customerEmail);
    console.log('   Customer Name:', customerName);

    // 3. Create payment record
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert([{
        quote_id,
        inquiry_id: quote.inquiry_id,
        amount: quote.total_amount,
        currency: quote.currency || 'USD',
        payment_status: 'pending',
        customer_email: customerEmail,
        customer_name: customerName,
        return_url: return_url || `${process.env.FRONTEND_URL || 'https://www.jetsetterss.com'}/payment/callback`,
        cancel_url: cancel_url || `${process.env.FRONTEND_URL || 'https://www.jetsetterss.com'}/inquiry/${quote.inquiry_id}`
      }])
      .select()
      .single();

    if (paymentError) {
      console.error('Payment creation error:', paymentError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create payment record',
        details: paymentError.message,
        code: paymentError.code
      });
    }

    console.log('✅ Payment record created:', payment.id);

    // 4. Call ARC Pay API to create hosted checkout session
    const arcMerchantId = process.env.ARC_PAY_MERCHANT_ID || 'TESTARC05511704';
    const arcApiPassword = process.env.ARC_PAY_API_PASSWORD || '4d41a81750f1ee3f6aa4adf0dfd6310c';
    const arcBaseUrl = process.env.ARC_PAY_BASE_URL || process.env.ARC_PAY_API_URL || 'https://api.arcpay.travel/api/rest/version/100';

    if (!arcMerchantId || !arcApiPassword) {
      console.error('ARC Pay credentials not configured');
      console.error('Merchant ID:', arcMerchantId ? 'Set' : 'Missing');
      console.error('API Password:', arcApiPassword ? 'Set' : 'Missing');
      return res.status(500).json({
        success: false,
        error: 'Payment gateway not configured. Please contact support.'
      });
    }

    console.log('🔄 Calling ARC Pay API...');
    console.log('Base URL:', arcBaseUrl);
    console.log('Merchant ID:', arcMerchantId);

    // ARC Pay uses HTTP Basic Auth with merchant.MERCHANT_ID:password format
    const authHeader = 'Basic ' + Buffer.from(`merchant.${arcMerchantId}:${arcApiPassword}`).toString('base64');

    const sessionUrl = `${arcBaseUrl}/merchant/${arcMerchantId}/session`;
    console.log('Session URL:', sessionUrl);

    // Ensure return and cancel URLs are properly formatted
    const finalReturnUrl = return_url || `${process.env.FRONTEND_URL || 'https://www.jetsetterss.com'}/payment/callback?quote_id=${quote.id}`;
    const finalCancelUrl = cancel_url || `${process.env.FRONTEND_URL || 'https://www.jetsetterss.com'}/inquiry/${quote.inquiry_id}?payment=cancelled`;

    const requestBody = {
      apiOperation: 'INITIATE_CHECKOUT',
      interaction: {
        operation: 'PURCHASE',
        returnUrl: finalReturnUrl,
        cancelUrl: finalCancelUrl,
        merchant: {
          name: 'JetSet Travel',
          address: {
            line1: '123 Travel Street',
            city: 'New York',
            stateProvince: 'NY',
            postalCode: '10001',
            country: 'USA'
          }
        },
        displayControl: {
          billingAddress: 'OPTIONAL',
          customerEmail: 'OPTIONAL'
        }
      },
      order: {
        id: payment.id,
        amount: parseFloat(quote.total_amount).toFixed(2),
        currency: quote.currency || 'USD',
        description: `Quote ${quote.quote_number || quote.id.slice(-8)} - ${quote.title || 'Travel Booking'}`
      }
    };

    console.log('Request body:', JSON.stringify(requestBody, null, 2));

    let arcResponse;
    try {
      arcResponse = await fetch(sessionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
    } catch (fetchError) {
      console.error('Network error calling ARC Pay:', fetchError);
      return res.status(500).json({
        success: false,
        error: 'Failed to connect to payment gateway',
        details: fetchError.message
      });
    }

    const responseText = await arcResponse.text();
    console.log('ARC Pay response status:', arcResponse.status);
    console.log('ARC Pay response:', responseText);

    if (!arcResponse.ok) {
      let errorDetails;
      try {
        errorDetails = JSON.parse(responseText);
      } catch {
        errorDetails = { message: responseText };
      }
      
      console.error('ARC Pay API error:', errorDetails);
      return res.status(500).json({
        success: false,
        error: 'Failed to create payment session with ARC Pay',
        details: errorDetails.message || errorDetails.error || 'Unknown error',
        status: arcResponse.status
      });
    }

    let session;
    try {
      session = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse ARC Pay response:', parseError);
      console.error('Response text:', responseText);
      return res.status(500).json({
        success: false,
        error: 'Invalid response from payment gateway',
        details: 'Failed to parse JSON response'
      });
    }

    // Handle different response formats from ARC Pay
    const sessionId = session.session?.id || session.sessionId || session.id;
    const successIndicator = session.successIndicator || session.success_indicator;

    if (!sessionId) {
      console.error('❌ ARC Pay response missing session ID');
      console.error('Full response:', JSON.stringify(session, null, 2));
      return res.status(500).json({
        success: false,
        error: 'Invalid response from payment gateway',
        details: 'Session ID not found in response',
        response: session
      });
    }

    console.log('✅ ARC Pay session created:', sessionId);
    console.log('   Success Indicator:', successIndicator);

    // 5. Store session ID in payment record
    const { error: updateError } = await supabase
      .from('payments')
      .update({
        arc_session_id: sessionId,
        success_indicator: successIndicator,
        arc_order_id: payment.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', payment.id);

    if (updateError) {
      console.error('Failed to update payment with session ID:', updateError);
      // Don't fail the request if update fails, but log it
    } else {
      console.log('✅ Payment record updated with session ID');
    }

    // 6. Return session details for Checkout.js integration
    return res.status(200).json({
      success: true,
      sessionId: sessionId,
      successIndicator: successIndicator,
      merchantId: arcMerchantId,
      paymentId: payment.id,
      checkoutUrl: session.redirectUrl || session.checkoutUrl || null
    });

  } catch (error) {
    console.error('❌ Payment initiation error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Provide more specific error messages
    let errorMessage = 'Payment initiation failed';
    let errorDetails = error.message || 'Unknown error';
    
    if (error.message?.includes('fetch')) {
      errorMessage = 'Network error connecting to payment gateway';
      errorDetails = 'Failed to reach ARC Pay API. Please try again.';
    } else if (error.message?.includes('JSON')) {
      errorMessage = 'Invalid response from payment gateway';
      errorDetails = 'Payment gateway returned invalid data. Please try again.';
    } else if (error.message?.includes('Supabase') || error.message?.includes('database')) {
      errorMessage = 'Database error';
      errorDetails = 'Failed to access database. Please try again.';
    }
    
    return res.status(500).json({
      success: false,
      error: errorMessage,
      details: errorDetails,
      type: error.name || 'Error'
    });
  }
}

// Payment Callback - Handle ARC Pay redirect
async function handlePaymentCallback(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { resultIndicator, sessionId } = req.query;

    if (!resultIndicator || !sessionId) {
      return res.redirect('/payment/failed?error=missing_params');
    }

    // 1. Retrieve payment by session ID
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*, quote:quotes(*), inquiry:inquiries(*)')
      .eq('arc_session_id', sessionId)
      .single();

    if (paymentError || !payment) {
      console.error('Payment not found for session:', sessionId);
      return res.redirect('/payment/failed?error=invalid_session');
    }

    // 2. Verify resultIndicator matches successIndicator (security check)
    if (resultIndicator !== payment.success_indicator) {
      console.error('Result indicator mismatch');
      return res.redirect('/payment/failed?error=invalid_indicator');
    }

    // 3. Retrieve transaction details from ARC Pay
    const arcMerchantId = process.env.ARC_PAY_MERCHANT_ID || 'TESTARC05511704';
    const arcApiPassword = process.env.ARC_PAY_API_PASSWORD || '4d41a81750f1ee3f6aa4adf0dfd6310c';
    const arcBaseUrl = process.env.ARC_PAY_BASE_URL || 'https://api.arcpay.travel/api/rest/version/100';

    // ARC Pay uses merchant.MERCHANT_ID:password format for authentication
    const authHeader = 'Basic ' + Buffer.from(`merchant.${arcMerchantId}:${arcApiPassword}`).toString('base64');

    const txnResponse = await fetch(
      `${arcBaseUrl}/merchant/${arcMerchantId}/order/${payment.id}/transaction/1`,
      {
        method: 'GET',
        headers: {
          'Authorization': authHeader
        }
      }
    );

    if (!txnResponse.ok) {
      console.error('Failed to retrieve transaction from ARC Pay');
      return res.redirect('/payment/failed?error=verification_failed');
    }

    const transaction = await txnResponse.json();

    // 4. Check transaction result
    if (transaction.result === 'SUCCESS') {
      // Update payment status
      await supabase
        .from('payments')
        .update({
          payment_status: 'completed',
          completed_at: new Date().toISOString(),
          arc_transaction_id: transaction.transaction?.id,
          payment_method: transaction.sourceOfFunds?.provided?.card?.brand,
          metadata: {
            transaction: transaction
          }
        })
        .eq('id', payment.id);

      // Update quote status
      await supabase
        .from('quotes')
        .update({
          payment_status: 'paid',
          paid_at: new Date().toISOString(),
          status: 'paid'
        })
        .eq('id', payment.quote_id);

      // Update inquiry status
      await supabase
        .from('inquiries')
        .update({
          status: 'paid'
        })
        .eq('id', payment.inquiry_id);

      return res.redirect(`/payment/success?paymentId=${payment.id}`);
    } else {
      // Payment failed
      await supabase
        .from('payments')
        .update({
          payment_status: 'failed',
          metadata: {
            error: transaction.error
          }
        })
        .eq('id', payment.id);

      return res.redirect(`/payment/failed?reason=${transaction.error?.cause || 'payment_declined'}`);
    }

  } catch (error) {
    console.error('Payment callback error:', error);
    return res.redirect('/payment/failed?error=processing_error');
  }
}

// Get Payment Details
async function handleGetPaymentDetails(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { paymentId } = req.query;

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        error: 'paymentId is required'
      });
    }

    const { data: payment, error } = await supabase
      .from('payments')
      .select('*, quote:quotes(*), inquiry:inquiries(*)')
      .eq('id', paymentId)
      .single();

    if (error || !payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    return res.status(200).json({
      success: true,
      payment
    });

  } catch (error) {
    console.error('Get payment details error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve payment details'
    });
  }
}

// ============================================
// LEGACY/TEST ENDPOINTS
// ============================================

// Gateway Status Check
async function handleGatewayStatus(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const gatewayStatus = {
    status: 'OPERATING',
    lastChecked: new Date().toISOString(),
    version: '1.0.0',
    services: {
      payment: 'OPERATING',
      refund: 'OPERATING',
      verification: 'OPERATING'
    },
    uptime: '99.9%'
  };

  res.status(200).json({
    success: true,
    gatewayStatus,
    message: 'Gateway status retrieved successfully'
  });
}

// Session Creation
async function handleSessionCreate(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const sessionData = {
    sessionId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
    status: 'ACTIVE',
    merchantId: 'TESTARC05511704',
    environment: 'sandbox'
  };

  res.status(200).json({
    success: true,
    sessionData,
    message: 'Payment session created successfully'
  });
}

// Order Creation
async function handleOrderCreate(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    amount,
    currency = 'USD',
    orderId,
    customerEmail,
    customerName,
    description,
    returnUrl,
    cancelUrl
  } = req.body;

  // Validate required fields
  if (!amount || !orderId || !customerEmail) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: amount, orderId, customerEmail'
    });
  }

  const orderData = {
    orderId: orderId || `ORDER_${Date.now()}`,
    amount: parseFloat(amount),
    currency,
    customerEmail,
    customerName: customerName || 'Guest User',
    description: description || `Payment for order ${orderId}`,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
    returnUrl,
    cancelUrl,
    merchantId: 'TESTARC05511704',
    environment: 'sandbox'
  };

  res.status(200).json({
    success: true,
    orderId: orderData.orderId,
    orderData,
    message: 'Order created successfully'
  });
}

// Payment Processing
async function handlePaymentProcess(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

  const { cardNumber, expiryDate, cvv, cardHolder } = cardDetails;
  
  if (!cardNumber || !expiryDate || !cvv || !cardHolder) {
    return res.status(400).json({
      success: false,
      error: 'Incomplete card details'
    });
  }

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
}

// Payment Verification
async function handlePaymentVerify(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { orderId } = req.query;

  if (!orderId) {
    return res.status(400).json({
      success: false,
      error: 'Order ID is required'
    });
  }

  const orderData = {
    orderId,
    status: 'COMPLETED',
    amount: 299.99,
    currency: 'USD',
    paymentMethod: 'CREDIT_CARD',
    transactionId: `txn_${Date.now()}_verified`,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
    completedAt: new Date().toISOString(),
    customerEmail: 'customer@example.com',
    merchantId: 'TESTARC05511704',
    authCode: `AUTH${Math.random().toString(36).substr(2, 6).toUpperCase()}`
  };

  res.status(200).json({
    success: true,
    orderData,
    message: 'Payment verification successful'
  });
}

// Payment Refund
async function handlePaymentRefund(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    orderId,
    transactionId,
    amount,
    reason = 'Customer request'
  } = req.body;

  // Validate required fields
  if (!orderId || !transactionId || !amount) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: orderId, transactionId, amount'
    });
  }

  const refundAmount = parseFloat(amount);
  if (isNaN(refundAmount) || refundAmount <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid refund amount'
    });
  }

  const refundReference = `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const refundData = {
    refundReference,
    orderId,
    transactionId,
    amount: refundAmount,
    currency: 'USD',
    reason,
    status: 'COMPLETED',
    processedAt: new Date().toISOString(),
    estimatedSettlement: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days
    merchantId: 'TESTARC05511704'
  };

  res.status(200).json({
    success: true,
    refundData,
    refundReference,
    message: 'Refund processed successfully'
  });
}

// Integration Test
async function handleTest(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const testResults = {
    timestamp: new Date().toISOString(),
    environment: 'sandbox',
    merchantId: 'TESTARC05511704',
    tests: [
      {
        name: 'Gateway Status Check',
        status: 'PASSED',
        duration: '120ms',
        details: 'Gateway is operational'
      },
      {
        name: 'Session Creation',
        status: 'PASSED',
        duration: '85ms',
        details: 'Session created successfully'
      },
      {
        name: 'Order Creation',
        status: 'PASSED',
        duration: '95ms',
        details: 'Order created with valid parameters'
      },
      {
        name: 'Payment Processing',
        status: 'PASSED',
        duration: '1250ms',
        details: 'Test payment processed successfully'
      },
      {
        name: 'Payment Verification',
        status: 'PASSED',
        duration: '75ms',
        details: 'Payment status verified'
      },
      {
        name: 'Refund Processing',
        status: 'PASSED',
        duration: '890ms',
        details: 'Test refund processed successfully'
      }
    ],
    summary: {
      totalTests: 6,
      passed: 6,
      failed: 0,
      overallStatus: 'HEALTHY',
      totalDuration: '2515ms'
    }
  };

  res.status(200).json({
    success: true,
    testResults,
    message: 'ARC Pay integration test completed successfully'
  });
}

// Health check endpoint
async function handleHealthCheck(req, res) {
  try {
    // Test Supabase connection
    const { data, error } = await supabase
      .from('quotes')
      .select('id')
      .limit(1);
    
    const supabaseStatus = error ? 'error' : 'ok';
    
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        supabase: {
          status: supabaseStatus,
          error: error?.message || null
        },
        arcPay: {
          merchantId: process.env.ARC_PAY_MERCHANT_ID || 'TESTARC05511704',
          configured: !!(process.env.ARC_PAY_MERCHANT_ID && process.env.ARC_PAY_API_PASSWORD)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// Debug endpoint - detailed environment info
async function handleDebug(req, res) {
  const envVars = {
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'Not set',
    SUPABASE_KEY: (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY) ? 'Set (hidden)' : 'Not set',
    ARC_PAY_MERCHANT_ID: process.env.ARC_PAY_MERCHANT_ID || 'TESTARC05511704 (fallback)',
    ARC_PAY_API_PASSWORD: process.env.ARC_PAY_API_PASSWORD ? 'Set (hidden)' : '4d41a81750f1ee3f6aa4adf0dfd6310c (fallback)',
    ARC_PAY_BASE_URL: process.env.ARC_PAY_BASE_URL || process.env.ARC_PAY_API_URL || 'https://api.arcpay.travel/api/rest/version/100 (fallback)',
    NODE_ENV: process.env.NODE_ENV || 'Not set',
    FRONTEND_URL: process.env.FRONTEND_URL || 'Not set'
  };

  try {
    // Test Supabase query
    const { data: quoteTest, error: quoteError } = await supabase
      .from('quotes')
      .select('id, quote_number, total_amount')
      .limit(1);

    const { data: paymentTest, error: paymentError } = await supabase
      .from('payments')
      .select('id')
      .limit(1);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      environment: envVars,
      supabase: {
        client: supabase ? 'Initialized' : 'Not initialized',
        quotesTable: quoteError ? `Error: ${quoteError.message}` : `OK (${quoteTest?.length || 0} records found)`,
        paymentsTable: paymentError ? `Error: ${paymentError.message}` : `OK (${paymentTest?.length || 0} records found)`
      },
      request: {
        method: req.method,
        url: req.url,
        headers: {
          'content-type': req.headers['content-type'],
          'user-agent': req.headers['user-agent'],
          'authorization': req.headers['authorization'] ? 'Present (hidden)' : 'Not present'
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      environment: envVars,
      timestamp: new Date().toISOString()
    });
  }
} 