# Deployment Notes - Vercel Free Plan Optimization

## Issue
Vercel's Hobby (free) plan limits deployments to a maximum of 12 serverless functions. The project was exceeding this limit.

## Solution
Consolidated API endpoints to use query parameters instead of dynamic routes to stay within the 12 function limit.

## Changes Made

### API Consolidation

1. **Removed Dynamic Routes**
   - Deleted `/api/inquiries/[id].js` 
   - Deleted `/api/quotes/inquiry/[inquiryId].js`
   - Deleted `/api/auth/login.js` and `/api/auth/register.js`

2. **Modified `/api/inquiries.js`**
   - Added support for individual inquiry operations using query parameters:
     - `GET /api/inquiries?id=xxx` - Get single inquiry
     - `PUT /api/inquiries?id=xxx` - Update inquiry
     - `DELETE /api/inquiries?id=xxx` - Delete inquiry
   - Existing endpoints still work:
     - `GET /api/inquiries` - List all inquiries (admin)
     - `GET /api/inquiries?endpoint=my` - User's inquiries
     - `GET /api/inquiries?endpoint=stats` - Statistics
     - `POST /api/inquiries` - Create inquiry

3. **Created `/api/quotes.js`**
   - New consolidated quotes API with query parameters:
     - `GET /api/quotes?inquiryId=xxx` - Get quotes for inquiry
     - `GET /api/quotes?id=xxx` - Get single quote
     - `GET /api/quotes` - List all quotes (admin)
     - `POST /api/quotes` - Create quote (admin)
     - `PUT /api/quotes?id=xxx` - Update quote (admin)
     - `DELETE /api/quotes?id=xxx` - Delete quote (admin)

4. **Updated Frontend Components**
   - Modified `/resources/js/Pages/Admin/InquiryDetail.jsx`:
     - Changed `/api/inquiries/${id}` → `/api/inquiries?id=${id}`
     - Changed `/api/quotes/inquiry/${id}` → `/api/quotes?inquiryId=${id}`
   - Modified `/resources/js/Pages/Admin/InquiryList.jsx`:
     - Fixed `.map()` error by properly handling API response structure
     - Added defensive array checks

## Current Serverless Function Count: 11

### API Functions List:
1. `/api/auth.js`
2. `/api/cruises.js`
3. `/api/flights/order-details.js`
4. `/api/flights/order.js`
5. `/api/flights/search.js`
6. `/api/hotels.js`
7. `/api/inquiries/stats.js`
8. `/api/inquiries.js`
9. `/api/payments/payment/process.js`
10. `/api/payments.js`
11. `/api/quotes.js`

✅ **Under the 12 function limit!**

## Deployment Instructions

1. **Commit changes**:
   ```bash
   git add .
   git commit -m "Consolidate API endpoints for Vercel free plan compatibility"
   git push
   ```

2. **Deploy to Vercel**:
   ```bash
   vercel --prod
   ```

   Or if using GitHub integration, Vercel will auto-deploy on push to main branch.

## Testing

After deployment, test the following:

1. **Admin Inquiries List**: `https://www.jetsetterss.com/admin/inquiries`
   - Should display list of inquiries
   - No `.map()` error

2. **View Inquiry Details**: Click "View" button on any inquiry
   - Should fetch inquiry details using `?id=xxx`
   - Should fetch quotes using `?inquiryId=xxx`

3. **Update Inquiry**: Try updating inquiry status/priority
   - Should update using `PUT /api/inquiries?id=xxx`

4. **Quote Button**: Click "Quote" button
   - Should navigate to quote creation page

## Notes

- All authentication and authorization checks remain the same
- Query parameter approach is compatible with Vercel's serverless architecture
- No functionality loss - just different URL structure
- Frontend updated to match new API structure
