# ARC Pay API Test Results

## Test Summary

**Date**: $(date)
**Status**: ⚠️ Authentication Issues Detected

### ✅ Passed Tests (2/5)
1. **Environment Variables Check** - All required variables are set correctly
2. **Gateway Status Check** - ARC Pay gateway is operational (version 25.8.1.1-4R)

### ❌ Failed Tests (3/5)
1. **Authentication Test** - Invalid request format
2. **Payment Session Creation (Axios)** - All authentication formats failed
3. **Payment Session Creation (Fetch)** - All authentication formats failed

## Authentication Attempts

The test tried the following authentication formats, all of which failed:

1. `Developer:Jetsetters@2026` (Username:Password)
2. `TESTARC05511704:Jetsetters@2026` (MerchantID:Password)
3. `merchant.TESTARC05511704:Jetsetters@2026` (merchant.MerchantID:Password)
4. `TESTARC05511704:e1c1f80f6e8dcc3c3d0b28c3f4fcbae3` (MerchantID:ReportingPassword1)
5. `TESTARC05511704:575a62ce17983304ae468a943d57ca1d` (MerchantID:ReportingPassword2)
6. `Developer:e1c1f80f6e8dcc3c3d0b28c3f4fcbae3` (Username:ReportingPassword1)
7. `Developer:575a62ce17983304ae468a943d57ca1d` (Username:ReportingPassword2)

**Error Response**: `{"error":{"cause":"INVALID_REQUEST","explanation":"Invalid credentials."},"result":"ERROR"}`

## Issue Analysis

The credentials provided (`Developer:Jetsetters@2026`) appear to be **portal login credentials**, not API credentials. ARC Pay typically uses separate credentials for:
- **Portal Access**: Username/Password for web interface
- **API Access**: Different credentials for REST API calls

## Next Steps

### 1. Verify API Credentials in ARC Pay Portal

Log into the ARC Pay Merchant Portal (https://api.arcpay.travel/ma/) and check:

1. **Go to**: Admin → Reporting API Integration Settings
2. **Check**: API Integration Authentication section
3. **Look for**: 
   - API Username (may be different from portal username)
   - API Password (separate from portal password)
   - API Key or Token (if applicable)

### 2. Check API Configuration

In the ARC Pay portal, verify:
- ✅ API Integration is enabled
- ✅ REST API access is activated
- ✅ Payment API permissions are granted
- ✅ API version 100 is supported for your merchant account

### 3. Contact ARC Pay Support

If API credentials are not visible in the portal, contact ARC Pay support:
- **Phone**: 703-816-8003
- **Email**: ccchelp@arccorp.com
- **Request**: API credentials for REST API integration (version 100)

### 4. Alternative: Check Documentation

Review ARC Pay API documentation for:
- Correct authentication method
- Required headers
- API endpoint format
- Credential format requirements

## Current Configuration

```env
ARC_PAY_MERCHANT_ID=TESTARC05511704
ARC_PAY_API_USERNAME=Developer
ARC_PAY_API_PASSWORD=Jetsetters@2026
ARC_PAY_BASE_URL=https://api.arcpay.travel/api/rest/version/100
ARC_PAY_PORTAL_URL=https://api.arcpay.travel/ma/
```

## Test File

The comprehensive test file is available at: `test-arc-pay-credentials.js`

Run it again after updating credentials:
```bash
node test-arc-pay-credentials.js
```

## Notes

- Gateway is operational and reachable
- Environment variables are correctly configured
- The issue is specifically with API authentication credentials
- Portal credentials (`Developer:Jetsetters@2026`) work for portal login but not for API calls
- Reporting API passwords are for reporting endpoints, not payment processing

