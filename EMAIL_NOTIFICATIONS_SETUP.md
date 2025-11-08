# Email Notifications Setup Guide

## Overview

The JetSet Travel application now has a complete email notification system using **Resend** as the email service provider. This system sends professional, beautifully designed emails to both customers and admins for all inquiry and quote activities.

## 🎯 Features Implemented

### 1. **Customer Notifications**

#### When User Creates an Inquiry:
- ✅ **Beautiful confirmation email** sent immediately
- ✅ Contains inquiry details (ID, type, email)
- ✅ Expected response time (24 hours)
- ✅ Link to "My Trips" section
- ✅ Contact information for support

#### When Admin Sends a Quote:
- ✅ **Professional quote email** with full details
- ✅ Quote number and total amount prominently displayed
- ✅ Cost breakdown (if available)
- ✅ Expiration date with urgent CTA
- ✅ Link to view full quote and book
- ✅ Next steps for customer

### 2. **Admin Notifications**

#### When User Creates an Inquiry:
- ✅ **Urgent notification email** to admin
- ✅ Customer information clearly displayed
- ✅ Inquiry type and travel details
- ✅ Direct link to admin panel to create quote
- ✅ Response time reminder (24 hours)

## 📧 Email Service Provider: Resend

We use [Resend](https://resend.com) for reliable email delivery. Resend offers:
- Simple API
- Great deliverability
- Professional email templates
- Generous free tier (100 emails/day, 3,000/month)

## 🔧 Setup Instructions

### Step 1: Get Resend API Key

1. Go to [https://resend.com](https://resend.com)
2. Sign up for a free account (or log in)
3. Go to **API Keys** section
4. Click **Create API Key**
5. Give it a name (e.g., "JetSet Production")
6. Copy the API key (starts with `re_...`)

### Step 2: Configure Environment Variables

You need to set these variables in your `.env` file:

```bash
# Email Configuration
RESEND_API_KEY=re_your_actual_api_key_here
ADMIN_EMAIL=your-admin-email@company.com
FRONTEND_URL=https://your-production-domain.com
```

#### For Local Development:
Add to `.env`:
```bash
RESEND_API_KEY=re_your_test_api_key
ADMIN_EMAIL=admin@localhost.com
FRONTEND_URL=http://localhost:3000
```

#### For Production:
Add to `.env` or `.env.node`:
```bash
RESEND_API_KEY=re_your_production_api_key
ADMIN_EMAIL=jetsetters721@gmail.com
FRONTEND_URL=https://jetset-app.com
```

### Step 3: Verify Domain (Optional but Recommended)

For production, verify your domain with Resend:

1. Go to Resend Dashboard → **Domains**
2. Click **Add Domain**
3. Enter your domain (e.g., `jetset.com`)
4. Add the DNS records Resend provides
5. Wait for verification (usually 5-10 minutes)
6. Once verified, update the email sender in `emailService.js`:

```javascript
from: 'JetSet Travel <noreply@jetset.com>'
```

**Note:** Without domain verification, emails will be sent from `onboarding@resend.dev`, which is fine for testing but looks less professional in production.

## 📋 Email Templates

All email templates are located in: `/backend/services/emailService.js`

### Available Templates:

1. **`generateInquiryReceivedTemplate`** - Sent to customer when inquiry is created
2. **`generateAdminInquiryNotificationTemplate`** - Sent to admin when inquiry is created
3. **`generateQuoteSentTemplate`** - Sent to customer when quote is ready

### Template Features:
- ✅ Fully responsive design (mobile-friendly)
- ✅ Professional color scheme matching JetSet brand
- ✅ Gradient headers for visual appeal
- ✅ Clear call-to-action buttons
- ✅ Contact information included
- ✅ Consistent branding

## 🧪 Testing Email Notifications

### Test Customer Inquiry Creation:

```bash
curl -X POST http://localhost:10000/api/inquiries \
  -H "Content-Type: application/json" \
  -d '{
    "inquiry_type": "custom",
    "customer_name": "Test User",
    "customer_email": "test@example.com",
    "customer_phone": "+1234567890",
    "travel_details": "Test inquiry for email notification",
    "destination": "Paris",
    "departure_date": "2025-06-01",
    "return_date": "2025-06-10",
    "adults": 2
  }'
```

**Expected Result:**
- ✅ Inquiry created in database
- ✅ Email sent to `test@example.com` (customer)
- ✅ Email sent to admin email configured in `ADMIN_EMAIL`

### Test Quote Creation and Sending:

1. Log in as admin
2. Go to Admin Panel → Inquiries
3. Click on an inquiry
4. Create a quote with details
5. Click "Send Quote" button

**Expected Result:**
- ✅ Quote status changed to "sent"
- ✅ Professional email sent to customer with quote details
- ✅ Customer can view quote in "My Trips"

## 🔍 Debugging Email Issues

### Check if emails are being sent:

Look for these log messages in your console:

```
✅ Confirmation email sent to customer: customer@email.com
✅ Admin notification email sent to: admin@email.com
✅ Quote email sent to customer: customer@email.com
```

### If emails are not being sent:

1. **Check Environment Variables:**
   ```bash
   # In your terminal:
   echo $RESEND_API_KEY
   echo $ADMIN_EMAIL
   ```

2. **Check Resend Dashboard:**
   - Go to [Resend Logs](https://resend.com/logs)
   - Check if API requests are being received
   - Look for any error messages

3. **Check Email Logs:**
   - Look for error messages like:
     ```
     ❌ Failed to send inquiry confirmation email: [error details]
     ❌ Failed to send admin notification email: [error details]
     ```

4. **Common Issues:**

   | Issue | Solution |
   |-------|----------|
   | Invalid API Key | Double-check your `RESEND_API_KEY` |
   | Emails not delivered | Check spam folder |
   | "Domain not verified" | Either verify domain or use default sender |
   | Rate limit exceeded | Upgrade Resend plan or wait 24h |

## 📊 Email Statistics

### Resend Free Tier Limits:
- **100 emails per day**
- **3,000 emails per month**
- Sufficient for most small to medium businesses

### For High Volume:
If you exceed free tier limits, upgrade to:
- **Pro Plan**: $20/month for 50,000 emails
- Pay-as-you-go available

## 🎨 Customizing Email Templates

To customize email appearance, edit templates in `/backend/services/emailService.js`:

### Change Colors:
```javascript
.header { 
  background: linear-gradient(135deg, #YOUR_COLOR 0%, #YOUR_DARK_COLOR 100%); 
}
```

### Change Button Style:
```javascript
.cta-button { 
  background-color: #YOUR_BRAND_COLOR; 
}
```

### Add Your Logo:
```html
<div class="header">
  <img src="https://your-domain.com/logo.png" alt="Logo" style="max-width: 150px;">
  <h1>✈️ Inquiry Received!</h1>
</div>
```

## 📝 Code Files Modified

Here are all the files that were updated for email notifications:

1. **`/backend/services/emailService.js`**
   - Enhanced with professional templates
   - Added 3 new template functions
   - Updated to use environment variables

2. **`/backend/controllers/inquiry.controller.js`**
   - Updated to use new email templates
   - Improved error handling and logging
   - Sends emails to both customer and admin

3. **`/backend/controllers/quote.controller.js`**
   - Updated to use new quote template
   - Better error handling
   - Professional quote emails with breakdown

4. **`/.env.example`**
   - Added email configuration section
   - Documented required variables

5. **`/.env.node`**
   - Added production email settings

## 🚀 Production Deployment Checklist

Before deploying to production:

- [ ] ✅ Get production Resend API key
- [ ] ✅ Update `RESEND_API_KEY` in production `.env`
- [ ] ✅ Set correct `ADMIN_EMAIL` (your actual admin email)
- [ ] ✅ Set correct `FRONTEND_URL` (your production URL)
- [ ] ✅ (Optional) Verify domain in Resend
- [ ] ✅ Test inquiry creation
- [ ] ✅ Test quote sending
- [ ] ✅ Check spam folders
- [ ] ✅ Monitor Resend dashboard for delivery stats

## 📞 Support & Troubleshooting

### If you need help:

1. **Check Console Logs**: Look for `✅` or `❌` email status messages
2. **Check Resend Dashboard**: See delivery status and error details
3. **Review this guide**: Most issues are configuration-related

### Email Not Received?

1. Check spam/junk folder
2. Verify email address is correct
3. Check Resend logs for delivery status
4. Try sending test email from Resend dashboard

## 🎉 Success Indicators

Your email notification system is working correctly if:

1. ✅ Customer receives inquiry confirmation immediately
2. ✅ Admin receives inquiry notification immediately
3. ✅ Customer receives quote email when admin sends quote
4. ✅ All emails look professional and branded
5. ✅ Links in emails work correctly
6. ✅ No errors in console logs

## 📈 Next Steps & Enhancements

### Future Improvements (Optional):

1. **Email Templates Library**
   - Store templates in database
   - Allow admin to customize via UI

2. **Email Preferences**
   - Let customers choose notification preferences
   - Unsubscribe functionality

3. **SMS Notifications**
   - Add Twilio for SMS alerts
   - Critical updates via SMS

4. **Email Analytics**
   - Track open rates
   - Track click rates
   - A/B test templates

5. **Reminder Emails**
   - Quote expiring soon reminders
   - Follow-up after inquiry
   - Booking confirmation reminders

## 🔒 Security Notes

- ✅ API keys are in `.env` (gitignored)
- ✅ Never commit API keys to Git
- ✅ Use different keys for dev/staging/production
- ✅ Rotate keys periodically
- ✅ Monitor Resend dashboard for suspicious activity

---

## Quick Reference

### Environment Variables:
```bash
RESEND_API_KEY=re_xxxxx
ADMIN_EMAIL=admin@company.com
FRONTEND_URL=https://your-domain.com
```

### Test Command:
```bash
curl -X POST http://localhost:10000/api/inquiries \
  -H "Content-Type: application/json" \
  -d '{"inquiry_type": "custom", "customer_name": "Test", "customer_email": "test@test.com"}'
```

### File Locations:
- Email Service: `/backend/services/emailService.js`
- Inquiry Controller: `/backend/controllers/inquiry.controller.js`
- Quote Controller: `/backend/controllers/quote.controller.js`

---

**Last Updated:** November 2025  
**Version:** 1.0.0  
**Status:** ✅ Production Ready
