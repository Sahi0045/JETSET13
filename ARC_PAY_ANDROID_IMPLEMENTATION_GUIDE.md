# ARC Pay Android Implementation Guide (FIXED)

## 📋 Table of Contents
1. [Overview](#overview)
2. [Architecture & Integration Model](#architecture--integration-model)
3. [Environment Setup](#environment-setup)
4. [Request / My Trips Flows](#request--my-trips-flows)
5. [Payment Flow Implementation](#payment-flow-implementation)
6. [3DS Authentication Handling](#3ds-authentication-handling)
7. [Code Implementation](#code-implementation)
8. [Test Cards & Scenarios](#test-cards--scenarios)
9. [Error Handling](#error-handling)
10. [Mobile-Specific Considerations](#mobile-specific-considerations)
11. [Testing Checklist](#testing-checklist)

---

## 🎯 Overview

This guide provides complete implementation instructions for integrating **ARC Pay Payment Gateway** into the **Jetsetterss Android App** built with **React Native** and **Expo**.

### Key Features
- ✅ **Hosted Checkout Integration**: Secure payment processing via ARC Pay's hosted payment page
- ✅ **3DS Authentication**: Full support for EMV 3DS2 (frictionless and challenge flows)
- ✅ **Mobile-Optimized**: WebView handling for payment pages and deep linking for callbacks
- ✅ **Shared Backend**: Uses same API endpoints as web platform
- ✅ **Real-time Status**: Payment status synchronization with Supabase

### Payment Gateway Details
- **Gateway**: ARC Pay (Mastercard Payment Gateway Services)
- **Merchant ID (test)**: `TESTARC05511704`
- **Gateway API Base URL (backend)**: `https://na.gateway.mastercard.com/api/rest/version/100`
- **Merchant API URL (backend)**: `https://na.gateway.mastercard.com/api/rest/version/100/merchant/TESTARC05511704`
- **Hosted Checkout Payment URL (front-end / app)**: `https://na.gateway.mastercard.com/checkout/pay/{sessionId}`
- **API Version**: `100`
- **Integration Model**: Hosted Checkout (ARC Pay hosts card form + 3DS)

> **Important 3DS Note**  
> For Hosted Checkout, 3DS behavior (frictionless vs challenge, mandatory/optional) is controlled by **ARC Pay merchant profile configuration**, **not** by adding a `3DSecure` block to `INITIATE_CHECKOUT`.  
> The Android app only opens the Hosted Checkout URL in WebView; all 3DS logic happens inside ARC Pay pages.

---

## 📄 Request / My Trips Flows

These sections describe how the Android app mirrors the existing web flows for:
- **Request form**: `https://www.jetsetterss.com/request`
- **My Trips / My Requests**: `https://www.jetsetterss.com/my-trips`

### 1. New Request (Inquiry) Flow – `/request`

#### 1.1 Screen: NewRequestScreen

**Purpose**: Let the user submit a new travel request (inquiry) with the same fields and behavior as the web `/request` page.

**Key elements:**
- Trip type (flight / hotel / cruise / package / custom)
- From / To / Destination fields
- Dates (departure / return or start / end)
- Passenger details (adults, children, infants)
- Budget / class / room type (depending on trip type)
- Free-text notes / special requirements
- Contact info (prefill from logged-in user: name, email, phone)

**Submit behavior (Android):**
- On submit, call the **same backend endpoint** used by the web request form (e.g. `POST /api/inquiries` or `POST /api/requests`).
- The body should be identical (field names and structure) to the web request payload so it plugs into the same Supabase tables and quote-generation logic.
- On success, navigate to:
  - Either a **“Request Submitted”** screen, or
  - Directly to **InquiryDetail** screen for that new inquiry (mirrors web behavior after submitting).

> **Important:** The Android app must not invent a new request model. It should **reuse exactly the same REST endpoint and JSON payload** the web `/request` page uses, so that all backoffice tools and quote creation flows continue to work unchanged.

#### 1.2 Recommended Service Layer

- Create `RequestService.js` similar to `PaymentService.js`:
  - `createRequest(payload)` → `POST /api/<same-endpoint-as-web>`
  - `getRequestById(id)` → `GET /api/<same-endpoint-as-web>/:id`

The service should:
- Attach the same auth token header as the web (Bearer token from AsyncStorage).
- Handle validation errors and show user-friendly messages in the app.

---

### 2. My Trips / My Requests – `/my-trips`

#### 2.1 Screen: MyTripsScreen

**Purpose**: Mirror the web `/my-trips` page, showing:
- **Upcoming / Past bookings** (paid and booked items)
- **Requests / Inquiries** with their latest quotes and payment status

**Data sources (must match web):**
- Use the same backend endpoints as the web `My Trips` page uses, for example:
  - `GET /api/inquiries?mine=true` – list of user’s inquiries + quotes
  - `GET /api/bookings?mine=true` – list of confirmed/paid bookings
  - `GET /api/payments?action=get-payment-details&paymentId=...` – payment details (already supported)

> If the web uses a combined endpoint (e.g. `/api/my-trips`), the Android app should call **that same endpoint** instead of creating new ones.

#### 2.2 Behavior in the app

- On screen focus:
  - Fetch the same lists as web:
    - Inquiries + quotes (including `payment_status`, `quote_status`, `inquiry_status`, `final` flags)
    - Paid bookings (from bookings + payments tables)
- Use **the same filtering rules** as web:
  - Upcoming vs past
  - Paid vs unpaid
  - Final quote vs non-final quote
- Tapping a **request/inquiry**:
  - Navigate to `InquiryDetail` screen (Android), which mirrors `InquiryDetail.jsx` on web.
- From **InquiryDetail**, when a quote is `final` and `payment_status === 'unpaid'`:
  - Show **Pay Now** button.
  - This should navigate into the **ARC Pay payment flow** described in this guide:
    - `PaymentScreen` → WebView Hosted Checkout → callback → Success / Failed.

#### 2.3 Integration with ARC Pay Flow

- **Entry point:** from `MyTripsScreen` or `InquiryDetailScreen`:
  - User selects a quote.
  - App passes `quoteId` (and optionally `inquiryId`) into `PaymentScreen`:
    - `navigation.navigate('PaymentFlow', { screen: 'Payment', params: { quoteId, inquiryId } })`
- **Everything after that** uses the already defined ARC Pay flow:
  - `PaymentService.initiatePayment(quoteId)` → `/api/payments?action=initiate-payment`
  - Backend handles ARC Pay `INITIATE_CHECKOUT` + 3DS + `PAY`.
  - WebView shows Hosted Checkout.
  - Callback hits `/payment/callback` and `payment-callback` backend action.
  - App shows `PaymentSuccessScreen` or `PaymentFailedScreen`.

This way:
- `/request` → creates **inquiry + quotes**.
- `/my-trips` → lists **inquiries, quotes, bookings**.
- **Pay Now** in app uses **exact same backend and ARC Pay integration** as the web, with no duplicate business logic on the device.

---

## 🏗️ Architecture & Integration Model

### Hosted Checkout Flow (Mobile)

```
┌─────────────────┐
│  Android App    │
│  (React Native) │
└────────┬────────┘
         │
         │ 1. POST /api/payments?action=initiate-payment
         │    Body: { quote_id: "xxx" }
         ▼
┌─────────────────┐
│  Backend API    │
│ (Jetsetterss)   │
└────────┬────────┘
         │
         │ 2. Backend fetches quote from Supabase
         │ 3. Calls ARC Pay INITIATE_CHECKOUT
         │ 4. Returns { sessionId, paymentPageUrl, paymentId }
         ▼
┌─────────────────┐
│  ARC Pay API    │
│ (arcpay.travel) │
└─────────────────┘
         │
         │ 5. App opens paymentPageUrl in WebView
         ▼
┌─────────────────┐
│  WebView        │
│  (Hosted Page)  │
│ na.gateway...   │
└────────┬────────┘
         │
         │ 6. User enters card details
         │ 7. 3DS authentication (if required)
         │ 8. ARC Pay processes payment
         │ 9. Redirects to returnUrl with resultIndicator
         ▼
┌─────────────────┐
│  App Captures   │
│  Redirect URL   │
└────────┬────────┘
         │
         │ 10. GET /api/payments?action=payment-callback
         │     Params: resultIndicator, sessionId, quote_id
         ▼
┌─────────────────┐
│  Backend API    │
│  (Verification) │
└────────┬────────┘
         │
         │ 11. Verifies with ARC Pay
         │ 12. Updates Supabase
         │ 13. Returns payment status
         ▼
┌─────────────────┐
│  Success/Fail   │
│  Screen         │
└─────────────────┘
```

### Key Points
- **Backend handles all complexity** - App only sends `quote_id`
- **Same backend API** as web platform
- **WebView captures redirect** instead of deep linking (simpler)
- **Shared Supabase database** - bookings sync across web and mobile

---

## ⚙️ Environment Setup

### 1. Install Required Dependencies

```bash
# React Native dependencies
npm install @react-native-async-storage/async-storage
npm install react-native-webview
npm install @react-navigation/native @react-navigation/stack
npm install axios

# For Expo
expo install react-native-webview
expo install @react-native-async-storage/async-storage
```

### 2. Environment Variables

Create `config/api.js` in your React Native project:

```javascript
// config/api.js
export const API_CONFIG = {
  // Use your production API URL
  BASE_URL: 'https://www.jetsetterss.com/api',
  
  // For local development (optional)
  // BASE_URL: 'http://localhost:5005/api',
  
  // Supabase (same as web)
  SUPABASE_URL: 'https://qqmagqwumjipdqvxbiqu.supabase.co',
  SUPABASE_ANON_KEY: 'your_supabase_anon_key',
};

export const getApiUrl = (endpoint) => {
  return `${API_CONFIG.BASE_URL}/${endpoint}`;
};
```

### 3. Configure Deep Linking (Optional but Recommended)

**`app.json` (Expo):**
```json
{
  "expo": {
    "scheme": "jetsetterss",
    "android": {
      "intentFilters": [
        {
          "action": "VIEW",
          "autoVerify": true,
          "data": [
            {
              "scheme": "https",
              "host": "www.jetsetterss.com",
              "pathPrefix": "/payment"
            },
            {
              "scheme": "jetsetterss",
              "host": "payment"
            }
          ],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    }
  }
}
```

---

## 💳 Payment Flow Implementation

### Step 1: Payment Service

**File: `src/services/PaymentService.js`**

```javascript
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'https://www.jetsetterss.com/api';

class PaymentService {
  /**
   * Get authentication token from storage
   */
  async getAuthToken() {
    // Try different token keys (same as web platform)
    const token = await AsyncStorage.getItem('token') ||
                  await AsyncStorage.getItem('supabase_token') ||
                  await AsyncStorage.getItem('auth_token');
    return token;
  }

  /**
   * Initiate payment with ARC Pay
   * 
   * IMPORTANT: Backend only needs quote_id!
   * Backend fetches all other details (amount, currency, customer info) from Supabase
   * 
   * @param {string} quoteId - The quote ID to pay for
   * @param {object} options - Optional: return_url, cancel_url for deep linking
   * @returns {Promise<object>} Payment session data
   */
  async initiatePayment(quoteId, options = {}) {
    try {
      const token = await this.getAuthToken();
      
      console.log('💳 Initiating payment for quote:', quoteId);
      
      const response = await axios.post(
        `${API_BASE_URL}/payments?action=initiate-payment`,
        {
          quote_id: quoteId,
          // Optional: Override return URLs for mobile deep linking
          return_url: options.returnUrl,
          cancel_url: options.cancelUrl,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        }
      );

      console.log('📥 Payment initiation response:', response.data);

      // Response structure from backend:
      // {
      //   success: true,
      //   sessionId: "SESSION0002...",
      //   paymentId: "uuid...",
      //   paymentPageUrl: "https://na.gateway.mastercard.com/checkout/pay/SESSION...",
      //   successIndicator: "abc123...",
      //   merchantId: "TESTARC05511704"
      // }
      
      if (response.data.success) {
        const { 
          sessionId, 
          paymentId, 
          paymentPageUrl, 
          successIndicator 
        } = response.data;
        
        // Store payment info for later verification
        await AsyncStorage.multiSet([
          ['current_payment_id', paymentId],
          ['current_session_id', sessionId],
          ['current_quote_id', quoteId],
          ['success_indicator', successIndicator || ''],
        ]);
        
        return {
          success: true,
          paymentId,
          sessionId,
          paymentPageUrl,
          successIndicator,
        };
      }
      
      throw new Error(response.data.error || response.data.details || 'Payment initiation failed');
    } catch (error) {
      console.error('❌ Payment initiation error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Verify payment after callback
   * Called after user completes payment on hosted page
   * 
   * @param {object} params - Callback parameters
   * @param {string} params.resultIndicator - Result indicator from ARC Pay
   * @param {string} params.sessionId - Session ID
   * @param {string} params.quoteId - Quote ID
   * @returns {Promise<object>} Payment verification result
   */
  async verifyPayment(params) {
    try {
      const { resultIndicator, sessionId, quoteId } = params;
      
      console.log('🔍 Verifying payment:', { resultIndicator, sessionId, quoteId });
      
      // Get inquiry_id from stored payment or quote
      const storedQuoteId = quoteId || await AsyncStorage.getItem('current_quote_id');
      
      const response = await axios.get(
        `${API_BASE_URL}/payments?action=payment-callback`,
        {
          params: {
            resultIndicator,
            sessionId,
            quote_id: storedQuoteId,
          },
        }
      );

      console.log('📥 Payment verification response:', response.data);
      
      // Clear stored payment data
      await AsyncStorage.multiRemove([
        'current_payment_id',
        'current_session_id',
        'current_quote_id',
        'success_indicator',
      ]);

      return response.data;
    } catch (error) {
      console.error('❌ Payment verification error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Get payment details by ID
   * 
   * @param {string} paymentId - Payment ID
   * @returns {Promise<object>} Payment details
   */
  async getPaymentDetails(paymentId) {
    try {
      const token = await this.getAuthToken();
      
      const response = await axios.get(
        `${API_BASE_URL}/payments?action=get-payment-details`,
        {
          params: { paymentId },
          headers: {
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('❌ Get payment details error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Handle API errors
   */
  handleError(error) {
    if (error.response) {
      // Server responded with error
      const message = error.response.data?.error || 
                     error.response.data?.details || 
                     error.response.data?.message ||
                     'Payment request failed';
      return new Error(message);
    } else if (error.request) {
      // No response received
      return new Error('Network error. Please check your internet connection.');
    }
    // Other error
    return new Error(error.message || 'An unexpected error occurred');
  }
}

export default new PaymentService();
```

---

### Step 2: Payment Screen with WebView

**File: `src/screens/PaymentScreen.js`**

```javascript
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  Alert,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  BackHandler,
} from 'react-native';
import { WebView } from 'react-native-webview';
import PaymentService from '../services/PaymentService';

const PaymentScreen = ({ navigation, route }) => {
  const { quoteId, inquiryId, quoteDetails } = route.params;
  
  const [loading, setLoading] = useState(true);
  const [paymentUrl, setPaymentUrl] = useState(null);
  const [error, setError] = useState(null);
  const [verifying, setVerifying] = useState(false);
  
  const webViewRef = useRef(null);

  useEffect(() => {
    initializePayment();
    
    // Handle Android back button
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (paymentUrl && !verifying) {
        Alert.alert(
          'Cancel Payment?',
          'Are you sure you want to cancel this payment?',
          [
            { text: 'Continue Payment', style: 'cancel' },
            { 
              text: 'Cancel', 
              style: 'destructive',
              onPress: () => navigation.goBack() 
            },
          ]
        );
        return true;
      }
      return false;
    });

    return () => backHandler.remove();
  }, []);

  const initializePayment = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🚀 Starting payment for quote:', quoteId);
      
      const result = await PaymentService.initiatePayment(quoteId);
      
      if (result.success && result.paymentPageUrl) {
        console.log('✅ Payment URL received:', result.paymentPageUrl);
        setPaymentUrl(result.paymentPageUrl);
      } else {
        throw new Error('Failed to get payment URL');
      }
    } catch (err) {
      console.error('❌ Payment initialization failed:', err);
      setError(err.message || 'Failed to start payment');
      Alert.alert(
        'Payment Error',
        err.message || 'Failed to initialize payment. Please try again.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle WebView navigation state changes
   * Captures the callback URL when ARC Pay redirects back
   */
  const handleNavigationStateChange = async (navState) => {
    const { url } = navState;
    console.log('🔗 WebView navigating to:', url);
    
    // Check if this is the callback URL
    // ARC Pay redirects to: returnUrl?resultIndicator=XXX&sessionId=YYY
    if (url.includes('/payment/callback') || 
        url.includes('resultIndicator=') ||
        url.includes('payment=success') ||
        url.includes('payment=failed')) {
      
      console.log('📥 Callback URL detected:', url);
      
      // Extract parameters from URL
      const urlParams = new URL(url).searchParams;
      const resultIndicator = urlParams.get('resultIndicator');
      const sessionId = urlParams.get('sessionId') || urlParams.get('session.id');
      const paymentStatus = urlParams.get('payment');
      
      // Handle the callback
      await handlePaymentCallback({
        resultIndicator,
        sessionId,
        quoteId,
        paymentStatus,
        callbackUrl: url,
      });
    }
    
    // Check for cancel URL
    if (url.includes('payment=cancelled') || url.includes('payment/cancel')) {
      console.log('❌ Payment cancelled by user');
      Alert.alert(
        'Payment Cancelled',
        'You cancelled the payment.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    }
  };

  /**
   * Handle payment callback - verify with backend
   */
  const handlePaymentCallback = async (params) => {
    try {
      setVerifying(true);
      setPaymentUrl(null); // Hide WebView
      
      console.log('🔍 Processing payment callback:', params);
      
      // If we have resultIndicator, verify with backend
      if (params.resultIndicator && params.sessionId) {
        const verificationResult = await PaymentService.verifyPayment({
          resultIndicator: params.resultIndicator,
          sessionId: params.sessionId,
          quoteId: params.quoteId,
        });
        
        console.log('📥 Verification result:', verificationResult);
        
        // Navigate based on result
        if (verificationResult.success || verificationResult.payment?.payment_status === 'completed') {
          navigation.replace('PaymentSuccess', {
            paymentId: verificationResult.payment?.id,
            quoteId: params.quoteId,
            inquiryId,
          });
        } else {
          navigation.replace('PaymentFailed', {
            reason: verificationResult.error || 'Payment verification failed',
            quoteId: params.quoteId,
            inquiryId,
          });
        }
      } else if (params.paymentStatus === 'success') {
        // Direct success callback (fallback)
        navigation.replace('PaymentSuccess', {
          quoteId: params.quoteId,
          inquiryId,
        });
      } else {
        // Payment failed
        navigation.replace('PaymentFailed', {
          reason: 'Payment was not completed',
          quoteId: params.quoteId,
          inquiryId,
        });
      }
    } catch (err) {
      console.error('❌ Callback handling error:', err);
      navigation.replace('PaymentFailed', {
        reason: err.message || 'Failed to verify payment',
        quoteId: params.quoteId,
        inquiryId,
      });
    } finally {
      setVerifying(false);
    }
  };

  /**
   * Control which URLs the WebView can navigate to
   */
  const handleShouldStartLoad = (request) => {
    const { url } = request;
    
    // Allow ARC Pay / Mastercard Gateway URLs
    if (url.includes('gateway.mastercard.com') ||
        url.includes('arcpay.travel') ||
        url.includes('3ds') ||
        url.includes('acs.') ||
        url.includes('secure')) {
      return true;
    }
    
    // Allow callback URLs (will be handled by navigation state change)
    if (url.includes('jetsetterss.com') ||
        url.includes('payment/callback') ||
        url.includes('resultIndicator')) {
      return true;
    }
    
    // Block other URLs for security
    console.log('⚠️ Blocked navigation to:', url);
    return false;
  };

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1e40af" />
          <Text style={styles.loadingText}>Preparing payment...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Verifying state
  if (verifying) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1e40af" />
          <Text style={styles.loadingText}>Verifying payment...</Text>
          <Text style={styles.subText}>Please wait while we confirm your payment</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorIcon}>❌</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={initializePayment}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // WebView with payment page
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.headerButton}
          onPress={() => {
            Alert.alert(
              'Cancel Payment?',
              'Are you sure you want to cancel this payment?',
              [
                { text: 'Continue', style: 'cancel' },
                { text: 'Cancel Payment', style: 'destructive', onPress: () => navigation.goBack() },
              ]
            );
          }}
        >
          <Text style={styles.headerButtonText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Secure Payment</Text>
        <View style={styles.headerButton} />
      </View>
      
      {/* WebView */}
      {paymentUrl && (
        <WebView
          ref={webViewRef}
          source={{ uri: paymentUrl }}
          style={styles.webview}
          onNavigationStateChange={handleNavigationStateChange}
          onShouldStartLoadWithRequest={handleShouldStartLoad}
          
          // Required settings for payment page
          javaScriptEnabled={true}
          domStorageEnabled={true}
          thirdPartyCookiesEnabled={true}
          sharedCookiesEnabled={true}
          mixedContentMode="always"
          
          // Loading indicator
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.webviewLoading}>
              <ActivityIndicator size="large" color="#1e40af" />
              <Text style={styles.loadingText}>Loading payment page...</Text>
            </View>
          )}
          
          // Error handling
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('WebView error:', nativeEvent);
            setError('Failed to load payment page. Please try again.');
          }}
          
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('WebView HTTP error:', nativeEvent.statusCode);
            if (nativeEvent.statusCode >= 400) {
              setError(`Payment page error (${nativeEvent.statusCode}). Please try again.`);
            }
          }}
        />
      )}
      
      {/* Security footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>🔒 Secured by ARC Pay & Mastercard</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonText: {
    fontSize: 20,
    color: '#6b7280',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  webview: {
    flex: 1,
  },
  webviewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#4b5563',
  },
  subText: {
    marginTop: 8,
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#1e40af',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  cancelButtonText: {
    color: '#6b7280',
    fontSize: 16,
  },
  footer: {
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  footerText: {
    fontSize: 12,
    color: '#6b7280',
  },
});

export default PaymentScreen;
```

---

### Step 3: Payment Success Screen

**File: `src/screens/PaymentSuccessScreen.js`**

```javascript
import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  BackHandler,
} from 'react-native';

const PaymentSuccessScreen = ({ navigation, route }) => {
  const { paymentId, quoteId, inquiryId } = route.params || {};

  useEffect(() => {
    // Prevent going back to payment screen
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      navigateToBookings();
      return true;
    });
    return () => backHandler.remove();
  }, []);

  const navigateToBookings = () => {
    // Navigate to My Trips/Bookings screen
    navigation.reset({
      index: 0,
      routes: [
        { name: 'Main' },
        { name: 'MyTrips' },
      ],
    });
  };

  const navigateToInquiry = () => {
    if (inquiryId) {
      navigation.navigate('InquiryDetail', { inquiryId });
    } else {
      navigateToBookings();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Success Icon */}
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>✓</Text>
        </View>
        
        {/* Success Message */}
        <Text style={styles.title}>Payment Successful!</Text>
        <Text style={styles.subtitle}>
          Your payment has been processed successfully.
        </Text>
        
        {/* Payment Details */}
        {paymentId && (
          <View style={styles.detailsCard}>
            <Text style={styles.detailLabel}>Payment Reference</Text>
            <Text style={styles.detailValue}>{paymentId.slice(-8).toUpperCase()}</Text>
          </View>
        )}
        
        {/* Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            📧 A confirmation email will be sent to you shortly.
          </Text>
        </View>
        
        {/* Actions */}
        <TouchableOpacity style={styles.primaryButton} onPress={navigateToBookings}>
          <Text style={styles.primaryButtonText}>View My Bookings</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('Home')}>
          <Text style={styles.secondaryButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 40,
    color: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  detailsCard: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
  },
  detailLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    fontFamily: 'monospace',
  },
  infoBox: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 32,
    width: '100%',
  },
  infoText: {
    fontSize: 14,
    color: '#1e40af',
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#1e40af',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    width: '100%',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  secondaryButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  secondaryButtonText: {
    color: '#6b7280',
    fontSize: 16,
  },
});

export default PaymentSuccessScreen;
```

---

### Step 4: Payment Failed Screen

**File: `src/screens/PaymentFailedScreen.js`**

```javascript
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';

const PaymentFailedScreen = ({ navigation, route }) => {
  const { reason, quoteId, inquiryId } = route.params || {};

  const retryPayment = () => {
    if (quoteId) {
      navigation.replace('Payment', { quoteId, inquiryId });
    } else {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Error Icon */}
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>✕</Text>
        </View>
        
        {/* Error Message */}
        <Text style={styles.title}>Payment Failed</Text>
        <Text style={styles.subtitle}>
          {reason || 'Your payment could not be processed.'}
        </Text>
        
        {/* Suggestions */}
        <View style={styles.suggestionsBox}>
          <Text style={styles.suggestionsTitle}>What you can try:</Text>
          <Text style={styles.suggestion}>• Check your card details are correct</Text>
          <Text style={styles.suggestion}>• Ensure sufficient funds are available</Text>
          <Text style={styles.suggestion}>• Try a different payment method</Text>
          <Text style={styles.suggestion}>• Contact your bank if the issue persists</Text>
        </View>
        
        {/* Actions */}
        <TouchableOpacity style={styles.primaryButton} onPress={retryPayment}>
          <Text style={styles.primaryButtonText}>Try Again</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('Home')}>
          <Text style={styles.secondaryButtonText}>Back to Home</Text>
        </TouchableOpacity>
        
        {/* Support */}
        <View style={styles.supportBox}>
          <Text style={styles.supportText}>
            Need help? Contact us at{'\n'}
            <Text style={styles.supportLink}>support@jetsetterss.com</Text>
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 40,
    color: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  suggestionsBox: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
    width: '100%',
  },
  suggestionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400e',
    marginBottom: 8,
  },
  suggestion: {
    fontSize: 14,
    color: '#78350f',
    marginBottom: 4,
  },
  primaryButton: {
    backgroundColor: '#1e40af',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    width: '100%',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  secondaryButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    marginBottom: 24,
  },
  secondaryButtonText: {
    color: '#6b7280',
    fontSize: 16,
  },
  supportBox: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  supportText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  supportLink: {
    color: '#1e40af',
    fontWeight: '500',
  },
});

export default PaymentFailedScreen;
```

---

### Step 5: Navigation Setup

**File: `src/navigation/PaymentNavigator.js`**

```javascript
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

import PaymentScreen from '../screens/PaymentScreen';
import PaymentSuccessScreen from '../screens/PaymentSuccessScreen';
import PaymentFailedScreen from '../screens/PaymentFailedScreen';

const Stack = createStackNavigator();

const PaymentNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: false, // Prevent swipe back during payment
      }}
    >
      <Stack.Screen name="Payment" component={PaymentScreen} />
      <Stack.Screen name="PaymentSuccess" component={PaymentSuccessScreen} />
      <Stack.Screen name="PaymentFailed" component={PaymentFailedScreen} />
    </Stack.Navigator>
  );
};

export default PaymentNavigator;
```

---

### Step 6: Usage Example - Initiating Payment from Quote Detail

**Example: `src/screens/QuoteDetailScreen.js` (partial)**

```javascript
import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';

const QuoteDetailScreen = ({ navigation, route }) => {
  const { quote, inquiry } = route.params;

  const handlePayment = () => {
    if (!quote?.id) {
      Alert.alert('Error', 'Quote information is missing');
      return;
    }

    // Navigate to payment screen with quote ID
    // Backend will fetch all details (amount, currency, customer info) automatically
    navigation.navigate('PaymentFlow', {
      screen: 'Payment',
      params: {
        quoteId: quote.id,
        inquiryId: inquiry?.id,
        quoteDetails: {
          amount: quote.total_amount,
          currency: quote.currency,
          title: quote.title,
        },
      },
    });
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      {/* Quote details... */}
      <Text>Quote: {quote?.quote_number}</Text>
      <Text>Amount: ${quote?.total_amount}</Text>
      
      {/* Pay Now Button */}
      <TouchableOpacity
        style={{
          backgroundColor: '#1e40af',
          padding: 16,
          borderRadius: 12,
          marginTop: 20,
        }}
        onPress={handlePayment}
      >
        <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '600' }}>
          Pay ${quote?.total_amount || '0.00'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default QuoteDetailScreen;
```

---

## 🔐 3DS Authentication Handling

### How 3DS Works in WebView

The WebView automatically handles 3DS authentication:

1. **User enters card details** on the ARC Pay hosted page
2. **ARC Pay detects 3DS requirement** based on card/bank
3. **3DS authentication happens within WebView:**
   - **Frictionless**: Auto-authenticates (no user action needed)
   - **Challenge**: Shows OTP/verification form in WebView
4. **User completes authentication** (if challenge)
5. **ARC Pay processes payment** and redirects to your return URL
6. **App captures redirect** and verifies with backend

### No Additional Code Needed!

The WebView handles all 3DS flows automatically. Just ensure:
- `javaScriptEnabled={true}`
- `domStorageEnabled={true}` 
- `thirdPartyCookiesEnabled={true}`
- Allow navigation to 3DS URLs (gateway.mastercard.com, acs.*, etc.)

---

## 🧪 Test Cards & Scenarios

### Official ARC Pay Test Cards

| Card Number | Type | Expiry | 3DS Behavior | Expected Result |
|------------|------|--------|--------------|-----------------|
| `5123456789012346` | Mastercard | 01/39 | ✅ Frictionless | Approved |
| `4440000042200014` | Visa | 01/39 | ✅ Frictionless | Approved |
| `5123450000000008` | Mastercard | 01/39 | 🔐 Challenge | Approved (after OTP) |
| `2223000000000007` | Mastercard | 01/39 | 🔐 Challenge | Approved (after OTP) |
| `4440000009900010` | Visa | 01/39 | 🔐 Challenge | Approved (after OTP) |

### Test Details
- **Expiry Date**: Use `01/39` for all test cards
- **CVV**: Any 3 digits (e.g., `100`, `123`)
- **OTP for Challenge**: Any 6 digits (e.g., `123456`)
- **Cardholder Name**: Any name

### Test Scenarios Checklist

- [ ] **Frictionless 3DS** - Card `5123456789012346`
  - Enter card details → Auto-authenticates → Success
- [ ] **Challenge 3DS** - Card `5123450000000008`
  - Enter card details → OTP form appears → Enter `123456` → Success
- [ ] **Network Error**
  - Turn off internet → Should show network error
- [ ] **User Cancels**
  - Press back/cancel → Should return to previous screen
- [ ] **WebView Error**
  - Should show error and retry option

---

## ⚠️ Error Handling

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "Payment initiation failed" | Invalid quote_id or quote not found | Verify quote exists in database |
| "Network error" | No internet connection | Check connectivity, show retry button |
| "Failed to load payment page" | WebView couldn't load URL | Check URL format, retry |
| "Payment verification failed" | Invalid resultIndicator | Backend will handle, redirect to failed |
| "Session expired" | Payment took too long | Restart payment flow |

### Error Handling Best Practices

```javascript
try {
  const result = await PaymentService.initiatePayment(quoteId);
} catch (error) {
  // Log for debugging
  console.error('Payment error:', error);
  
  // Show user-friendly message
  Alert.alert(
    'Payment Error',
    error.message || 'Something went wrong. Please try again.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Retry', onPress: () => retryPayment() },
    ]
  );
}
```

---

## 📱 Mobile-Specific Considerations

### 1. Back Button Handling
```javascript
useEffect(() => {
  const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
    if (isPaymentInProgress) {
      // Show confirmation before cancelling
      Alert.alert('Cancel Payment?', '...', [...]);
      return true; // Prevent default
    }
    return false;
  });
  return () => backHandler.remove();
}, []);
```

### 2. Network State Monitoring
```javascript
import NetInfo from '@react-native-community/netinfo';

useEffect(() => {
  const unsubscribe = NetInfo.addEventListener(state => {
    if (!state.isConnected && isPaymentInProgress) {
      Alert.alert('No Internet', 'Please check your connection.');
    }
  });
  return () => unsubscribe();
}, []);
```

### 3. App Background/Foreground
```javascript
import { AppState } from 'react-native';

useEffect(() => {
  const subscription = AppState.addEventListener('change', state => {
    if (state === 'active' && isPaymentInProgress) {
      // App came back to foreground - check payment status
      checkPaymentStatus();
    }
  });
  return () => subscription.remove();
}, []);
```

---

## ✅ Testing Checklist

### Pre-Development
- [ ] API base URL configured (`https://www.jetsetterss.com/api`)
- [ ] WebView package installed
- [ ] AsyncStorage package installed

### Payment Flow
- [ ] Payment initiation works (POST with quote_id)
- [ ] WebView loads payment page correctly
- [ ] 3DS frictionless flow works
- [ ] 3DS challenge flow works (OTP entry)
- [ ] Callback URL captured correctly
- [ ] Payment verification works
- [ ] Success screen displays
- [ ] Failed screen displays with reason

### Error Scenarios
- [ ] Invalid quote_id handled
- [ ] Network error handled
- [ ] WebView error handled
- [ ] User cancellation handled
- [ ] Back button during payment handled

### Edge Cases
- [ ] App backgrounded during payment
- [ ] Payment timeout handled
- [ ] Multiple payment attempts handled

---

## 📞 Support

### API Endpoints (Same as Web)

```
POST /api/payments?action=initiate-payment
     Body: { quote_id: "xxx" }
     Returns: { success, sessionId, paymentId, paymentPageUrl }

GET  /api/payments?action=payment-callback
     Params: resultIndicator, sessionId, quote_id
     Returns: { success, payment: {...} }

GET  /api/payments?action=get-payment-details
     Params: paymentId
     Returns: { success, payment: {...} }
```

### Contact
- **Support Email**: support@jetsetterss.com
- **Phone**: (877) 538-7380

---

**Document Status**: ✅ **FIXED & COMPLETE**  
**Last Updated**: November 2025  
**Version**: 2.0

This guide is now aligned with the actual Jetsetterss backend implementation. The key points are:
1. **Send only `quote_id`** - Backend fetches everything else
2. **Use the correct response structure** - Data at top level
3. **WebView handles 3DS automatically** - No extra code needed
4. **Same API as web platform** - Shared Supabase database
