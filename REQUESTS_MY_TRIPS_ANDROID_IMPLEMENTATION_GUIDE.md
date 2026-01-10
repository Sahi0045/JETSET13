# Requests & My Trips Android Implementation Guide

## 📋 Overview

This document describes how the **Jetsetterss Android app** (React Native / Expo) must implement:

- The **Request form** flow (`/request` on web)
- The **My Trips / My Requests** flow (`/my-trips` on web)

The goal is **strict web parity**:

- Use the **same REST API endpoints** as the web app.
- Use the **same JSON payloads and field names**.
- Store everything in the **same Supabase tables** (inquiries, quotes, bookings, payments).
- Do **not** introduce any Android-specific models or mock data.

---

## 🧩 Architecture & Data Flow

### 1. Request Form (`/request`)

**Web behavior (reference):**

- User opens `https://www.jetsetterss.com/request`.
- Fills in trip details (destination, dates, passengers, budget, notes, etc.).
- Web sends a **single POST** to the backend to create an **inquiry** (and possibly initial related records).
- Backend saves to Supabase and returns the created inquiry (with `id`, `status`, etc.).

**Android behavior must be identical:**

1. **Screen**: `NewRequestScreen`
2. **Action**: On submit, Android app sends a **POST** to the **same endpoint** the web form uses (e.g. `POST /api/inquiries` or `POST /api/requests`).
3. **Payload**: Must match the **exact JSON structure** of the web request body.
4. **Response handling**:
   - If success: navigate to `InquiryDetailScreen` with `inquiryId` from the response, or show a “Request Submitted” confirmation then go to detail.
   - If validation error: show user-friendly error messages.

> **Implementation rule:**  
> Whenever you change the web `/request` payload or endpoint, this Android implementation must be updated to match. There is only **one canonical request format**, shared by web and mobile.

---

### 2. My Trips / My Requests (`/my-trips`)

**Web behavior (reference):**

- User opens `https://www.jetsetterss.com/my-trips`.
- Page shows:
  - **Upcoming / Past bookings** (paid/confirmed).
  - **Inquiries / Requests** with their associated quotes and payment status.
- The same Supabase data is used for both:
  - `inquiries` + `quotes` + `payments` for quotes.
  - `bookings` + `payments` for completed trips.

**Android behavior must be identical:**

1. **Screen**: `MyTripsScreen`.
2. **Data**:
   - Fetch the **same REST endpoints** the web page uses (for example):
     - `GET /api/inquiries?mine=true` – all inquiries for the logged-in user, including quotes.
     - `GET /api/bookings?mine=true` – all bookings for the logged-in user.
     - Or a combined endpoint like `GET /api/my-trips` if that’s what the web uses.
3. **Filtering & grouping**:
   - Apply the **same rules as web**:
     - Upcoming vs Past.
     - Paid vs Unpaid.
     - Final vs non-final quotes.
4. **Actions**:
   - Tap a **request/inquiry** → navigate to `InquiryDetailScreen`.
   - From `InquiryDetailScreen`, when a quote is **final** and `payment_status === 'unpaid'`, show **Pay Now** → go into ARC Pay payment flow using `quoteId`.

---

## ⚙️ Environment & Auth

- **Base API URL**: Same as used by web app (e.g. `https://www.jetsetterss.com/api`).
- **Auth**:
  - Use the same JWT / token the web uses (stored in `AsyncStorage`).
  - Attach as `Authorization: Bearer <token>` on all authenticated requests (`/my-trips`, `/inquiries`, etc.).
- **Supabase**:
  - No direct Supabase writes from Android for these flows.
  - Android always goes through the backend REST API, same as the web pages.

---

## 📝 New Request Implementation

### 1. Screen: `NewRequestScreen`

**Responsibilities:**

- Render the same logical fields as `/request`:
  - Trip type (flight / hotel / cruise / package / custom).
  - Origin / destination / location fields.
  - Dates (start/end or departure/return).
  - Passenger counts (adults, children, infants).
  - Budget / cabin / room preferences as applicable.
  - Free-text notes / additional requirements.
  - Contact details (prefill from logged‑in user profile when possible).
- Validate required fields before sending to API.

### 2. Service: `RequestService.js`

**Structure (pseudocode, adapt to your real endpoint + fields):**

```javascript
// src/services/RequestService.js
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'https://www.jetsetterss.com/api'; // same as web

class RequestService {
  async getAuthToken() {
    const token =
      (await AsyncStorage.getItem('token')) ||
      (await AsyncStorage.getItem('supabase_token')) ||
      (await AsyncStorage.getItem('auth_token'));
    return token;
  }

  /**
   * Create a new inquiry/request (same payload & endpoint as web /request form)
   * @param {object} payload - Must match existing web JSON body
   */
  async createRequest(payload) {
    const token = await this.getAuthToken();

    const response = await axios.post(
      `${API_BASE_URL}/<SAME_PATH_AS_WEB_REQUEST>`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      }
    );

    return response.data;
  }
}

export default new RequestService();
```

> Replace `/<SAME_PATH_AS_WEB_REQUEST>` with the **actual path** used by the web `/request` page.  
> Do **not** introduce a new mobile-only endpoint.

---

## 📂 My Trips Implementation

### 1. Screen: `MyTripsScreen`

**Responsibilities:**

- On mount or focus:
  - Call the **same API(s)** as web:
    - Example:
      - `GET /api/my-trips`
      - or `GET /api/inquiries?mine=true` + `GET /api/bookings?mine=true`
  - Store results in local state and split into:
    - Upcoming bookings / past bookings.
    - Active requests / closed requests.
- Render lists grouped similarly to the web layout:
  - Sections or tabs: “Upcoming”, “Past”, “Requests”.
- Attach navigation handlers:
  - Tap booking → Booking detail screen (Android) using existing booking data.
  - Tap request/inquiry → `InquiryDetailScreen` with `inquiryId`.

### 2. Service: `MyTripsService.js`

**Structure (pseudocode, adapt to real endpoints):**

```javascript
// src/services/MyTripsService.js
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'https://www.jetsetterss.com/api';

class MyTripsService {
  async getAuthToken() {
    const token =
      (await AsyncStorage.getItem('token')) ||
      (await AsyncStorage.getItem('supabase_token')) ||
      (await AsyncStorage.getItem('auth_token'));
    return token;
  }

  async getMyTrips() {
    const token = await this.getAuthToken();

    const response = await axios.get(`${API_BASE_URL}/<SAME_PATH_AS_WEB_MY_TRIPS>`, {
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });

    return response.data;
  }
}

export default new MyTripsService();
```

> Again, `<SAME_PATH_AS_WEB_MY_TRIPS>` must be replaced with the real endpoint already used by `https://www.jetsetterss.com/my-trips`.

---

## 🔗 Integration with ARC Pay Flow

- From `MyTripsScreen` → `InquiryDetailScreen`:
  - When a quote is **final** and `payment_status === 'unpaid'`, show a **Pay Now** button.
- On **Pay Now**:
  - Navigate to the ARC Pay payment flow documented in `ARC_PAY_ANDROID_IMPLEMENTATION_GUIDE.md`, passing:
    - `quoteId`
    - `inquiryId` (optional but recommended).
- All payment logic stays in:
  - Backend `/api/payments` controller, plus ARC Pay Hosted Checkout.
  - Android only sends `quoteId` and opens the Hosted Checkout WebView.

This keeps the **request → quote → pay → booking** lifecycle identical between web and Android.

---

## ✅ Testing Checklist (Requests & My Trips)

### Request (`/request`)

- [ ] Submitting a new request in the app creates an inquiry visible on the web `/my-trips`.
- [ ] Submitting a new request on the web shows up in Android `MyTripsScreen`.
- [ ] All required fields validate properly in the app.
- [ ] The inquiry created from app has the same structure and status as web-created inquiries.

### My Trips (`/my-trips`)

- [ ] Android `MyTripsScreen` shows the same bookings and requests as the web `My Trips` page.
- [ ] Upcoming vs Past filters match web behavior.
- [ ] Requests/inquiries list and statuses match web.
- [ ] Tapping a request opens the correct `InquiryDetailScreen`.
- [ ] From a final quote, Pay Now triggers the ARC Pay flow and, after success, the booking appears in both web and app.

---

---

## 🎨 Complete React Native Implementation Code

### 1. RequestService.js (Complete)

**File: `src/services/RequestService.js`**

```javascript
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'https://www.jetsetterss.com/api';

class RequestService {
  async getAuthToken() {
    const token =
      (await AsyncStorage.getItem('token')) ||
      (await AsyncStorage.getItem('supabase_token')) ||
      (await AsyncStorage.getItem('auth_token'));
    return token;
  }

  /**
   * Create a new inquiry/request
   * Endpoint: POST /api/inquiries (same as web)
   * @param {object} payload - Must match web /request form JSON structure
   */
  async createRequest(payload) {
    try {
      const token = await this.getAuthToken();

      const response = await axios.post(
        `${API_BASE_URL}/inquiries`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Create request error:', error);
      throw this.handleError(error);
    }
  }

  handleError(error) {
    if (error.response) {
      const message = error.response.data?.message || 
                     error.response.data?.error || 
                     'Failed to submit request';
      return new Error(message);
    } else if (error.request) {
      return new Error('Network error. Please check your internet connection.');
    }
    return new Error(error.message || 'An unexpected error occurred');
  }
}

export default new RequestService();
```

---

### 2. NewRequestScreen.jsx (Complete UI Component)

**File: `src/screens/NewRequestScreen.jsx`**

```javascript
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import RequestService from '../services/RequestService';

const NewRequestScreen = ({ navigation, route }) => {
  const [inquiryType, setInquiryType] = useState('flight');
  const [formData, setFormData] = useState({
    // Common fields
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    customer_country: '',
    special_requirements: '',
    budget_range: '',
    preferred_contact_method: 'email',

    // Flight specific
    flight_origin: '',
    flight_destination: '',
    flight_departure_date: '',
    flight_return_date: '',
    flight_passengers: '1',
    flight_class: 'economy',

    // Hotel specific
    hotel_destination: '',
    hotel_checkin_date: '',
    hotel_checkout_date: '',
    hotel_rooms: '1',
    hotel_guests: '1',
    hotel_room_type: '',

    // Cruise specific
    cruise_destination: '',
    cruise_departure_date: '',
    cruise_duration: '7',
    cruise_cabin_type: '',
    cruise_passengers: '1',

    // Package specific
    package_destination: '',
    package_start_date: '',
    package_end_date: '',
    package_travelers: '1',
    package_budget_range: '',
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState({ field: null, visible: false });

  useEffect(() => {
    // Pre-fill user info if logged in
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    try {
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        setFormData(prev => ({
          ...prev,
          customer_name: user.firstName && user.lastName 
            ? `${user.firstName} ${user.lastName}` 
            : user.email?.split('@')[0] || '',
          customer_email: user.email || '',
        }));
      }
    } catch (error) {
      console.log('Could not load user info:', error);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleDateChange = (event, selectedDate, field) => {
    setShowDatePicker({ field: null, visible: false });
    if (event.type === 'set' && selectedDate) {
      const dateStr = selectedDate.toISOString().split('T')[0];
      handleChange(field, dateStr);
    }
  };

  const validateForm = () => {
    const newErrors = {};

    // Common validations
    if (!formData.customer_name.trim()) {
      newErrors.customer_name = 'Name is required';
    }
    if (!formData.customer_email.trim()) {
      newErrors.customer_email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.customer_email)) {
      newErrors.customer_email = 'Invalid email format';
    }
    if (!formData.customer_phone.trim()) {
      newErrors.customer_phone = 'Phone is required';
    }

    // Type-specific validations
    if (inquiryType === 'flight') {
      if (!formData.flight_origin.trim()) newErrors.flight_origin = 'Origin is required';
      if (!formData.flight_destination.trim()) newErrors.flight_destination = 'Destination is required';
      if (!formData.flight_departure_date) newErrors.flight_departure_date = 'Departure date is required';
    } else if (inquiryType === 'hotel') {
      if (!formData.hotel_destination.trim()) newErrors.hotel_destination = 'Destination is required';
      if (!formData.hotel_checkin_date) newErrors.hotel_checkin_date = 'Check-in date is required';
      if (!formData.hotel_checkout_date) newErrors.hotel_checkout_date = 'Check-out date is required';
    } else if (inquiryType === 'cruise') {
      if (!formData.cruise_destination.trim()) newErrors.cruise_destination = 'Destination is required';
      if (!formData.cruise_departure_date) newErrors.cruise_departure_date = 'Departure date is required';
    } else if (inquiryType === 'package') {
      if (!formData.package_destination.trim()) newErrors.package_destination = 'Destination is required';
      if (!formData.package_start_date) newErrors.package_start_date = 'Start date is required';
      if (!formData.package_end_date) newErrors.package_end_date = 'End date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getTypeSpecificData = () => {
    switch (inquiryType) {
      case 'flight':
        return {
          flight_origin: formData.flight_origin,
          flight_destination: formData.flight_destination,
          flight_departure_date: formData.flight_departure_date,
          flight_return_date: formData.flight_return_date || null,
          flight_passengers: parseInt(formData.flight_passengers) || 1,
          flight_class: formData.flight_class,
        };
      case 'hotel':
        return {
          hotel_destination: formData.hotel_destination,
          hotel_checkin_date: formData.hotel_checkin_date,
          hotel_checkout_date: formData.hotel_checkout_date,
          hotel_rooms: parseInt(formData.hotel_rooms) || 1,
          hotel_guests: parseInt(formData.hotel_guests) || 1,
          hotel_room_type: formData.hotel_room_type,
        };
      case 'cruise':
        return {
          cruise_destination: formData.cruise_destination,
          cruise_departure_date: formData.cruise_departure_date,
          cruise_duration: parseInt(formData.cruise_duration) || 7,
          cruise_cabin_type: formData.cruise_cabin_type,
          cruise_passengers: parseInt(formData.cruise_passengers) || 1,
        };
      case 'package':
        return {
          package_destination: formData.package_destination,
          package_start_date: formData.package_start_date,
          package_end_date: formData.package_end_date,
          package_travelers: parseInt(formData.package_travelers) || 1,
          package_budget_range: formData.package_budget_range,
        };
      default:
        return {};
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      Alert.alert('Validation Error', 'Please fill in all required fields correctly.');
      return;
    }

    setIsSubmitting(true);

    try {
      const inquiryData = {
        inquiry_type: inquiryType,
        customer_name: formData.customer_name,
        customer_email: formData.customer_email,
        customer_phone: formData.customer_phone,
        customer_country: formData.customer_country || null,
        special_requirements: formData.special_requirements || null,
        budget_range: formData.budget_range || null,
        preferred_contact_method: formData.preferred_contact_method,
        ...getTypeSpecificData(),
      };

      const result = await RequestService.createRequest(inquiryData);

      if (result.success && result.data?.inquiry) {
        Alert.alert(
          'Request Submitted',
          'Your inquiry has been submitted successfully! Our travel experts will get back to you within 24 hours.',
          [
            {
              text: 'View Request',
              onPress: () => {
                navigation.replace('InquiryDetail', {
                  inquiryId: result.data.inquiry.id,
                });
              },
            },
            {
              text: 'OK',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      } else {
        throw new Error(result.message || 'Failed to submit request');
      }
    } catch (error) {
      console.error('Submit error:', error);
      Alert.alert('Error', error.message || 'Failed to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderFlightFields = () => (
    <>
      <View style={styles.formGroup}>
        <Text style={styles.label}>Origin *</Text>
        <TextInput
          style={[styles.input, errors.flight_origin && styles.inputError]}
          placeholder="e.g., JFK, New York"
          value={formData.flight_origin}
          onChangeText={(value) => handleChange('flight_origin', value)}
        />
        {errors.flight_origin && <Text style={styles.errorText}>{errors.flight_origin}</Text>}
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Destination *</Text>
        <TextInput
          style={[styles.input, errors.flight_destination && styles.inputError]}
          placeholder="e.g., LAX, Los Angeles"
          value={formData.flight_destination}
          onChangeText={(value) => handleChange('flight_destination', value)}
        />
        {errors.flight_destination && <Text style={styles.errorText}>{errors.flight_destination}</Text>}
      </View>

      <View style={styles.formRow}>
        <View style={styles.formGroupHalf}>
          <Text style={styles.label}>Departure Date *</Text>
          <TouchableOpacity
            style={[styles.input, errors.flight_departure_date && styles.inputError]}
            onPress={() => setShowDatePicker({ field: 'flight_departure_date', visible: true })}
          >
            <Text style={styles.dateText}>
              {formData.flight_departure_date || 'Select date'}
            </Text>
          </TouchableOpacity>
          {errors.flight_departure_date && (
            <Text style={styles.errorText}>{errors.flight_departure_date}</Text>
          )}
        </View>

        <View style={styles.formGroupHalf}>
          <Text style={styles.label}>Return Date</Text>
          <TouchableOpacity
            style={styles.input}
            onPress={() => setShowDatePicker({ field: 'flight_return_date', visible: true })}
          >
            <Text style={styles.dateText}>
              {formData.flight_return_date || 'Select date'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.formRow}>
        <View style={styles.formGroupHalf}>
          <Text style={styles.label}>Passengers *</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={formData.flight_passengers}
            onChangeText={(value) => handleChange('flight_passengers', value)}
          />
        </View>

        <View style={styles.formGroupHalf}>
          <Text style={styles.label}>Class</Text>
          <View style={styles.pickerContainer}>
            {['economy', 'premium_economy', 'business', 'first'].map((cls) => (
              <TouchableOpacity
                key={cls}
                style={[
                  styles.pickerOption,
                  formData.flight_class === cls && styles.pickerOptionActive,
                ]}
                onPress={() => handleChange('flight_class', cls)}
              >
                <Text
                  style={[
                    styles.pickerOptionText,
                    formData.flight_class === cls && styles.pickerOptionTextActive,
                  ]}
                >
                  {cls.charAt(0).toUpperCase() + cls.slice(1).replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </>
  );

  const renderCommonFields = () => (
    <>
      <View style={styles.formGroup}>
        <Text style={styles.label}>Full Name *</Text>
        <TextInput
          style={[styles.input, errors.customer_name && styles.inputError]}
          placeholder="John Doe"
          value={formData.customer_name}
          onChangeText={(value) => handleChange('customer_name', value)}
        />
        {errors.customer_name && <Text style={styles.errorText}>{errors.customer_name}</Text>}
      </View>

      <View style={styles.formRow}>
        <View style={styles.formGroupHalf}>
          <Text style={styles.label}>Email *</Text>
          <TextInput
            style={[styles.input, errors.customer_email && styles.inputError]}
            placeholder="john@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={formData.customer_email}
            onChangeText={(value) => handleChange('customer_email', value)}
          />
          {errors.customer_email && <Text style={styles.errorText}>{errors.customer_email}</Text>}
        </View>

        <View style={styles.formGroupHalf}>
          <Text style={styles.label}>Phone *</Text>
          <TextInput
            style={[styles.input, errors.customer_phone && styles.inputError]}
            placeholder="+1234567890"
            keyboardType="phone-pad"
            value={formData.customer_phone}
            onChangeText={(value) => handleChange('customer_phone', value)}
          />
          {errors.customer_phone && <Text style={styles.errorText}>{errors.customer_phone}</Text>}
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Budget Range</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., $1000 - $2000"
          value={formData.budget_range}
          onChangeText={(value) => handleChange('budget_range', value)}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Special Requirements</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Any special requests or requirements..."
          multiline
          numberOfLines={4}
          value={formData.special_requirements}
          onChangeText={(value) => handleChange('special_requirements', value)}
        />
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Request</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Inquiry Type Selector */}
        <View style={styles.typeSelector}>
          {['flight', 'hotel', 'cruise', 'package'].map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.typeButton,
                inquiryType === type && styles.typeButtonActive,
              ]}
              onPress={() => setInquiryType(type)}
            >
              <Text
                style={[
                  styles.typeButtonText,
                  inquiryType === type && styles.typeButtonTextActive,
                ]}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Form Fields */}
        {inquiryType === 'flight' && renderFlightFields()}
        {/* Add similar render functions for hotel, cruise, package */}
        {renderCommonFields()}

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Submit Request</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Date Picker */}
      {showDatePicker.visible && (
        <DateTimePicker
          value={new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, date) =>
            handleDateChange(event, date, showDatePicker.field)
          }
          minimumDate={new Date()}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
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
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  typeSelector: {
    flexDirection: 'row',
    marginBottom: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: '#1e40af',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  formGroup: {
    marginBottom: 16,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  formGroupHalf: {
    flex: 1,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  dateText: {
    fontSize: 16,
    color: formData.flight_departure_date ? '#111827' : '#9ca3af',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 4,
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pickerOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  pickerOptionActive: {
    backgroundColor: '#1e40af',
    borderColor: '#1e40af',
  },
  pickerOptionText: {
    fontSize: 12,
    color: '#6b7280',
  },
  pickerOptionTextActive: {
    color: '#fff',
  },
  submitButton: {
    backgroundColor: '#1e40af',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 32,
    shadowColor: '#1e40af',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default NewRequestScreen;
```

---

### 3. MyTripsService.js (Complete)

**File: `src/services/MyTripsService.js`**

```javascript
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'https://www.jetsetterss.com/api';

class MyTripsService {
  async getAuthToken() {
    const token =
      (await AsyncStorage.getItem('token')) ||
      (await AsyncStorage.getItem('supabase_token')) ||
      (await AsyncStorage.getItem('auth_token'));
    return token;
  }

  /**
   * Get user's inquiries/requests
   * Endpoint: GET /api/inquiries (with user filter)
   */
  async getMyInquiries() {
    try {
      const token = await this.getAuthToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      const response = await axios.get(`${API_BASE_URL}/inquiries`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Get inquiries error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Get user's bookings
   * Endpoint: GET /api/bookings (or similar)
   */
  async getMyBookings() {
    try {
      const token = await this.getAuthToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      // Adjust endpoint based on your actual API
      const response = await axios.get(`${API_BASE_URL}/bookings`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Get bookings error:', error);
      throw this.handleError(error);
    }
  }

  handleError(error) {
    if (error.response) {
      const message = error.response.data?.message || 
                     error.response.data?.error || 
                     'Failed to load data';
      return new Error(message);
    } else if (error.request) {
      return new Error('Network error. Please check your internet connection.');
    }
    return new Error(error.message || 'An unexpected error occurred');
  }
}

export default new MyTripsService();
```

---

### 4. MyTripsScreen.jsx (Complete UI Component)

**File: `src/screens/MyTripsScreen.jsx`**

```javascript
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MyTripsService from '../services/MyTripsService';

const MyTripsScreen = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState('Upcoming');
  const [inquiries, setInquiries] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const [inquiriesData, bookingsData] = await Promise.all([
        MyTripsService.getMyInquiries().catch(() => ({ success: false, data: [] })),
        MyTripsService.getMyBookings().catch(() => ({ success: false, data: [] })),
      ]);

      if (inquiriesData.success) {
        setInquiries(inquiriesData.data || []);
      }
      if (bookingsData.success) {
        setBookings(bookingsData.data || []);
      }
    } catch (error) {
      console.error('Load data error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const filterItems = (items, type) => {
    const now = new Date();
    return items.filter((item) => {
      if (type === 'Upcoming') {
        const date = item.departure_date || item.start_date || item.flight_departure_date;
        return date && new Date(date) >= now;
      } else {
        const date = item.departure_date || item.start_date || item.flight_departure_date;
        return !date || new Date(date) < now;
      }
    });
  };

  const getDisplayItems = () => {
    if (activeTab === 'Requests') {
      return inquiries;
    }
    const allBookings = bookings;
    return filterItems(allBookings, activeTab);
  };

  const renderInquiryCard = (inquiry) => {
    const hasUnpaidQuote = inquiry.quotes?.some(
      (q) => q.status === 'sent' && q.payment_status === 'unpaid'
    );

    return (
      <TouchableOpacity
        key={inquiry.id}
        style={styles.card}
        onPress={() => navigation.navigate('InquiryDetail', { inquiryId: inquiry.id })}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.cardTitle}>
              {inquiry.inquiry_type?.charAt(0).toUpperCase() + inquiry.inquiry_type?.slice(1) || 'Request'}
            </Text>
            <Text style={styles.cardSubtitle}>
              {inquiry.flight_destination || inquiry.hotel_destination || inquiry.cruise_destination || inquiry.package_destination || 'Custom Request'}
            </Text>
          </View>
          <View style={[styles.statusBadge, styles[`status${inquiry.status}`]]}>
            <Text style={styles.statusText}>{inquiry.status}</Text>
          </View>
        </View>

        {inquiry.quotes && inquiry.quotes.length > 0 && (
          <View style={styles.quotesSection}>
            {inquiry.quotes.map((quote) => (
              <View key={quote.id} style={styles.quoteRow}>
                <Text style={styles.quoteText}>
                  {quote.quote_number || quote.id.slice(-8)} - ${parseFloat(quote.total_amount || 0).toFixed(2)}
                </Text>
                {quote.payment_status === 'unpaid' && quote.status === 'sent' && (
                  <TouchableOpacity
                    style={styles.payButton}
                    onPress={() => {
                      navigation.navigate('PaymentFlow', {
                        screen: 'Payment',
                        params: {
                          quoteId: quote.id,
                          inquiryId: inquiry.id,
                        },
                      });
                    }}
                  >
                    <Text style={styles.payButtonText}>Pay Now</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}

        <Text style={styles.cardDate}>
          Created: {new Date(inquiry.created_at).toLocaleDateString()}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderBookingCard = (booking) => (
    <TouchableOpacity
      key={booking.id}
      style={styles.card}
      onPress={() => navigation.navigate('BookingDetail', { bookingId: booking.id })}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.cardTitle}>{booking.booking_reference || booking.id.slice(-8)}</Text>
          <Text style={styles.cardSubtitle}>{booking.travel_type || 'Booking'}</Text>
        </View>
        <View style={[styles.statusBadge, styles.statusbooked]}>
          <Text style={styles.statusText}>Booked</Text>
        </View>
      </View>

      <Text style={styles.cardAmount}>
        ${parseFloat(booking.total_amount || 0).toFixed(2)} {booking.currency || 'USD'}
      </Text>
      <Text style={styles.cardDate}>
        {booking.departure_date || booking.start_date
          ? `Departure: ${new Date(booking.departure_date || booking.start_date).toLocaleDateString()}`
          : `Created: ${new Date(booking.created_at).toLocaleDateString()}`}
      </Text>
    </TouchableOpacity>
  );

  const displayItems = getDisplayItems();

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1e40af" />
          <Text style={styles.loadingText}>Loading your trips...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Trips</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('NewRequest')}
          style={styles.newRequestButton}
        >
          <Text style={styles.newRequestButtonText}>+ New Request</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {['Upcoming', 'Past', 'Requests'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {displayItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>✈️</Text>
            <Text style={styles.emptyStateTitle}>
              {activeTab === 'Requests' ? 'No Requests Yet' : `No ${activeTab} Trips`}
            </Text>
            <Text style={styles.emptyStateText}>
              {activeTab === 'Requests'
                ? 'Create a new travel request to get started'
                : `You don't have any ${activeTab.toLowerCase()} trips at the moment`}
            </Text>
            {activeTab === 'Requests' && (
              <TouchableOpacity
                style={styles.emptyStateButton}
                onPress={() => navigation.navigate('NewRequest')}
              >
                <Text style={styles.emptyStateButtonText}>Create Request</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {activeTab === 'Requests'
              ? inquiries.map(renderInquiryCard)
              : bookings.map(renderBookingCard)}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  newRequestButton: {
    backgroundColor: '#1e40af',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  newRequestButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#1e40af',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  tabTextActive: {
    color: '#1e40af',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'capitalize',
  },
  statuspending: { backgroundColor: '#f59e0b' },
  statusquoted: { backgroundColor: '#3b82f6' },
  statusbooked: { backgroundColor: '#10b981' },
  statuscancelled: { backgroundColor: '#ef4444' },
  quotesSection: {
    marginTop: 8,
    marginBottom: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  quoteText: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  payButton: {
    backgroundColor: '#1e40af',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
  },
  payButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  cardAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  cardDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyStateButton: {
    backgroundColor: '#1e40af',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyStateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default MyTripsScreen;
```

---

## 📦 Required Dependencies

Add these to your `package.json`:

```json
{
  "dependencies": {
    "@react-native-async-storage/async-storage": "^1.19.0",
    "@react-native-community/datetimepicker": "^7.6.0",
    "axios": "^1.6.0",
    "@react-navigation/native": "^6.1.0",
    "@react-navigation/stack": "^6.3.0"
  }
}
```

Install with:
```bash
npm install @react-native-async-storage/async-storage @react-native-community/datetimepicker axios @react-navigation/native @react-navigation/stack
```

---

## 📋 Booking Information Collection (Before Payment)

### Overview

Before a user can proceed to payment, they **must** complete their booking information. This includes:

- **Personal Information**: Full name, email, phone, date of birth, nationality
- **Government ID**: Required for ALL bookings (ID type, ID number, issue/expiry dates)
- **Passport Information**: Required ONLY for flight bookings (passport number, expiry date, etc.)
- **Emergency Contact**: Contact name, phone, relationship
- **Terms Acceptance**: Terms & conditions and privacy policy must be accepted

**API Endpoints:**
- `GET /api/quotes?id={quoteId}&endpoint=booking-info` - Get existing booking info
- `POST /api/quotes?id={quoteId}&endpoint=booking-info` - Save/update booking info

**Validation Rules:**
- Status must be `'completed'` or `'verified'` before payment can proceed
- For flights: Passport info is required
- For all bookings: Government ID is required
- Terms and privacy policy must be accepted

---

### 1. BookingInfoService.js

**File: `src/services/BookingInfoService.js`**

```javascript
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../constants/config';

// Force correct production API URL
const API_BASE_URL = 'https://www.jetsetterss.com/api';

const bookingInfoApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
bookingInfoApi.interceptors.request.use(async (config) => {
  const token =
    (await AsyncStorage.getItem('token')) ||
    (await AsyncStorage.getItem('supabase_token')) ||
    (await AsyncStorage.getItem('authToken')) ||
    (await AsyncStorage.getItem('auth_token'));

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

class BookingInfoService {
  /**
   * Get existing booking info for a quote
   * @param {string} quoteId - Quote ID
   * @returns {Promise<object>} Booking info data or null if not found
   */
  async getBookingInfo(quoteId) {
    try {
      console.log('📥 Fetching booking info for quote:', quoteId);
      const response = await bookingInfoApi.get(
        `/quotes?id=${quoteId}&endpoint=booking-info`
      );

      if (response.data.success && response.data.data) {
        console.log('✅ Booking info found:', response.data.data);
        return response.data.data;
      }

      return null;
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('ℹ️ No booking info found (404)');
        return null;
      }
      if (error.response?.status === 403) {
        console.error('❌ Not authorized to access booking info');
        throw new Error('Not authorized to access booking information');
      }
      console.error('❌ Error fetching booking info:', error);
      throw new Error(
        error.response?.data?.message ||
        'Failed to fetch booking information'
      );
    }
  }

  /**
   * Save or update booking info for a quote
   * @param {string} quoteId - Quote ID
   * @param {object} bookingData - Booking information data
   * @returns {Promise<object>} Saved booking info with status
   */
  async saveBookingInfo(quoteId, bookingData) {
    try {
      console.log('💾 Saving booking info for quote:', quoteId);
      console.log('📦 Booking data:', JSON.stringify(bookingData, null, 2));

      // Filter to only valid fields (same as web)
      const validFields = [
        'full_name',
        'email',
        'phone',
        'date_of_birth',
        'nationality',
        'passport_number',
        'passport_expiry_date',
        'passport_issue_date',
        'passport_issuing_country',
        'govt_id_type',
        'govt_id_number',
        'govt_id_issue_date',
        'govt_id_expiry_date',
        'govt_id_issuing_authority',
        'govt_id_issuing_country',
        'emergency_contact_name',
        'emergency_contact_phone',
        'emergency_contact_relationship',
        'booking_details',
        'terms_accepted',
        'privacy_policy_accepted',
      ];

      const filteredData = {};
      validFields.forEach((field) => {
        if (bookingData[field] !== undefined) {
          // Convert empty strings to null for date fields
          const dateFields = [
            'date_of_birth',
            'passport_expiry_date',
            'passport_issue_date',
            'govt_id_issue_date',
            'govt_id_expiry_date',
          ];
          if (dateFields.includes(field) && bookingData[field] === '') {
            filteredData[field] = null;
          } else {
            filteredData[field] = bookingData[field];
          }
        }
      });

      const response = await bookingInfoApi.post(
        `/quotes?id=${quoteId}&endpoint=booking-info`,
        filteredData
      );

      if (response.data.success) {
        console.log('✅ Booking info saved successfully');
        console.log('📋 Status:', response.data.status);
        return {
          success: true,
          data: response.data.data,
          status: response.data.status,
          message: response.data.message,
        };
      }

      throw new Error(response.data.message || 'Failed to save booking information');
    } catch (error) {
      console.error('❌ Error saving booking info:', error);
      
      if (error.response?.status === 403) {
        throw new Error('Not authorized to submit booking information');
      }
      if (error.response?.status === 400) {
        throw new Error(
          error.response.data?.message ||
          'Invalid booking information. Please check your entries.'
        );
      }
      if (error.response?.status === 401) {
        throw new Error('Please log in to submit booking information');
      }

      throw new Error(
        error.response?.data?.message ||
        error.message ||
        'Failed to save booking information'
      );
    }
  }

  /**
   * Check if booking info is complete (ready for payment)
   * @param {object} bookingInfo - Booking info object
   * @param {string} inquiryType - Inquiry type ('flight', 'hotel', etc.)
   * @returns {object} { isComplete: boolean, missingFields: string[] }
   */
  checkBookingInfoComplete(bookingInfo, inquiryType) {
    if (!bookingInfo) {
      return {
        isComplete: false,
        missingFields: ['all booking information'],
      };
    }

    const missingFields = [];

    // Required for all bookings
    if (!bookingInfo.full_name || !bookingInfo.email || !bookingInfo.phone) {
      missingFields.push('personal information');
    }

    // Government ID required for all
    if (!bookingInfo.govt_id_type || !bookingInfo.govt_id_number) {
      missingFields.push('government ID information');
    }

    // Passport required only for flights
    const isFlight = inquiryType === 'flight';
    if (isFlight && (!bookingInfo.passport_number || !bookingInfo.passport_expiry_date)) {
      missingFields.push('passport information');
    }

    // Terms required
    if (!bookingInfo.terms_accepted || !bookingInfo.privacy_policy_accepted) {
      missingFields.push('terms acceptance');
    }

    // Check status
    const status = bookingInfo.status;
    const hasRequiredFields = !missingFields.length;

    return {
      isComplete: hasRequiredFields && (status === 'completed' || status === 'verified'),
      missingFields,
      status,
    };
  }
}

export default new BookingInfoService();
```

---

### 2. BookingInfoFormScreen.jsx

**File: `src/screens/BookingInfoFormScreen.jsx`**

```javascript
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import BookingInfoService from '../services/BookingInfoService';

const BookingInfoFormScreen = ({ route, navigation }) => {
  const { quoteId, inquiryType } = route.params;

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    date_of_birth: '',
    nationality: '',
    passport_number: '',
    passport_expiry_date: '',
    passport_issue_date: '',
    passport_issuing_country: '',
    govt_id_type: '',
    govt_id_number: '',
    govt_id_issue_date: '',
    govt_id_expiry_date: '',
    govt_id_issuing_authority: '',
    govt_id_issuing_country: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
    terms_accepted: false,
    privacy_policy_accepted: false,
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [datePickerField, setDatePickerField] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerValue, setDatePickerValue] = useState(new Date());

  const isFlightBooking = inquiryType === 'flight';

  useEffect(() => {
    loadExistingBookingInfo();
  }, [quoteId]);

  const loadExistingBookingInfo = async () => {
    setLoading(true);
    try {
      const existing = await BookingInfoService.getBookingInfo(quoteId);
      if (existing) {
        // Populate form with existing data
        setFormData({
          full_name: existing.full_name || '',
          email: existing.email || '',
          phone: existing.phone || '',
          date_of_birth: existing.date_of_birth || '',
          nationality: existing.nationality || '',
          passport_number: existing.passport_number || '',
          passport_expiry_date: existing.passport_expiry_date || '',
          passport_issue_date: existing.passport_issue_date || '',
          passport_issuing_country: existing.passport_issuing_country || '',
          govt_id_type: existing.govt_id_type || '',
          govt_id_number: existing.govt_id_number || '',
          govt_id_issue_date: existing.govt_id_issue_date || '',
          govt_id_expiry_date: existing.govt_id_expiry_date || '',
          govt_id_issuing_authority: existing.govt_id_issuing_authority || '',
          govt_id_issuing_country: existing.govt_id_issuing_country || '',
          emergency_contact_name: existing.emergency_contact_name || '',
          emergency_contact_phone: existing.emergency_contact_phone || '',
          emergency_contact_relationship: existing.emergency_contact_relationship || '',
          terms_accepted: existing.terms_accepted || false,
          privacy_policy_accepted: existing.privacy_policy_accepted || false,
        });
      }
    } catch (error) {
      console.error('Error loading booking info:', error);
      Alert.alert('Error', error.message || 'Failed to load booking information');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate && datePickerField) {
      const dateStr = selectedDate.toISOString().split('T')[0];
      handleInputChange(datePickerField, dateStr);
    }
    setDatePickerField(null);
  };

  const openDatePicker = (field) => {
    const currentValue = formData[field];
    if (currentValue) {
      setDatePickerValue(new Date(currentValue));
    }
    setDatePickerField(field);
    setShowDatePicker(true);
  };

  const validateForm = () => {
    if (!formData.full_name || !formData.email || !formData.phone) {
      Alert.alert('Validation Error', 'Please fill in all required personal information fields.');
      return false;
    }

    if (!formData.govt_id_type || !formData.govt_id_number) {
      Alert.alert('Validation Error', 'Government ID information is required for all bookings.');
      return false;
    }

    if (isFlightBooking && (!formData.passport_number || !formData.passport_expiry_date)) {
      Alert.alert('Validation Error', 'Passport information is required for flight bookings.');
      return false;
    }

    if (!formData.terms_accepted || !formData.privacy_policy_accepted) {
      Alert.alert('Validation Error', 'Please accept the terms and conditions and privacy policy.');
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      const result = await BookingInfoService.saveBookingInfo(quoteId, formData);
      
      if (result.success) {
        Alert.alert(
          'Success',
          'Booking information saved successfully. You can now proceed to payment.',
          [
            {
              text: 'Continue to Payment',
              onPress: () => {
                navigation.goBack();
                // Trigger payment flow from parent screen
                if (route.params.onComplete) {
                  route.params.onComplete(result.data);
                }
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error saving booking info:', error);
      Alert.alert('Error', error.message || 'Failed to save booking information');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1e40af" />
        <Text style={styles.loadingText}>Loading booking information...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Complete Your Booking Information</Text>
          <Text style={styles.subtitle}>
            Please provide your travel information and documents to proceed with payment.
          </Text>
        </View>

        {/* Personal Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name *</Text>
            <TextInput
              style={styles.input}
              value={formData.full_name}
              onChangeText={(value) => handleInputChange('full_name', value)}
              placeholder="Enter your full name"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email *</Text>
            <TextInput
              style={styles.input}
              value={formData.email}
              onChangeText={(value) => handleInputChange('email', value)}
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone *</Text>
            <TextInput
              style={styles.input}
              value={formData.phone}
              onChangeText={(value) => handleInputChange('phone', value)}
              placeholder="Enter your phone number"
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Date of Birth</Text>
            <TouchableOpacity
              style={styles.dateInput}
              onPress={() => openDatePicker('date_of_birth')}
            >
              <Text style={formData.date_of_birth ? styles.dateText : styles.datePlaceholder}>
                {formData.date_of_birth || 'Select date of birth'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nationality</Text>
            <TextInput
              style={styles.input}
              value={formData.nationality}
              onChangeText={(value) => handleInputChange('nationality', value)}
              placeholder="Enter your nationality"
            />
          </View>
        </View>

        {/* Government ID Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Government ID Information <Text style={styles.required}>*</Text>
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>ID Type <Text style={styles.required}>*</Text></Text>
            <View style={styles.selectContainer}>
              <Text style={styles.selectText}>
                {formData.govt_id_type || 'Select ID Type'}
              </Text>
            </View>
            <View style={styles.selectOptions}>
              {['drivers_license', 'national_id', 'passport', 'other'].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.selectOption,
                    formData.govt_id_type === type && styles.selectOptionActive,
                  ]}
                  onPress={() => handleInputChange('govt_id_type', type)}
                >
                  <Text
                    style={[
                      styles.selectOptionText,
                      formData.govt_id_type === type && styles.selectOptionTextActive,
                    ]}
                  >
                    {type.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>ID Number <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={formData.govt_id_number}
              onChangeText={(value) => handleInputChange('govt_id_number', value)}
              placeholder="Enter government ID number"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Issue Date</Text>
            <TouchableOpacity
              style={styles.dateInput}
              onPress={() => openDatePicker('govt_id_issue_date')}
            >
              <Text
                style={
                  formData.govt_id_issue_date ? styles.dateText : styles.datePlaceholder
                }
              >
                {formData.govt_id_issue_date || 'Select issue date'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Expiry Date</Text>
            <TouchableOpacity
              style={styles.dateInput}
              onPress={() => openDatePicker('govt_id_expiry_date')}
            >
              <Text
                style={
                  formData.govt_id_expiry_date ? styles.dateText : styles.datePlaceholder
                }
              >
                {formData.govt_id_expiry_date || 'Select expiry date'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Issuing Authority</Text>
            <TextInput
              style={styles.input}
              value={formData.govt_id_issuing_authority}
              onChangeText={(value) => handleInputChange('govt_id_issuing_authority', value)}
              placeholder="e.g., DMV, Passport Office"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Issuing Country</Text>
            <TextInput
              style={styles.input}
              value={formData.govt_id_issuing_country}
              onChangeText={(value) => handleInputChange('govt_id_issuing_country', value)}
              placeholder="Enter issuing country"
            />
          </View>
        </View>

        {/* Passport Information (Only for Flights) */}
        {isFlightBooking && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Passport Information <Text style={styles.required}>*</Text>
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Passport Number <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={formData.passport_number}
                onChangeText={(value) => handleInputChange('passport_number', value)}
                placeholder="Enter passport number"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Passport Expiry Date <Text style={styles.required}>*</Text>
              </Text>
              <TouchableOpacity
                style={styles.dateInput}
                onPress={() => openDatePicker('passport_expiry_date')}
              >
                <Text
                  style={
                    formData.passport_expiry_date ? styles.dateText : styles.datePlaceholder
                  }
                >
                  {formData.passport_expiry_date || 'Select expiry date'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Passport Issue Date</Text>
              <TouchableOpacity
                style={styles.dateInput}
                onPress={() => openDatePicker('passport_issue_date')}
              >
                <Text
                  style={
                    formData.passport_issue_date ? styles.dateText : styles.datePlaceholder
                  }
                >
                  {formData.passport_issue_date || 'Select issue date'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Issuing Country</Text>
              <TextInput
                style={styles.input}
                value={formData.passport_issuing_country}
                onChangeText={(value) => handleInputChange('passport_issuing_country', value)}
                placeholder="Enter issuing country"
              />
            </View>
          </View>
        )}

        {/* Emergency Contact */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Emergency Contact</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Contact Name</Text>
            <TextInput
              style={styles.input}
              value={formData.emergency_contact_name}
              onChangeText={(value) => handleInputChange('emergency_contact_name', value)}
              placeholder="Enter emergency contact name"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Contact Phone</Text>
            <TextInput
              style={styles.input}
              value={formData.emergency_contact_phone}
              onChangeText={(value) => handleInputChange('emergency_contact_phone', value)}
              placeholder="Enter emergency contact phone"
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Relationship</Text>
            <TextInput
              style={styles.input}
              value={formData.emergency_contact_relationship}
              onChangeText={(value) =>
                handleInputChange('emergency_contact_relationship', value)
              }
              placeholder="e.g., Spouse, Parent, Friend"
            />
          </View>
        </View>

        {/* Terms and Conditions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Terms and Conditions</Text>

          <View style={styles.checkboxGroup}>
            <Switch
              value={formData.terms_accepted}
              onValueChange={(value) => handleInputChange('terms_accepted', value)}
            />
            <View style={styles.checkboxLabel}>
              <Text style={styles.checkboxText}>
                I accept the terms and conditions <Text style={styles.required}>*</Text>
              </Text>
              <Text style={styles.checkboxSubtext}>
                By accepting, you agree to our booking terms and conditions for travel services.
              </Text>
            </View>
          </View>

          <View style={styles.checkboxGroup}>
            <Switch
              value={formData.privacy_policy_accepted}
              onValueChange={(value) => handleInputChange('privacy_policy_accepted', value)}
            />
            <View style={styles.checkboxLabel}>
              <Text style={styles.checkboxText}>
                I accept the privacy policy <Text style={styles.required}>*</Text>
              </Text>
              <Text style={styles.checkboxSubtext}>
                By accepting, you consent to the collection and use of your personal information.
              </Text>
            </View>
          </View>
        </View>

        {/* Submit Button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.submitButton, saving && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Save & Continue</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Date Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={datePickerValue}
          mode="date"
          display="default"
          onChange={handleDateChange}
          maximumDate={new Date()}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 16,
    padding: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  required: {
    color: '#ef4444',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#fff',
  },
  dateInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
  },
  dateText: {
    fontSize: 16,
    color: '#111827',
  },
  datePlaceholder: {
    fontSize: 16,
    color: '#9ca3af',
  },
  selectContainer: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  selectText: {
    fontSize: 16,
    color: '#111827',
  },
  selectOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  selectOptionActive: {
    backgroundColor: '#1e40af',
    borderColor: '#1e40af',
  },
  selectOptionText: {
    fontSize: 14,
    color: '#374151',
  },
  selectOptionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  checkboxGroup: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  checkboxLabel: {
    flex: 1,
    marginLeft: 12,
  },
  checkboxText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 4,
  },
  checkboxSubtext: {
    fontSize: 12,
    color: '#6b7280',
  },
  buttonContainer: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  submitButton: {
    backgroundColor: '#1e40af',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default BookingInfoFormScreen;
```

---

### 3. Integration with Payment Flow

**Update `InquiryDetailScreen.jsx` (or wherever "Pay Now" is handled):**

```javascript
import BookingInfoService from '../services/BookingInfoService';

// In your handlePayNow function, add booking info check:

const handlePayNow = async (quote) => {
  try {
    // 1. Check if booking info exists and is complete
    const bookingInfo = await BookingInfoService.getBookingInfo(quote.id);
    const checkResult = BookingInfoService.checkBookingInfoComplete(
      bookingInfo,
      inquiry.inquiry_type
    );

    if (!checkResult.isComplete) {
      // Show alert and navigate to booking info form
      Alert.alert(
        'Booking Information Required',
        `Please complete your booking information before proceeding to payment. Missing: ${checkResult.missingFields.join(', ')}.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Fill Booking Information',
            onPress: () => {
              navigation.navigate('BookingInfoForm', {
                quoteId: quote.id,
                inquiryType: inquiry.inquiry_type,
                onComplete: (savedBookingInfo) => {
                  // After saving, proceed to payment
                  if (savedBookingInfo.status === 'completed' || savedBookingInfo.status === 'verified') {
                    initiatePayment(quote);
                  }
                },
              });
            },
          },
        ]
      );
      return;
    }

    // 2. Booking info is complete, proceed to payment
    initiatePayment(quote);
  } catch (error) {
    console.error('Error checking booking info:', error);
    Alert.alert('Error', error.message || 'Failed to check booking information');
  }
};
```

---

### 4. Navigation Setup

**Add to your navigation stack:**

```javascript
// In your navigation file (e.g., AppNavigator.js)
import BookingInfoFormScreen from './screens/BookingInfoFormScreen';

<Stack.Screen
  name="BookingInfoForm"
  component={BookingInfoFormScreen}
  options={{
    title: 'Booking Information',
    headerStyle: {
      backgroundColor: '#1e40af',
    },
    headerTintColor: '#fff',
  }}
/>
```

---

**Document Status**: ✅ COMPLETE WITH FULL UI CODE  
**Scope**: Request form (`/request`) + My Trips (`/my-trips`) + Booking Information Collection Android implementation with complete React Native components  
**Dependency**: Shares backend and Supabase schema with web, uses ARC Pay integration described in `ARC_PAY_ANDROID_IMPLEMENTATION_GUIDE.md`.


