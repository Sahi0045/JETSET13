// Mock booking dataset used as offline/fallback data by FlightBookingConfirmation
// when the search-page state and the live API both fail to provide a booking.
// Extracted from data.js so it can be dynamic-imported and kept out of the
// main flights bundle until the fallback path is actually hit.

export const flightBookingData = {
  bookings: [
    {
      bookingId: "BK789012",
      bookingDate: "2024-07-15T12:00:00Z",
      status: "Confirmed",
      passengers: [
        {
          id: 1,
          name: "John Smith",
          age: 35,
          gender: "Male",
          seatNumber: "12A"
        },
        {
          id: 2,
          name: "Emma Smith",
          age: 30,
          gender: "Female",
          seatNumber: "12B"
        }
      ],
      flight: {
        flightNumber: "AI101",
        airline: "Air India",
        departureCity: "Mumbai",
        arrivalCity: "Delhi",
        departureTime: "2024-08-10T10:00:00Z",
        arrivalTime: "2024-08-10T12:30:00Z",
        duration: "2h 30m",
        aircraft: "Boeing 787",
        terminal: "T2",
        gate: "G12"
      },
      payment: {
        amount: 12500,
        currency: "INR",
        method: "Credit Card",
        status: "Paid"
      }
    },
    {
      bookingId: "BK123456",
      bookingDate: "2024-06-20T09:30:00Z",
      status: "Confirmed",
      passengers: [
        {
          id: 1,
          name: "Raj Sharma",
          age: 28,
          gender: "Male",
          seatNumber: "18F"
        }
      ],
      flight: {
        flightNumber: "IGO244",
        airline: "IndiGo",
        departureCity: "Bangalore",
        arrivalCity: "Kolkata",
        departureTime: "2024-07-25T16:15:00Z",
        arrivalTime: "2024-07-25T18:45:00Z",
        duration: "2h 30m",
        aircraft: "Airbus A320",
        terminal: "T1",
        gate: "G07"
      },
      payment: {
        amount: 5800,
        currency: "INR",
        method: "UPI",
        status: "Paid"
      }
    }
  ],
  internationalBookings: [
    {
      bookingId: "BK567890",
      bookingDate: "2024-08-10T14:30:00Z",
      status: "Confirmed",
      passengers: [
        {
          id: 1,
          name: "Priya Patel",
          age: 32,
          gender: "Female",
          seatNumber: "23K",
          passport: "J8745692",
          visaDetails: {
            country: "United States",
            type: "B2",
            expiryDate: "2026-05-15"
          }
        },
        {
          id: 2,
          name: "Vikram Patel",
          age: 35,
          gender: "Male",
          seatNumber: "23J",
          passport: "M1234587",
          visaDetails: {
            country: "United States",
            type: "B2",
            expiryDate: "2026-05-15"
          }
        }
      ],
      flight: {
        flightNumber: "AI101",
        airline: "Air India",
        departureCity: "New Delhi",
        arrivalCity: "New York",
        departureTime: "2024-09-15T01:30:00Z",
        arrivalTime: "2024-09-15T18:45:00Z",
        duration: "16h 15m",
        aircraft: "Boeing 777-300ER",
        terminal: "T3",
        gate: "G15",
        class: "Business",
        layovers: [
          {
            airport: "London Heathrow",
            duration: "2h 30m"
          }
        ]
      },
      payment: {
        amount: 185000,
        currency: "INR",
        method: "Credit Card",
        status: "Paid"
      },
      additionalServices: {
        meal: "Asian Vegetarian",
        extraBaggage: "1 piece (23kg)",
        insurance: true,
        airportPickup: false
      }
    }
  ]
};
