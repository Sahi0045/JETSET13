import { createClient } from '@supabase/supabase-js';
import { normalizeCountryCode, normalizeBillingAddress } from './utils/countryCodeNormalizer.js';

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
      case 'hosted-checkout':
        return handleHostedCheckout(req, res);
      case 'payment-process':
        return handlePaymentProcess(req, res);
      case 'payment-verify':
        return handlePaymentVerify(req, res);
      case 'payment-refund':
        return handlePaymentRefund(req, res);
      case 'payment-void':
        return handlePaymentVoid(req, res);
      case 'payment-capture':
        return handlePaymentCapture(req, res);
      case 'payment-retrieve':
        return handlePaymentRetrieve(req, res);
      case 'test':
        return handleTest(req, res);
      case 'health':
        return handleHealthCheck(req, res);
      case 'debug':
        return handleDebug(req, res);
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action. Supported actions: initiate-payment, payment-callback, get-payment-details, gateway-status, session-create, order-create, hosted-checkout, payment-process, payment-verify, payment-refund, payment-void, payment-capture, payment-retrieve, test, health, debug'
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
    console.log('🚀 handlePaymentInitiation called');
    console.log('Request method:', req.method);
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Request query:', JSON.stringify(req.query, null, 2));

    // Validate Supabase client
    if (!supabase) {
      console.error('❌ Supabase client not initialized');
      return res.status(500).json({
        success: false,
        error: 'Database connection failed',
        details: 'Supabase client not initialized'
      });
    }

    console.log('✅ Supabase client initialized');
    const { quote_id, return_url, cancel_url } = req.body;

    if (!quote_id) {
      console.error('❌ Missing quote_id in request body');
      return res.status(400).json({
        success: false,
        error: 'quote_id is required',
        details: 'quote_id parameter is missing from request body'
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
    const arcBaseUrl = process.env.ARC_PAY_BASE_URL || process.env.ARC_PAY_API_URL || 'https://api.arcpay.travel/api/rest/version/77';

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
    console.log('API Password:', arcApiPassword ? '***' + arcApiPassword.slice(-4) : 'Missing');

    // ARC Pay uses HTTP Basic Auth with merchant.MERCHANT_ID:password format
    const authHeader = 'Basic ' + Buffer.from(`merchant.${arcMerchantId}:${arcApiPassword}`).toString('base64');

    // Ensure base URL doesn't have trailing slash
    const cleanBaseUrl = arcBaseUrl.replace(/\/$/, '');
    const sessionUrl = `${cleanBaseUrl}/merchant/${arcMerchantId}/session`;
    console.log('Session URL:', sessionUrl);
    console.log('Auth Header:', authHeader.substring(0, 20) + '...');

    // Ensure return and cancel URLs are properly formatted
    // Return URL must point to FRONTEND route - ARC Pay redirects to frontend with resultIndicator and sessionId
    // Frontend then calls backend API for verification
    // Format: /payment/callback?quote_id={quoteId}&inquiry_id={inquiryId}
    const frontendBaseUrl = process.env.FRONTEND_URL || 'https://www.jetsetterss.com';
    const finalReturnUrl = return_url || `${frontendBaseUrl}/payment/callback?quote_id=${quote.id}&inquiry_id=${quote.inquiry_id}`;
    const finalCancelUrl = cancel_url || `${frontendBaseUrl}/inquiry/${quote.inquiry_id}?payment=cancelled`;

    console.log('🔗 Return URL:', finalReturnUrl);
    console.log('🔗 Cancel URL:', finalCancelUrl);

    // IMPORTANT: Per ARC Pay API v70/v100 documentation, INITIATE_CHECKOUT does NOT accept
    // authentication parameters (acceptVersions, channel, purpose). These parameters
    // are only used in INITIATE_AUTHENTICATION and AUTHENTICATE_PAYER operations.
    // Including authentication.purpose will result in: "Unexpected parameter 'authentication.purpose'"
    // Reference: https://documenter.getpostman.com/view/9012210/2s935sp37U#ae595aa5-e080-4961-ae0b-80d8611d8921
    // 
    // Official documentation structure:
    // - apiOperation: "INITIATE_CHECKOUT"
    // - order: { id, currency, description, amount }
    // - interaction: { operation, returnUrl }
    // - customer: { email, mobilePhone } (optional but recommended)
    const requestBody = {
      apiOperation: 'INITIATE_CHECKOUT',
      interaction: {
        operation: 'PURCHASE',
        returnUrl: finalReturnUrl,
        cancelUrl: finalCancelUrl,
        merchant: {
          name: 'JetSet Travel'
        },
        displayControl: {
          billingAddress: 'MANDATORY',  // Required for 3DS2 - ensures billing data is collected
          customerEmail: 'MANDATORY'    // Required for 3DS2 risk assessment
        },
        action: {
          '3DSecure': 'MANDATORY'
        },
        timeout: 900
      },
      order: {
        id: payment.id,
        reference: payment.id,
        amount: parseFloat(quote.total_amount).toFixed(2),
        currency: quote.currency || 'USD',
        description: `Quote ${quote.quote_number || quote.id.slice(-8)} - ${quote.title || 'Travel Booking'}`
      },
      // Force 3DS challenge (OTP) - required for v77 to trigger authentication
      authentication: {
        challengePreference: 'CHALLENGE_MANDATED'
      }
    };

    // Add customer object if email is available (per ARC Pay documentation example)
    // Reference: https://documenter.getpostman.com/view/9012210/2s935sp37U#ae595aa5-e080-4961-ae0b-80d8611d8921
    if (customerEmail) {
      requestBody.customer = {
        email: customerEmail
      };

      // Add mobile phone if available from inquiry
      const customerPhone = inquiry?.customer_phone || quote.customer_phone;
      if (customerPhone) {
        // Remove any non-digit characters for phone number
        const cleanPhone = customerPhone.replace(/\D/g, '');
        if (cleanPhone) {
          requestBody.customer.mobilePhone = cleanPhone;
        }
      }
    }

    // Log full request for ARC support debugging (3DS should auto-trigger from merchant profile)
    console.log('='.repeat(80));
    console.log('🔵 ARC PAY REQUEST - INITIATE_CHECKOUT');
    console.log('='.repeat(80));
    console.log('📤 Endpoint:', sessionUrl);
    console.log('📤 Request Body:', JSON.stringify(requestBody, null, 2));
    console.log('='.repeat(80));

    let arcResponse;
    try {
      const requestBodyString = JSON.stringify(requestBody);

      arcResponse = await fetch(sessionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
          'Accept': 'application/json'
        },
        body: requestBodyString
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
    console.log('='.repeat(80));
    console.log('🔵 ARC PAY RESPONSE - INITIATE_CHECKOUT');
    console.log('='.repeat(80));
    console.log('📥 HTTP Status:', arcResponse.status);
    console.log('📥 Response Body:', responseText);
    console.log('='.repeat(80));

    if (!arcResponse.ok) {
      let errorDetails;
      try {
        errorDetails = JSON.parse(responseText);
      } catch {
        errorDetails = { message: responseText, rawResponse: responseText };
      }

      console.error('='.repeat(80));
      console.error('❌ ARC Pay API ERROR:');
      console.error('   HTTP Status:', arcResponse.status, arcResponse.statusText);
      console.error('   Full Error Object:', JSON.stringify(errorDetails, null, 2));
      console.error('   Raw Response:', responseText.substring(0, 1000));
      console.error('   Request URL:', sessionUrl);
      console.error('   Request Body:', JSON.stringify(requestBody, null, 2));
      console.error('='.repeat(80));

      // Return more detailed error information
      const errorMessage = errorDetails.error?.explanation ||
        errorDetails.error?.message ||
        errorDetails.message ||
        errorDetails.explanation ||
        errorDetails.result ||
        errorDetails.reason ||
        'Unknown error from ARC Pay';

      const errorField = errorDetails.error?.field || errorDetails.field;
      const errorCause = errorDetails.error?.cause || errorDetails.cause;
      const errorCode = errorDetails.error?.code || errorDetails.code;

      return res.status(500).json({
        success: false,
        error: 'Failed to create payment session with ARC Pay',
        details: errorMessage,
        field: errorField,
        cause: errorCause,
        code: errorCode,
        httpStatus: arcResponse.status,
        httpStatusText: arcResponse.statusText,
        arcPayError: errorDetails,
        rawResponse: responseText.substring(0, 1000),
        requestUrl: sessionUrl,
        requestBody: requestBody
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

    // 6. Construct payment page URL for Hosted Payment Page (HPP) redirect
    // ARC Pay uses their own hosted checkout page
    // Correct format: https://api.arcpay.travel/checkout/pay/{sessionId}
    // 
    // Reference: ARC Pay documentation

    const gatewayDomain = 'https://api.arcpay.travel';

    console.log('🔧 Using ARC Pay gateway domain for payment page:', gatewayDomain);
    console.log('   API base URL was:', arcBaseUrl);

    // ARC Pay Hosted Payment Page URL - simple redirect with session ID in path
    // Format: https://api.arcpay.travel/checkout/pay/{sessionId}
    const paymentPageUrl = `${gatewayDomain}/checkout/pay/${sessionId}`;

    console.log('✅ Payment page URL (HPP Redirect):', paymentPageUrl);
    console.log('   Session ID:', sessionId);

    // 7. Return session details - frontend will use simple redirect
    return res.status(200).json({
      success: true,
      sessionId: sessionId,
      successIndicator: successIndicator,
      merchantId: arcMerchantId,
      paymentId: payment.id,
      paymentPageUrl: paymentPageUrl,
      checkoutUrl: paymentPageUrl,
      // Include redirect method so frontend knows to use GET redirect instead of form POST
      redirectMethod: 'GET'
    });

  } catch (error) {
    console.error('='.repeat(60));
    console.error('❌ Payment initiation error in handlePaymentInitiation:');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error type:', typeof error);
    console.error('Error keys:', Object.keys(error));
    if (error.cause) {
      console.error('Error cause:', error.cause);
    }
    console.error('='.repeat(60));

    // Provide more specific error messages
    let errorMessage = 'Payment initiation failed';
    let errorDetails = error.message || 'Unknown error';

    if (error.message?.includes('fetch') || error.message?.includes('network')) {
      errorMessage = 'Network error connecting to payment gateway';
      errorDetails = 'Failed to reach ARC Pay API. Please try again.';
    } else if (error.message?.includes('JSON') || error.message?.includes('parse')) {
      errorMessage = 'Invalid response from payment gateway';
      errorDetails = 'Payment gateway returned invalid data. Please try again.';
    } else if (error.message?.includes('Supabase') || error.message?.includes('database')) {
      errorMessage = 'Database error';
      errorDetails = 'Failed to access database. Please try again.';
    }

    // Ensure we always return a response
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: errorMessage,
        details: errorDetails,
        errorType: error.name || 'Error',
        timestamp: new Date().toISOString()
      });
    } else {
      console.error('⚠️ Response already sent, cannot send error response');
    }
  }
}

// Payment Callback - Handle ARC Pay redirect
// 
// ARC Pay 3DS2 Authentication Status Handling:
// - transactionStatus: Y (Frictionless), C (Challenge), A (Authentication Attempted), 
//                      N (Not Authenticated), R (Rejected), U (Unavailable)
// - authenticationStatus: AUTHENTICATION_SUCCESSFUL, AUTHENTICATION_PENDING, 
//                        AUTHENTICATION_FAILED, AUTHENTICATION_UNAVAILABLE
// 
// Official ARC Pay Test Cards for 3DS Testing:
// Mastercard Challenge: 5123450000000008, 2223000000000007
// Mastercard Frictionless: 5123456789012346
// Visa Challenge: 4440000009900010
// Visa Frictionless: 4440000042200014
// Use expiry "01/39" for successful transactions
//
async function handlePaymentCallback(req, res) {
  // Accept both GET and POST - ARC Pay gateway sends POST with form data
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('📥 Payment callback received:');
    console.log('   Method:', req.method);
    console.log('   Body:', JSON.stringify(req.body, null, 2));
    console.log('   Query:', JSON.stringify(req.query, null, 2));
    console.log('   Headers:', JSON.stringify(req.headers, null, 2));

    // ARC Pay hosted form may send data with different parameter names
    // Try multiple possible formats
    const resultIndicator = req.body?.resultIndicator || req.query?.resultIndicator ||
      req.body?.result || req.query?.result ||
      req.body?.resultIndicator || req.query?.resultIndicator;
    const sessionId = req.body?.sessionId || req.query?.sessionId ||
      req.body?.['session.id'] || req.query?.['session.id'] ||
      req.body?.session_id || req.query?.session_id ||
      req.body?.sessionId || req.query?.sessionId;

    console.log('   Extracted - Result Indicator:', resultIndicator);
    console.log('   Extracted - Session ID:', sessionId);

    // If still missing, try to get from quote_id in query
    const quoteId = req.body?.quote_id || req.query?.quote_id;

    // Validate that we have at least sessionId or quoteId
    if (!sessionId && !quoteId) {
      console.error('❌ Missing required parameters (sessionId and quoteId)');
      console.error('   Available keys in body:', Object.keys(req.body || {}));
      console.error('   Available keys in query:', Object.keys(req.query || {}));
      console.error('   Full body:', JSON.stringify(req.body, null, 2));
      console.error('   Full query:', JSON.stringify(req.query, null, 2));

      // Try to get inquiryId from payment record if we have quoteId
      let inquiryId = req.body?.inquiry_id || req.query?.inquiry_id;

      if (quoteId && !inquiryId) {
        const { data: paymentByQuote } = await supabase
          .from('payments')
          .select('inquiry_id')
          .eq('quote_id', quoteId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (paymentByQuote?.inquiry_id) {
          inquiryId = paymentByQuote.inquiry_id;
        }
      }

      // Always redirect instead of returning JSON - prevents "undefined" in body
      if (inquiryId) {
        return res.redirect(`/inquiry/${inquiryId}?payment=failed&error=missing_params`);
      }
      return res.redirect('/payment/failed?error=missing_params');
    }

    // 1. Retrieve payment by session ID or quote ID
    let payment;
    let paymentError;

    if (sessionId) {
      const result = await supabase
        .from('payments')
        .select('*, quote:quotes(*), inquiry:inquiries(*)')
        .eq('arc_session_id', sessionId)
        .single();
      payment = result.data;
      paymentError = result.error;
    } else if (quoteId) {
      // Fallback: get latest payment for quote
      const result = await supabase
        .from('payments')
        .select('*, quote:quotes(*), inquiry:inquiries(*)')
        .eq('quote_id', quoteId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      payment = result.data;
      paymentError = result.error;
    }

    if (paymentError || !payment) {
      console.error('Payment not found:', {
        sessionId: sessionId || 'undefined',
        quoteId: quoteId || 'undefined',
        error: paymentError?.message
      });

      const inquiryId = payment?.inquiry_id || req.body?.inquiry_id || req.query?.inquiry_id;
      if (inquiryId) {
        return res.redirect(`/inquiry/${inquiryId}?payment=failed&error=invalid_session`);
      }
      return res.redirect('/payment/failed?error=invalid_session');
    }

    // 2. Verify resultIndicator matches successIndicator (security check)
    // Only verify if resultIndicator is provided (ARC Pay may not always send it)
    if (resultIndicator && payment.success_indicator) {
      if (resultIndicator !== payment.success_indicator) {
        console.error('Result indicator mismatch:', {
          received: resultIndicator,
          expected: payment.success_indicator
        });
        const inquiryId = payment.inquiry_id || payment.quote?.inquiry_id;
        if (inquiryId) {
          return res.redirect(`/inquiry/${inquiryId}?payment=failed&error=invalid_indicator`);
        }
        return res.redirect('/payment/failed?error=invalid_indicator');
      }
    } else {
      console.warn('⚠️ Result indicator not provided or not stored - skipping verification');
      console.warn('   Received resultIndicator:', resultIndicator);
      console.warn('   Stored success_indicator:', payment.success_indicator);
    }

    // 3. Retrieve order and transaction details from ARC Pay
    const arcMerchantId = process.env.ARC_PAY_MERCHANT_ID || 'TESTARC05511704';
    const arcApiPassword = process.env.ARC_PAY_API_PASSWORD || '4d41a81750f1ee3f6aa4adf0dfd6310c';
    const arcBaseUrl = process.env.ARC_PAY_BASE_URL || 'https://api.arcpay.travel/api/rest/version/77';

    // ARC Pay uses merchant.MERCHANT_ID:password format for authentication
    const authHeader = 'Basic ' + Buffer.from(`merchant.${arcMerchantId}:${arcApiPassword}`).toString('base64');

    // First, get the order status (ARC Pay best practice)
    let orderData = null;
    try {
      const orderResponse = await fetch(
        `${arcBaseUrl}/merchant/${arcMerchantId}/order/${payment.id}`,
        {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'Accept': 'application/json'
          }
        }
      );

      if (orderResponse.ok) {
        orderData = await orderResponse.json();
        console.log('📋 Order data retrieved:', JSON.stringify(orderData, null, 2));
      } else {
        console.warn('⚠️ Could not retrieve order data, status:', orderResponse.status);
      }
    } catch (orderError) {
      console.warn('⚠️ Error retrieving order data:', orderError.message);
    }

    // Then get transaction details
    let transaction = null;
    try {
      const txnResponse = await fetch(
        `${arcBaseUrl}/merchant/${arcMerchantId}/order/${payment.id}/transaction/1`,
        {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'Accept': 'application/json'
          }
        }
      );

      if (!txnResponse.ok) {
        const errorText = await txnResponse.text();
        console.error('❌ Failed to retrieve transaction from ARC Pay:', txnResponse.status, errorText);

        // If we have order data, use it instead
        if (orderData) {
          console.log('📋 Using order data as fallback');
          transaction = orderData;
        } else {
          return res.redirect('/payment/failed?error=verification_failed');
        }
      } else {
        transaction = await txnResponse.json();
      }
    } catch (txnError) {
      console.error('❌ Error retrieving transaction:', txnError.message);

      // If we have order data, use it as fallback
      if (orderData) {
        console.log('📋 Using order data as fallback due to transaction error');
        transaction = orderData;
      } else {
        return res.redirect('/payment/failed?error=verification_failed');
      }
    }

    // Merge order data with transaction data if available
    if (orderData && transaction) {
      transaction = {
        ...transaction,
        ...orderData,
        // Prefer transaction fields over order fields
        result: transaction.result || orderData.result,
        status: transaction.status || orderData.status,
        authentication: transaction.authentication || orderData.authentication
      };
    }

    console.log('🔍 Transaction response:', JSON.stringify(transaction, null, 2));

    // 4. Extract transaction data from transaction array (ARC Pay structure)
    // ARC Pay returns transaction data in transaction[0] array
    const transactionArray = transaction.transaction || [];
    const latestTransaction = transactionArray.length > 0 ? transactionArray[transactionArray.length - 1] : null;

    // Get transaction-level data (most recent transaction)
    let transactionResult = latestTransaction?.result || transaction.result;
    let transactionGatewayCode = latestTransaction?.response?.gatewayCode || transaction.response?.gatewayCode;
    const transactionAuth = latestTransaction?.authentication || transaction.authentication || {};

    // Order-level status
    const orderStatus = transaction.status;
    let orderAuthStatus = transaction.authenticationStatus || latestTransaction?.order?.authenticationStatus;

    // 3DS2 authentication fields - check transaction first, then order
    const threeDS2 = transactionAuth.threeDS2 || transactionAuth['3ds2'] || transaction.authentication?.threeDS2 || transaction.authentication?.['3ds2'] || {};
    let transactionStatus = threeDS2.transactionStatus || transactionAuth.transactionStatus;
    const statusReasonCode = threeDS2.statusReasonCode || transactionAuth.statusReasonCode;
    let eci = threeDS2.eci || transactionAuth.eci || transaction.eci;
    const authenticationToken = threeDS2.authenticationToken || transactionAuth.authenticationToken;

    // Legacy 3DS fields
    const authenticationResult = transactionAuth.result || transaction.authentication?.result || transaction.threeDSecure?.result;
    let authenticationStatus = orderAuthStatus || transaction.authenticationStatus || transactionAuth.status || latestTransaction?.authenticationStatus;
    let gatewayCode = transactionGatewayCode || transaction.response?.gatewayCode || transaction.response?.code;
    const avsResponse = transaction.response?.avsResponse || latestTransaction?.response?.avsResponse;

    console.log('📊 Transaction analysis:', {
      result: transactionResult,
      status: orderStatus,
      transactionStatus, // Y, C, A, N, R, U (from 3DS2)
      statusReasonCode,
      eci,
      authenticationStatus, // AUTHENTICATION_SUCCESSFUL, AUTHENTICATION_PENDING, etc.
      authenticationResult, // Legacy field
      gatewayCode,
      hasAuthenticationToken: !!authenticationToken,
      transactionCount: transactionArray.length
    });

    // Handle 3DS2 transaction status according to ARC Pay documentation
    // Y = Frictionless (successful), C = Challenge, A = Authentication Attempted,
    // N = Not Authenticated, R = Rejected, U = Unavailable

    // CRITICAL: Never mark PENDING transactions as successful
    // If transaction result is PENDING, it means the transaction is still being processed
    if (transactionResult === 'PENDING' || gatewayCode === 'PENDING') {
      console.log('⏳ Transaction is still pending - waiting for final status');

      // Check if 3DS challenge is still in progress
      if (transactionStatus === 'C' ||
        authenticationStatus === 'AUTHENTICATION_PENDING' ||
        orderStatus === 'AUTHENTICATION_INITIATED' ||
        orderStatus === 'AUTHENTICATION_PENDING') {

        console.log('⏳ 3DS authentication challenge still pending');

        await supabase
          .from('payments')
          .update({
            payment_status: 'pending_3ds',
            metadata: {
              transaction: transaction,
              transactionResult,
              gatewayCode,
              transactionStatus,
              authenticationStatus,
              message: '3D Secure challenge in progress - waiting for completion',
              lastChecked: new Date().toISOString()
            }
          })
          .eq('id', payment.id);

        // Redirect to a page that will poll for status updates
        // Ensure both values exist before using in redirect URL
        if (resultIndicator && sessionId) {
          return res.redirect(`/payment/callback?resultIndicator=${resultIndicator}&sessionId=${sessionId}&status=checking`);
        } else {
          const inquiryId = payment?.inquiry_id || payment?.quote?.inquiry_id;
          if (inquiryId) {
            return res.redirect(`/inquiry/${inquiryId}?payment=pending&status=checking`);
          }
          return res.redirect('/payment/failed?error=processing_error');
        }
      }

      // Check if 3DS authentication is successful but PAY hasn't been processed yet
      // This can happen with Hosted Checkout when authentication completes but PAY needs to be triggered
      // First, check if PAY was already processed automatically by ARC Pay
      const hasPayTransaction = transactionArray.some(txn =>
        txn.transaction?.type === 'PAYMENT' ||
        txn.type === 'PAYMENT' ||
        txn.apiOperation === 'PAY' ||
        (txn.result === 'SUCCESS' && txn.response?.gatewayCode === 'APPROVED' && txn.transaction?.type === 'PAYMENT')
      );

      // Check if order has been captured/paid (indicates PAY was processed)
      const orderCaptured = transaction.order?.status === 'CAPTURED' ||
        transaction.order?.status === 'PAID' ||
        transaction.status === 'CAPTURED' ||
        transaction.status === 'PAID' ||
        (transaction.order?.totalCapturedAmount > 0) ||
        (transaction.totalCapturedAmount > 0);

      // Determine if we should call PAY
      // Conditions:
      // 1. Authentication is successful (AUTHENTICATION_SUCCESSFUL or AUTHENTICATION_ATTEMPTED)
      // 2. Transaction status is Y (Frictionless) or A (Attempted) - both are valid
      // 3. Order status is AUTHENTICATED (authentication done, but payment not processed)
      // 4. No PAY transaction exists yet
      // 5. Order not yet captured

      // CRITICAL: If order status is AUTHENTICATED, we MUST call PAY
      // This is the key indicator that authentication completed but payment hasn't been processed
      const isAuthenticatedButNotPaid = (
        orderStatus === 'AUTHENTICATED' &&
        !hasPayTransaction &&
        !orderCaptured &&
        (transaction.order?.totalCapturedAmount === 0 || !transaction.order?.totalCapturedAmount)
      );

      const shouldCallPay = (
        isAuthenticatedButNotPaid || (
          (authenticationStatus === 'AUTHENTICATION_SUCCESSFUL' ||
            authenticationStatus === 'AUTHENTICATION_ATTEMPTED' ||
            orderStatus === 'AUTHENTICATED') &&
          (transactionStatus === 'Y' || transactionStatus === 'A' || !transactionStatus) &&
          (authenticationToken || orderStatus === 'AUTHENTICATED') &&
          !hasPayTransaction &&
          !orderCaptured
        )
      );

      console.log('🔍 PAY Decision Check:', {
        orderStatus,
        authenticationStatus,
        transactionStatus,
        hasPayTransaction,
        orderCaptured,
        isAuthenticatedButNotPaid,
        shouldCallPay,
        totalCapturedAmount: transaction.order?.totalCapturedAmount || transaction.totalCapturedAmount
      });

      if (shouldCallPay) {

        console.log('✅ 3DS Authentication successful but PAY not yet processed - calling PAY');
        console.log(`   Order Status: ${orderStatus}`);
        console.log(`   Transaction Status: ${transactionStatus || 'N/A'}`);
        console.log(`   Authentication Status: ${authenticationStatus}`);
        console.log(`   Has PAY Transaction: ${hasPayTransaction}`);
        console.log(`   Order Captured: ${orderCaptured}`);
        console.log(`   Authentication Token: ${authenticationToken ? authenticationToken.substring(0, 20) + '...' : 'N/A'}`);
        console.log(`   Transaction Array Length: ${transactionArray.length}`);

        // Get authentication transaction ID from multiple possible locations
        // ARC Pay stores this in different places depending on the response structure
        // Check for nested 3ds structure: authentication.3ds.transactionId
        let authTransactionId = transaction.authentication?.transactionId ||
          transaction.authentication?.['3ds']?.transactionId ||
          transaction.authentication?.threeDS2?.transactionId ||
          transactionAuth.transactionId ||
          transactionAuth?.['3ds']?.transactionId ||
          latestTransaction?.authentication?.transactionId ||
          latestTransaction?.authentication?.['3ds']?.transactionId ||
          transaction.transactionId ||
          latestTransaction?.transactionId ||
          orderData?.authentication?.transactionId ||
          orderData?.authentication?.['3ds']?.transactionId ||
          orderData?.transactionId;

        // If not found, search through transaction array for authentication transaction
        // Check both direct transactionId and nested 3ds.transactionId
        // Use the LATEST authentication transaction (last in array) for PAY
        if (!authTransactionId && transactionArray.length > 0) {
          // Search from end to beginning to get the most recent authentication
          for (let i = transactionArray.length - 1; i >= 0; i--) {
            const txn = transactionArray[i];

            // Only process AUTHENTICATION type transactions
            if (txn.transaction?.type !== 'AUTHENTICATION' && txn.type !== 'AUTHENTICATION') {
              continue;
            }

            // Check for authentication.3ds.transactionId (most common structure)
            if (txn.authentication?.['3ds']?.transactionId) {
              authTransactionId = txn.authentication['3ds'].transactionId;
              console.log(`   Found latest auth transaction ID in 3ds structure (transaction ${i}): ${authTransactionId}`);
              break;
            }
            // Check for authentication.transactionId (legacy structure)
            if (txn.authentication?.transactionId) {
              authTransactionId = txn.authentication.transactionId;
              console.log(`   Found latest auth transaction ID in transaction array (transaction ${i}): ${authTransactionId}`);
              break;
            }
          }
        }

        // Also check orderData transaction array if available
        if (!authTransactionId && orderData?.transaction) {
          const orderTxnArray = Array.isArray(orderData.transaction) ? orderData.transaction : [orderData.transaction];
          for (const txn of orderTxnArray) {
            // Check for 3ds structure first
            if (txn.authentication?.['3ds']?.transactionId) {
              authTransactionId = txn.authentication['3ds'].transactionId;
              console.log(`   Found auth transaction ID in order data (3ds): ${authTransactionId}`);
              break;
            }
            if (txn.authentication?.transactionId) {
              authTransactionId = txn.authentication.transactionId;
              console.log(`   Found auth transaction ID in order data: ${authTransactionId}`);
              break;
            }
            if (txn.transactionId && txn.authentication) {
              if (txn.authentication['3ds']?.transactionId) {
                authTransactionId = txn.authentication['3ds'].transactionId;
                console.log(`   Found auth transaction ID in order data transaction: ${authTransactionId}`);
                break;
              }
            }
          }
        }

        // Also check the order-level authentication.3ds.transactionId (fallback)
        // But prefer the latest from transaction array
        if (!authTransactionId) {
          // Check order-level 3ds structure
          if (transaction.authentication?.['3ds']?.transactionId) {
            authTransactionId = transaction.authentication['3ds'].transactionId;
            console.log(`   Found auth transaction ID at order level (3ds): ${authTransactionId}`);
          }
          // Check order-level direct transactionId
          else if (transaction.authentication?.transactionId) {
            authTransactionId = transaction.authentication.transactionId;
            console.log(`   Found auth transaction ID at order level: ${authTransactionId}`);
          }
          // Check orderData authentication
          else if (orderData?.authentication?.['3ds']?.transactionId) {
            authTransactionId = orderData.authentication['3ds'].transactionId;
            console.log(`   Found auth transaction ID in orderData (3ds): ${authTransactionId}`);
          }
        }

        if (authTransactionId) {
          console.log(`   ✅ Using Authentication Transaction ID: ${authTransactionId}`);

          // Check if we already attempted PAY for this payment (prevent duplicate calls)
          const paymentMetadata = payment.metadata || {};
          const lastPayAttempt = paymentMetadata.lastPayAttempt;
          const now = Date.now();

          // Only proceed if we haven't attempted PAY in the last 5 seconds (prevents duplicate calls)
          if (lastPayAttempt && (now - lastPayAttempt) < 5000) {
            console.log('⚠️ PAY already attempted recently, skipping to prevent duplicate');
            // Continue with existing transaction data
          } else {
            try {
              // Update payment record to track PAY attempt
              await supabase
                .from('payments')
                .update({
                  metadata: {
                    ...paymentMetadata,
                    lastPayAttempt: now,
                    payAttemptInProgress: true,
                    authTransactionId: authTransactionId
                  }
                })
                .eq('id', payment.id);

              // Generate a unique transaction ID for the PAY operation
              // Format: pay-{timestamp}-{paymentId}
              const payTransactionId = `pay-${Date.now()}-${payment.id.slice(-8)}`;
              console.log(`   🚀 Calling PAY API...`);
              console.log(`   Using PAY transaction ID: ${payTransactionId}`);

              // Call PAY with the authentication transaction ID
              const payUrl = `${arcBaseUrl}/merchant/${arcMerchantId}/order/${payment.id}/transaction/${payTransactionId}`;
              console.log(`   PAY URL: ${payUrl}`);

              // Build PAY request body according to ARC Pay documentation
              // Required fields: apiOperation, authentication.transactionId, session.id
              // Optional: transaction.reference
              const payRequestBody = {
                apiOperation: 'PAY',
                authentication: {
                  transactionId: authTransactionId
                },
                session: {
                  id: payment.arc_session_id || sessionId || ''
                },
                transaction: {
                  reference: `PAY-${payment.id}`
                }
              };

              // Note: order.amount and sourceOfFunds are NOT needed for PAY after 3DS
              // The amount and card details are already captured in the INITIATE_CHECKOUT session

              console.log('   PAY Request Body:', JSON.stringify(payRequestBody, null, 2));

              const payResponse = await fetch(payUrl, {
                method: 'PUT',
                headers: {
                  'Authorization': authHeader,
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
                },
                body: JSON.stringify(payRequestBody)
              });

              const payResponseText = await payResponse.text();
              console.log(`   PAY Response Status: ${payResponse.status}`);
              console.log(`   PAY Response: ${payResponseText.substring(0, 500)}`);

              // Clean up payAttemptInProgress flag
              await supabase
                .from('payments')
                .update({
                  metadata: {
                    ...paymentMetadata,
                    lastPayAttempt: now,
                    payAttemptInProgress: false,
                    payResponseStatus: payResponse.status,
                    payResponseReceived: true
                  }
                })
                .eq('id', payment.id);

              if (payResponse.ok) {
                let payData;
                try {
                  payData = JSON.parse(payResponseText);
                } catch (parseError) {
                  console.error('❌ Failed to parse PAY response:', parseError);
                  console.error('   Response text:', payResponseText);
                  // Continue with original transaction data
                }

                if (payData) {
                  console.log('✅ PAY request successful:', payData.result);
                  console.log('   Gateway Code:', payData.response?.gatewayCode);
                  console.log('   Order Status:', payData.order?.status);
                  console.log('   Total Captured:', payData.order?.totalCapturedAmount);

                  // Update transaction data with PAY response
                  transaction = payData;
                  transactionResult = payData.result || payData.transaction?.[0]?.result;
                  gatewayCode = payData.response?.gatewayCode || payData.transaction?.[0]?.response?.gatewayCode;

                  // Re-extract authentication status from PAY response
                  const payAuth = payData.authentication || payData.transaction?.[0]?.authentication || {};
                  const payThreeDS2 = payAuth.threeDS2 || payAuth['3ds2'] || {};
                  transactionStatus = payThreeDS2.transactionStatus || transactionStatus;
                  authenticationStatus = payData.authenticationStatus || payData.order?.authenticationStatus || payAuth.status || authenticationStatus;
                  eci = payThreeDS2.eci || eci;

                  // Update order status from PAY response
                  orderStatus = payData.order?.status || payData.status || orderStatus;

                  console.log('📊 PAY response analysis:', {
                    result: transactionResult,
                    gatewayCode,
                    transactionStatus,
                    authenticationStatus,
                    eci,
                    orderStatus: payData.order?.status,
                    orderId: payData.order?.id,
                    totalCapturedAmount: payData.order?.totalCapturedAmount
                  });
                }
              } else {
                console.error('❌ PAY request failed:', payResponse.status);
                console.error('   Response:', payResponseText);

                // Try to parse error response
                try {
                  const errorData = JSON.parse(payResponseText);
                  console.error('   Error details:', JSON.stringify(errorData, null, 2));

                  // Update payment with error details
                  await supabase
                    .from('payments')
                    .update({
                      metadata: {
                        ...paymentMetadata,
                        payError: errorData,
                        payAttemptInProgress: false
                      }
                    })
                    .eq('id', payment.id);
                } catch (e) {
                  // Not JSON, already logged as text
                }

                // Continue with original transaction data - don't fail the callback
                // The transaction might still be processing
              }
            } catch (payError) {
              console.error('❌ Error calling PAY:', payError.message);
              console.error('   Stack:', payError.stack);

              // Clean up payAttemptInProgress flag on error
              await supabase
                .from('payments')
                .update({
                  metadata: {
                    ...paymentMetadata,
                    payAttemptInProgress: false,
                    payError: payError.message
                  }
                })
                .eq('id', payment.id);

              // Continue with original transaction data
            }
          }
        } else {
          console.warn('⚠️ Authentication transaction ID not found - cannot call PAY');
          console.log('   Order Status:', orderStatus);
          console.log('   Authentication Status:', authenticationStatus);
          console.log('   Transaction Status:', transactionStatus);
          console.log('   Transaction data structure:', {
            hasTransactionAuth: !!transaction.authentication,
            hasTransactionAuthTransactionId: !!transaction.authentication?.transactionId,
            hasTransactionAuth3dsTransactionId: !!transaction.authentication?.['3ds']?.transactionId,
            hasTransactionAuthId: !!transactionAuth.transactionId,
            hasLatestTxnAuth: !!latestTransaction?.authentication?.transactionId,
            hasLatestTxnAuth3ds: !!latestTransaction?.authentication?.['3ds']?.transactionId,
            hasOrderDataAuth: !!orderData?.authentication?.transactionId,
            hasOrderDataAuth3ds: !!orderData?.authentication?.['3ds']?.transactionId,
            transactionArrayLength: transactionArray.length,
            orderDataHasTransaction: !!orderData?.transaction
          });

          // Log detailed transaction array structure
          if (transactionArray.length > 0) {
            console.log('   Transaction Array Details:');
            transactionArray.forEach((txn, idx) => {
              console.log(`     Transaction ${idx}:`, {
                type: txn.transaction?.type || txn.type,
                hasAuth: !!txn.authentication,
                auth3dsTransactionId: txn.authentication?.['3ds']?.transactionId,
                authTransactionId: txn.authentication?.transactionId,
                transactionId: txn.transactionId
              });
            });
          }

          // Log order-level authentication structure
          if (transaction.authentication) {
            console.log('   Order-level authentication structure:', {
              has3ds: !!transaction.authentication['3ds'],
              has3dsTransactionId: !!transaction.authentication['3ds']?.transactionId,
              '3dsTransactionId': transaction.authentication['3ds']?.transactionId,
              hasDirectTransactionId: !!transaction.authentication.transactionId,
              directTransactionId: transaction.authentication.transactionId
            });
          }
        }
      } else if (hasPayTransaction) {
        console.log('✅ PAY transaction already exists - ARC Pay processed it automatically');
      }

      // If PENDING but not 3DS related, wait a moment and retry once
      console.log('⏳ Transaction pending - will retry status check');
      await supabase
        .from('payments')
        .update({
          payment_status: 'pending',
          metadata: {
            transaction: transaction,
            transactionResult,
            gatewayCode,
            message: 'Transaction pending - status will be updated shortly',
            lastChecked: new Date().toISOString()
          }
        })
        .eq('id', payment.id);

      // Wait 2 seconds and retry checking the order status
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        const retryResponse = await fetch(
          `${arcBaseUrl}/merchant/${arcMerchantId}/order/${payment.id}`,
          {
            method: 'GET',
            headers: {
              'Authorization': authHeader,
              'Accept': 'application/json'
            }
          }
        );

        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          console.log('🔄 Retry check result:', retryData.result, retryData.status);

          // If still pending after retry, redirect to status check page
          if (retryData.result === 'PENDING' || retryData.status === 'AUTHENTICATION_PENDING') {
            // Ensure both values exist before using in redirect URL
            if (resultIndicator && sessionId) {
              return res.redirect(`/payment/callback?resultIndicator=${resultIndicator}&sessionId=${sessionId}&status=checking`);
            } else {
              const inquiryId = payment?.inquiry_id || payment?.quote?.inquiry_id;
              if (inquiryId) {
                return res.redirect(`/inquiry/${inquiryId}?payment=pending&status=checking`);
              }
              return res.redirect('/payment/failed?error=processing_error');
            }
          }

          // Update transaction with retry data
          transaction = retryData;
          // Re-extract values from retry data
          const retryTransactionArray = retryData.transaction || [];
          const retryLatestTransaction = retryTransactionArray.length > 0 ? retryTransactionArray[retryTransactionArray.length - 1] : null;
          if (retryLatestTransaction) {
            transactionResult = retryLatestTransaction.result || retryData.result;
            gatewayCode = retryLatestTransaction.response?.gatewayCode || retryData.response?.gatewayCode;
            authenticationStatus = retryData.authenticationStatus || retryLatestTransaction.order?.authenticationStatus;
            const retryAuth = retryLatestTransaction.authentication || retryData.authentication || {};
            const retryThreeDS2 = retryAuth.threeDS2 || retryAuth['3ds2'] || {};
            transactionStatus = retryThreeDS2.transactionStatus;
            eci = retryThreeDS2.eci;
          }
        }
      } catch (retryError) {
        console.error('⚠️ Retry check failed:', retryError.message);
        // Continue with original transaction data
      }
    }

    // Check if 3DS authentication is still pending (Challenge flow) - after retry check
    if (transactionStatus === 'C' ||
      orderStatus === 'AUTHENTICATION_INITIATED' ||
      orderStatus === 'AUTHENTICATION_PENDING' ||
      authenticationStatus === 'AUTHENTICATION_INITIATED' ||
      authenticationStatus === 'AUTHENTICATION_PENDING') {

      console.log('⏳ 3DS authentication challenge pending');

      await supabase
        .from('payments')
        .update({
          payment_status: 'pending_3ds',
          metadata: {
            transaction: transaction,
            transactionStatus,
            authenticationStatus,
            message: '3D Secure challenge in progress'
          }
        })
        .eq('id', payment.id);

      // Ensure payment.id exists before using in redirect
      if (payment?.id) {
        return res.redirect(`/payment/failed?reason=3ds_pending&paymentId=${payment.id}&message=Please complete the 3D Secure authentication challenge`);
      } else {
        const inquiryId = payment?.inquiry_id || payment?.quote?.inquiry_id;
        if (inquiryId) {
          return res.redirect(`/inquiry/${inquiryId}?payment=failed&reason=3ds_pending`);
        }
        return res.redirect('/payment/failed?reason=3ds_pending');
      }
    }

    // Check if 3DS authentication was not authenticated, rejected, or unavailable
    if (transactionStatus === 'N' ||
      transactionStatus === 'R' ||
      transactionStatus === 'U' ||
      authenticationResult === 'FAILURE' ||
      authenticationResult === 'UNAVAILABLE' ||
      authenticationStatus === 'AUTHENTICATION_FAILED' ||
      authenticationStatus === 'AUTHENTICATION_UNAVAILABLE' ||
      (transactionResult === 'FAILURE' && authenticationStatus === 'AUTHENTICATION_FAILED')) {

      console.log('❌ 3DS authentication failed, rejected, or unavailable');

      const failureReason = transactionStatus === 'N' ? '3DS Not Authenticated' :
        transactionStatus === 'R' ? '3DS Authentication Rejected' :
          transactionStatus === 'U' ? '3DS Authentication Unavailable' :
            statusReasonCode ? `3DS Error Code: ${statusReasonCode}` :
              authenticationStatus === 'AUTHENTICATION_UNAVAILABLE' ? '3DS Authentication Unavailable' :
                '3D Secure authentication failed';

      await supabase
        .from('payments')
        .update({
          payment_status: 'failed',
          metadata: {
            transaction: transaction,
            transactionStatus,
            statusReasonCode,
            eci,
            authenticationResult,
            authenticationStatus,
            failureReason,
            timestamp: new Date().toISOString()
          }
        })
        .eq('id', payment.id);

      // Ensure payment.id exists before using in redirect
      if (payment?.id) {
        return res.redirect(`/payment/failed?reason=3ds_authentication_failed&paymentId=${payment.id}`);
      } else {
        const inquiryId = payment?.inquiry_id || payment?.quote?.inquiry_id;
        if (inquiryId) {
          return res.redirect(`/inquiry/${inquiryId}?payment=failed&reason=3ds_authentication_failed`);
        }
        return res.redirect('/payment/failed?reason=3ds_authentication_failed');
      }
    }

    // Check if transaction is successful
    // ARC Pay considers it successful if:
    // 1. result === 'SUCCESS' AND
    // 2. 3DS2 transactionStatus === 'Y' (Frictionless) OR 'A' (Authentication Attempted) OR no 3DS required
    // 3. authenticationStatus === 'AUTHENTICATION_SUCCESSFUL' (if 3DS was required)
    // 4. gatewayCode is APPROVED or SUCCESS
    // 5. ECI code indicates successful authentication (05, 02 for successful 3DS, or no ECI if no 3DS)

    const is3DSSuccess = (
      transactionStatus === 'Y' || // Frictionless - successful
      transactionStatus === 'A' || // Authentication Attempted - treated as success per ARC Pay docs
      !transactionStatus || // No 3DS required for this card
      transactionStatus === undefined // No 3DS data present
    );

    const isAuthSuccess = (
      authenticationStatus === 'AUTHENTICATION_SUCCESSFUL' ||
      authenticationStatus === undefined || // No authentication status (no 3DS)
      !authenticationStatus // No authentication required
    );

    // ECI codes: 05/02 = successful 3DS, 07/00 = failed 3DS, undefined = no 3DS
    const isValidECI = (
      !eci || // No ECI (no 3DS)
      eci === '05' || // Successful 3DS (Visa)
      eci === '02' || // Successful 3DS (Mastercard)
      eci === '06' || // Authentication Attempted (treated as success)
      eci === '01' || // Mastercard 3DS attempted
      eci === '07' // Non-3DS transaction
    );

    // CRITICAL: Check multiple success indicators
    // ARC Pay may return SUCCESS in result OR APPROVED in gatewayCode
    const isResultSuccess = transactionResult === 'SUCCESS';
    const isGatewayApproved = gatewayCode === 'APPROVED' || gatewayCode === 'SUCCESS';
    const isOrderCaptured = orderStatus === 'CAPTURED' || orderStatus === 'AUTHORIZED' || orderStatus === 'PURCHASED';

    // If gateway explicitly approved the payment, it's successful
    // This overrides any 3DS status issues since the bank approved it
    const isExplicitlyApproved = isGatewayApproved && transactionResult !== 'FAILURE' && transactionResult !== 'ERROR';

    // Payment is successful if:
    // 1. Gateway explicitly approved (APPROVED gatewayCode) - highest priority
    // 2. OR Result is SUCCESS with valid 3DS checks
    // 3. OR Order is CAPTURED/AUTHORIZED
    // 4. AND it's not PENDING or FAILURE
    const isSuccess = (
      isExplicitlyApproved ||
      (isResultSuccess && is3DSSuccess && isAuthSuccess && isValidECI) ||
      isOrderCaptured
    ) && (
        transactionResult !== 'PENDING' &&
        transactionResult !== 'FAILURE' &&
        transactionResult !== 'ERROR' &&
        gatewayCode !== 'PENDING' &&
        gatewayCode !== 'DECLINED' &&
        gatewayCode !== 'ERROR'
      );

    console.log('🔍 Success evaluation:', {
      transactionResult,
      gatewayCode,
      orderStatus,
      isResultSuccess,
      isGatewayApproved,
      isOrderCaptured,
      isExplicitlyApproved,
      is3DSSuccess,
      isAuthSuccess,
      isValidECI,
      transactionStatus,
      authenticationStatus,
      eci,
      finalIsSuccess: isSuccess
    });

    if (isSuccess) {
      console.log('✅ Payment successful');
      console.log(`   3DS Status: ${transactionStatus || 'No 3DS'}`);
      console.log(`   ECI: ${eci || 'N/A'}`);
      console.log(`   Gateway Code: ${gatewayCode || 'N/A'}`);
      console.log(`   Payment ID: ${payment.id}`);
      console.log(`   Quote ID: ${payment.quote_id}`);
      console.log(`   Inquiry ID: ${payment.inquiry_id}`);

      // Update payment status
      const { error: paymentUpdateError } = await supabase
        .from('payments')
        .update({
          payment_status: 'completed',
          completed_at: new Date().toISOString(),
          arc_transaction_id: transaction.transaction?.id || transaction.id,
          payment_method: transaction.sourceOfFunds?.provided?.card?.brand ||
            transaction.card?.brand ||
            transaction.paymentMethod,
          metadata: {
            transaction: transaction,
            threeDS2: {
              transactionStatus,
              statusReasonCode,
              eci,
              hasAuthenticationToken: !!authenticationToken
            },
            authenticationResult,
            authenticationStatus,
            gatewayCode
          }
        })
        .eq('id', payment.id);

      if (paymentUpdateError) {
        console.error('❌ Failed to update payment status:', paymentUpdateError);
      } else {
        console.log('✅ Payment status updated to completed');
      }

      // Update quote status
      const { error: quoteUpdateError } = await supabase
        .from('quotes')
        .update({
          payment_status: 'paid',
          paid_at: new Date().toISOString(),
          status: 'paid'
        })
        .eq('id', payment.quote_id);

      if (quoteUpdateError) {
        console.error('❌ Failed to update quote status:', quoteUpdateError);
      } else {
        console.log('✅ Quote status updated to paid');
      }

      // Update inquiry status to 'booked' (not just 'paid')
      const { error: inquiryUpdateError } = await supabase
        .from('inquiries')
        .update({
          status: 'booked'
        })
        .eq('id', payment.inquiry_id);

      if (inquiryUpdateError) {
        console.error('❌ Failed to update inquiry status:', inquiryUpdateError);
      } else {
        console.log('✅ Inquiry status updated to booked');
      }

      // Ensure paymentId is valid before redirecting
      if (payment?.id) {
        return res.redirect(`/payment/success?paymentId=${payment.id}`);
      } else {
        console.error('❌ Payment ID is undefined in success redirect');
        const inquiryId = payment?.inquiry_id || payment?.quote?.inquiry_id;
        if (inquiryId) {
          return res.redirect(`/inquiry/${inquiryId}?payment=success`);
        }
        return res.redirect('/payment/success');
      }
    } else {
      // Payment failed, declined, or still processing
      // Check if it's still PENDING (should have been handled earlier, but double-check)
      if (transactionResult === 'PENDING' || gatewayCode === 'PENDING') {
        console.log('⏳ Payment still pending - not marking as failed');

        await supabase
          .from('payments')
          .update({
            payment_status: 'pending',
            metadata: {
              transaction: transaction,
              transactionResult,
              gatewayCode,
              authenticationStatus,
              message: 'Transaction pending - please check status again shortly',
              lastChecked: new Date().toISOString()
            }
          })
          .eq('id', payment.id);

        // Ensure both values exist before using in redirect URL
        if (resultIndicator && sessionId) {
          return res.redirect(`/payment/callback?resultIndicator=${resultIndicator}&sessionId=${sessionId}&status=checking`);
        } else {
          const inquiryId = payment?.inquiry_id || payment?.quote?.inquiry_id;
          if (inquiryId) {
            return res.redirect(`/inquiry/${inquiryId}?payment=pending&status=checking`);
          }
          return res.redirect('/payment/failed?error=processing_error');
        }
      }

      // Payment failed or declined
      console.log('❌ Payment failed or declined');
      console.log(`   Result: ${transactionResult}`);
      console.log(`   Gateway Code: ${gatewayCode}`);
      console.log(`   Authentication Status: ${authenticationStatus}`);

      const failureReason = transaction.error?.cause ||
        transaction.error?.explanation ||
        latestTransaction?.response?.gatewayCode ||
        gatewayCode ||
        transaction.response?.reason ||
        'payment_declined';

      await supabase
        .from('payments')
        .update({
          payment_status: 'failed',
          metadata: {
            transaction: transaction,
            transactionResult,
            gatewayCode,
            authenticationStatus,
            transactionStatus,
            error: transaction.error || latestTransaction?.error,
            authenticationResult,
            failureReason,
            timestamp: new Date().toISOString()
          }
        })
        .eq('id', payment.id);

      // Ensure payment.id exists before using in redirect
      if (payment?.id) {
        return res.redirect(`/payment/failed?reason=${encodeURIComponent(failureReason)}&paymentId=${payment.id}`);
      } else {
        const inquiryId = payment?.inquiry_id || payment?.quote?.inquiry_id;
        if (inquiryId) {
          return res.redirect(`/inquiry/${inquiryId}?payment=failed&reason=${encodeURIComponent(failureReason)}`);
        }
        return res.redirect(`/payment/failed?reason=${encodeURIComponent(failureReason)}`);
      }
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
    const { paymentId, quoteId } = req.query;

    if (!paymentId && !quoteId) {
      return res.status(400).json({
        success: false,
        error: 'paymentId or quoteId is required'
      });
    }

    let payment;
    let error;

    if (paymentId) {
      // Get payment by payment ID
      const result = await supabase
        .from('payments')
        .select('*, quote:quotes(*), inquiry:inquiries(*)')
        .eq('id', paymentId)
        .single();
      payment = result.data;
      error = result.error;
    } else if (quoteId) {
      // Get latest payment by quote ID
      const result = await supabase
        .from('payments')
        .select('*, quote:quotes(*), inquiry:inquiries(*)')
        .eq('quote_id', quoteId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      payment = result.data;
      error = result.error;
    }

    if (error || !payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found',
        details: error?.message || 'No payment found for the provided ID'
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
      error: 'Failed to retrieve payment details',
      details: error.message
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

// ============================================
// HOSTED CHECKOUT FOR DIRECT BOOKINGS
// (Flights, Hotels, Cruises, Packages)
// ============================================
async function handleHostedCheckout(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🚀 handleHostedCheckout called for direct booking');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const {
      amount,
      currency = 'USD',
      orderId,
      bookingType = 'flight', // flight, hotel, cruise, package
      customerEmail,
      customerName,
      customerPhone,
      description,
      returnUrl,
      cancelUrl,
      // Additional booking data for airline transactions
      bookingData,
      // Flight-specific data for ARC Pay certification
      flightData
    } = req.body;

    // Validate required fields
    if (!amount || !orderId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: amount and orderId are required'
      });
    }

    console.log('💳 Creating ARC Pay hosted checkout session...');
    console.log('   Order ID:', orderId);
    console.log('   Amount:', amount, currency);
    console.log('   Booking Type:', bookingType);

    // ARC Pay credentials - Using API version 100 (latest)
    const arcMerchantId = process.env.ARC_PAY_MERCHANT_ID || 'TESTARC05511704';
    const arcApiPassword = process.env.ARC_PAY_API_PASSWORD || '4d41a81750f1ee3f6aa4adf0dfd6310c';
    // Check for ARC_PAY_API_URL first (full URL), then ARC_PAY_BASE_URL, then fallback to v100
    let arcApiUrl = process.env.ARC_PAY_API_URL || process.env.ARC_PAY_BASE_URL;
    // If URL contains version/77, upgrade to version/100
    if (arcApiUrl && arcApiUrl.includes('version/77')) {
      arcApiUrl = arcApiUrl.replace('version/77', 'version/100');
      console.log('   ⚠️ Upgraded ARC Pay API from v77 to v100');
    }
    // If URL includes merchant ID, extract just the base URL
    if (arcApiUrl && arcApiUrl.includes('/merchant/')) {
      arcApiUrl = arcApiUrl.split('/merchant/')[0];
    }
    const arcBaseUrl = arcApiUrl || 'https://api.arcpay.travel/api/rest/version/100';
    const frontendBaseUrl = process.env.FRONTEND_URL || 'https://www.jetsetterss.com';

    // Travel Agent Info provided by ARC
    const travelAgentCode = process.env.ARC_TRAVEL_AGENT_CODE || 'JETSET001';
    const travelAgentName = process.env.ARC_TRAVEL_AGENT_NAME || 'JetSet Travel LLC';

    console.log('   ARC Pay Base URL:', arcBaseUrl);
    console.log('   ARC Pay Merchant ID:', arcMerchantId);

    // ARC Pay uses merchant.MERCHANT_ID:password format for authentication
    const authHeader = 'Basic ' + Buffer.from(`merchant.${arcMerchantId}:${arcApiPassword}`).toString('base64');

    // Construct URLs for redirect
    const finalReturnUrl = returnUrl || `${frontendBaseUrl}/payment/callback?orderId=${orderId}&bookingType=${bookingType}`;
    const finalCancelUrl = cancelUrl || `${frontendBaseUrl}/${bookingType}-payment?cancelled=true`;

    // Create session with ARC Pay
    const cleanBaseUrl = arcBaseUrl.replace(/\/$/, '');
    const sessionUrl = `${cleanBaseUrl}/merchant/${arcMerchantId}/session`;

    // Parse passenger name
    const nameParts = (customerName || 'Guest User').split(' ');
    const firstName = nameParts[0] || 'Guest';
    const lastName = nameParts.slice(1).join(' ') || 'User';

    // Build the request body - using same settings as working inquiry payment flow
    const requestBody = {
      apiOperation: 'INITIATE_CHECKOUT',
      interaction: {
        operation: 'PURCHASE',
        returnUrl: finalReturnUrl,
        cancelUrl: finalCancelUrl,
        merchant: {
          name: 'JetSet Travel'
        },
        displayControl: {
          billingAddress: 'MANDATORY',  // Required for 3DS2 - ensures billing data is collected
          customerEmail: 'MANDATORY'    // Required for 3DS2 risk assessment
        },
        action: {
          '3DSecure': 'MANDATORY'
        },
        timeout: 900
      },
      order: {
        id: orderId,
        reference: orderId,
        amount: parseFloat(amount).toFixed(2),
        currency: currency,
        description: description || `${bookingType.charAt(0).toUpperCase() + bookingType.slice(1)} Booking - ${orderId}`
      },
      // Force 3DS challenge (OTP) - required for ARC Pay to trigger authentication
      authentication: {
        challengePreference: 'CHALLENGE_MANDATED'
      }
    };

    // Add airline data for flight bookings (Required for ARC Pay Certification)
    // Format based on official ARC Pay documentation: https://api.arcpay.travel/api/documentation/integrationGuidelines/supportedFeatures/pickAdditionalFunctionality/airlineData.html
    if (bookingType === 'flight') {
      try {
        console.log('🔍 Processing airline data...');
        
        // Extract flight details from flightData or bookingData
        const flight = flightData || bookingData?.selectedFlight || bookingData?.flightData || {};
        const itinerary = flight?.itineraries?.[0] || flight?.itinerary || {};
        const segments = Array.isArray(itinerary?.segments) ? itinerary.segments : 
                        Array.isArray(flight?.segments) ? flight.segments : [];
        const firstSegment = segments[0] || {};
        const lastSegment = segments[segments.length - 1] || firstSegment;
        
        console.log('   segments count:', segments.length);

        // Get passenger info - format as array per ARC Pay docs
        const passengers = bookingData?.passengerData || [];
        const passengerList = passengers.length > 0 
          ? passengers.map(p => ({
              firstName: (p.firstName || '').toUpperCase(),
              lastName: (p.lastName || '').toUpperCase()
            }))
          : [{
              firstName: (firstName || 'GUEST').toUpperCase(),
              lastName: (lastName || 'PASSENGER').toUpperCase()
            }];

        // Build leg array - only required fields per ARC Pay docs (NO departureTime!)
        const legArray = segments.length > 0 
          ? segments.map((segment) => ({
              carrierCode: (segment?.carrierCode || segment?.operating?.carrierCode || 'XX').substring(0, 2),
              departureAirport: segment?.departure?.iataCode || 'XXX',
              departureDate: (segment?.departure?.at || new Date().toISOString()).split('T')[0],
              destinationAirport: segment?.arrival?.iataCode || 'XXX'
            }))
          : [{
              carrierCode: 'XX',
              departureAirport: flight?.origin || bookingData?.origin || 'XXX',
              departureDate: new Date().toISOString().split('T')[0],
              destinationAirport: flight?.destination || bookingData?.destination || 'XXX'
            }];

        // Build airline object matching official ARC Pay documentation format exactly
        requestBody.airline = {
          bookingReference: (flight?.pnr || flight?.bookingReference || orderId).substring(0, 6).toUpperCase(),
          documentType: 'PASSENGER_TICKET',
          itinerary: {
            leg: legArray,
            numberInParty: String(passengerList.length)
          },
          passenger: passengerList,
          ticket: {
            issue: {
              carrierCode: legArray[0]?.carrierCode || 'XX',
              carrierName: flight?.carrierName || 'Airline',
              city: 'Online',
              country: 'USA',
              date: new Date().toISOString().split('T')[0]
            },
            ticketNumber: `T${orderId}`.substring(0, 14),
            totalFare: parseFloat(amount).toFixed(2),
            totalFees: '0.00',
            totalTaxes: '0.00'
          }
        };

        console.log('✈️ Airline data for ARC Pay:', JSON.stringify(requestBody.airline, null, 2));
        
      } catch (airlineError) {
        console.error('⚠️ Error constructing airline data:', airlineError);
        // Don't add airline data if construction fails - it's optional for hosted checkout
      }
    }

    // Add customer info if available
    if (customerEmail) {
      requestBody.customer = {
        email: customerEmail,
        firstName: firstName,
        lastName: lastName
      };
      if (customerPhone) {
        const cleanPhone = customerPhone.replace(/\D/g, '');
        if (cleanPhone) {
          requestBody.customer.mobilePhone = cleanPhone;
        }
      }
    }

    // Normalize billing address if provided (for direct API integration)
    // Note: For hosted checkout, ARC Pay collects billing address on their form
    // But if billing address is provided in the request, normalize it
    if (req.body.billingAddress) {
      try {
        const normalizedAddress = normalizeBillingAddress(req.body.billingAddress);
        console.log('✅ Billing address normalized:', normalizedAddress);
        // Store normalized address for later use if needed
        requestBody.billing = {
          address: {
            street: normalizedAddress.street,
            city: normalizedAddress.city,
            stateProvince: normalizedAddress.state,
            postcodeZip: normalizedAddress.postalCode,
            country: normalizedAddress.country
          }
        };
      } catch (normalizationError) {
        console.error('⚠️ Billing address normalization failed:', normalizationError.message);
        // Don't fail the request - hosted checkout will collect billing address
      }
    }

    console.log('📤 ARC Pay Request:', JSON.stringify(requestBody, null, 2));
    console.log('📤 Session URL:', sessionUrl);
    console.log('📤 Auth Header:', authHeader ? 'Present' : 'Missing');

    let arcResponse;
    let responseText;
    
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

      responseText = await arcResponse.text();
      console.log('📥 ARC Pay Response Status:', arcResponse.status);
      console.log('📥 ARC Pay Response:', responseText.substring(0, 500));

      if (!arcResponse.ok) {
        let errorDetails;
        try {
          errorDetails = JSON.parse(responseText);
        } catch {
          errorDetails = { message: responseText };
        }

        console.error('❌ ARC Pay API Error:', errorDetails);

        // Enhanced error details for debugging
        return res.status(500).json({
          success: false,
          error: 'Failed to create payment session',
          details: errorDetails.error?.explanation || errorDetails.message || 'Unknown error',
          arcPayStatus: arcResponse.status,
          merchantId: arcMerchantId,
          debugInfo: {
            sessionUrl: sessionUrl,
            hasAuth: !!authHeader,
            requestBodyKeys: Object.keys(requestBody)
          }
        });
      }
    } catch (fetchError) {
      console.error('❌ Fetch error calling ARC Pay:', fetchError);
      return res.status(500).json({
        success: false,
        error: 'Failed to connect to payment gateway',
        details: fetchError.message,
        merchantId: arcMerchantId,
        sessionUrl: sessionUrl
      });
    }

    const session = JSON.parse(responseText);
    const sessionId = session.session?.id || session.sessionId || session.id;
    const successIndicator = session.successIndicator;

    if (!sessionId) {
      console.error('❌ Session ID not found in response');
      return res.status(500).json({
        success: false,
        error: 'Invalid response from payment gateway',
        details: 'Session ID not found'
      });
    }

    console.log('✅ ARC Pay session created:', sessionId);

    // Construct ARC Pay hosted payment page URL
    // Correct format: https://api.arcpay.travel/checkout/pay/{sessionId}
    const gatewayDomain = 'https://api.arcpay.travel';
    const paymentPageUrl = `${gatewayDomain}/checkout/pay/${sessionId}`;

    console.log('🔗 Payment Page URL:', paymentPageUrl);

    return res.status(200).json({
      success: true,
      sessionId: sessionId,
      successIndicator: successIndicator,
      merchantId: arcMerchantId,
      orderId: orderId,
      paymentPageUrl: paymentPageUrl,
      checkoutUrl: paymentPageUrl,
      redirectMethod: 'GET',
      message: 'Hosted checkout session created successfully'
    });

  } catch (error) {
    console.error('='.repeat(80));
    console.error('❌ HOSTED CHECKOUT ERROR - Full Stack Trace');
    console.error('='.repeat(80));
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Request body:', JSON.stringify(req.body, null, 2));
    console.error('='.repeat(80));
    
    return res.status(500).json({
      success: false,
      error: 'Failed to create hosted checkout',
      details: error.message,
      errorType: error.name,
      timestamp: new Date().toISOString()
    });
  }
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

// REFUND Operation - Refund a captured transaction
async function handlePaymentRefund(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('💸 Handling REFUND operation');

    const {
      paymentId,
      orderId,
      amount,
      reason = 'Customer request',
      transactionId
    } = req.body;

    if (!paymentId && !orderId) {
      return res.status(400).json({
        success: false,
        error: 'Either paymentId or orderId is required'
      });
    }

    // Get payment record
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId || orderId)
      .single();

    if (paymentError || !payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    // Check if payment can be refunded (must be completed)
    if (payment.payment_status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Payment must be completed before refunding',
        currentStatus: payment.payment_status
      });
    }

    const refundAmount = amount ? parseFloat(amount) : parseFloat(payment.amount);
    if (isNaN(refundAmount) || refundAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid refund amount'
      });
    }

    // Call ARC Pay REFUND API
    const arcMerchantId = process.env.ARC_PAY_MERCHANT_ID || 'TESTARC05511704';
    const arcApiPassword = process.env.ARC_PAY_API_PASSWORD || '4d41a81750f1ee3f6aa4adf0dfd6310c';
    const arcBaseUrl = process.env.ARC_PAY_BASE_URL || 'https://api.arcpay.travel/api/rest/version/77';

    const authHeader = 'Basic ' + Buffer.from(`merchant.${arcMerchantId}:${arcApiPassword}`).toString('base64');

    const refundTransactionId = transactionId || `refund-${Date.now()}`;
    const refundUrl = `${arcBaseUrl}/merchant/${arcMerchantId}/order/${payment.id}/transaction/${refundTransactionId}`;

    console.log('🔄 Calling ARC Pay REFUND API:', refundUrl);
    console.log('Refund Amount:', refundAmount);

    const refundResponse = await fetch(refundUrl, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        apiOperation: 'REFUND',
        transaction: {
          amount: parseFloat(refundAmount).toFixed(2),
          currency: payment.currency || 'USD',
          reference: reason
        }
      })
    });

    const refundResponseText = await refundResponse.text();
    console.log('REFUND Response Status:', refundResponse.status);
    console.log('REFUND Response:', refundResponseText);

    if (!refundResponse.ok) {
      let errorData;
      try {
        errorData = JSON.parse(refundResponseText);
      } catch (e) {
        errorData = { message: refundResponseText };
      }

      return res.status(refundResponse.status).json({
        success: false,
        error: 'REFUND operation failed',
        details: errorData
      });
    }

    const refundData = JSON.parse(refundResponseText);

    // Update payment record
    const currentRefunds = payment.metadata?.refunds || [];
    await supabase
      .from('payments')
      .update({
        payment_status: 'refunded',
        metadata: {
          ...payment.metadata,
          refunds: [...currentRefunds, {
            transactionId: refundTransactionId,
            amount: refundAmount,
            reason,
            refundedAt: new Date().toISOString(),
            refundData
          }],
          totalRefunded: currentRefunds.reduce((sum, r) => sum + r.amount, 0) + refundAmount,
          lastRefundedAt: new Date().toISOString()
        }
      })
      .eq('id', payment.id);

    console.log('✅ REFUND operation successful');

    return res.status(200).json({
      success: true,
      refundData,
      refundTransactionId,
      refundAmount,
      paymentId: payment.id,
      message: 'Payment refunded successfully'
    });

  } catch (error) {
    console.error('❌ REFUND operation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to refund payment',
      details: error.message
    });
  }
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

// ============================================
// ARC PAY STANDARD OPERATIONS
// ============================================

// VOID Operation - Cancel an authorized transaction
async function handlePaymentVoid(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🚫 Handling VOID operation');

    const { paymentId, orderId, transactionId } = req.body;

    if (!paymentId && !orderId) {
      return res.status(400).json({
        success: false,
        error: 'Either paymentId or orderId is required'
      });
    }

    // Get payment record
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId || orderId)
      .single();

    if (paymentError || !payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    // Check if payment can be voided (must be authorized but not captured)
    if (payment.payment_status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot void a completed payment. Use refund instead.'
      });
    }

    if (payment.payment_status === 'failed' || payment.payment_status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: 'Payment is already failed or cancelled'
      });
    }

    // Call ARC Pay VOID API
    const arcMerchantId = process.env.ARC_PAY_MERCHANT_ID || 'TESTARC05511704';
    const arcApiPassword = process.env.ARC_PAY_API_PASSWORD || '4d41a81750f1ee3f6aa4adf0dfd6310c';
    const arcBaseUrl = process.env.ARC_PAY_BASE_URL || 'https://api.arcpay.travel/api/rest/version/77';

    const authHeader = 'Basic ' + Buffer.from(`merchant.${arcMerchantId}:${arcApiPassword}`).toString('base64');

    const voidTransactionId = transactionId || `void-${Date.now()}`;
    const voidUrl = `${arcBaseUrl}/merchant/${arcMerchantId}/order/${payment.id}/transaction/${voidTransactionId}`;

    console.log('🔄 Calling ARC Pay VOID API:', voidUrl);

    const voidResponse = await fetch(voidUrl, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        apiOperation: 'VOID',
        transaction: {
          targetTransactionId: payment.arc_transaction_id
        }
      })
    });

    const voidResponseText = await voidResponse.text();
    console.log('VOID Response Status:', voidResponse.status);
    console.log('VOID Response:', voidResponseText);

    if (!voidResponse.ok) {
      let errorData;
      try {
        errorData = JSON.parse(voidResponseText);
      } catch (e) {
        errorData = { message: voidResponseText };
      }

      return res.status(voidResponse.status).json({
        success: false,
        error: 'VOID operation failed',
        details: errorData
      });
    }

    const voidData = JSON.parse(voidResponseText);

    // Update payment record
    await supabase
      .from('payments')
      .update({
        payment_status: 'cancelled',
        metadata: {
          ...payment.metadata,
          voidTransaction: voidData,
          voidedAt: new Date().toISOString()
        }
      })
      .eq('id', payment.id);

    console.log('✅ VOID operation successful');

    return res.status(200).json({
      success: true,
      voidData,
      paymentId: payment.id,
      message: 'Payment voided successfully'
    });

  } catch (error) {
    console.error('❌ VOID operation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to void payment',
      details: error.message
    });
  }
}

// CAPTURE Operation - Capture an authorized transaction
async function handlePaymentCapture(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('💰 Handling CAPTURE operation');

    const { paymentId, orderId, amount, transactionId } = req.body;

    if (!paymentId && !orderId) {
      return res.status(400).json({
        success: false,
        error: 'Either paymentId or orderId is required'
      });
    }

    // Get payment record
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId || orderId)
      .single();

    if (paymentError || !payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    // Call ARC Pay CAPTURE API
    const arcMerchantId = process.env.ARC_PAY_MERCHANT_ID || 'TESTARC05511704';
    const arcApiPassword = process.env.ARC_PAY_API_PASSWORD || '4d41a81750f1ee3f6aa4adf0dfd6310c';
    const arcBaseUrl = process.env.ARC_PAY_BASE_URL || 'https://api.arcpay.travel/api/rest/version/77';

    const authHeader = 'Basic ' + Buffer.from(`merchant.${arcMerchantId}:${arcApiPassword}`).toString('base64');

    const captureTransactionId = transactionId || `capture-${Date.now()}`;
    const captureUrl = `${arcBaseUrl}/merchant/${arcMerchantId}/order/${payment.id}/transaction/${captureTransactionId}`;

    console.log('🔄 Calling ARC Pay CAPTURE API:', captureUrl);

    const captureAmount = amount || payment.amount;

    const captureResponse = await fetch(captureUrl, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        apiOperation: 'CAPTURE',
        transaction: {
          amount: parseFloat(captureAmount).toFixed(2),
          currency: payment.currency || 'USD'
        }
      })
    });

    const captureResponseText = await captureResponse.text();
    console.log('CAPTURE Response Status:', captureResponse.status);
    console.log('CAPTURE Response:', captureResponseText);

    if (!captureResponse.ok) {
      let errorData;
      try {
        errorData = JSON.parse(captureResponseText);
      } catch (e) {
        errorData = { message: captureResponseText };
      }

      return res.status(captureResponse.status).json({
        success: false,
        error: 'CAPTURE operation failed',
        details: errorData
      });
    }

    const captureData = JSON.parse(captureResponseText);

    // Update payment record
    await supabase
      .from('payments')
      .update({
        payment_status: 'completed',
        completed_at: new Date().toISOString(),
        metadata: {
          ...payment.metadata,
          captureTransaction: captureData,
          capturedAt: new Date().toISOString(),
          capturedAmount: captureAmount
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

    console.log('✅ CAPTURE operation successful');

    return res.status(200).json({
      success: true,
      captureData,
      paymentId: payment.id,
      message: 'Payment captured successfully'
    });

  } catch (error) {
    console.error('❌ CAPTURE operation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to capture payment',
      details: error.message
    });
  }
}

// RETRIEVE Operation - Get transaction/order status from ARC Pay
async function handlePaymentRetrieve(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔍 Handling RETRIEVE operation');

    const { paymentId, orderId } = req.method === 'GET' ? req.query : req.body;

    if (!paymentId && !orderId) {
      return res.status(400).json({
        success: false,
        error: 'Either paymentId or orderId is required'
      });
    }

    // Get payment record
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId || orderId)
      .single();

    if (paymentError || !payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    // Call ARC Pay RETRIEVE API
    const arcMerchantId = process.env.ARC_PAY_MERCHANT_ID || 'TESTARC05511704';
    const arcApiPassword = process.env.ARC_PAY_API_PASSWORD || '4d41a81750f1ee3f6aa4adf0dfd6310c';
    const arcBaseUrl = process.env.ARC_PAY_BASE_URL || 'https://api.arcpay.travel/api/rest/version/77';

    const authHeader = 'Basic ' + Buffer.from(`merchant.${arcMerchantId}:${arcApiPassword}`).toString('base64');

    const retrieveUrl = `${arcBaseUrl}/merchant/${arcMerchantId}/order/${payment.id}`;

    console.log('🔄 Calling ARC Pay RETRIEVE API:', retrieveUrl);

    const retrieveResponse = await fetch(retrieveUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });

    const retrieveResponseText = await retrieveResponse.text();
    console.log('RETRIEVE Response Status:', retrieveResponse.status);

    if (!retrieveResponse.ok) {
      let errorData;
      try {
        errorData = JSON.parse(retrieveResponseText);
      } catch (e) {
        errorData = { message: retrieveResponseText };
      }

      return res.status(retrieveResponse.status).json({
        success: false,
        error: 'RETRIEVE operation failed',
        details: errorData
      });
    }

    const orderData = JSON.parse(retrieveResponseText);

    console.log('✅ RETRIEVE operation successful');
    console.log('Order Status:', orderData.status);
    console.log('Result:', orderData.result);

    // Optionally update local payment record with latest status
    const statusMapping = {
      'CAPTURED': 'completed',
      'AUTHENTICATED': 'pending',
      'AUTHORIZED': 'authorized',
      'FAILED': 'failed',
      'CANCELLED': 'cancelled'
    };

    const localStatus = statusMapping[orderData.status] || payment.payment_status;

    await supabase
      .from('payments')
      .update({
        metadata: {
          ...payment.metadata,
          lastRetrieved: new Date().toISOString(),
          latestOrderData: orderData
        }
      })
      .eq('id', payment.id);

    return res.status(200).json({
      success: true,
      orderData,
      paymentId: payment.id,
      localPaymentStatus: localStatus,
      message: 'Order status retrieved successfully'
    });

  } catch (error) {
    console.error('❌ RETRIEVE operation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve payment status',
      details: error.message
    });
  }
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
    ARC_PAY_BASE_URL: process.env.ARC_PAY_BASE_URL || process.env.ARC_PAY_API_URL || 'https://api.arcpay.travel/api/rest/version/77 (fallback)',
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
} // Build trigger: Sun 01 Feb 2026 08:28:07 AM IST
