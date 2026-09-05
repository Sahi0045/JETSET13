import supabase from '../config/supabase.js';
import { sendEmail } from '../services/emailService.js';
import { generateQuoteExpiredTemplate, generateQuoteExpiringTemplate } from '../services/email/templates.js';

/**
 * Check for expiring and expired quotes
 * Run this daily via cron job or scheduled function
 */
export const checkQuoteExpiration = async () => {
  try {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));

    console.log('🔍 Checking for expiring and expired quotes...');

    // 1. Find quotes expiring in 3 days (send warning)
    const { data: expiringQuotes, error: expiringError } = await supabase
      .from('quotes')
      .select(`
        *,
        inquiries (
          customer_name,
          customer_email
        )
      `)
      .eq('status', 'sent')
      .gte('expires_at', now.toISOString())
      .lte('expires_at', threeDaysFromNow.toISOString());

    if (expiringError) {
      console.error('Error fetching expiring quotes:', expiringError);
    } else if (expiringQuotes && expiringQuotes.length > 0) {
      console.log(`⚠️  Found ${expiringQuotes.length} quotes expiring soon`);

      // Send warning emails
      for (const quote of expiringQuotes) {
        try {
          const daysUntilExpiry = Math.ceil(
            (new Date(quote.expires_at) - now) / (1000 * 60 * 60 * 24)
          );

          await sendEmail({
            to: quote.inquiries.customer_email,
            subject: `Your travel quote expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}`,
            html: generateQuoteExpiringTemplate({
              customerName: quote.inquiries.customer_name,
              title: quote.title,
              quoteId: quote.id,
              totalAmount: quote.total_amount,
              currency: quote.currency,
              days: daysUntilExpiry,
            }),
          });

          console.log(`✅ Sent expiration warning to ${quote.inquiries.customer_email}`);
        } catch (emailError) {
          console.error(`❌ Failed to send warning email for quote ${quote.id}:`, emailError);
        }
      }
    }

    // 2. Find expired quotes (mark as expired)
    const { data: expiredQuotes, error: expiredError } = await supabase
      .from('quotes')
      .select(`
        *,
        inquiries (
          customer_name,
          customer_email
        )
      `)
      .in('status', ['sent', 'viewed'])
      .lt('expires_at', now.toISOString());

    if (expiredError) {
      console.error('Error fetching expired quotes:', expiredError);
    } else if (expiredQuotes && expiredQuotes.length > 0) {
      console.log(`❌ Found ${expiredQuotes.length} expired quotes`);

      // Update status to expired
      const expiredIds = expiredQuotes.map(q => q.id);
      const { error: updateError } = await supabase
        .from('quotes')
        .update({ status: 'expired' })
        .in('id', expiredIds);

      if (updateError) {
        console.error('Error updating expired quotes:', updateError);
      } else {
        console.log(`✅ Marked ${expiredIds.length} quotes as expired`);

        // Send expiration emails
        for (const quote of expiredQuotes) {
          try {
            await sendEmail({
              to: quote.inquiries.customer_email,
              subject: 'Your travel quote has expired',
              html: generateQuoteExpiredTemplate({
                customerName: quote.inquiries.customer_name,
                title: quote.title,
                quoteId: quote.id,
              }),
            });

            console.log(`✅ Sent expiration notice to ${quote.inquiries.customer_email}`);
          } catch (emailError) {
            console.error(`❌ Failed to send expiration email for quote ${quote.id}:`, emailError);
          }
        }
      }
    }

    console.log('✅ Quote expiration check completed');

    return {
      success: true,
      expiringSoon: expiringQuotes?.length || 0,
      expired: expiredQuotes?.length || 0
    };

  } catch (error) {
    console.error('❌ Error in quote expiration check:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Export as endpoint handler for manual trigger
export const checkQuoteExpirationHandler = async (req, res) => {
  try {
    const result = await checkQuoteExpiration();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Run immediately if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Running quote expiration check...');
  checkQuoteExpiration()
    .then(result => {
      console.log('Result:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}
