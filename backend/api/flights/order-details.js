export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  const { orderId } = req.query;

  if (!orderId) {
    return res.status(400).json({
      success: false,
      error: 'Order ID is required'
    });
  }

  // Since we can't use real Amadeus booking API due to token limitations,
  // this simulates what the response would look like
  const simulatedOrderDetails = {
    id: orderId,
    status: "CONFIRMED",
    creationDate: "2025-06-19T19:05:00.000Z",
    bookingReference: `BOOK-${Date.now()}`,
    
    // PNR is found in associatedRecords
    associatedRecords: [{
      reference: "PNR" + Math.random().toString(36).substr(2, 6).toUpperCase(), // Simulated PNR
      creationDate: "2025-06-19T19:05:00.000Z",
      originSystemCode: "GDS",
      flightNumber: "AI-9731"
    }],
    
    flightOffers: [{
      id: "1",
      price: { 
        total: "29.60", 
        currency: "USD",
        base: "25.00",
        taxes: [{
          amount: "4.60",
          code: "IN"
        }]
      },
      itineraries: [{
        duration: "PT1H5M",
        segments: [{
          departure: {
            iataCode: "DEL",
            terminal: "3",
            at: "2025-06-29T11:10:00"
          },
          arrival: {
            iataCode: "JAI", 
            terminal: "1",
            at: "2025-06-29T12:15:00"
          },
          carrierCode: "AI",
          number: "9731",
          aircraft: { code: "320" },
          operating: { carrierCode: "AI" },
          duration: "PT1H5M"
        }]
      }],
      price: { total: "29.60", currency: "USD" },
      pricingOptions: {
        fareType: ["PUBLISHED"],
        includedCheckedBagsOnly: true
      }
    }],
    
    travelers: [{
      id: "1",
      dateOfBirth: "1990-01-01",
      name: {
        firstName: "John",
        lastName: "Doe"
      },
      gender: "MALE",
      contact: {
        emailAddress: "john.doe@example.com",
        phones: [{
          deviceType: "MOBILE",
          countryCallingCode: "91",
          number: "9876543210"
        }]
      },
      documents: [{
        documentType: "PASSPORT",
        number: "123456789",
        expiryDate: "2030-12-31",
        issuanceCountry: "IN",
        validityCountry: "IN",
        nationality: "IN",
        holder: true
      }]
    }],
    
    contacts: {
      emailAddress: "john.doe@example.com",
      phones: [{
        deviceType: "MOBILE",
        countryCallingCode: "91", 
        number: "9876543210"
      }]
    },
    
    totalPrice: {
      amount: "29.60",
      currency: "USD"
    },
    
    // Additional booking information
    bookingStatus: "CONFIRMED",
    paymentStatus: "COMPLETED",
    ticketingAgreement: {
      option: "DELAY_TO_CANCEL",
      delay: "6D"
    }
  };

  // Extract PNR for easy access
  const pnr = simulatedOrderDetails.associatedRecords?.[0]?.reference;

  return res.json({
    success: true,
    data: simulatedOrderDetails,
    pnr: pnr,
    message: "Order details retrieved successfully",
    note: "This is a simulated response due to Amadeus production API limitations"
  });
} 