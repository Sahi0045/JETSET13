# 🚢 Cruise Implementation Guide for Android App

## 📋 Overview

This guide provides complete implementation details for cruise booking functionality in the Jetsetterss Android app, covering search, booking, payment, and database integration.

## 🏗️ Architecture Overview

### Current Web Platform Implementation
- **Frontend**: React.js with cruise search and booking components
- **Backend**: Node.js/Express API with Amadeus integration
- **Database**: Supabase PostgreSQL with shared bookings table
- **Payment**: ARC Pay integration
- **Data Source**: Static JSON + Amadeus API (fallback)

### Android App Requirements
- **Framework**: React Native
- **State Management**: Redux
- **Navigation**: React Navigation
- **API Integration**: Axios
- **Database**: Same Supabase instance as web platform

---

## 🔍 1. Cruise Search Implementation

### 1.1 Search API Endpoints

#### GET /api/cruises/search
```javascript
// Query Parameters
{
  destination: "Caribbean", // Optional
  departurePort: "Miami", // Optional
  cruiseLine: "Royal Caribbean", // Optional
  departureDate: "2024-07-15", // Optional
  duration: "7", // Optional (nights)
  minPrice: 500, // Optional
  maxPrice: 2000, // Optional
  passengers: 2 // Required
}
```

#### Response Format
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Royal Caribbean",
      "cruiseLine": "Royal Caribbean",
      "ship": "Symphony of the Seas",
      "duration": "7 Nights",
      "price": "From $699",
      "priceValue": 699,
      "departurePort": "Miami",
      "departureDate": "2024-07-15",
      "destinations": ["Caribbean", "Bahamas", "Mexico"],
      "image": "/images/cruises/royal-caribbean.jpg",
      "rating": 4.7,
      "reviews": 3245,
      "amenities": ["Waterslides", "Rock Climbing", "Broadway Shows"],
      "itinerary": [
        {
          "day": 1,
          "port": "Miami",
          "arrival": "Departure",
          "departure": "4:00 PM",
          "activities": ["Board the ship", "Welcome dinner"]
        }
      ]
    }
  ],
  "total": 12,
  "meta": {
    "source": "amadeus-api",
    "cached": false
  }
}
```

### 1.2 React Native Search Component

```javascript
// components/CruiseSearchForm.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import DatePicker from 'react-native-date-picker';

const CruiseSearchForm = ({ onSearch }) => {
  const [searchParams, setSearchParams] = useState({
    destination: '',
    departurePort: '',
    cruiseLine: '',
    departureDate: new Date(),
    duration: '',
    passengers: 2,
    minPrice: '',
    maxPrice: ''
  });

  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleSearch = () => {
    const params = {
      ...searchParams,
      departureDate: searchParams.departureDate.toISOString().split('T')[0]
    };
    onSearch(params);
  };

  return (
    <ScrollView className="flex-1 bg-white p-4">
      <View className="mb-4">
        <Text className="text-lg font-semibold mb-2">Destination</Text>
        <TextInput
          className="border border-gray-300 rounded-lg p-3"
          placeholder="Where would you like to go?"
          value={searchParams.destination}
          onChangeText={(text) => setSearchParams({...searchParams, destination: text})}
        />
      </View>

      <View className="mb-4">
        <Text className="text-lg font-semibold mb-2">Departure Port</Text>
        <TextInput
          className="border border-gray-300 rounded-lg p-3"
          placeholder="Miami, Fort Lauderdale, etc."
          value={searchParams.departurePort}
          onChangeText={(text) => setSearchParams({...searchParams, departurePort: text})}
        />
      </View>

      <View className="mb-4">
        <Text className="text-lg font-semibold mb-2">Departure Date</Text>
        <TouchableOpacity
          className="border border-gray-300 rounded-lg p-3"
          onPress={() => setShowDatePicker(true)}
        >
          <Text>{searchParams.departureDate.toDateString()}</Text>
        </TouchableOpacity>
      </View>

      <View className="mb-4">
        <Text className="text-lg font-semibold mb-2">Passengers</Text>
        <Picker
          selectedValue={searchParams.passengers}
          onValueChange={(value) => setSearchParams({...searchParams, passengers: value})}
        >
          {[1,2,3,4,5,6].map(num => (
            <Picker.Item key={num} label={`${num} Passenger${num > 1 ? 's' : ''}`} value={num} />
          ))}
        </Picker>
      </View>

      <TouchableOpacity
        className="bg-blue-600 rounded-lg p-4 mt-4"
        onPress={handleSearch}
      >
        <Text className="text-white text-center font-semibold text-lg">Search Cruises</Text>
      </TouchableOpacity>

      <DatePicker
        modal
        open={showDatePicker}
        date={searchParams.departureDate}
        onConfirm={(date) => {
          setShowDatePicker(false);
          setSearchParams({...searchParams, departureDate: date});
        }}
        onCancel={() => setShowDatePicker(false)}
      />
    </ScrollView>
  );
};

export default CruiseSearchForm;
```

### 1.3 Search Results Component

```javascript
// components/CruiseResults.js
import React from 'react';
import { View, Text, FlatList, TouchableOpacity, Image } from 'react-native';
import { Star, MapPin, Calendar, Users } from 'lucide-react-native';

const CruiseResults = ({ cruises, onSelectCruise }) => {
  const renderCruiseCard = ({ item }) => (
    <TouchableOpacity
      className="bg-white rounded-lg shadow-md mb-4 p-4"
      onPress={() => onSelectCruise(item)}
    >
      <Image
        source={{ uri: item.image }}
        className="w-full h-48 rounded-lg mb-3"
        resizeMode="cover"
      />
      
      <View className="flex-row justify-between items-start mb-2">
        <Text className="text-lg font-semibold flex-1">{item.name}</Text>
        <Text className="text-blue-600 font-bold text-lg">{item.price}</Text>
      </View>

      <Text className="text-gray-600 mb-2">{item.cruiseLine}</Text>
      
      <View className="flex-row items-center mb-2">
        <Star size={16} color="#fbbf24" fill="#fbbf24" />
        <Text className="ml-1 text-gray-600">{item.rating} ({item.reviews} reviews)</Text>
      </View>

      <View className="flex-row items-center mb-2">
        <MapPin size={16} color="#6b7280" />
        <Text className="ml-1 text-gray-600">{item.departurePort}</Text>
      </View>

      <View className="flex-row items-center mb-2">
        <Calendar size={16} color="#6b7280" />
        <Text className="ml-1 text-gray-600">{item.duration}</Text>
      </View>

      <View className="flex-row flex-wrap">
        {item.destinations.slice(0, 3).map((dest, index) => (
          <Text key={index} className="text-blue-600 text-sm mr-2">
            {dest}{index < 2 ? ',' : ''}
          </Text>
        ))}
      </View>
    </TouchableOpacity>
  );

  return (
    <FlatList
      data={cruises}
      renderItem={renderCruiseCard}
      keyExtractor={(item) => item.id.toString()}
      showsVerticalScrollIndicator={false}
    />
  );
};

export default CruiseResults;
```

---

## 📱 2. Cruise Details & Booking

### 2.1 Cruise Details Screen

```javascript
// screens/CruiseDetails.js
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Image, TouchableOpacity } from 'react-native';
import { Star, MapPin, Calendar, Users, Ship, Anchor } from 'lucide-react-native';

const CruiseDetails = ({ route, navigation }) => {
  const { cruise } = route.params;
  const [selectedCabin, setSelectedCabin] = useState(null);
  const [passengers, setPassengers] = useState(2);

  const handleBookNow = () => {
    navigation.navigate('CruiseBooking', {
      cruise,
      selectedCabin,
      passengers
    });
  };

  return (
    <ScrollView className="flex-1 bg-white">
      <Image
        source={{ uri: cruise.image }}
        className="w-full h-64"
        resizeMode="cover"
      />

      <View className="p-4">
        <View className="flex-row justify-between items-start mb-3">
          <Text className="text-2xl font-bold flex-1">{cruise.name}</Text>
          <Text className="text-blue-600 font-bold text-xl">{cruise.price}</Text>
        </View>

        <Text className="text-gray-600 mb-3">{cruise.cruiseLine}</Text>

        <View className="flex-row items-center mb-3">
          <Star size={20} color="#fbbf24" fill="#fbbf24" />
          <Text className="ml-2 text-gray-600">{cruise.rating} ({cruise.reviews} reviews)</Text>
        </View>

        <View className="bg-gray-50 rounded-lg p-4 mb-4">
          <Text className="font-semibold mb-2">Cruise Details</Text>
          <View className="flex-row items-center mb-2">
            <Ship size={16} color="#6b7280" />
            <Text className="ml-2 text-gray-600">{cruise.ship}</Text>
          </View>
          <View className="flex-row items-center mb-2">
            <Calendar size={16} color="#6b7280" />
            <Text className="ml-2 text-gray-600">{cruise.duration}</Text>
          </View>
          <View className="flex-row items-center">
            <MapPin size={16} color="#6b7280" />
            <Text className="ml-2 text-gray-600">{cruise.departurePort}</Text>
          </View>
        </View>

        <View className="mb-4">
          <Text className="font-semibold mb-2">Destinations</Text>
          <View className="flex-row flex-wrap">
            {cruise.destinations.map((dest, index) => (
              <View key={index} className="bg-blue-100 rounded-full px-3 py-1 mr-2 mb-2">
                <Text className="text-blue-800 text-sm">{dest}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="mb-4">
          <Text className="font-semibold mb-2">Amenities</Text>
          <View className="flex-row flex-wrap">
            {cruise.amenities.map((amenity, index) => (
              <View key={index} className="bg-green-100 rounded-full px-3 py-1 mr-2 mb-2">
                <Text className="text-green-800 text-sm">{amenity}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="mb-4">
          <Text className="font-semibold mb-2">Itinerary</Text>
          {cruise.itinerary.map((day, index) => (
            <View key={index} className="bg-gray-50 rounded-lg p-3 mb-2">
              <Text className="font-semibold">Day {day.day}: {day.port}</Text>
              <Text className="text-gray-600 text-sm">
                Arrival: {day.arrival} | Departure: {day.departure}
              </Text>
              <View className="mt-2">
                {day.activities.map((activity, actIndex) => (
                  <Text key={actIndex} className="text-gray-600 text-sm">• {activity}</Text>
                ))}
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity
          className="bg-blue-600 rounded-lg p-4 mt-4"
          onPress={handleBookNow}
        >
          <Text className="text-white text-center font-semibold text-lg">Book Now</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

export default CruiseDetails;
```

### 2.2 Booking Form Component

```javascript
// components/CruiseBookingForm.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { User, Mail, Phone, CreditCard } from 'lucide-react-native';

const CruiseBookingForm = ({ cruise, onBookingSubmit }) => {
  const [passengerDetails, setPassengerDetails] = useState({
    adults: [{ firstName: '', lastName: '', age: '', nationality: '' }],
    children: [{ firstName: '', lastName: '', age: '', nationality: '' }]
  });

  const [contactDetails, setContactDetails] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: ''
  });

  const [paymentDetails, setPaymentDetails] = useState({
    cardNumber: '',
    cardHolder: '',
    expiryDate: '',
    cvv: ''
  });

  const addPassenger = (type) => {
    setPassengerDetails(prev => ({
      ...prev,
      [type]: [...prev[type], { firstName: '', lastName: '', age: '', nationality: '' }]
    }));
  };

  const updatePassenger = (type, index, field, value) => {
    setPassengerDetails(prev => ({
      ...prev,
      [type]: prev[type].map((passenger, i) => 
        i === index ? { ...passenger, [field]: value } : passenger
      )
    }));
  };

  const validateForm = () => {
    // Validation logic
    if (!contactDetails.firstName || !contactDetails.lastName) {
      Alert.alert('Error', 'Please enter your full name');
      return false;
    }
    if (!contactDetails.email) {
      Alert.alert('Error', 'Please enter your email');
      return false;
    }
    if (!paymentDetails.cardNumber || !paymentDetails.cvv) {
      Alert.alert('Error', 'Please enter payment details');
      return false;
    }
    return true;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      onBookingSubmit({
        cruise,
        passengers: passengerDetails,
        contact: contactDetails,
        payment: paymentDetails
      });
    }
  };

  return (
    <ScrollView className="flex-1 bg-white p-4">
      <Text className="text-2xl font-bold mb-4">Complete Your Booking</Text>

      {/* Contact Information */}
      <View className="mb-6">
        <Text className="text-lg font-semibold mb-3">Contact Information</Text>
        <View className="mb-3">
          <Text className="text-gray-600 mb-1">First Name</Text>
          <TextInput
            className="border border-gray-300 rounded-lg p-3"
            value={contactDetails.firstName}
            onChangeText={(text) => setContactDetails({...contactDetails, firstName: text})}
            placeholder="Enter first name"
          />
        </View>
        <View className="mb-3">
          <Text className="text-gray-600 mb-1">Last Name</Text>
          <TextInput
            className="border border-gray-300 rounded-lg p-3"
            value={contactDetails.lastName}
            onChangeText={(text) => setContactDetails({...contactDetails, lastName: text})}
            placeholder="Enter last name"
          />
        </View>
        <View className="mb-3">
          <Text className="text-gray-600 mb-1">Email</Text>
          <TextInput
            className="border border-gray-300 rounded-lg p-3"
            value={contactDetails.email}
            onChangeText={(text) => setContactDetails({...contactDetails, email: text})}
            placeholder="Enter email"
            keyboardType="email-address"
          />
        </View>
        <View className="mb-3">
          <Text className="text-gray-600 mb-1">Phone</Text>
          <TextInput
            className="border border-gray-300 rounded-lg p-3"
            value={contactDetails.phone}
            onChangeText={(text) => setContactDetails({...contactDetails, phone: text})}
            placeholder="Enter phone number"
            keyboardType="phone-pad"
          />
        </View>
      </View>

      {/* Passenger Details */}
      <View className="mb-6">
        <Text className="text-lg font-semibold mb-3">Passenger Details</Text>
        
        {passengerDetails.adults.map((adult, index) => (
          <View key={index} className="mb-4 p-3 bg-gray-50 rounded-lg">
            <Text className="font-semibold mb-2">Adult {index + 1}</Text>
            <View className="flex-row mb-2">
              <TextInput
                className="flex-1 border border-gray-300 rounded-lg p-2 mr-2"
                placeholder="First Name"
                value={adult.firstName}
                onChangeText={(text) => updatePassenger('adults', index, 'firstName', text)}
              />
              <TextInput
                className="flex-1 border border-gray-300 rounded-lg p-2"
                placeholder="Last Name"
                value={adult.lastName}
                onChangeText={(text) => updatePassenger('adults', index, 'lastName', text)}
              />
            </View>
            <View className="flex-row">
              <TextInput
                className="flex-1 border border-gray-300 rounded-lg p-2 mr-2"
                placeholder="Age"
                value={adult.age}
                onChangeText={(text) => updatePassenger('adults', index, 'age', text)}
                keyboardType="numeric"
              />
              <TextInput
                className="flex-1 border border-gray-300 rounded-lg p-2"
                placeholder="Nationality"
                value={adult.nationality}
                onChangeText={(text) => updatePassenger('adults', index, 'nationality', text)}
              />
            </View>
          </View>
        ))}

        <TouchableOpacity
          className="bg-blue-100 rounded-lg p-3 mb-4"
          onPress={() => addPassenger('adults')}
        >
          <Text className="text-blue-600 text-center">Add Adult Passenger</Text>
        </TouchableOpacity>
      </View>

      {/* Payment Details */}
      <View className="mb-6">
        <Text className="text-lg font-semibold mb-3">Payment Information</Text>
        <View className="mb-3">
          <Text className="text-gray-600 mb-1">Card Number</Text>
          <TextInput
            className="border border-gray-300 rounded-lg p-3"
            value={paymentDetails.cardNumber}
            onChangeText={(text) => setPaymentDetails({...paymentDetails, cardNumber: text})}
            placeholder="1234 5678 9012 3456"
            keyboardType="numeric"
          />
        </View>
        <View className="mb-3">
          <Text className="text-gray-600 mb-1">Cardholder Name</Text>
          <TextInput
            className="border border-gray-300 rounded-lg p-3"
            value={paymentDetails.cardHolder}
            onChangeText={(text) => setPaymentDetails({...paymentDetails, cardHolder: text})}
            placeholder="John Doe"
          />
        </View>
        <View className="flex-row mb-3">
          <View className="flex-1 mr-2">
            <Text className="text-gray-600 mb-1">Expiry Date</Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-3"
              value={paymentDetails.expiryDate}
              onChangeText={(text) => setPaymentDetails({...paymentDetails, expiryDate: text})}
              placeholder="MM/YY"
            />
          </View>
          <View className="flex-1">
            <Text className="text-gray-600 mb-1">CVV</Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-3"
              value={paymentDetails.cvv}
              onChangeText={(text) => setPaymentDetails({...paymentDetails, cvv: text})}
              placeholder="123"
              keyboardType="numeric"
              secureTextEntry
            />
          </View>
        </View>
      </View>

      {/* Booking Summary */}
      <View className="bg-gray-50 rounded-lg p-4 mb-6">
        <Text className="text-lg font-semibold mb-3">Booking Summary</Text>
        <View className="flex-row justify-between mb-2">
          <Text className="text-gray-600">Cruise:</Text>
          <Text className="font-semibold">{cruise.name}</Text>
        </View>
        <View className="flex-row justify-between mb-2">
          <Text className="text-gray-600">Duration:</Text>
          <Text className="font-semibold">{cruise.duration}</Text>
        </View>
        <View className="flex-row justify-between mb-2">
          <Text className="text-gray-600">Passengers:</Text>
          <Text className="font-semibold">{passengerDetails.adults.length + passengerDetails.children.length}</Text>
        </View>
        <View className="flex-row justify-between mb-2">
          <Text className="text-gray-600">Base Price:</Text>
          <Text className="font-semibold">{cruise.price}</Text>
        </View>
        <View className="flex-row justify-between mb-2">
          <Text className="text-gray-600">Taxes & Fees:</Text>
          <Text className="font-semibold">$150</Text>
        </View>
        <View className="flex-row justify-between mb-2">
          <Text className="text-gray-600">Port Charges:</Text>
          <Text className="font-semibold">$200</Text>
        </View>
        <View className="border-t border-gray-300 pt-2 mt-2">
          <View className="flex-row justify-between">
            <Text className="text-lg font-bold">Total:</Text>
            <Text className="text-lg font-bold text-blue-600">
              ${parseFloat(cruise.price.replace(/[^0-9.]/g, '')) + 350}
            </Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        className="bg-blue-600 rounded-lg p-4"
        onPress={handleSubmit}
      >
        <Text className="text-white text-center font-semibold text-lg">Complete Booking</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

export default CruiseBookingForm;
```

---

## 💳 3. Payment Integration

### 3.1 Payment Processing Service

```javascript
// services/PaymentService.js
import axios from 'axios';

class PaymentService {
  constructor() {
    this.baseURL = 'https://your-api-domain.com/api';
  }

  async createOrder(orderData) {
    try {
      const response = await axios.post(`${this.baseURL}/payments/order/create`, orderData);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create order: ${error.message}`);
    }
  }

  async processPayment(paymentData) {
    try {
      const response = await axios.post(`${this.baseURL}/payments/payment/process`, paymentData);
      return response.data;
    } catch (error) {
      throw new Error(`Payment processing failed: ${error.message}`);
    }
  }

  async createCruiseBooking(bookingData) {
    try {
      const response = await axios.post(`${this.baseURL}/cruises/booking`, bookingData);
      return response.data;
    } catch (error) {
      throw new Error(`Booking creation failed: ${error.message}`);
    }
  }
}

export default new PaymentService();
```

### 3.2 Booking Flow Handler

```javascript
// services/CruiseBookingService.js
import PaymentService from './PaymentService';
import CurrencyService from './CurrencyService';

class CruiseBookingService {
  async processCruiseBooking(bookingData) {
    try {
      const { cruise, passengers, contact, payment } = bookingData;
      
      // Calculate total amount
      const basePrice = parseFloat(cruise.price.replace(/[^0-9.]/g, ''));
      const taxesAndFees = 150;
      const portCharges = 200;
      const totalAmount = basePrice + taxesAndFees + portCharges;

      // Get current currency
      const userCurrency = CurrencyService.getCurrency();
      const convertedTotalAmount = CurrencyService.convertPrice(totalAmount, userCurrency);

      // Generate order ID
      const orderId = `CRUISE-${Date.now()}`;

      // Step 1: Create order
      const orderData = {
        amount: convertedTotalAmount,
        currency: userCurrency,
        booking_type: 'cruise',
        booking_details: {
          cruise_id: cruise.id,
          cruise_name: cruise.name,
          passengers: passengers,
          customer_name: `${contact.firstName} ${contact.lastName}`,
          customer_email: contact.email
        },
        orderId: orderId
      };

      const orderResult = await PaymentService.createOrder(orderData);
      if (!orderResult.success) {
        throw new Error(orderResult.error || 'Failed to create order');
      }

      // Step 2: Process payment
      const paymentData = {
        amount: convertedTotalAmount,
        currency: userCurrency,
        cardDetails: {
          cardNumber: payment.cardNumber,
          expiryDate: payment.expiryDate,
          cvv: payment.cvv
        },
        billingAddress: {
          firstName: contact.firstName,
          lastName: contact.lastName
        }
      };

      const paymentResult = await PaymentService.processPayment(paymentData);
      if (!paymentResult.success) {
        throw new Error(paymentResult.error || 'Payment processing failed');
      }

      // Step 3: Create booking record
      const bookingRecord = {
        cruise_id: cruise.id,
        order_id: orderId,
        transaction_id: paymentResult.transactionId,
        passengers: passengers,
        contact_details: contact,
        total_amount: convertedTotalAmount,
        currency: userCurrency,
        status: 'confirmed'
      };

      const bookingResult = await PaymentService.createCruiseBooking(bookingRecord);
      
      return {
        success: true,
        orderId: orderId,
        transactionId: paymentResult.transactionId,
        bookingId: bookingResult.bookingId,
        totalAmount: convertedTotalAmount,
        currency: userCurrency
      };

    } catch (error) {
      throw new Error(`Booking failed: ${error.message}`);
    }
  }
}

export default new CruiseBookingService();
```

---

## 🗄️ 4. Database Integration

### 4.1 Supabase Integration

```javascript
// services/SupabaseService.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qqmagqwumjipdqvxbiqu.supabase.co';
const supabaseKey = 'your_supabase_anon_key';

const supabase = createClient(supabaseUrl, supabaseKey);

class SupabaseService {
  async saveCruiseBooking(bookingData) {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .insert({
          user_id: bookingData.userId || null,
          booking_reference: bookingData.orderId,
          travel_type: 'cruise',
          status: 'confirmed',
          total_amount: bookingData.totalAmount,
          payment_status: 'paid',
          booking_details: {
            cruise_id: bookingData.cruiseId,
            cruise_name: bookingData.cruiseName,
            passengers: bookingData.passengers,
            contact_details: bookingData.contactDetails,
            order_id: bookingData.orderId,
            transaction_id: bookingData.transactionId
          },
          passenger_details: bookingData.passengers
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Failed to save booking: ${error.message}`);
    }
  }

  async getUserBookings(userId) {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('user_id', userId)
        .eq('travel_type', 'cruise')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Failed to fetch bookings: ${error.message}`);
    }
  }
}

export default new SupabaseService();
```

### 4.2 Database Schema

```sql
-- Bookings table (already exists)
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    booking_reference TEXT UNIQUE NOT NULL,
    travel_type TEXT NOT NULL CHECK (travel_type IN ('flight', 'hotel', 'package', 'cruise', 'car')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'paid', 'cancelled', 'completed')),
    total_amount DECIMAL(10,2) NOT NULL,
    payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'refunded')),
    booking_details JSONB NOT NULL,
    passenger_details JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cruise-specific data can be stored in booking_details JSONB field
-- Example structure:
{
  "cruise_id": 1,
  "cruise_name": "Royal Caribbean",
  "ship": "Symphony of the Seas",
  "departure_port": "Miami",
  "departure_date": "2024-07-15",
  "duration": "7 Nights",
  "destinations": ["Caribbean", "Bahamas"],
  "passengers": {
    "adults": [{"firstName": "John", "lastName": "Doe", "age": "35", "nationality": "US"}],
    "children": []
  },
  "contact_details": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+1234567890"
  },
  "order_id": "CRUISE-1234567890",
  "transaction_id": "TXN-1234567890"
}
```

---

## 🚀 5. Complete Implementation Flow

### 5.1 Navigation Structure

```javascript
// navigation/CruiseNavigation.js
import { createStackNavigator } from '@react-navigation/stack';

const Stack = createStackNavigator();

const CruiseNavigation = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="CruiseSearch" 
        component={CruiseSearchScreen}
        options={{ title: 'Search Cruises' }}
      />
      <Stack.Screen 
        name="CruiseResults" 
        component={CruiseResultsScreen}
        options={{ title: 'Cruise Results' }}
      />
      <Stack.Screen 
        name="CruiseDetails" 
        component={CruiseDetailsScreen}
        options={{ title: 'Cruise Details' }}
      />
      <Stack.Screen 
        name="CruiseBooking" 
        component={CruiseBookingScreen}
        options={{ title: 'Book Cruise' }}
      />
      <Stack.Screen 
        name="CruiseConfirmation" 
        component={CruiseConfirmationScreen}
        options={{ title: 'Booking Confirmed' }}
      />
    </Stack.Navigator>
  );
};

export default CruiseNavigation;
```

### 5.2 Redux Store Setup

```javascript
// store/cruiseSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import CruiseBookingService from '../services/CruiseBookingService';

// Async thunks
export const searchCruises = createAsyncThunk(
  'cruise/searchCruises',
  async (searchParams) => {
    const response = await fetch('/api/cruises/search', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchParams)
    });
    return response.json();
  }
);

export const processCruiseBooking = createAsyncThunk(
  'cruise/processBooking',
  async (bookingData) => {
    return await CruiseBookingService.processCruiseBooking(bookingData);
  }
);

const cruiseSlice = createSlice({
  name: 'cruise',
  initialState: {
    searchResults: [],
    selectedCruise: null,
    bookingData: null,
    isLoading: false,
    error: null,
    bookingSuccess: false
  },
  reducers: {
    setSelectedCruise: (state, action) => {
      state.selectedCruise = action.payload;
    },
    clearBookingData: (state) => {
      state.bookingData = null;
      state.bookingSuccess = false;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(searchCruises.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(searchCruises.fulfilled, (state, action) => {
        state.isLoading = false;
        state.searchResults = action.payload.data;
      })
      .addCase(searchCruises.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message;
      })
      .addCase(processCruiseBooking.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(processCruiseBooking.fulfilled, (state, action) => {
        state.isLoading = false;
        state.bookingSuccess = true;
        state.bookingData = action.payload;
      })
      .addCase(processCruiseBooking.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message;
      });
  }
});

export const { setSelectedCruise, clearBookingData } = cruiseSlice.actions;
export default cruiseSlice.reducer;
```

### 5.3 Main Cruise Screen

```javascript
// screens/CruiseScreen.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import CruiseSearchForm from '../components/CruiseSearchForm';
import CruiseResults from '../components/CruiseResults';
import { searchCruises, setSelectedCruise } from '../store/cruiseSlice';

const CruiseScreen = () => {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const { searchResults, isLoading, error } = useSelector(state => state.cruise);
  const [showResults, setShowResults] = useState(false);

  const handleSearch = async (searchParams) => {
    try {
      await dispatch(searchCruises(searchParams)).unwrap();
      setShowResults(true);
    } catch (error) {
      Alert.alert('Search Error', error);
    }
  };

  const handleSelectCruise = (cruise) => {
    dispatch(setSelectedCruise(cruise));
    navigation.navigate('CruiseDetails', { cruise });
  };

  if (showResults) {
    return (
      <View className="flex-1 bg-white">
        <TouchableOpacity
          className="bg-blue-600 p-3 m-4 rounded-lg"
          onPress={() => setShowResults(false)}
        >
          <Text className="text-white text-center font-semibold">Back to Search</Text>
        </TouchableOpacity>
        
        {isLoading ? (
          <View className="flex-1 justify-center items-center">
            <Text>Loading cruises...</Text>
          </View>
        ) : error ? (
          <View className="flex-1 justify-center items-center">
            <Text className="text-red-600">Error: {error}</Text>
          </View>
        ) : (
          <CruiseResults 
            cruises={searchResults} 
            onSelectCruise={handleSelectCruise}
          />
        )}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <CruiseSearchForm onSearch={handleSearch} />
    </View>
  );
};

export default CruiseScreen;
```

---

## 📋 6. Implementation Checklist

### Phase 1: Core Search & Display
- [ ] Implement cruise search form component
- [ ] Create cruise results display component
- [ ] Set up Redux store for cruise state management
- [ ] Implement API integration for cruise search
- [ ] Add navigation between search and results screens

### Phase 2: Details & Booking
- [ ] Create cruise details screen
- [ ] Implement booking form component
- [ ] Add passenger details collection
- [ ] Implement contact information form
- [ ] Add payment form integration

### Phase 3: Payment & Confirmation
- [ ] Integrate ARC Pay payment processing
- [ ] Implement order creation flow
- [ ] Add booking confirmation screen
- [ ] Set up Supabase booking persistence
- [ ] Add error handling and validation

### Phase 4: Testing & Optimization
- [ ] Test complete booking flow
- [ ] Add loading states and error handling
- [ ] Implement offline data caching
- [ ] Add booking history in My Trips
- [ ] Performance optimization and testing

---

## 🔧 7. Environment Configuration

### 7.1 Required Environment Variables

```env
# Supabase Configuration
SUPABASE_URL=https://qqmagqwumjipdqvxbiqu.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key

# API Configuration
API_BASE_URL=https://your-api-domain.com/api

# Payment Configuration
ARC_PAY_MERCHANT_ID=your_arc_pay_merchant_id
ARC_PAY_API_URL=https://api.arcpay.travel/api/rest/version/77/merchant/

# Amadeus API (for cruise data)
AMADEUS_API_KEY=your_amadeus_api_key
AMADEUS_API_SECRET=your_amadeus_api_secret
```

### 7.2 Package Dependencies

```json
{
  "dependencies": {
    "@react-navigation/native": "^6.0.0",
    "@react-navigation/stack": "^6.0.0",
    "@reduxjs/toolkit": "^1.9.0",
    "react-redux": "^8.0.0",
    "axios": "^1.4.0",
    "@supabase/supabase-js": "^2.0.0",
    "react-native-date-picker": "^4.0.0",
    "@react-native-picker/picker": "^2.0.0",
    "lucide-react-native": "^0.263.0"
  }
}
```

---

## 🎯 8. Key Features Summary

### Search Features
- Destination-based search
- Departure port selection
- Date range filtering
- Price range filtering
- Cruise line filtering
- Passenger count selection

### Booking Features
- Detailed cruise information display
- Passenger details collection
- Contact information form
- Payment processing integration
- Booking confirmation
- Booking history in My Trips

### Technical Features
- Redux state management
- Supabase database integration
- ARC Pay payment processing
- Error handling and validation
- Loading states and user feedback
- Offline data caching

This comprehensive guide provides all the necessary components, services, and implementation details to build a complete cruise booking system for your Android app. The implementation follows the same patterns and architecture as your existing web platform, ensuring consistency and maintainability.





