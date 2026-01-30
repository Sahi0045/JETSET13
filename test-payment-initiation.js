import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ARC Pay Configuration
const ARC_PAY_CONFIG = {
    MERCHANT_ID: process.env.ARC_PAY_MERCHANT_ID || 'TESTARC05511704',
    API_PASSWORD: process.env.ARC_PAY_API_PASSWORD || '4d41a81750f1ee3f6aa4adf0dfd6310c',
    BASE_URL: process.env.ARC_PAY_BASE_URL || 'https://api.arcpay.travel/api/rest/version/77'
};

console.log('🧪 Testing Payment Initiation Flow\n');
console.log('═'.repeat(60));

async function testPaymentInitiation() {
    try {
        console.log('\n📋 Step 1: Fetching a test quote from database...');
        
        // Get a quote from database
        const { data: quotes, error: quoteError } = await supabase
            .from('quotes')
            .select('*, inquiry:inquiries(*)')
            .eq('status', 'sent')
            .eq('payment_status', 'unpaid')
            .limit(1);
        
        if (quoteError) {
            console.error('❌ Error fetching quotes:', quoteError);
            throw quoteError;
        }
        
        if (!quotes || quotes.length === 0) {
            console.log('⚠️  No unpaid quotes found. Creating a test quote...');
            
            // Create a test inquiry first
            const { data: inquiry, error: inquiryError } = await supabase
                .from('inquiries')
                .insert([{
                    inquiry_type: 'flight',
                    customer_name: 'Test Customer',
                    customer_email: 'test@example.com',
                    status: 'quoted'
                }])
                .select()
                .single();
            
            if (inquiryError) {
                throw new Error(`Failed to create test inquiry: ${inquiryError.message}`);
            }
            
            // Create a test quote
            const { data: quote, error: createQuoteError } = await supabase
                .from('quotes')
                .insert([{
                    inquiry_id: inquiry.id,
                    admin_id: inquiry.id, // Using inquiry ID as placeholder
                    quote_number: `TEST-${Date.now()}`,
                    title: 'Test Quote',
                    total_amount: 124.00,
                    currency: 'USD',
                    status: 'sent',
                    payment_status: 'unpaid'
                }])
                .select()
                .single();
            
            if (createQuoteError) {
                throw new Error(`Failed to create test quote: ${createQuoteError.message}`);
            }
            
            console.log('✅ Test quote created:', quote.id);
            return await testWithQuote(quote);
        }
        
        const quote = quotes[0];
        console.log('✅ Quote found:', quote.id);
        console.log('   Amount:', quote.total_amount, quote.currency);
        console.log('   Status:', quote.status);
        console.log('   Payment Status:', quote.payment_status);
        
        return await testWithQuote(quote);
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

async function testWithQuote(quote) {
    try {
        console.log('\n📋 Step 2: Creating payment record...');
        
        const returnUrl = 'https://www.jetsetterss.com/payment/callback';
        const cancelUrl = 'https://www.jetsetterss.com/inquiry/test';
        
        // Create payment record
        const { data: payment, error: paymentError } = await supabase
            .from('payments')
            .insert([{
                quote_id: quote.id,
                inquiry_id: quote.inquiry_id,
                amount: quote.total_amount,
                currency: quote.currency || 'USD',
                payment_status: 'pending',
                customer_email: quote.inquiry?.customer_email || quote.customer_email,
                customer_name: quote.inquiry?.customer_name || quote.customer_name,
                return_url: returnUrl,
                cancel_url: cancelUrl
            }])
            .select()
            .single();
        
        if (paymentError) {
            console.error('❌ Payment creation error:', paymentError);
            throw new Error(`Failed to create payment: ${paymentError.message}`);
        }
        
        console.log('✅ Payment record created:', payment.id);
        
        console.log('\n📋 Step 3: Calling ARC Pay API to create session...');
        console.log('   Merchant ID:', ARC_PAY_CONFIG.MERCHANT_ID);
        console.log('   Base URL:', ARC_PAY_CONFIG.BASE_URL);
        
        const sessionUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/session`;
        const authHeader = 'Basic ' + Buffer.from(`merchant.${ARC_PAY_CONFIG.MERCHANT_ID}:${ARC_PAY_CONFIG.API_PASSWORD}`).toString('base64');
        
        const requestBody = {
            apiOperation: 'INITIATE_CHECKOUT',
            interaction: {
                operation: 'PURCHASE',
                returnUrl: returnUrl,
                cancelUrl: cancelUrl
            },
            order: {
                id: payment.id,
                amount: parseFloat(quote.total_amount).toFixed(2),
                currency: quote.currency || 'USD',
                description: `Quote ${quote.quote_number || quote.id.slice(-8)} - ${quote.title || 'Travel Booking'}`
            }
        };
        
        console.log('   Request URL:', sessionUrl);
        console.log('   Request Body:', JSON.stringify(requestBody, null, 2));
        
        const response = await fetch(sessionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': authHeader
            },
            body: JSON.stringify(requestBody)
        });
        
        const responseText = await response.text();
        console.log('\n📋 Step 4: ARC Pay API Response...');
        console.log('   Status:', response.status);
        console.log('   Response:', responseText);
        
        if (!response.ok) {
            let errorDetails;
            try {
                errorDetails = JSON.parse(responseText);
            } catch {
                errorDetails = { message: responseText };
            }
            
            console.error('\n❌ ARC Pay API Error:');
            console.error('   Status:', response.status);
            console.error('   Error:', JSON.stringify(errorDetails, null, 2));
            
            throw new Error(`ARC Pay API returned ${response.status}: ${errorDetails.explanation || errorDetails.message || responseText}`);
        }
        
        let session;
        try {
            session = JSON.parse(responseText);
        } catch (parseError) {
            console.error('❌ Failed to parse response:', parseError);
            throw new Error('Invalid JSON response from ARC Pay');
        }
        
        console.log('\n✅ SUCCESS! Payment session created:');
        console.log('   Session ID:', session.session?.id);
        console.log('   Success Indicator:', session.successIndicator);
        console.log('   Result:', session.result);
        
        // Update payment record with session ID
        console.log('\n📋 Step 5: Updating payment record with session ID...');
        const { error: updateError } = await supabase
            .from('payments')
            .update({
                arc_session_id: session.session?.id,
                success_indicator: session.successIndicator,
                arc_order_id: payment.id,
                updated_at: new Date().toISOString()
            })
            .eq('id', payment.id);
        
        if (updateError) {
            console.warn('⚠️  Warning: Failed to update payment with session ID:', updateError.message);
        } else {
            console.log('✅ Payment record updated successfully');
        }
        
        console.log('\n' + '═'.repeat(60));
        console.log('🎉 ALL TESTS PASSED! Payment initiation is working correctly.');
        console.log('═'.repeat(60));
        
        return {
            success: true,
            paymentId: payment.id,
            sessionId: session.session?.id,
            successIndicator: session.successIndicator
        };
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        if (error.stack) {
            console.error('Stack:', error.stack);
        }
        throw error;
    }
}

// Run the test
testPaymentInitiation()
    .then(result => {
        console.log('\n✅ Test completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    });

