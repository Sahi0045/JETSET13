# Complete Workflow Guide - JET SETTERS Travel Management System

## 🔄 End-to-End Booking Workflow

This document outlines the complete professional workflow from customer inquiry to confirmed booking.

---

## 📋 **Workflow Overview**

```
Customer Submits Inquiry 
    ↓
Admin Receives Notification
    ↓
Admin Reviews & Creates Quote
    ↓
Customer Receives Quote Email
    ↓
Customer Reviews Quote in My Trips
    ↓
Customer Accepts Quote & Pays via ARC Gateway
    ↓
Payment Confirmed & Booking Created
    ↓
Booking Appears in My Trips
```

---

## 1️⃣ **Customer Inquiry Submission**

### Access Point
- URL: `http://localhost:5173/request`
- No authentication required

### Process
1. Customer selects inquiry type:
   - ✈️ Flight Bookings
   - 🏨 Hotel Stays
   - 🚢 Cruise Vacations
   - 🎒 Travel Packages
   - 💬 General Inquiries

2. Customer fills inquiry form with:
   - Personal details (name, email, phone)
   - Travel preferences
   - Special requirements
   - Budget range

3. System Actions:
   - Saves inquiry to `inquiries` table
   - Sends confirmation email to customer
   - Sends notification email to admin
   - Sets status to `pending`

---

## 2️⃣ **Admin Processing**

### Admin Login
- URL: `http://localhost:5173/admin/login`
- Credentials:
  ```
  Email: sahi0045@hotmail.com
  Password: Sahi@0045
  ```

### Admin Dashboard
- URL: `http://localhost:5173/admin`
- Features:
  - View all inquiries
  - Filter by status, type, priority
  - Search inquiries
  - Quick stats overview

### Inquiry Management
1. **View Inquiry Details**
   - URL: `/admin/inquiries/{inquiry_id}`
   - See complete customer information
   - View travel requirements
   - Check inquiry history

2. **Update Inquiry Status**
   - Status options:
     - `pending` - New inquiry
     - `processing` - Being worked on
     - `quoted` - Quote sent
     - `booked` - Converted to booking
     - `cancelled` - Customer cancelled
     - `expired` - Quote expired

3. **Set Priority**
   - `low`, `normal`, `high`, `urgent`

4. **Add Internal Notes**
   - Track communication
   - Document requirements

---

## 3️⃣ **Quote Creation**

### Create Quote
- URL: `/admin/inquiries/{inquiry_id}/quote`

### Quote Components

1. **Basic Information**
   - Title (auto-generated based on inquiry type)
   - Description
   - Total Amount
   - Currency (USD, EUR, GBP, INR)
   - Validity Days (default: 30)

2. **Cost Breakdown** (Optional but recommended)
   - Flight Tickets: $X
   - Hotel Accommodation: $X
   - Tours & Activities: $X
   - Insurance: $X
   - Service Fee: $X

3. **Terms & Conditions**
   - Payment terms
   - Cancellation policy
   - Inclusions/Exclusions
   - Important notes

### Quote Actions

1. **Save as Draft**
   - Saves quote without sending
   - Can be edited later
   - Status: `draft`

2. **Create & Send to Customer**
   - Creates quote
   - Sets status to `sent`
   - Sends email to customer with:
     - Quote details
     - Payment link
     - Expiration date
   - Updates inquiry status to `quoted`

---

## 4️⃣ **Customer Quote Review**

### Customer Access
- URL: `http://localhost:5173/my-trips`
- Authentication: Required (user login)

### Quote Viewing
Customer can see:
- Quote number
- Total amount
- Breakdown of costs
- Terms & conditions
- Expiration date
- Payment link

### Quote Actions
1. **Accept Quote**
   - Proceeds to payment
   - Quote status → `accepted`

2. **Decline Quote**
   - Quote status → `rejected`
   - Inquiry can be re-quoted

---

## 5️⃣ **Payment Processing**

### ARC Payment Gateway Integration

#### Payment Link Generation
```javascript
{
  quote_id: "uuid",
  amount: 1500.00,
  currency: "USD",
  customer_email: "customer@email.com",
  customer_name: "John Doe",
  return_url: "http://localhost:5173/payment/success",
  cancel_url: "http://localhost:5173/payment/cancel"
}
```

#### Payment Flow
1. Customer clicks "Pay Now"
2. Redirects to ARC Payment Gateway
3. Customer enters payment details
4. Payment processed securely
5. Redirect back to application

#### Payment Webhook
```javascript
POST /api/webhooks/arc-payment
{
  quote_id: "uuid",
  transaction_id: "ARC_TXN_12345",
  status: "success",
  amount: 1500.00,
  payment_method: "card",
  timestamp: "2024-01-01T12:00:00Z"
}
```

#### Post-Payment Actions
- Update quote status to `paid`
- Create booking record
- Update inquiry status to `booked`
- Send confirmation email to customer
- Send notification to admin

---

## 6️⃣ **Booking Confirmation**

### Booking Record Creation
```sql
INSERT INTO bookings (
  quote_id,
  inquiry_id,
  customer_id,
  booking_reference,
  total_amount,
  payment_status,
  payment_transaction_id,
  status,
  booking_date
) VALUES (...)
```

### Confirmation Email
Sent to customer with:
- Booking reference number
- Itinerary details
- Payment receipt
- Contact information
- Next steps

---

## 7️⃣ **My Trips Page**

### Customer Dashboard
- URL: `http://localhost:5173/my-trips`

### Features
1. **View All Bookings**
   - Upcoming trips
   - Past trips
   - Cancelled bookings

2. **Booking Details**
   - Booking reference
   - Travel dates
   - Payment status
   - Itinerary
   - Documents

3. **Manage Booking**
   - Download e-tickets
   - Modify booking (if allowed)
   - Cancel booking
   - Contact support

---

## 📊 **Database Schema**

### Key Tables

```sql
-- Inquiries (Customer Requests)
inquiries
├── id (UUID, PK)
├── inquiry_type (TEXT)
├── customer_name (TEXT)
├── customer_email (TEXT)
├── status (TEXT)
└── [type-specific fields]

-- Quotes (Admin Created)
quotes
├── id (UUID, PK)
├── inquiry_id (UUID, FK)
├── quote_number (TEXT)
├── total_amount (DECIMAL)
├── status (TEXT)
├── payment_link (TEXT)
└── expires_at (TIMESTAMP)

-- Bookings (Confirmed Trips)
bookings
├── id (UUID, PK)
├── quote_id (UUID, FK)
├── booking_reference (TEXT)
├── payment_status (TEXT)
├── payment_transaction_id (TEXT)
└── status (TEXT)

-- Email Notifications
email_notifications
├── id (UUID, PK)
├── inquiry_id (UUID, FK)
├── quote_id (UUID, FK)
├── notification_type (TEXT)
└── status (TEXT)
```

---

## 🔐 **Authentication & Authorization**

### User Roles

1. **Customer**
   - Submit inquiries
   - View own quotes
   - Make payments
   - View own bookings

2. **Admin**
   - View all inquiries
   - Create/send quotes
   - Manage bookings
   - Access admin panel

---

## 📧 **Email Notifications**

### Automated Emails

1. **Inquiry Received** (Customer)
   - Confirmation of submission
   - Expected response time
   - Inquiry reference number

2. **New Inquiry Alert** (Admin)
   - Customer details
   - Inquiry type
   - Priority level

3. **Quote Sent** (Customer)
   - Quote details
   - Payment link
   - Expiration date

4. **Quote Accepted** (Admin)
   - Customer accepted quote
   - Payment pending notification

5. **Payment Received** (Customer & Admin)
   - Payment confirmation
   - Booking reference
   - Next steps

6. **Quote Expiring** (Customer)
   - 3 days before expiration
   - Option to extend

7. **Quote Expired** (Customer & Admin)
   - Quote expired notification
   - Option to request new quote

---

## 🛠️ **API Endpoints**

### Customer Endpoints
```
POST   /api/inquiries              Create inquiry
GET    /api/inquiries/my           Get user's inquiries
GET    /api/quotes/inquiry/:id     Get quotes for inquiry
PUT    /api/quotes/:id/accept      Accept quote
```

### Admin Endpoints
```
GET    /api/inquiries              Get all inquiries
GET    /api/inquiries/:id          Get inquiry details
PUT    /api/inquiries/:id          Update inquiry
POST   /api/quotes                 Create quote
PUT    /api/quotes/:id/send        Send quote to customer
GET    /api/quotes                 Get all quotes
```

### Payment Endpoints
```
POST   /api/payments/arc/initiate  Initiate payment
POST   /api/webhooks/arc-payment   Payment webhook
GET    /api/payments/:id/status    Check payment status
```

---

## 🚀 **Deployment Checklist**

### 1. Database Setup
- [ ] Run `inquiry-system-schema.sql`
- [ ] Run `init-feature-flags.sql`
- [ ] Run `create-admin-user.sql`
- [ ] Verify RLS policies

### 2. Environment Variables
```env
# Database
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# Email
RESEND_API_KEY=re_4tfvwTmv_9kPKorQAcpZmZcZ4i744cC1Q
ADMIN_EMAIL=sahi0045@hotmail.com

# Payment Gateway
ARC_PAYMENT_API_KEY=your_arc_key
ARC_PAYMENT_SECRET=your_arc_secret
ARC_WEBHOOK_SECRET=your_webhook_secret

# Frontend
FRONTEND_URL=http://localhost:5173
```

### 3. Start Application
```bash
npm run dev
```

### 4. Test Workflow
- [ ] Submit inquiry
- [ ] Login as admin
- [ ] Create quote
- [ ] Send quote
- [ ] Accept quote (as customer)
- [ ] Process payment
- [ ] Verify booking

---

## 📞 **Support & Troubleshooting**

### Common Issues

1. **Inquiry not saving**
   - Check database connection
   - Verify RLS policies
   - Check console for errors

2. **Email not sending**
   - Verify Resend API key
   - Check email service logs
   - Confirm recipient email

3. **Payment failing**
   - Verify ARC credentials
   - Check webhook configuration
   - Review payment logs

4. **Quote not appearing**
   - Check quote status
   - Verify inquiry association
   - Refresh My Trips page

---

## 🎯 **Best Practices**

1. **Quote Management**
   - Always include detailed breakdown
   - Set reasonable validity periods
   - Include clear terms & conditions

2. **Customer Communication**
   - Respond to inquiries within 24 hours
   - Keep customers updated on status
   - Follow up on pending quotes

3. **Payment Handling**
   - Verify payment before confirming booking
   - Keep transaction records
   - Handle failed payments gracefully

4. **Data Management**
   - Regular database backups
   - Archive old inquiries
   - Monitor quote expiration

---

## 📈 **Future Enhancements**

- [ ] Automated quote generation based on templates
- [ ] Multi-currency support
- [ ] Quote comparison for customers
- [ ] Payment installment plans
- [ ] Mobile app integration
- [ ] Real-time chat support
- [ ] Loyalty points system
- [ ] Travel insurance integration

---

**Last Updated:** November 6, 2024
**Version:** 1.0.0
**Contact:** sahi0045@hotmail.com
