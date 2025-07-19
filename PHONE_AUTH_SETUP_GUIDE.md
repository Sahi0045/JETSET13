# Firebase Phone Authentication Setup Guide

## Overview
Phone authentication allows users to sign in using their mobile phone number with OTP (One Time Password) verification. This guide covers the complete setup process for your travel website.

## Features Implemented
- ✅ Phone number input with country code selection
- ✅ reCAPTCHA verification for bot protection
- ✅ OTP sending and verification
- ✅ Resend OTP functionality with timer
- ✅ Integration with existing Firebase auth system
- ✅ Responsive UI matching your design

## Firebase Console Setup

### 1. Enable Phone Authentication
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `jets-1b5fa`
3. Navigate to **Authentication** → **Sign-in method**
4. Click on **Phone** provider
5. Toggle **Enable** and click **Save**

### 2. Configure Authorized Domains
Make sure these domains are added to your Firebase authorized domains:
- `localhost` (for development)
- `prod-pbnfdvvmz-shubhams-projects-4a867368.vercel.app` (current deployment)
- Any other domains you plan to deploy to

### 3. reCAPTCHA Configuration
Phone authentication requires reCAPTCHA verification:
- Firebase automatically handles reCAPTCHA setup
- reCAPTCHA will appear during phone verification
- Test users can be added in Firebase Console for testing without reCAPTCHA

## Testing Phone Authentication

### 1. Test Users (Recommended for Development)
Add test phone numbers in Firebase Console:
1. Go to **Authentication** → **Settings** → **Authorized domains**
2. Scroll down to **Phone numbers for testing**
3. Add test numbers like:
   - Phone: `+91 9876543210`
   - Code: `123456`

### 2. Real Phone Numbers
For production testing:
- Use real phone numbers
- OTP will be sent via SMS
- Standard SMS charges apply

## Code Structure

### Components Added
1. **PhoneLogin.jsx** - Main phone authentication component
2. **Firebase Config Updates** - Added phone auth methods
3. **Context Updates** - Added phone auth to FirebaseAuthContext
4. **Routing** - Added `/phone-login` route
5. **Styling** - Added phone-specific CSS

### Key Functions
```javascript
// Initialize reCAPTCHA
initializeRecaptcha(containerId)

// Send OTP to phone number
sendOTP(phoneNumber)

// Verify OTP and sign in
verifyOTP(verificationId, otp)

// Clear reCAPTCHA
clearRecaptcha()
```

## Usage Flow

### 1. Phone Number Entry
- User selects country code (+91, +1, +44, etc.)
- Enters 10-digit mobile number
- reCAPTCHA verification appears
- Clicks "Send OTP"

### 2. OTP Verification
- User receives SMS with 6-digit OTP
- Enters OTP in the verification screen
- System verifies OTP with Firebase
- User is logged in on successful verification

### 3. Alternative Options
- Users can switch to email/password login
- Option to change phone number
- Resend OTP with 60-second timer

## Error Handling

### Common Errors and Solutions

#### 1. `auth/invalid-phone-number`
- **Cause**: Invalid phone number format
- **Solution**: Ensure number includes country code (e.g., +919876543210)

#### 2. `auth/quota-exceeded`
- **Cause**: SMS quota exceeded
- **Solution**: Wait or upgrade Firebase plan

#### 3. `auth/invalid-verification-code`
- **Cause**: Wrong or expired OTP
- **Solution**: Request new OTP or check code

#### 4. `auth/captcha-check-failed`
- **Cause**: reCAPTCHA verification failed
- **Solution**: Refresh page and try again

## Security Features

### 1. reCAPTCHA Protection
- Prevents automated bot attacks
- Required for all phone authentication requests
- Automatically handled by Firebase

### 2. OTP Expiration
- OTP codes expire after 5 minutes
- Users must request new OTP if expired

### 3. Rate Limiting
- Firebase implements automatic rate limiting
- Prevents SMS spam and abuse

## URLs and Routes

### New Routes Added
- `/phone-login` - Phone authentication page
- Integrated with existing auth system

### Navigation
- Accessible from main login page
- Users can switch between auth methods
- Redirects to `/my-trips` after successful login

## Production Deployment

### Environment Variables
No additional environment variables needed - uses existing Firebase config:
```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
```

### Domain Authorization
Ensure your production domain is added to:
1. Firebase Console → Authentication → Settings → Authorized domains
2. Google Cloud Console → Credentials (if using other Google services)

## Testing Checklist

### Before Production
- [ ] Test with test phone numbers
- [ ] Verify OTP delivery
- [ ] Test resend functionality
- [ ] Check error handling
- [ ] Test on mobile devices
- [ ] Verify reCAPTCHA works
- [ ] Test country code selection
- [ ] Check navigation flow

### Production Testing
- [ ] Test with real phone numbers
- [ ] Verify SMS delivery in your region
- [ ] Check international phone support
- [ ] Monitor Firebase usage and quotas

## Support and Troubleshooting

### Firebase Console Monitoring
- Check Authentication logs for errors
- Monitor SMS usage and quotas
- Review security events

### Common Issues
1. **SMS not received**: Check phone number format and Firebase quotas
2. **reCAPTCHA issues**: Ensure domain is authorized
3. **OTP expired**: Implement proper error handling for expired codes

## Cost Considerations

### Firebase Pricing
- Phone authentication uses Firebase Authentication
- SMS costs apply based on your Firebase plan
- Free tier includes limited SMS quota
- Production apps should consider Blaze plan

### SMS Costs
- Varies by country/region
- Check Firebase pricing page for current rates
- Monitor usage in Firebase Console

## Next Steps

1. **Test thoroughly** with test phone numbers
2. **Add production domains** to Firebase Console
3. **Monitor usage** and costs in Firebase Console
4. **Consider adding** phone number verification for profile updates
5. **Implement** phone number linking for existing email users

For technical issues, refer to [Firebase Documentation](https://firebase.google.com/docs/auth/web/phone-auth) or contact support. 