// Hotel data
export const hotels = [
  {
    id: 1,
    name: "Kashmir catch up",
    location: "Kashmir, India",
    price: 50,
    rating: 4.8,
    images: {
      main: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?q=80&w=2070&auto=format&fit=crop",
      gallery: [
        "https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=2070&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?q=80&w=2070&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1590490360182-c33d57733427?q=80&w=2070&auto=format&fit=crop"
      ]
    },
    amenities: ["Spa", "Pool", "WiFi", "Restaurant", "Room Service"]
  },
  {
    id: 2,
    name: "Maldives Resort",
    location: "Maldives",
    price: 22,
    rating: 4.9,
    images: {
      main: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?q=80&w=2070&auto=format&fit=crop",
      gallery: [
        "https://images.unsplash.com/photo-1564501049412-61c2a3083791?q=80&w=2070&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?q=80&w=2070&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1590490360182-c33d57733427?q=80&w=2070&auto=format&fit=crop"
      ]
    },
    amenities: ["Ocean View", "WiFi", "Restaurant", "Breakfast", "Bar"]
  },
  {
    id: 3,
    name: "Stark House",
    location: "Dehiwala, Sri Lanka",
    price: 856,
    rating: 4.7,
    images: {
      main: "https://images.unsplash.com/photo-1564501049412-61c2a3083791?q=80&w=2070&auto=format&fit=crop",
      gallery: [
        "https://images.unsplash.com/photo-1590490360182-c33d57733427?q=80&w=2070&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=2070&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?q=80&w=2070&auto=format&fit=crop"
      ]
    },
    amenities: ["Mountain View", "WiFi", "Restaurant", "Bar", "Parking"]
  },
  {
    id: 4,
    name: "Vinna Vill",
    location: "Beruwala, Sri Lanka",
    price: 62,
    rating: 4.8,
    images: {
      main: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?q=80&w=2070&auto=format&fit=crop",
      gallery: [
        "https://images.unsplash.com/photo-1564501049412-61c2a3083791?q=80&w=2070&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=2070&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?q=80&w=2070&auto=format&fit=crop"
      ]
    },
    amenities: ["River View", "Fireplace", "WiFi", "Kitchen", "Private Garden"]
  },
  {
    id: 5,
    name: "Bobox",
    location: "Kandy, Sri Lanka",
    price: 72,
    rating: 4.6,
    images: {
      main: "https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=2070&auto=format&fit=crop",
      gallery: [
        "https://images.unsplash.com/photo-1590490360182-c33d57733427?q=80&w=2070&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1564501049412-61c2a3083791?q=80&w=2070&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?q=80&w=2070&auto=format&fit=crop"
      ]
    },
    amenities: ["Mountain View", "Private Chef", "WiFi", "Terrace", "Room Service"]
  }
];

// Popular destinations data
export const popularDestinations = [
  {
    id: 1,
    name: "Paris",
    code: "PAR",
    country: "France",
    image: "https://images.unsplash.com/photo-1499856871958-5b9627545d1a",
    description: "The City of Light",
    rating: 4.8,
    reviews: 1250
  },
  {
    id: 2,
    name: "London",
    code: "LON",
    country: "United Kingdom",
    image: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad",
    description: "A Royal Experience",
    rating: 4.7,
    reviews: 980
  },
  {
    id: 3,
    name: "New York",
    code: "NYC",
    country: "United States",
    image: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9",
    description: "The City That Never Sleeps",
    rating: 4.9,
    reviews: 2100
  },
  {
    id: 4,
    name: "Tokyo",
    code: "TYO",
    country: "Japan",
    image: "https://images.unsplash.com/photo-1536098561742-ca998e48cbcc",
    description: "Where Tradition Meets Future",
    rating: 4.8,
    reviews: 1560
  },
  {
    id: 5,
    name: "Dubai",
    code: "DXB",
    country: "United Arab Emirates",
    image: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c",
    description: "Luxury in the Desert",
    rating: 4.9,
    reviews: 890
  },
  {
    id: 6,
    name: "Rome",
    code: "ROM",
    country: "Italy",
    image: "https://images.unsplash.com/photo-1525874684015-58379d421a52",
    description: "The Eternal City",
    rating: 4.7,
    reviews: 1100
  },
  {
    id: 7,
    name: "Singapore",
    code: "SIN",
    country: "Singapore",
    image: "https://images.unsplash.com/photo-1525625293386-3f8f99389edd",
    description: "Garden City of Asia",
    rating: 4.8,
    reviews: 950
  },
  {
    id: 8,
    name: "Barcelona",
    code: "BCN",
    country: "Spain",
    image: "https://images.unsplash.com/photo-1539037116277-4db20889f2d4",
    description: "Gaudi's Masterpiece",
    rating: 4.7,
    reviews: 850
  },
  {
    id: 9,
    name: "Amsterdam",
    code: "AMS",
    country: "Netherlands",
    image: "https://images.unsplash.com/photo-1576924542622-772579fe5fbb",
    description: "City of Canals",
    rating: 4.6,
    reviews: 780
  },
  {
    id: 10,
    name: "Hong Kong",
    code: "HKG",
    country: "China",
    image: "https://images.unsplash.com/photo-1508002366005-75a695ee2d17",
    description: "East Meets West",
    rating: 4.7,
    reviews: 920
  },
  {
    id: 11,
    name: "Berlin",
    code: "BER",
    country: "Germany",
    image: "https://images.unsplash.com/photo-1528728329032-2972f65dfb3f",
    description: "Historic and Modern",
    rating: 4.5,
    reviews: 720
  },
  {
    id: 12,
    name: "Istanbul",
    code: "IST",
    country: "Turkey",
    image: "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200",
    description: "Where Continents Meet",
    rating: 4.6,
    reviews: 680
  }
];

// Sample hotel details for detail page
export const hotelDetails = {
  id: 1,
  name: "Grand Luxury Resort",
  location: "Jammu & Kashmir, India",
  price: 249,
  currency: "USD",
  description:
    "Nestled in the heart of Jammu & Kashmir, Grand Luxury Resort is your perfect retreat for an unforgettable stay in the breathtaking landscapes of the Himalayas. Whether you're here for a relaxing getaway, a romantic escape, or an adventure, our hotel offers world-class hospitality with a touch of Kashmiri charm.",
  longDescription:
    "At Grand Luxury Resort, we promise you a blend of comfort, elegance, and warm hospitality that makes your stay truly special. Come, experience the beauty of Kashmir!",
  address: "Near Dal Lake, Srinagar, Jammu & Kashmir",
  rating: 4.9,
  reviewCount: 156,
  amenities: [
    { name: "2 bedrooms", icon: "bed" },
    { name: "1 living room", icon: "layout" },
    { name: "2 bathrooms", icon: "bath" },
    { name: "1 dining room", icon: "utensils" },
    { name: "50 mbps/s", icon: "wifi" },
    { name: "10 unit ready", icon: "grid" },
    { name: "1 refrigerator", icon: "refrigerator" },
    { name: "2 television", icon: "tv" },
  ],
  images: {
    main: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?q=80&w=2070&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=2070&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?q=80&w=2070&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1590490360182-c33d57733427?q=80&w=2070&auto=format&fit=crop",
    ],
  }
};