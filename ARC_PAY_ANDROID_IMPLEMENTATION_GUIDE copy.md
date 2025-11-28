# ARC Pay Android Implementation Guide

## 📋 Table of Contents
1. [Overview](#overview)
2. [Architecture & Integration Model](#architecture--integration-model)
3. [Environment Setup](#environment-setup)
4. [Payment Flow Implementation](#payment-flow-implementation)
5. [3DS Authentication Handling](#3ds-authentication-handling)
6. [Code Implementation](#code-implementation)
7. [Test Cards & Scenarios](#test-cards--scenarios)
8. [Error Handling](#error-handling)
9. [Mobile-Specific Considerations](#mobile-specific-considerations)
10. [Testing Checklist](#testing-checklist)

---

## 🎯 Overview

This guide provides complete implementation instructions for integrating **ARC Pay Payment Gateway** (Mastercard Payment Gateway Services) into the **Jetsetterss Android App** built with **React Native** and **Expo**.

### Key Features
- ✅ **Hosted Checkout Integration**: Secure payment processing via ARC Pay's hosted payment page
- ✅ **3DS Authentication**: Full support for EMV 3DS2 (frictionless and challenge flows)
- ✅ **Mobile-Optimized**: WebView handling for payment pages and deep linking for callbacks
- ✅ **Shared Backend**: Uses same API endpoints as web platform
- ✅ **Real-time Status**: Payment status synchronization with Supabase

### Payment Gateway Details
- **Gateway**: ARC Pay (Mastercard Payment Gateway Services)
- **Base URL**: `https://na.gateway.mastercard.com`
- **API Version**: `100`
- **Integration Model**: Hosted Checkout (Hosted Session)
- **Merchant ID**: `TESTARC05511704` (Test) / `ARC05511704` (Production)

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
         ▼
┌─────────────────┐
│  Backend API    │
│  (Same as Web)  │
└────────┬────────┘
         │
         │ 2. INITIATE_CHECKOUT → ARC Pay
         │ 3. Returns sessionId & paymentPageUrl
         ▼
┌─────────────────┐
│  ARC Pay API    │
└─────────────────┘
         │
         │ 4. Redirect to paymentPageUrl
         ▼
┌─────────────────┐
│  WebView/       │
│  In-App Browser │
│  (Payment Page) │
└────────┬────────┘
         │
         │ 5. User enters card details
         │ 6. 3DS authentication (if required)
         │ 7. ARC Pay processes payment
         │ 8. Redirects to returnUrl
         ▼
┌─────────────────┐
│  Deep Link      │
│  /payment/callback│
└────────┬────────┘
         │
         │ 9. POST /api/payments?action=payment-callback
         ▼
┌─────────────────┐
│  Backend API    │
│  (Verification) │
└────────┬────────┘
         │
         │ 10. Updates Supabase
         │ 11. Redirects to success/failure
         ▼
┌─────────────────┐
│  Success/Fail   │
│  Screen         │
└─────────────────┘
```

### Key Differences from Web Implementation

| Aspect | Web | Android |
|--------|-----|---------|
| **Payment Page** | Browser redirect | WebView or In-App Browser |
| **Callback Handling** | URL redirect | Deep linking |
| **3DS Challenge** | Browser popup | WebView navigation |
| **Session Management** | Browser cookies | App state + AsyncStorage |

---

## ⚙️ Environment Setup

### 1. Install Required Dependencies

```bash
# React Native dependencies
npm install @react-native-async-storage/async-storage
npm install react-native-webview
npm install @react-navigation/native
npm install react-native-url-polyfill
npm install expo-linking
npm install expo-web-browser

# For deep linking
npm install @react-navigation/deep-linking

# HTTP client
npm install axios
```

### 2. Environment Variables

Create `.env` file in your React Native project root:

```env
# API Configuration
API_BASE_URL=https://your-api-domain.com/api
# OR for development:
# API_BASE_URL=http://localhost:5005/api

# ARC Pay Configuration (Same as web)
ARC_PAY_API_URL=https://na.gateway.mastercard.com/api/rest/version/100/merchant/TESTARC05511704
ARC_PAY_MERCHANT_ID=TESTARC05511704
ARC_PAY_BASE_URL=https://na.gateway.mastercard.com/api/rest/version/100

# Supabase (Same as web)
SUPABASE_URL=https://qqmagqwumjipdqvxbiqu.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key

# Deep Linking
APP_SCHEME=jetsetterss
APP_DOMAIN=jetsetterss.com
```

### 3. Configure Deep Linking

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
              "host": "jetsetterss.com",
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

**`AndroidManifest.xml` (React Native CLI):**
```xml
<activity
  android:name=".MainActivity"
  android:launchMode="singleTask">
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data
      android:scheme="jetsetterss"
      android:host="payment" />
    <data
      android:scheme="https"
      android:host="jetsetterss.com"
      android:pathPrefix="/payment" />
  </intent-filter>
</activity>
```

---

## 💳 Payment Flow Implementation

### Step 1: Initiate Payment

**File: `src/services/paymentService.js`**

```javascript
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@env';

const API_URL = API_BASE_URL || 'https://your-api-domain.com/api';

/**
 * Initiate payment with ARC Pay
 * @param {Object} paymentData - Payment details
 * @returns {Promise<Object>} Payment session data
 */
export const initiatePayment = async (paymentData) => {
  try {
    const { quoteId, inquiryId, amount, currency, customerEmail, customerName } = paymentData;

    // Get auth token if available
    const token = await AsyncStorage.getItem('auth_token');
    
    const response = await axios.post(
      `${API_URL}/payments?action=initiate-payment`,
      {
        quote_id: quoteId,
        inquiry_id: inquiryId,
        amount: amount,
        currency: currency || 'USD',
        customer_email: customerEmail,
        customer_name: customerName,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      }
    );

    if (response.data.success) {
      const { payment, paymentPageUrl, sessionId } = response.data.data;
      
      // Store payment ID for later reference
      await AsyncStorage.setItem('current_payment_id', payment.id);
      await AsyncStorage.setItem('current_session_id', sessionId);
      
      return {
        success: true,
        paymentId: payment.id,
        paymentPageUrl: paymentPageUrl,
        sessionId: sessionId,
        payment: payment,
      };
    } else {
      throw new Error(response.data.error || 'Payment initiation failed');
    }
  } catch (error) {
    console.error('Payment initiation error:', error);
    throw error;
  }
};
```

### Step 2: Open Payment Page in WebView

**File: `src/screens/PaymentScreen.jsx`**

```javascript
import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { initiatePayment } from '../services/paymentService';

const PaymentScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { quoteId, inquiryId, amount, currency, customerEmail, customerName } = route.params;
  
  const [paymentUrl, setPaymentUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    initializePayment();
  }, []);

  const initializePayment = async () => {
    try {
      setLoading(true);
      const result = await initiatePayment({
        quoteId,
        inquiryId,
        amount,
        currency,
        customerEmail,
        customerName,
      });

      if (result.success) {
        setPaymentUrl(result.paymentPageUrl);
      } else {
        setError('Failed to initialize payment');
      }
    } catch (err) {
      console.error('Payment initialization error:', err);
      setError(err.message || 'Payment initialization failed');
      Alert.alert('Error', err.message || 'Failed to start payment');
    } finally {
      setLoading(false);
    }
  };

  const handleNavigationStateChange = (navState) => {
    const { url } = navState;
    
    // Check if this is the callback URL
    if (url.includes('/payment/callback') || url.includes('resultIndicator')) {
      // Extract parameters from URL
      const urlObj = new URL(url);
      const resultIndicator = urlObj.searchParams.get('resultIndicator') || 
                             urlObj.searchParams.get('result');
      const sessionId = urlObj.searchParams.get('sessionId') || 
                       urlObj.searchParams.get('session.id') ||
                       urlObj.searchParams.get('session_id');

      if (resultIndicator && sessionId) {
        // Handle callback
        handlePaymentCallback(resultIndicator, sessionId, url);
        return false; // Prevent navigation
      }
    }
  };

  const handlePaymentCallback = async (resultIndicator, sessionId, callbackUrl) => {
    try {
      // Close WebView
      setPaymentUrl(null);
      
      // Navigate to callback handler
      navigation.navigate('PaymentCallback', {
        resultIndicator,
        sessionId,
        quoteId,
        inquiryId,
        callbackUrl,
      });
    } catch (err) {
      console.error('Callback handling error:', err);
      Alert.alert('Error', 'Failed to process payment callback');
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1e40af" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!paymentUrl) {
    return null;
  }

  return (
    <WebView
      source={{ uri: paymentUrl }}
      onNavigationStateChange={handleNavigationStateChange}
      onShouldStartLoadWithRequest={(request) => {
        const { url } = request;
        
        // Allow navigation to payment page
        if (url.includes('gateway.mastercard.com') || url.includes('arcpay.travel')) {
          return true;
        }
        
        // Handle callback URLs
        if (url.includes('/payment/callback') || url.includes('resultIndicator')) {
          handleNavigationStateChange({ url });
          return false;
        }
        
        return true;
      }}
      style={styles.webview}
      startInLoadingState={true}
      renderLoading={() => (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1e40af" />
        </View>
      )}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
    textAlign: 'center',
    padding: 20,
  },
});

export default PaymentScreen;
```

### Step 3: Handle Payment Callback

**File: `src/screens/PaymentCallbackScreen.jsx`**

```javascript
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import axios from 'axios';
import { API_BASE_URL } from '@env';

const PaymentCallbackScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { resultIndicator, sessionId, quoteId, inquiryId } = route.params;
  
  const [status, setStatus] = useState('verifying');
  const [paymentData, setPaymentData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    verifyPayment();
  }, []);

  const verifyPayment = async () => {
    try {
      setStatus('verifying');
      
      // Call backend to verify payment
      const response = await axios.get(
        `${API_BASE_URL}/payments?action=payment-callback`,
        {
          params: {
            resultIndicator,
            sessionId,
            quote_id: quoteId,
            inquiry_id: inquiryId,
          },
        }
      );

      if (response.data.success) {
        const payment = response.data.data.payment;
        setPaymentData(payment);
        
        // Navigate based on payment status
        if (payment.payment_status === 'completed' || payment.payment_status === 'success') {
          setStatus('success');
          setTimeout(() => {
            navigation.replace('PaymentSuccess', { paymentId: payment.id });
          }, 1500);
        } else if (payment.payment_status === 'failed' || payment.payment_status === 'declined') {
          setStatus('failed');
          setTimeout(() => {
            navigation.replace('PaymentFailed', { 
              paymentId: payment.id,
              reason: payment.failure_reason || 'Payment failed',
            });
          }, 1500);
        } else {
          setStatus('pending');
          // Handle pending status
          navigation.replace('PaymentPending', { paymentId: payment.id });
        }
      } else {
        throw new Error(response.data.error || 'Payment verification failed');
      }
    } catch (err) {
      console.error('Payment verification error:', err);
      setError(err.message || 'Failed to verify payment');
      setStatus('error');
      
      setTimeout(() => {
        navigation.replace('PaymentFailed', { 
          reason: err.message || 'Payment verification failed',
        });
      }, 2000);
    }
  };

  return (
    <View style={styles.container}>
      {status === 'verifying' && (
        <>
          <ActivityIndicator size="large" color="#1e40af" />
          <Text style={styles.statusText}>Verifying payment...</Text>
        </>
      )}
      {status === 'success' && (
        <>
          <Text style={styles.successText}>✓ Payment Successful!</Text>
          <Text style={styles.statusText}>Redirecting...</Text>
        </>
      )}
      {status === 'failed' && (
        <>
          <Text style={styles.errorText}>✗ Payment Failed</Text>
          <Text style={styles.statusText}>Redirecting...</Text>
        </>
      )}
      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  statusText: {
    marginTop: 20,
    fontSize: 16,
    color: '#6b7280',
  },
  successText: {
    fontSize: 24,
    color: '#10b981',
    fontWeight: 'bold',
    marginBottom: 10,
  },
  errorText: {
    fontSize: 18,
    color: '#ef4444',
    textAlign: 'center',
  },
});

export default PaymentCallbackScreen;
```

---

## 🔐 3DS Authentication Handling

### Mobile 3DS Flow

In a mobile app using WebView, 3DS authentication works as follows:

1. **User enters card details** in the WebView (ARC Pay hosted page)
2. **ARC Pay detects 3DS requirement** based on card
3. **3DS Challenge appears** within the same WebView:
   - **Frictionless**: Auto-authenticates (no user action)
   - **Challenge**: Shows OTP input form in WebView
4. **User enters OTP** (if challenge required)
5. **ARC Pay processes authentication** and payment
6. **Redirects to returnUrl** with resultIndicator

### Handling 3DS in WebView

The WebView automatically handles 3DS challenges. You just need to:

1. **Allow navigation** to 3DS challenge URLs:
   ```javascript
   onShouldStartLoadWithRequest={(request) => {
     const { url } = request;
     // Allow all ARC Pay/Mastercard Gateway URLs
     if (url.includes('gateway.mastercard.com') || 
         url.includes('arcpay.travel') ||
         url.includes('3ds')) {
       return true;
     }
     return false;
   }}
   ```

2. **Monitor for callback** after 3DS completion:
   ```javascript
   onNavigationStateChange={(navState) => {
     if (navState.url.includes('/payment/callback')) {
       // Handle callback
     }
   }}
   ```

### 3DS Test Cards for Mobile

Use the same test cards as web platform:

| Card Number | Type | Expiry | CVV | 3DS Behavior |
|------------|------|--------|-----|--------------|
| `5123456789012346` | Mastercard | 01/39 | 100 | ✅ Frictionless |
| `4508750015741019` | Visa | 01/39 | 100 | ✅ Frictionless |
| `5123450000000008` | Mastercard | 01/39 | 100 | 🔐 Challenge (OTP: `123456`) |
| `4111111111111111` | Visa | 01/39 | 100 | 🔐 Challenge (OTP: `123456`) |

**For test OTP**: Enter any 6-digit number (e.g., `123456`)

---

## 📱 Code Implementation

### Complete Payment Service

**File: `src/services/paymentService.js`**

```javascript
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@env';

const API_URL = API_BASE_URL;

class PaymentService {
  /**
   * Initiate payment
   */
  async initiatePayment(paymentData) {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      
      const response = await axios.post(
        `${API_URL}/payments?action=initiate-payment`,
        paymentData,
        {
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        }
      );

      if (response.data.success) {
        const { payment, paymentPageUrl, sessionId } = response.data.data;
        
        await AsyncStorage.multiSet([
          ['current_payment_id', payment.id],
          ['current_session_id', sessionId],
        ]);
        
        return {
          success: true,
          paymentId: payment.id,
          paymentPageUrl,
          sessionId,
          payment,
        };
      }
      
      throw new Error(response.data.error || 'Payment initiation failed');
    } catch (error) {
      console.error('Payment initiation error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Verify payment callback
   */
  async verifyPaymentCallback(params) {
    try {
      const { resultIndicator, sessionId, quoteId, inquiryId } = params;
      
      const response = await axios.get(
        `${API_URL}/payments?action=payment-callback`,
        {
          params: {
            resultIndicator,
            sessionId,
            quote_id: quoteId,
            inquiry_id: inquiryId,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Payment verification error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Get payment details
   */
  async getPaymentDetails(paymentId) {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      
      const response = await axios.get(
        `${API_URL}/payments?action=get-payment-details`,
        {
          params: { payment_id: paymentId },
          headers: {
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Get payment details error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Handle errors
   */
  handleError(error) {
    if (error.response) {
      // Server responded with error
      return new Error(
        error.response.data?.error || 
        error.response.data?.message || 
        'Payment request failed'
      );
    } else if (error.request) {
      // Request made but no response
      return new Error('Network error. Please check your connection.');
    } else {
      // Error in request setup
      return new Error(error.message || 'An unexpected error occurred');
    }
  }
}

export default new PaymentService();
```

### Navigation Setup

**File: `src/navigation/AppNavigator.jsx`**

```javascript
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as Linking from 'expo-linking';

// Screens
import PaymentScreen from '../screens/PaymentScreen';
import PaymentCallbackScreen from '../screens/PaymentCallbackScreen';
import PaymentSuccessScreen from '../screens/PaymentSuccessScreen';
import PaymentFailedScreen from '../screens/PaymentFailedScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Deep linking configuration
const linking = {
  prefixes: [
    'jetsetterss://',
    'https://jetsetterss.com',
    'https://www.jetsetterss.com',
  ],
  config: {
    screens: {
      PaymentCallback: {
        path: '/payment/callback',
        parse: {
          resultIndicator: (value) => value,
          sessionId: (value) => value,
          quote_id: (value) => value,
          inquiry_id: (value) => value,
        },
      },
    },
  },
};

const PaymentStack = () => (
  <Stack.Navigator>
    <Stack.Screen 
      name="Payment" 
      component={PaymentScreen}
      options={{ title: 'Payment' }}
    />
    <Stack.Screen 
      name="PaymentCallback" 
      component={PaymentCallbackScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen 
      name="PaymentSuccess" 
      component={PaymentSuccessScreen}
      options={{ title: 'Payment Success' }}
    />
    <Stack.Screen 
      name="PaymentFailed" 
      component={PaymentFailedScreen}
      options={{ title: 'Payment Failed' }}
    />
  </Stack.Navigator>
);

const AppNavigator = () => {
  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator>
        <Stack.Screen 
          name="Main" 
          component={Tab.Navigator}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="PaymentFlow" 
          component={PaymentStack}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
```

---

## 🧪 Test Cards & Scenarios

### Standard Test Cards

| Card Number | Type | Expiry | CVV | Expected Result |
|------------|------|--------|-----|----------------|
| `5123456789012346` | Mastercard | 01/39 | 100 | ✅ Approved (Frictionless) |
| `4508750015741019` | Visa | 01/39 | 100 | ✅ Approved (Frictionless) |
| `5123450000000008` | Mastercard | 01/39 | 100 | 🔐 Challenge → ✅ Approved |
| `4111111111111111` | Visa | 01/39 | 100 | 🔐 Challenge → ✅ Approved |
| `5123456789012346` | Mastercard | 05/39 | 100 | ❌ Declined |
| `5123456789012346` | Mastercard | 04/27 | 100 | ❌ Expired Card |

### 3DS Test Scenarios

#### Scenario 1: Frictionless Flow
1. Use card: `5123456789012346`
2. Enter card details
3. **Expected**: Auto-authenticates, no OTP needed
4. **Result**: Payment approved immediately

#### Scenario 2: Challenge Flow
1. Use card: `5123450000000008`
2. Enter card details
3. **Expected**: OTP page appears in WebView
4. Enter OTP: `123456` (any 6 digits for test)
5. **Result**: Payment approved after OTP

#### Scenario 3: Declined Payment
1. Use card: `5123456789012346`
2. Set expiry: `05/39` (triggers decline)
3. **Expected**: Payment declined
4. **Result**: Error message shown

### Testing Checklist

- [ ] Frictionless 3DS authentication
- [ ] Challenge 3DS authentication (OTP entry)
- [ ] Successful payment completion
- [ ] Declined payment handling
- [ ] Expired card handling
- [ ] Network error handling
- [ ] WebView navigation
- [ ] Deep linking callback
- [ ] Payment status verification
- [ ] Error message display

---

## ⚠️ Error Handling

### Common Errors & Solutions

#### 1. WebView Not Loading Payment Page

**Error**: Blank screen or "Page not found"

**Solutions**:
```javascript
// Check URL format
const paymentPageUrl = `https://na.gateway.mastercard.com/checkout/pay/${sessionId}`;

// Ensure WebView has proper permissions
<WebView
  source={{ uri: paymentPageUrl }}
  javaScriptEnabled={true}
  domStorageEnabled={true}
  startInLoadingState={true}
/>
```

#### 2. Deep Link Not Triggering

**Error**: Callback not received after payment

**Solutions**:
- Verify deep link configuration in `app.json` / `AndroidManifest.xml`
- Check returnUrl format in backend: `jetsetterss://payment/callback`
- Test deep link manually: `adb shell am start -W -a android.intent.action.VIEW -d "jetsetterss://payment/callback?resultIndicator=XXX"`

#### 3. 3DS Challenge Not Appearing

**Error**: Payment proceeds without 3DS challenge

**Solutions**:
- Verify `INITIATE_CHECKOUT` includes authentication block
- Use challenge test card: `5123450000000008`
- Check WebView allows navigation to 3DS URLs

#### 4. Payment Stuck in Pending

**Error**: Payment status remains "pending" after 3DS

**Solutions**:
- Backend should auto-trigger PAY after authentication
- Check backend logs for PAY operation
- Verify `authTransactionId` is extracted correctly

### Error Handling Code

```javascript
const handlePaymentError = (error) => {
  let errorMessage = 'Payment failed. Please try again.';
  
  if (error.response) {
    const { status, data } = error.response;
    
    switch (status) {
      case 400:
        errorMessage = data.error || 'Invalid payment request';
        break;
      case 401:
        errorMessage = 'Authentication failed. Please login again.';
        break;
      case 402:
        errorMessage = 'Payment declined. Please check your card details.';
        break;
      case 500:
        errorMessage = 'Server error. Please try again later.';
        break;
      default:
        errorMessage = data.error || 'Payment request failed';
    }
  } else if (error.request) {
    errorMessage = 'Network error. Please check your internet connection.';
  } else {
    errorMessage = error.message || 'An unexpected error occurred';
  }
  
  Alert.alert('Payment Error', errorMessage);
};
```

---

## 📱 Mobile-Specific Considerations

### 1. WebView Security

```javascript
<WebView
  source={{ uri: paymentUrl }}
  // Security settings
  javaScriptEnabled={true}
  domStorageEnabled={true}
  mixedContentMode="always"
  // Prevent external navigation
  onShouldStartLoadWithRequest={(request) => {
    const { url } = request;
    // Only allow ARC Pay domains
    if (url.includes('gateway.mastercard.com') || 
        url.includes('arcpay.travel')) {
      return true;
    }
    // Block other URLs
    return false;
  }}
/>
```

### 2. Deep Linking Handling

```javascript
import * as Linking from 'expo-linking';

useEffect(() => {
  // Handle deep link on app open
  const handleDeepLink = (event) => {
    const { url } = event;
    if (url.includes('/payment/callback')) {
      const params = Linking.parse(url);
      navigation.navigate('PaymentCallback', {
        resultIndicator: params.queryParams?.resultIndicator,
        sessionId: params.queryParams?.sessionId,
        quoteId: params.queryParams?.quote_id,
        inquiryId: params.queryParams?.inquiry_id,
      });
    }
  };

  // Listen for deep links
  Linking.addEventListener('url', handleDeepLink);
  
  // Check if app was opened via deep link
  Linking.getInitialURL().then((url) => {
    if (url) handleDeepLink({ url });
  });

  return () => {
    Linking.removeEventListener('url', handleDeepLink);
  };
}, []);
```

### 3. Back Button Handling

```javascript
import { BackHandler } from 'react-native';

useEffect(() => {
  const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
    // Prevent back button during payment
    if (isPaymentInProgress) {
      Alert.alert(
        'Payment in Progress',
        'Are you sure you want to cancel this payment?',
        [
          { text: 'Continue Payment', style: 'cancel' },
          { 
            text: 'Cancel Payment', 
            onPress: () => {
              cancelPayment();
              navigation.goBack();
            }
          },
        ]
      );
      return true; // Prevent default back action
    }
    return false; // Allow default back action
  });

  return () => backHandler.remove();
}, [isPaymentInProgress]);
```

### 4. Network State Handling

```javascript
import NetInfo from '@react-native-community/netinfo';

const [isConnected, setIsConnected] = useState(true);

useEffect(() => {
  const unsubscribe = NetInfo.addEventListener(state => {
    setIsConnected(state.isConnected);
    
    if (!state.isConnected && isPaymentInProgress) {
      Alert.alert(
        'No Internet Connection',
        'Please check your internet connection to complete the payment.',
        [{ text: 'OK' }]
      );
    }
  });

  return () => unsubscribe();
}, []);
```

### 5. Payment State Persistence

```javascript
// Save payment state
await AsyncStorage.setItem('payment_state', JSON.stringify({
  paymentId,
  sessionId,
  quoteId,
  timestamp: Date.now(),
}));

// Restore payment state on app restart
useEffect(() => {
  const restorePaymentState = async () => {
    const savedState = await AsyncStorage.getItem('payment_state');
    if (savedState) {
      const state = JSON.parse(savedState);
      // Check if payment is still valid (within 30 minutes)
      if (Date.now() - state.timestamp < 30 * 60 * 1000) {
        // Resume payment flow
        setPaymentState(state);
      } else {
        // Clear expired state
        await AsyncStorage.removeItem('payment_state');
      }
    }
  };
  
  restorePaymentState();
}, []);
```

---

## ✅ Testing Checklist

### Pre-Development
- [ ] Environment variables configured
- [ ] Deep linking configured
- [ ] WebView permissions set
- [ ] API endpoints accessible

### Development Testing
- [ ] Payment initiation works
- [ ] WebView loads payment page
- [ ] Card details can be entered
- [ ] 3DS frictionless flow works
- [ ] 3DS challenge flow works (OTP entry)
- [ ] Payment callback received
- [ ] Payment status verified
- [ ] Success screen displayed
- [ ] Failure screen displayed

### Error Scenarios
- [ ] Network error handling
- [ ] Invalid card handling
- [ ] Declined payment handling
- [ ] Expired session handling
- [ ] Back button during payment
- [ ] App backgrounding during payment

### Production Readiness
- [ ] Test with production ARC Pay credentials
- [ ] Verify SSL/TLS certificates
- [ ] Test on multiple Android versions
- [ ] Test on different screen sizes
- [ ] Performance testing
- [ ] Security audit

---

## 🔗 Related Documentation

- **Web Implementation**: See `ARC_PAY_3DS_GUIDE.md` for web platform details
- **Backend API**: Same endpoints as web platform (`/api/payments`)
- **ARC Pay Docs**: [Mastercard Payment Gateway Documentation](https://na.gateway.mastercard.com/api/documentation/)
- **Test Cards**: See `ARC_PAY_3DS_GUIDE.md` for complete test card list

---

## 📞 Support

### Backend API Endpoints (Same as Web)

```
POST /api/payments?action=initiate-payment
GET  /api/payments?action=payment-callback
GET  /api/payments?action=get-payment-details
```

### Environment Variables (Shared with Web)

```env
ARC_PAY_API_URL=https://na.gateway.mastercard.com/api/rest/version/100/merchant/TESTARC05511704
ARC_PAY_MERCHANT_ID=TESTARC05511704
SUPABASE_URL=https://qqmagqwumjipdqvxbiqu.supabase.co
```

---

**Document Status**: ✅ **COMPLETE**  
**Last Updated**: January 2025  
**Version**: 1.0

This guide provides complete implementation instructions for integrating ARC Pay into the Jetsetterss Android app. The implementation uses the same backend API as the web platform, ensuring consistency across all platforms.

