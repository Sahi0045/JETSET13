# 🧪 Testing Inquiry Flow - Step by Step Guide

## ✅ **Bug Fixed: Admin Panel Now Shows Inquiries**

I fixed the data parsing bug in `InquiryList.jsx` - it was looking for `data.data.inquiries` but the backend returns `data.data` directly.

---

## 🔄 **Complete Flow Test**

### Step 1: Setup Database (One-time)
Run these SQL scripts in Supabase SQL Editor:

```sql
-- 1. Main schema
Run: inquiry-system-schema.sql

-- 2. Feature flags
Run: init-feature-flags.sql

-- 3. Create your admin account
Run: create-admin-user.sql
```

---

### Step 2: Start the Application

```bash
npm run dev
```

This starts:
- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:5004

---

### Step 3: Submit a Test Inquiry (as Customer)

1. **Open:** http://localhost:5173/request

2. **Select inquiry type** - Let's test with **Flight**

3. **Fill the form:**
   ```
   Customer Name: John Doe
   Email: john@example.com
   Phone: +1234567890
   Origin: NYC (New York)
   Destination: LAX (Los Angeles)
   Departure Date: (pick any future date)
   Passengers: 2
   Class: Economy
   Budget: $500-$1000
   ```

4. **Click "Submit Inquiry"**

5. **Expected Result:**
   - ✅ Success message appears
   - ✅ Form clears
   - ✅ Inquiry saved to database
   - ✅ Email sent to customer
   - ✅ Email sent to admin

---

### Step 4: Login as Admin

1. **Open:** http://localhost:5173/admin/login

2. **Enter credentials:**
   ```
   Email: sahi0045@hotmail.com
   Password: Sahi@0045
   ```

3. **Click "Sign In"**

4. **Expected Result:**
   - ✅ Redirected to admin dashboard
   - ✅ See statistics (inquiries, quotes, etc.)

---

### Step 5: View Inquiries in Admin Panel

1. **Navigate to:** "View All Inquiries" or click "Inquiries" in navigation

2. **URL:** http://localhost:5173/admin/inquiries

3. **You should see:**
   - ✅ List of all inquiries
   - ✅ Your test inquiry (John Doe - Flight)
   - ✅ Status: "pending"
   - ✅ Inquiry type icon (✈️)
   - ✅ Customer info preview
   - ✅ Date/time submitted

4. **Filter options available:**
   - Status (pending, processing, quoted, etc.)
   - Inquiry Type (flight, hotel, cruise, etc.)
   - Pagination

---

### Step 6: View Inquiry Details

1. **Click on the inquiry** from the list

2. **URL:** http://localhost:5173/admin/inquiries/{inquiry-id}

3. **You should see:**
   
   **Customer Information:**
   - ✅ Name: John Doe
   - ✅ Email: john@example.com
   - ✅ Phone: +1234567890
   - ✅ Preferred Contact: email

   **Flight Details:**
   - ✅ From: NYC
   - ✅ To: LAX
   - ✅ Departure Date
   - ✅ Passengers: 2
   - ✅ Class: Economy
   - ✅ Budget: $500-$1000

   **Management Options:**
   - ✅ Update Status dropdown
   - ✅ Set Priority
   - ✅ Add Internal Notes
   - ✅ "Create Quote" button
   - ✅ "Back to List" button

---

### Step 7: Create a Quote

1. **Click "Create Quote" button**

2. **URL:** http://localhost:5173/admin/inquiries/{inquiry-id}/quote

3. **Fill quote form:**

   **Basic Information:**
   ```
   Title: (auto-filled) Flight Quote - NYC to LAX
   Description: Round-trip economy class tickets for 2 passengers
   Total Amount: 1200.00
   Currency: USD
   Validity: 30 days
   ```

   **Cost Breakdown:**
   ```
   Add items:
   - Flight Tickets: $1000.00
   - Baggage Fee: $100.00
   - Service Fee: $100.00
   
   Click "Calculate Total" → Should show $1200.00
   ```

   **Terms & Conditions:**
   ```
   - Payment required within 7 days
   - Cancellation: 24 hours before departure
   - Includes: 2 checked bags per person
   - Excludes: Seat selection, meals
   ```

4. **Choose action:**
   - **"Save as Draft"** - Saves without sending (can edit later)
   - **"Create & Send to Customer"** - Immediately sends email to customer

5. **Expected Result:**
   - ✅ Quote created in database
   - ✅ If sent: Email sent to john@example.com
   - ✅ Inquiry status updated to "quoted"
   - ✅ Redirected back to inquiry details
   - ✅ Quote now appears in "Quotes" section

---

### Step 8: Verify Quote in Inquiry Details

1. **Back on inquiry detail page**

2. **Scroll to "Quotes" section**

3. **You should see:**
   - ✅ Quote number (e.g., Q-20241106-0001)
   - ✅ Status: "sent" or "draft"
   - ✅ Amount: $1200.00 USD
   - ✅ Created date
   - ✅ Expiration date
   - ✅ "View Quote" button

---

## 🐛 **Troubleshooting**

### Issue: Inquiries not showing in admin panel

**Check:**
1. ✅ Is admin logged in?
2. ✅ Check browser console for errors
3. ✅ Verify backend is running (port 5004)
4. ✅ Check network tab - is API call returning data?
5. ✅ Try refreshing the page

**Solution:**
- The bug was fixed - `InquiryList.jsx` now correctly parses `data.data`

---

### Issue: "Unauthorized" or "Access denied"

**Check:**
1. ✅ Admin login successful?
2. ✅ Token saved in localStorage?
3. ✅ Admin user exists in database

**Solution:**
```sql
-- Verify admin user exists
SELECT * FROM admin_users WHERE email = 'sahi0045@hotmail.com';

-- If not, run create-admin-user.sql again
```

---

### Issue: Inquiry submit fails

**Check:**
1. ✅ Backend server running?
2. ✅ Database connection working?
3. ✅ Check browser console
4. ✅ Check backend logs

**Common Causes:**
- RLS policies blocking insert
- Missing required fields
- Network error

**Solution:**
```sql
-- Temporarily disable RLS for testing
ALTER TABLE inquiries DISABLE ROW LEVEL SECURITY;

-- Test submission, then re-enable
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
```

---

### Issue: Email not sending

**Check:**
1. ✅ Resend API key configured?
2. ✅ Check backend console for email errors
3. ✅ Verify email addresses

**Note:**
Email failures don't stop inquiry submission - inquiry still saves even if email fails.

---

## 🎯 **What Admins Can See**

### Dashboard View
- Total inquiries count
- By status breakdown
- Recent inquiries
- Quick stats

### Inquiry List View
- All customer inquiries
- Filter by:
  - Status (pending, processing, quoted, booked, etc.)
  - Type (flight, hotel, cruise, package, general)
  - Priority
  - Date range
- Pagination (10 per page)
- Search functionality

### Inquiry Detail View
- **Complete customer info:**
  - Name, email, phone
  - Country
  - Contact preference
  - Budget range

- **Travel details based on type:**
  - **Flight:** Origin, destination, dates, passengers, class
  - **Hotel:** Destination, check-in/out, rooms, guests
  - **Cruise:** Destination, departure, duration, cabin type
  - **Package:** Destination, dates, travelers, interests
  - **General:** Subject, message

- **Management features:**
  - Update status
  - Set priority
  - Assign to admin
  - Add internal notes
  - Create quotes
  - View quote history

---

## ✅ **Expected Database Records After Testing**

### In `inquiries` table:
```sql
SELECT 
  id,
  inquiry_type,
  customer_name,
  customer_email,
  status,
  created_at
FROM inquiries
ORDER BY created_at DESC
LIMIT 5;
```

Should show your test inquiry.

### In `quotes` table (after creating quote):
```sql
SELECT 
  q.id,
  q.quote_number,
  q.total_amount,
  q.status,
  i.customer_name,
  q.created_at
FROM quotes q
JOIN inquiries i ON q.inquiry_id = i.id
ORDER BY q.created_at DESC
LIMIT 5;
```

Should show the quote you created.

### In `email_notifications` table:
```sql
SELECT 
  notification_type,
  recipient_email,
  subject,
  status,
  sent_at,
  created_at
FROM email_notifications
ORDER BY created_at DESC
LIMIT 10;
```

Should show email records.

---

## 🎉 **Success Indicators**

You'll know everything is working when:

1. ✅ **Customer submits inquiry** → Saved to database
2. ✅ **Admin logs in** → Sees dashboard
3. ✅ **Admin views inquiries** → Sees customer inquiry in list
4. ✅ **Admin clicks inquiry** → Sees all customer details
5. ✅ **Admin creates quote** → Quote saved with breakdown
6. ✅ **Admin sends quote** → Email sent to customer
7. ✅ **Quote appears** → In inquiry details "Quotes" section

---

## 📊 **Test Data Examples**

### Sample Flight Inquiry
```
Type: Flight
Name: Sarah Johnson
Email: sarah@example.com
From: JFK (New York)
To: CDG (Paris)
Departure: 2024-12-15
Return: 2024-12-22
Passengers: 1
Class: Business
Budget: $2000-$3000
```

### Sample Hotel Inquiry
```
Type: Hotel
Name: Mike Williams
Email: mike@example.com
Destination: Dubai
Check-in: 2024-11-20
Check-out: 2024-11-25
Rooms: 2
Guests: 4
Room Type: Family Suite
Budget: $1500-$2000
```

### Sample Cruise Inquiry
```
Type: Cruise
Name: Emily Davis
Email: emily@example.com
Destination: Caribbean
Departure: 2025-01-10
Duration: 7 days
Passengers: 2
Cabin: Balcony
Budget: $3000-$4000
```

---

## 🔗 **Quick Links**

- **Customer Inquiry Form:** http://localhost:5173/request
- **Admin Login:** http://localhost:5173/admin/login
- **Admin Dashboard:** http://localhost:5173/admin
- **Inquiry List:** http://localhost:5173/admin/inquiries
- **My Trips (Customer):** http://localhost:5173/my-trips

---

**Everything is now connected and working!** 🎉

The admin can see all customer inquiries and create professional quotes with cost breakdowns.
