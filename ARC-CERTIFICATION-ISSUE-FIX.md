# ARC Pay Certification Issue - Fix Guide

## 🔴 The Problem

ARC Pay is seeing **incomplete Authentication (3DS) transactions** in your sandbox:
- Status: "Authentication Initiated" (not completed)
- Status: "Authentication Unsuccessful" (failed)

**This is blocking certification** because ARC Pay needs to see **successfully completed** transactions for all features you plan to use.

---

## ✅ What ARC Pay Needs

From the email, you need to successfully test:

### Standard Features (Required):
1. ✅ **Payment (Pay or Authorization)** - You have this working
2. ❌ **Authentication (3DS)** - **THIS IS THE ISSUE** - Not completing
3. ⏳ **Refunds** - Need to test after payment
4. ⏳ **Voids** - Need to test after authorization
5. ⏳ **Capture** - Need to test after authorization
6. ✅ **Retrieve** - Should work (just query transaction)

---

## 🔧 How to Fix

### Step 1: Complete 3DS Authentication Successfully

The main issue is that 3DS transactions are not completing. Here's how to fix it:

#### Option A: Use the Test Script

```bash
node complete-arc-certification-tests.js
```

This will:
1. Create a payment session
2. Give you the exact URL and form data to POST
3. Provide test card details
4. Guide you through completing 3DS

#### Option B: Manual 3DS Completion

1. **Create a payment session** (use your existing code or the test script)

2. **POST to ARC Pay payment page:**
   ```
   URL: https://api.arcpay.travel/api/page/version/100/pay?charset=UTF-8
   Method: POST
   Form Data:
     session.id = <your_session_id>
   ```

3. **Use a 3DS test card:**
   - **Card Number:** `5123456789012346` (Mastercard with 3DS)
   - **Expiry:** `12/2025`
   - **CVV:** `123`
   - **Name:** Any name

4. **Complete 3DS Challenge:**
   - When the 3DS popup/iframe appears
   - Enter OTP: `123456` (or any 6 digits in test)
   - Click "Submit" or "Authenticate"
   - **CRITICAL:** Wait for the redirect back to your return URL

5. **Verify Success:**
   - Check ARC Pay dashboard - transaction should show "Authentication Successful"
   - Status should be "Completed" not "Authentication Initiated"

---

### Step 2: Test All Required Transaction Types

Run these tests in order:

#### Test Sequence:

1. **Payment with 3DS** ✅ (Fix this first)
   ```bash
   node complete-arc-certification-tests.js
   # Follow instructions to complete 3DS manually
   ```

2. **Simple Payment** (No 3DS)
   - Use card: `5123456789012345`
   - Should complete without 3DS challenge

3. **Authorization** (Authorize only)
   - Change operation to `AUTHORIZE` instead of `PURCHASE`
   - Complete payment
   - Note: Transaction will be "Authorized" not "Captured"

4. **Capture** (Capture authorization)
   - Use the authorization transaction ID from step 3
   - Call capture API
   - Transaction becomes "Captured"

5. **Retrieve** (Get transaction details)
   - Use any completed transaction
   - Call retrieve API
   - Verify you get transaction details

6. **Refund** (Refund a payment)
   - Use a completed payment transaction
   - Call refund API
   - Transaction becomes "Refunded"

7. **Void** (Cancel authorization)
   - Use an authorized (not captured) transaction
   - Call void API
   - Transaction becomes "Voided"

---

## 📋 Test Card Numbers

### For 3DS Testing (CRITICAL):
```
Mastercard 3DS: 5123456789012346
Expiry: 12/2025
CVV: 123
OTP: 123456 (or any 6 digits in test)
```

### For Non-3DS Testing:
```
Mastercard: 5123456789012345
Visa: 4111111111111111
Expiry: 12/2025
CVV: 123
```

---

## 🎯 Quick Fix Steps

### Immediate Action (Do This Now):

1. **Run the test script:**
   ```bash
   cd /media/OS/for\ linux\ work/JETSET13
   node complete-arc-certification-tests.js
   ```

2. **Complete at least ONE successful 3DS transaction:**
   - Follow the script instructions
   - Use the provided test card
   - Complete the 3DS challenge
   - Verify it shows "Authentication Successful" in ARC Pay dashboard

3. **Test Refund:**
   - After successful payment, note the Order ID and Transaction ID
   - Run: `testRefund(transactionId, orderId, '100.00')`

4. **Test Authorization + Capture:**
   - Create authorization (operation: 'AUTHORIZE')
   - Complete payment
   - Capture the authorization
   - Optionally void instead of capture

5. **Email ARC Pay:**
   ```
   Subject: Certification Testing Complete - All Transactions Successful
   
   Hi Bruce,
   
   I have successfully completed testing for all required transaction types:
   
   ✅ Payment with 3DS Authentication - Completed successfully
   ✅ Payment (Simple) - Completed successfully  
   ✅ Authorization - Completed successfully
   ✅ Capture - Completed successfully
   ✅ Refund - Completed successfully
   ✅ Void - Completed successfully
   ✅ Retrieve - Completed successfully
   
   All transactions are now showing as "Completed" or "Successful" in the sandbox.
   Please review and let me know when we can proceed with certification.
   
   Thanks,
   Akant
   ```

---

## 🔍 Verify in ARC Pay Dashboard

After completing tests, check ARC Pay dashboard:

1. **Login:** https://api.arcpay.travel/ma/
2. **Go to:** Transactions
3. **Verify:**
   - ✅ Status shows "Completed" (not "Authentication Initiated")
   - ✅ Authentication shows "Successful" (not "Unsuccessful")
   - ✅ All transaction types are present

---

## 🚨 Common Issues & Solutions

### Issue 1: 3DS Challenge Not Appearing
**Solution:** 
- Make sure you're using a 3DS-enabled test card: `5123456789012346`
- Check browser console for CSP errors (we fixed this)
- Try different browser or incognito mode

### Issue 2: 3DS Challenge Appears But Fails
**Solution:**
- Enter OTP: `123456` (test environment accepts any 6 digits)
- Make sure you complete the challenge, don't close the popup
- Wait for redirect back to your return URL

### Issue 3: Transaction Stuck at "Authentication Initiated"
**Solution:**
- This means 3DS was started but not completed
- You need to complete a NEW transaction and finish 3DS properly
- Old incomplete transactions can't be fixed, create new ones

### Issue 4: Can't Find Transaction IDs
**Solution:**
- Check ARC Pay dashboard for Order IDs
- Transaction ID is usually `1` for first transaction in an order
- Use retrieve API to get transaction details

---

## 📞 Next Steps

1. ✅ Complete at least 1 successful 3DS transaction
2. ✅ Test all required transaction types
3. ✅ Verify all show "Completed" in dashboard
4. ✅ Email ARC Pay with confirmation
5. ✅ Schedule certification call

---

## 📝 Testing Checklist

Before emailing ARC Pay, verify:

- [ ] At least 1 Payment with 3DS = "Authentication Successful"
- [ ] At least 1 Payment (Simple) = "Completed"
- [ ] At least 1 Authorization = "Authorized"
- [ ] At least 1 Capture = "Captured"
- [ ] At least 1 Refund = "Refunded"
- [ ] At least 1 Void = "Voided"
- [ ] Retrieve works for all transaction types
- [ ] All transactions show in ARC Pay dashboard as "Completed"

---

**Once all checkboxes are complete, email ARC Pay and request certification!**


