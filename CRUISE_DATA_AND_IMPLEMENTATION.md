# 🚢 Cruise Data & Implementation Guide

## 📋 Overview

This document provides complete cruise data structures and implementation details for the Jetsetterss platform, including web and Android app integration.

---

## 🗄️ 1. Cruise Data Structure

### 1.1 Complete Cruise Data Schema

```json
{
  "id": 1,
  "name": "Royal Caribbean",
  "cruise_line": "Royal Caribbean",
  "ship": "Symphony of the Seas",
  "logo": "/cruise/logos/royal-caribbean.png",
  "image": "/images/Rectangle 1434 (1).png",
  "price": "From $699",
  "priceValue": 699,
  "duration": "7 Nights",
  "description": "Caribbean & Bahamas Cruises",
  "longDescription": "Experience the perfect blend of adventure and relaxation aboard Royal Caribbean's innovative ships, featuring thrilling activities, world-class entertainment, and delicious dining options.",
  "rating": 4.7,
  "reviews": 3245,
  "destinations": ["Caribbean", "Bahamas", "Mexico", "Alaska", "Europe", "Asia", "Australia", "Hawaii"],
  "departurePorts": ["Miami", "Fort Lauderdale", "Orlando", "Seattle", "Sydney", "Barcelona", "Rome", "Vancouver"],
  "amenities": ["Waterslides", "Rock Climbing", "Broadway Shows", "Fine Dining", "Kids Club", "Casino", "Spa", "Adult-Only Areas"],
  "popular": true,
  "promos": [
    {
      "title": "Summer Sale",
      "description": "Save up to 30% on summer bookings",
      "expiryDate": "2023-08-31"
    }
  ],
  "ships": ["Wonder of the Seas", "Symphony of the Seas", "Harmony of the Seas"],
  "itinerary": [
    {
      "day": 1,
      "port": "Miami",
      "arrival": "Departure",
      "departure": "4:00 PM",
      "activities": ["Board the ship", "Explore the ship amenities", "Welcome dinner"]
    }
  ],
  "cabin_types": [
    { "type": "Interior", "price": 699 },
    { "type": "Ocean View", "price": 999 },
    { "type": "Balcony", "price": 1299 },
    { "type": "Suite", "price": 1999 }
  ],
  "departure_date": "2024-07-15",
  "return_date": "2024-07-22",
  "departure_time": "4:00 PM",
  "return_time": "8:00 AM"
}
```

### 1.2 Destination Data Schema

```json
{
  "id": 1,
  "name": "Caribbean",
  "price": 699,
  "rating": 4.7,
  "image": "/images/Rectangle 1434 (1).png",
  "country": "Multiple",
  "category": "Tropical",
  "tags": ["Beach", "Tropical", "Culture"],
  "duration": "7-10 days",
  "season": "All Year",
  "cruiseLines": ["Royal Caribbean", "Norwegian Cruise Line", "Celebrity Cruises"]
}
```

---

## 🚀 2. API Implementation

### 2.1 Cruise Search API Endpoint

#### GET `/api/cruises/search`

**Request Parameters:**
```javascript
{
  destination: "Caribbean",        // Optional
  departurePort: "Miami",         // Optional
  cruiseLine: "Royal Caribbean",   // Optional
  departureDate: "2024-07-15",     // Optional
  duration: "7",                   // Optional (nights)
  minPrice: 500,                   // Optional
  maxPrice: 2000,                  // Optional
  passengers: 2                    // Required
}
```

**Response Format:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Royal Caribbean",
      "cruise_line": "Royal Caribbean",
      "ship": "Symphony of the Seas",
      "duration": "7 Nights",
      "price": "From $699",
      "priceValue": 699,
      "departure_port": "Miami",
      "departure_date": "2024-07-15",
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
    "source": "api",
    "cached": false
  }
}
```

### 2.2 Cruise Details API Endpoint

#### GET `/api/cruises/:id`

**Response Format:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Royal Caribbean",
    "cruise_line": "Royal Caribbean",
    "ship": "Symphony of the Seas",
    "duration": "7 Nights",
    "price": "From $699",
    "priceValue": 699,
    "departure_port": "Miami",
    "departure_date": "2024-07-15",
    "return_date": "2024-07-22",
    "destinations": ["Caribbean", "Bahamas", "Mexico"],
    "image": "/images/cruises/royal-caribbean.jpg",
    "rating": 4.7,
    "reviews": 3245,
    "amenities": ["Waterslides", "Rock Climbing", "Broadway Shows"],
    "cabin_types": [
      { "type": "Interior", "price": 699 },
      { "type": "Ocean View", "price": 999 },
      { "type": "Balcony", "price": 1299 },
      { "type": "Suite", "price": 1999 }
    ],
    "itinerary": [
      {
        "day": 1,
        "port": "Miami",
        "arrival": "Departure",
        "departure": "4:00 PM",
        "activities": ["Board the ship", "Explore amenities", "Welcome dinner"]
      },
      {
        "day": 2,
        "port": "Nassau, Bahamas",
        "arrival": "8:00 AM",
        "departure": "5:00 PM",
        "activities": ["City tour", "Local cuisine", "Shopping"]
      }
    ]
  }
}
```

### 2.3 Cruise Booking API Endpoint

#### POST `/api/cruises/booking`

**Request Body:**
```json
{
  "cruise_id": 1,
  "passengers": {
    "adults": [
      {
        "firstName": "John",
        "lastName": "Doe",
        "age": "35",
        "nationality": "US"
      }
    ],
    "children": []
  },
  "contact_details": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+1234567890"
  },
  "cabin_type": "Balcony",
  "departure_date": "2024-07-15",
  "total_amount": 1299,
  "currency": "USD"
}
```

**Response Format:**
```json
{
  "success": true,
  "data": {
    "booking_id": "CRUISE-1234567890",
    "confirmation_number": "RC-2024-001",
    "status": "confirmed",
    "total_amount": 1299,
    "currency": "USD",
    "departure_date": "2024-07-15",
    "passengers": 1,
    "cabin_type": "Balcony"
  }
}
```

---

## 🏗️ 3. Backend Implementation

### 3.1 Express.js API Routes

#### `routes/api/cruise.js`

```javascript
const express = require('express');
const router = express.Router();
const axios = require('axios');

// Cache for cruise data
const cache = {
  data: null,
  timestamp: null,
  ttl: 3600000 // 1 hour
};

// Sample cruise data
const sampleCruises = [
  {
    id: 1,
    name: "Royal Caribbean",
    cruise_line: "Royal Caribbean",
    ship: "Symphony of the Seas",
    duration: 7,
    departure_port: "Miami, FL",
    destinations: ["Caribbean", "Bahamas", "Mexico"],
    departure_date: "2024-07-15",
    return_date: "2024-07-22",
    price_per_person: 699,
    image: "/images/cruises/royal-caribbean.jpg",
    rating: 4.7,
    reviews: 3245,
    amenities: ["Waterslides", "Rock Climbing", "Broadway Shows"],
    cabin_types: [
      { type: "Interior", price: 699 },
      { type: "Ocean View", price: 999 },
      { type: "Balcony", price: 1299 },
      { type: "Suite", price: 1999 }
    ],
    itinerary: [
      {
        day: 1,
        port: "Miami",
        arrival: "Departure",
        departure: "4:00 PM",
        activities: ["Board the ship", "Welcome dinner"]
      }
    ]
  }
];

// GET /api/cruises/search
router.get('/search', async (req, res) => {
  try {
    const { destination, departurePort, cruiseLine, minPrice, maxPrice, passengers } = req.query;
    
    let filteredCruises = [...sampleCruises];
    
    // Apply filters
    if (destination) {
      filteredCruises = filteredCruises.filter(cruise => 
        cruise.destinations.some(dest => 
          dest.toLowerCase().includes(destination.toLowerCase())
        )
      );
    }
    
    if (departurePort) {
      filteredCruises = filteredCruises.filter(cruise => 
        cruise.departure_port.toLowerCase().includes(departurePort.toLowerCase())
      );
    }
    
    if (cruiseLine) {
      filteredCruises = filteredCruises.filter(cruise => 
        cruise.cruise_line.toLowerCase().includes(cruiseLine.toLowerCase())
      );
    }
    
    if (minPrice) {
      filteredCruises = filteredCruises.filter(cruise => 
        cruise.price_per_person >= parseInt(minPrice)
      );
    }
    
    if (maxPrice) {
      filteredCruises = filteredCruises.filter(cruise => 
        cruise.price_per_person <= parseInt(maxPrice)
      );
    }
    
    res.json({
      success: true,
      data: filteredCruises,
      total: filteredCruises.length,
      meta: { source: 'api', cached: false }
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to search cruises' });
  }
});

// GET /api/cruises/:id
router.get('/:id', async (req, res) => {
  try {
    const cruiseId = parseInt(req.params.id);
    const cruise = sampleCruises.find(c => c.id === cruiseId);
    
    if (!cruise) {
      return res.status(404).json({ error: 'Cruise not found' });
    }
    
    res.json({
      success: true,
      data: cruise
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch cruise details' });
  }
});

// POST /api/cruises/booking
router.post('/booking', async (req, res) => {
  try {
    const { cruise_id, passengers, contact_details, cabin_type, total_amount } = req.body;
    
    // Generate booking ID
    const bookingId = `CRUISE-${Date.now()}`;
    const confirmationNumber = `RC-2024-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    // Here you would typically save to database
    const booking = {
      booking_id: bookingId,
      confirmation_number: confirmationNumber,
      cruise_id: cruise_id,
      status: 'confirmed',
      total_amount: total_amount,
      passengers: passengers,
      contact_details: contact_details,
      cabin_type: cabin_type,
      created_at: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: booking
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

module.exports = router;
```

### 3.2 Vercel API Function

#### `api/cruises.js`

```javascript
export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    // Return sample cruise data
    const cruises = [
      {
        id: 1,
        name: "Caribbean Paradise",
        cruise_line: "Royal Caribbean",
        ship: "Symphony of the Seas",
        duration: 7,
        departure_port: "Miami, FL",
        destinations: ["Cozumel", "Jamaica", "Bahamas"],
        departure_date: "2024-07-15",
        return_date: "2024-07-22",
        price_per_person: 899,
        image: "/images/cruises/caribbean-paradise.svg",
        description: "Experience the ultimate Caribbean adventure with stops at pristine beaches and vibrant cultures.",
        amenities: ["Pool deck", "Spa", "Casino", "Multiple restaurants", "Entertainment shows"],
        cabin_types: [
          { type: "Interior", price: 899 },
          { type: "Ocean View", price: 1199 },
          { type: "Balcony", price: 1599 },
          { type: "Suite", price: 2499 }
        ]
      },
      {
        id: 2,
        name: "Mediterranean Explorer",
        cruise_line: "Norwegian Cruise Line",
        ship: "Norwegian Epic",
        duration: 10,
        departure_port: "Barcelona, Spain",
        destinations: ["Rome", "Naples", "Santorini", "Mykonos"],
        departure_date: "2024-08-10",
        return_date: "2024-08-20",
        price_per_person: 1299,
        image: "/images/cruises/mediterranean-explorer.svg",
        description: "Discover ancient history and stunning Mediterranean coastlines on this unforgettable journey.",
        amenities: ["Multiple pools", "Rock climbing wall", "Broadway shows", "Specialty dining"],
        cabin_types: [
          { type: "Interior", price: 1299 },
          { type: "Ocean View", price: 1699 },
          { type: "Balcony", price: 2199 },
          { type: "Suite", price: 3499 }
        ]
      },
      {
        id: 3,
        name: "Alaska Wilderness",
        cruise_line: "Princess Cruises",
        ship: "Majestic Princess",
        duration: 8,
        departure_port: "Seattle, WA",
        destinations: ["Juneau", "Ketchikan", "Skagway", "Glacier Bay"],
        departure_date: "2024-06-20",
        return_date: "2024-06-28",
        price_per_person: 1599,
        image: "/images/cruises/alaska-wilderness.svg",
        description: "Witness breathtaking glaciers and wildlife in America's last frontier.",
        amenities: ["Observation deck", "Naturalist programs", "Fine dining", "Spa services"],
        cabin_types: [
          { type: "Interior", price: 1599 },
          { type: "Ocean View", price: 1999 },
          { type: "Balcony", price: 2599 },
          { type: "Suite", price: 3999 }
        ]
      }
    ];

    res.status(200).json({
      success: true,
      data: cruises,
      total: cruises.length
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
```

---

## 📱 4. React Native Implementation

### 4.1 Cruise Search Component

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

### 4.2 Cruise Results Component

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

      <Text className="text-gray-600 mb-2">{item.cruise_line}</Text>
      
      <View className="flex-row items-center mb-2">
        <Star size={16} color="#fbbf24" fill="#fbbf24" />
        <Text className="ml-1 text-gray-600">{item.rating} ({item.reviews} reviews)</Text>
      </View>

      <View className="flex-row items-center mb-2">
        <MapPin size={16} color="#6b7280" />
        <Text className="ml-1 text-gray-600">{item.departure_port}</Text>
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

### 4.3 Cruise Service

```javascript
// services/CruiseService.js
import axios from 'axios';

class CruiseService {
  constructor() {
    this.baseURL = 'https://your-api-domain.com/api';
  }

  async searchCruises(searchParams) {
    try {
      const response = await axios.get(`${this.baseURL}/cruises/search`, {
        params: searchParams
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to search cruises: ${error.message}`);
    }
  }

  async getCruiseDetails(cruiseId) {
    try {
      const response = await axios.get(`${this.baseURL}/cruises/${cruiseId}`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch cruise details: ${error.message}`);
    }
  }

  async bookCruise(bookingData) {
    try {
      const response = await axios.post(`${this.baseURL}/cruises/booking`, bookingData);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to book cruise: ${error.message}`);
    }
  }
}

export default new CruiseService();
```

---

## 🗄️ 5. Database Schema

### 5.1 Supabase Tables

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

-- Cruise-specific data stored in booking_details JSONB field
-- Example structure:
{
  "cruise_id": 1,
  "cruise_name": "Royal Caribbean",
  "ship": "Symphony of the Seas",
  "departure_port": "Miami",
  "departure_date": "2024-07-15",
  "return_date": "2024-07-22",
  "duration": "7 Nights",
  "destinations": ["Caribbean", "Bahamas"],
  "cabin_type": "Balcony",
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

## 🔧 6. Environment Configuration

### 6.1 Required Environment Variables

```env
# Supabase Configuration
SUPABASE_URL=https://qqmagqwumjipdqvxbiqu.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key

# API Configuration
API_BASE_URL=https://your-api-domain.com/api

# Payment Configuration
ARC_PAY_MERCHANT_ID=your_arc_pay_merchant_id
ARC_PAY_API_URL=https://api.arcpay.travel/api/rest/version/77/merchant/

# Amadeus API (for future cruise data)
AMADEUS_API_KEY=your_amadeus_api_key
AMADEUS_API_SECRET=your_amadeus_api_secret
```

### 6.2 Package Dependencies

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

## 📋 7. Implementation Checklist

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

---

## 📞 9. Support & Contact

### Customer Support
- **Toll-free Number**: ((877) 538-7380)
- **Email Support**: support@jetsetterss.com
- **Live Chat**: In-app customer support
- **FAQ Section**: Comprehensive help center

### Technical Support
- **Documentation**: Complete API documentation
- **Developer Resources**: SDK and integration guides
- **Community Forum**: Developer community support
- **Professional Services**: Custom integration support

---

This comprehensive guide provides all the necessary data structures, API endpoints, and implementation details to build a complete cruise booking system for both web and Android platforms. The implementation follows consistent patterns and maintains data integrity across all touchpoints.





