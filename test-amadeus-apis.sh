#!/bin/bash

# Amadeus Flight APIs Test Script
# This script tests all Amadeus flight-related API endpoints

echo "🚀 Starting Amadeus Flight APIs Test Suite"
echo "=========================================="
echo ""

# Base URL
BASE_URL="http://localhost:5005/api/flights"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to print test result
print_result() {
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ PASS${NC}: $2"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}❌ FAIL${NC}: $2"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    echo ""
}

# Function to test API endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    
    echo -e "${YELLOW}Testing:${NC} $description"
    echo "Endpoint: $method $endpoint"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    echo "HTTP Status: $http_code"
    echo "Response: $body" | jq '.' 2>/dev/null || echo "$body"
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        print_result 0 "$description"
        return 0
    else
        print_result 1 "$description"
        return 1
    fi
}

echo "📋 Test 1: Flight Search (One-way)"
echo "-----------------------------------"
test_endpoint "POST" "$BASE_URL/search" '{
  "from": "DEL",
  "to": "BOM",
  "departDate": "2025-06-15",
  "adults": 1,
  "travelClass": "ECONOMY"
}' "One-way flight search DEL to BOM"

echo "📋 Test 2: Flight Search (Round-trip)"
echo "--------------------------------------"
test_endpoint "POST" "$BASE_URL/search" '{
  "from": "JFK",
  "to": "LAX",
  "departDate": "2025-07-01",
  "returnDate": "2025-07-10",
  "adults": 2,
  "children": 1,
  "travelClass": "BUSINESS"
}' "Round-trip flight search JFK to LAX"

echo "📋 Test 3: Flight Search (Non-stop only)"
echo "-----------------------------------------"
test_endpoint "POST" "$BASE_URL/search" '{
  "from": "LHR",
  "to": "DXB",
  "departDate": "2025-08-15",
  "adults": 1,
  "nonStop": true
}' "Non-stop flights LHR to DXB"

echo "📋 Test 4: Flight Search (With max price filter)"
echo "-------------------------------------------------"
test_endpoint "POST" "$BASE_URL/search" '{
  "from": "SYD",
  "to": "SIN",
  "departDate": "2025-09-01",
  "adults": 1,
  "maxPrice": 500
}' "Flights with max price $500"

echo "📋 Test 5: Flight Search (Specific airline)"
echo "--------------------------------------------"
test_endpoint "POST" "$BASE_URL/search" '{
  "from": "BOM",
  "to": "DEL",
  "departDate": "2025-06-20",
  "adults": 1,
  "includedAirlineCodes": "AI,6E"
}' "Flights with specific airlines (Air India, IndiGo)"

echo "📋 Test 6: Location Search (Airport/City)"
echo "------------------------------------------"
test_endpoint "GET" "$BASE_URL/locations?keyword=New%20York&limit=5" "" "Search locations for 'New York'"

echo "📋 Test 7: Location Search (By country)"
echo "----------------------------------------"
test_endpoint "GET" "$BASE_URL/locations?keyword=Mumbai&countryCode=IN&limit=3" "" "Search locations in India"

echo "📋 Test 8: Airline Codes Lookup"
echo "--------------------------------"
test_endpoint "GET" "$BASE_URL/airlines?codes=AI,BA,AA" "" "Lookup airline codes (AI, BA, AA)"

echo "📋 Test 9: All Airlines Lookup"
echo "-------------------------------"
test_endpoint "GET" "$BASE_URL/airlines" "" "Get all airline codes"

echo "📋 Test 10: Most Booked Destinations"
echo "-------------------------------------"
test_endpoint "GET" "$BASE_URL/analytics/most-booked?origin=DEL&period=2024-12" "" "Most booked destinations from Delhi"

echo "📋 Test 11: Most Traveled Destinations"
echo "---------------------------------------"
test_endpoint "GET" "$BASE_URL/analytics/most-traveled?origin=NYC&period=2024-12" "" "Most traveled destinations from NYC"

echo "📋 Test 12: Cheapest Flight Dates"
echo "----------------------------------"
test_endpoint "GET" "$BASE_URL/analytics/cheapest-dates?origin=BOM&destination=GOI&departureDate=2025-06-01" "" "Cheapest dates BOM to GOI"

echo "📋 Test 13: Flight Status"
echo "-------------------------"
test_endpoint "GET" "$BASE_URL/status?carrierCode=AI&flightNumber=680&scheduledDate=2025-05-15" "" "Flight status for AI680"

echo "📋 Test 14: Flight Availabilities"
echo "----------------------------------"
test_endpoint "POST" "$BASE_URL/availabilities" '{
  "origin": "DEL",
  "destination": "BOM",
  "departureDate": "2025-06-15",
  "adults": 1
}' "Flight seat availabilities DEL to BOM"

echo "📋 Test 15: Flight Price Confirmation"
echo "--------------------------------------"
# Note: This requires a valid flight offer from search results
# For now, we'll test the endpoint structure
test_endpoint "POST" "$BASE_URL/price" '{
  "flightOffer": {
    "type": "flight-offer",
    "id": "1",
    "source": "GDS",
    "instantTicketingRequired": false,
    "nonHomogeneous": false,
    "oneWay": false,
    "lastTicketingDate": "2025-06-14",
    "numberOfBookableSeats": 9,
    "itineraries": [],
    "price": {
      "currency": "USD",
      "total": "150.00",
      "base": "120.00"
    },
    "pricingOptions": {
      "fareType": ["PUBLISHED"],
      "includedCheckedBagsOnly": true
    },
    "validatingAirlineCodes": ["AI"],
    "travelerPricings": []
  }
}' "Price confirmation for flight offer"

echo ""
echo "=========================================="
echo "📊 Test Summary"
echo "=========================================="
echo -e "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}⚠️  Some tests failed. Please check the output above.${NC}"
    exit 1
fi
