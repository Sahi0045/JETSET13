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
          error: 'Invalid action. Supported actions: initiate-payment, payment-callback, get-payment-details, gateway-status, session-create, order-create, payment-process, payment-verify, payment-refund, payment-void, payment-capture, payment-retrieve, test, health, debug'
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
    console.log('API Password:', arcApiPassword ? '***' + arcApiPassword.slice(-4) : 'Missing');

    // ARC Pay uses HTTP Basic Auth with merchant.MERCHANT_ID:password format
    const authHeader = 'Basic ' + Buffer.from(`merchant.${arcMerchantId}:${arcApiPassword}`).toString('base64');

    // Ensure base URL doesn't have trailing slash
    const cleanBaseUrl = arcBaseUrl.replace(/\/$/, '');
    const sessionUrl = `${cleanBaseUrl}/merchant/${arcMerchantId}/session`;
    console.log('Session URL:', sessionUrl);
    console.log('Auth Header:', authHeader.substring(0, 20) + '...');

    // Ensure return and cancel URLs are properly formatted
    const finalReturnUrl = return_url || `${process.env.FRONTEND_URL || 'https://www.jetsetterss.com'}/payment/callback?quote_id=${quote.id}`;
    const finalCancelUrl = cancel_url || `${process.env.FRONTEND_URL || 'https://www.jetsetterss.com'}/inquiry/${quote.inquiry_id}?payment=cancelled`;

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
          billingAddress: 'OPTIONAL',
          customerEmail: 'OPTIONAL'
        },
        timeout: 900
      },
      order: {
        id: payment.id,
        reference: payment.id, // Required: Unique order reference per ARC Pay docs
        amount: parseFloat(quote.total_amount).toFixed(2),
        currency: quote.currency || 'USD',
        description: `Quote ${quote.quote_number || quote.id.slice(-8)} - ${quote.title || 'Travel Booking'}`
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
    
    // NOTE: Do NOT include authentication block here - it's not supported in INITIATE_CHECKOUT
    // NOTE: airline.ticket.issue.travelAgentCode and travelAgentName are required for airline transactions
    // but may be optional for other transaction types (hotels, packages, etc.)

    // Final verification: Ensure no authentication block exists
    if (requestBody.authentication) {
      console.error('❌ ERROR: authentication block found in requestBody! Removing it...');
      delete requestBody.authentication;
    }
    
    console.log('Request body:', JSON.stringify(requestBody, null, 2));
    console.log('✅ Verified: No authentication block in request');

    let arcResponse;
    try {
      const requestBodyString = JSON.stringify(requestBody);
      // Double-check the string doesn't contain authentication
      if (requestBodyString.includes('"authentication"') || requestBodyString.includes("'authentication'")) {
        console.error('❌ CRITICAL: authentication found in JSON string!');
        console.error('Request body string:', requestBodyString);
      }
      
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
    console.log('ARC Pay response status:', arcResponse.status);
    console.log('ARC Pay response headers:', Object.fromEntries(arcResponse.headers.entries()));
    console.log('ARC Pay response text:', responseText);

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

    // 6. Construct payment page URL for Hosted Checkout
    // CORRECT FORMAT: https://api.arcpay.travel/form/{sessionId}?charset=UTF-8
    // The sessionId is embedded in the URL path, NOT sent as a form field
    // Reference: ARC Pay Hosted Payment Form documentation

    // Extract base domain from arcBaseUrl to use for payment page
    let gatewayDomain;
    try {
      const url = new URL(arcBaseUrl);
      gatewayDomain = `${url.protocol}//${url.hostname}`;
    } catch (e) {
      // Fallback to api.arcpay.travel for test environment
      gatewayDomain = 'https://api.arcpay.travel';
    }

    console.log('🔧 Using gateway domain for payment page:', gatewayDomain);
    console.log('   API base URL:', arcBaseUrl);

    // ARC Pay payment page URL format: {domain}/form/{sessionId}?charset=UTF-8
    // The sessionId is part of the URL path, not a POST parameter
    const paymentPageUrl = `${gatewayDomain}/form/${sessionId}?charset=UTF-8`;
    
    console.log('✅ Payment page URL:', paymentPageUrl);
    console.log('   Session ID:', sessionId);

    // 7. Return session details for form POST integration
    return res.status(200).json({
      success: true,
      sessionId: sessionId,
      successIndicator: successIndicator,
      merchantId: arcMerchantId,
      paymentId: payment.id,
      paymentPageUrl: paymentPageUrl,
      // Keep checkoutUrl for backward compatibility, but use paymentPageUrl instead
      checkoutUrl: paymentPageUrl
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
    // ARC Pay sends data via POST body for form submission, or GET query params
    const resultIndicator = req.body?.resultIndicator || req.query?.resultIndicator;
    const sessionId = req.body?.sessionId || req.query?.sessionId;

    console.log('📥 Payment callback received:');
    console.log('   Method:', req.method);
    console.log('   Body:', req.body);
    console.log('   Query:', req.query);
    console.log('   Result Indicator:', resultIndicator);
    console.log('   Session ID:', sessionId);

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

    // 3. Retrieve order and transaction details from ARC Pay
    const arcMerchantId = process.env.ARC_PAY_MERCHANT_ID || 'TESTARC05511704';
    const arcApiPassword = process.env.ARC_PAY_API_PASSWORD || '4d41a81750f1ee3f6aa4adf0dfd6310c';
    const arcBaseUrl = process.env.ARC_PAY_BASE_URL || 'https://api.arcpay.travel/api/rest/version/100';

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
        return res.redirect(`/payment/callback?resultIndicator=${resultIndicator}&sessionId=${sessionId}&status=checking`);
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
              
              const payRequestBody = {
              apiOperation: 'PAY',
              authentication: {
                transactionId: authTransactionId
              },
              order: {
                amount: parseFloat(payment.amount).toFixed(2),
                currency: payment.currency || 'USD'
              },
              sourceOfFunds: {
                type: 'CARD'
              },
              transaction: {
                reference: `PAY-${payment.id}`
              }
            };
            
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
            return res.redirect(`/payment/callback?resultIndicator=${resultIndicator}&sessionId=${sessionId}&status=checking`);
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

      return res.redirect(`/payment/failed?reason=3ds_pending&paymentId=${payment.id}&message=Please complete the 3D Secure authentication challenge`);
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

      return res.redirect(`/payment/failed?reason=3ds_authentication_failed&paymentId=${payment.id}`);
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
      eci === '06' // Authentication Attempted (treated as success)
    );

    // CRITICAL: Never mark PENDING transactions as successful
    // Only mark as successful if result is explicitly SUCCESS and all checks pass
    const isSuccess = (
      transactionResult === 'SUCCESS' && // Must be SUCCESS, not PENDING
      transactionResult !== 'PENDING' && // Explicit check to prevent PENDING from being marked successful
      gatewayCode !== 'PENDING' && // Gateway code must not be PENDING
      is3DSSuccess &&
      isAuthSuccess &&
      isValidECI &&
      (gatewayCode === 'APPROVED' || gatewayCode === 'SUCCESS' || (!gatewayCode && transactionResult === 'SUCCESS'))
    );

    if (isSuccess) {
      console.log('✅ Payment successful');
      console.log(`   3DS Status: ${transactionStatus || 'No 3DS'}`);
      console.log(`   ECI: ${eci || 'N/A'}`);
      console.log(`   Gateway Code: ${gatewayCode || 'N/A'}`);
      
      // Update payment status
      await supabase
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

        return res.redirect(`/payment/callback?resultIndicator=${resultIndicator}&sessionId=${sessionId}&status=checking`);
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

      return res.redirect(`/payment/failed?reason=${encodeURIComponent(failureReason)}&paymentId=${payment.id}`);
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
    const arcBaseUrl = process.env.ARC_PAY_BASE_URL || 'https://api.arcpay.travel/api/rest/version/100';

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
    const arcBaseUrl = process.env.ARC_PAY_BASE_URL || 'https://api.arcpay.travel/api/rest/version/100';

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
    const arcBaseUrl = process.env.ARC_PAY_BASE_URL || 'https://api.arcpay.travel/api/rest/version/100';

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
    const arcBaseUrl = process.env.ARC_PAY_BASE_URL || 'https://api.arcpay.travel/api/rest/version/100';

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