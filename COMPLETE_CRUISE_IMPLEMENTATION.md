# 🚢 Complete Cruise Implementation - Matching Website Functionality

## 📋 Overview

This document provides the complete implementation of cruise functionality matching the existing website, including all components, pages, data structures, and API endpoints.

---

## 🏗️ 1. Architecture Overview

### 1.1 Current Web Platform Structure
```
Cruise Pages:
├── / (Homepage with HeroSection)
├── /cruises (CruiseCards - Search Results)
├── /itinerary (Itinerary - Cruise Details)
└── /cruise-booking-summary (CruiseBookingSummary - Booking Form)

Components:
├── HeroSection.jsx (Search Form)
├── DestinationSection.jsx (Destination Cards)
├── CruiseLineSection.jsx (Cruise Line Cards)
├── cruise-cards.jsx (Search Results)
├── Itinerary.jsx (Cruise Details)
├── CruiseBookingSummary.jsx (Booking Form)
├── WhyChooseUsSection.jsx (Features)
└── ContactSection.jsx (Contact Form)
```

### 1.2 Data Sources
- **Primary**: `/api/cruises` endpoint
- **Fallback**: Local JSON files (`cruiselines.json`, `destinations.json`)
- **Amadeus API**: Configured but inactive

---

## 📊 2. Complete Data Structures

### 2.1 Cruise Data Schema
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

### 2.2 Destination Data Schema
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

## 🔌 3. API Implementation

### 3.1 Express.js Routes (`routes/api/cruise.js`)

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

// Sample cruise data matching website structure
const sampleCruises = [
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
    
    // Apply filters matching website logic
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
    
    // Generate booking ID matching website format
    const bookingId = `CRUISE-${Date.now()}`;
    const confirmationNumber = `RC-2024-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
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

### 3.2 Vercel API Function (`api/cruises.js`)

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
    // Return sample cruise data matching website
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

### 4.1 Cruise Search Form Component

```javascript
// components/CruiseSearchForm.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import DatePicker from 'react-native-date-picker';
import { MapPin, Calendar, Users, Ship } from 'lucide-react-native';

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
        <View className="flex-row items-center border border-gray-300 rounded-lg p-3">
          <MapPin size={20} color="#6b7280" />
          <TextInput
            className="flex-1 ml-2"
            placeholder="Where would you like to go?"
            value={searchParams.destination}
            onChangeText={(text) => setSearchParams({...searchParams, destination: text})}
          />
        </View>
      </View>

      <View className="mb-4">
        <Text className="text-lg font-semibold mb-2">Departure Port</Text>
        <View className="flex-row items-center border border-gray-300 rounded-lg p-3">
          <Ship size={20} color="#6b7280" />
          <TextInput
            className="flex-1 ml-2"
            placeholder="Miami, Fort Lauderdale, etc."
            value={searchParams.departurePort}
            onChangeText={(text) => setSearchParams({...searchParams, departurePort: text})}
          />
        </View>
      </View>

      <View className="mb-4">
        <Text className="text-lg font-semibold mb-2">Departure Date</Text>
        <TouchableOpacity
          className="flex-row items-center border border-gray-300 rounded-lg p-3"
          onPress={() => setShowDatePicker(true)}
        >
          <Calendar size={20} color="#6b7280" />
          <Text className="ml-2 flex-1">{searchParams.departureDate.toDateString()}</Text>
        </TouchableOpacity>
      </View>

      <View className="mb-4">
        <Text className="text-lg font-semibold mb-2">Passengers</Text>
        <View className="flex-row items-center border border-gray-300 rounded-lg p-3">
          <Users size={20} color="#6b7280" />
          <Picker
            className="flex-1 ml-2"
            selectedValue={searchParams.passengers}
            onValueChange={(value) => setSearchParams({...searchParams, passengers: value})}
          >
            {[1,2,3,4,5,6].map(num => (
              <Picker.Item key={num} label={`${num} Passenger${num > 1 ? 's' : ''}`} value={num} />
            ))}
          </Picker>
        </View>
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
import { Star, MapPin, Calendar, Users, Ship } from 'lucide-react-native';

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
        <Text className="text-blue-600 font-bold text-lg">${item.price_per_person}</Text>
      </View>

      <Text className="text-gray-600 mb-2">{item.cruise_line}</Text>
      
      <View className="flex-row items-center mb-2">
        <Star size={16} color="#fbbf24" fill="#fbbf24" />
        <Text className="ml-1 text-gray-600">4.7 (3245 reviews)</Text>
      </View>

      <View className="flex-row items-center mb-2">
        <MapPin size={16} color="#6b7280" />
        <Text className="ml-1 text-gray-600">{item.departure_port}</Text>
      </View>

      <View className="flex-row items-center mb-2">
        <Calendar size={16} color="#6b7280" />
        <Text className="ml-1 text-gray-600">{item.duration} Days</Text>
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

### 4.3 Cruise Details Screen

```javascript
// screens/CruiseDetails.js
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Image, TouchableOpacity } from 'react-native';
import { Star, MapPin, Calendar, Users, Ship, Anchor, Clock } from 'lucide-react-native';

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
          <Text className="text-blue-600 font-bold text-xl">${cruise.price_per_person}</Text>
        </View>

        <Text className="text-gray-600 mb-3">{cruise.cruise_line}</Text>

        <View className="flex-row items-center mb-3">
          <Star size={20} color="#fbbf24" fill="#fbbf24" />
          <Text className="ml-2 text-gray-600">4.7 (3245 reviews)</Text>
        </View>

        <View className="bg-gray-50 rounded-lg p-4 mb-4">
          <Text className="font-semibold mb-2">Cruise Details</Text>
          <View className="flex-row items-center mb-2">
            <Ship size={16} color="#6b7280" />
            <Text className="ml-2 text-gray-600">{cruise.ship}</Text>
          </View>
          <View className="flex-row items-center mb-2">
            <Calendar size={16} color="#6b7280" />
            <Text className="ml-2 text-gray-600">{cruise.duration} Days</Text>
          </View>
          <View className="flex-row items-center">
            <MapPin size={16} color="#6b7280" />
            <Text className="ml-2 text-gray-600">{cruise.departure_port}</Text>
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
          <Text className="font-semibold mb-2">Cabin Types</Text>
          {cruise.cabin_types.map((cabin, index) => (
            <TouchableOpacity
              key={index}
              className={`border rounded-lg p-3 mb-2 ${
                selectedCabin?.type === cabin.type ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
              }`}
              onPress={() => setSelectedCabin(cabin)}
            >
              <View className="flex-row justify-between items-center">
                <Text className="font-semibold">{cabin.type}</Text>
                <Text className="text-blue-600 font-bold">${cabin.price}</Text>
              </View>
            </TouchableOpacity>
          ))}
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

### 4.4 Cruise Booking Form Component

```javascript
// components/CruiseBookingForm.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { User, Mail, Phone, CreditCard, Users } from 'lucide-react-native';

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
          <View className="flex-row items-center border border-gray-300 rounded-lg p-3">
            <User size={20} color="#6b7280" />
            <TextInput
              className="flex-1 ml-2"
              value={contactDetails.firstName}
              onChangeText={(text) => setContactDetails({...contactDetails, firstName: text})}
              placeholder="Enter first name"
            />
          </View>
        </View>
        <View className="mb-3">
          <Text className="text-gray-600 mb-1">Last Name</Text>
          <View className="flex-row items-center border border-gray-300 rounded-lg p-3">
            <User size={20} color="#6b7280" />
            <TextInput
              className="flex-1 ml-2"
              value={contactDetails.lastName}
              onChangeText={(text) => setContactDetails({...contactDetails, lastName: text})}
              placeholder="Enter last name"
            />
          </View>
        </View>
        <View className="mb-3">
          <Text className="text-gray-600 mb-1">Email</Text>
          <View className="flex-row items-center border border-gray-300 rounded-lg p-3">
            <Mail size={20} color="#6b7280" />
            <TextInput
              className="flex-1 ml-2"
              value={contactDetails.email}
              onChangeText={(text) => setContactDetails({...contactDetails, email: text})}
              placeholder="Enter email"
              keyboardType="email-address"
            />
          </View>
        </View>
        <View className="mb-3">
          <Text className="text-gray-600 mb-1">Phone</Text>
          <View className="flex-row items-center border border-gray-300 rounded-lg p-3">
            <Phone size={20} color="#6b7280" />
            <TextInput
              className="flex-1 ml-2"
              value={contactDetails.phone}
              onChangeText={(text) => setContactDetails({...contactDetails, phone: text})}
              placeholder="Enter phone number"
              keyboardType="phone-pad"
            />
          </View>
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
          <View className="flex-row items-center border border-gray-300 rounded-lg p-3">
            <CreditCard size={20} color="#6b7280" />
            <TextInput
              className="flex-1 ml-2"
              value={paymentDetails.cardNumber}
              onChangeText={(text) => setPaymentDetails({...paymentDetails, cardNumber: text})}
              placeholder="1234 5678 9012 3456"
              keyboardType="numeric"
            />
          </View>
        </View>
        <View className="mb-3">
          <Text className="text-gray-600 mb-1">Cardholder Name</Text>
          <View className="flex-row items-center border border-gray-300 rounded-lg p-3">
            <User size={20} color="#6b7280" />
            <TextInput
              className="flex-1 ml-2"
              value={paymentDetails.cardHolder}
              onChangeText={(text) => setPaymentDetails({...paymentDetails, cardHolder: text})}
              placeholder="John Doe"
            />
          </View>
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
          <Text className="font-semibold">{cruise.duration} Days</Text>
        </View>
        <View className="flex-row justify-between mb-2">
          <Text className="text-gray-600">Passengers:</Text>
          <Text className="font-semibold">{passengerDetails.adults.length + passengerDetails.children.length}</Text>
        </View>
        <View className="flex-row justify-between mb-2">
          <Text className="text-gray-600">Base Price:</Text>
          <Text className="font-semibold">${cruise.price_per_person}</Text>
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
              ${cruise.price_per_person + 350}
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

## 🗄️ 5. Database Integration

### 5.1 Supabase Service

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
            ship: bookingData.ship,
            departure_port: bookingData.departurePort,
            departure_date: bookingData.departureDate,
            return_date: bookingData.returnDate,
            duration: bookingData.duration,
            destinations: bookingData.destinations,
            cabin_type: bookingData.cabinType,
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

---

## 🚀 6. Complete Implementation Flow

### 6.1 Navigation Structure

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

### 6.2 Redux Store Setup

```javascript
// store/cruiseSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import CruiseService from '../services/CruiseService';

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
    return await CruiseService.processCruiseBooking(bookingData);
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

This complete implementation provides all the necessary components, services, and implementation details to build a cruise booking system that matches the existing website functionality for both web and Android platforms.





