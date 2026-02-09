// Cruise advertisement data
const adData = [
  {
    id: 1,
    title: "Caribbean Cruise Special Offer",
    subtitle: "7 Days of Luxury & Adventure",
    imagePath: "/cruise/caribbean-cruise.jpg",
    badge: "Limited Time Offer",
    price: 499,
    pricePeriod: "per person",
    features: [
      { icon: "ship", text: "Luxury Ship" },
      { icon: "wifi", text: "Free Wi-Fi" },
      { icon: "cocktail", text: "All-Inclusive" }
    ],
    primaryButton: {
      text: "Book Now & Save 30%",
      link: "/cruises/caribbean-special"
    },
    secondaryButton: {
      text: "View Details"
    },
    offerEnds: 24, // hours
    destinations: ["Miami", "Jamaica", "Bahamas"],
    cruiseLine: "Royal Caribbean",
    priority: 10
  },
  {
    id: 2,
    title: "Mediterranean Cruise Experience",
    subtitle: "10 Days of Culture & Relaxation",
    imagePath: "/cruise/mediterranean-cruise.jpg",
    badge: "Best Seller",
    price: 899,
    pricePeriod: "per person",
    features: [
      { icon: "ship", text: "Premium Suite" },
      { icon: "utensils", text: "Gourmet Dining" },
      { icon: "spa", text: "Spa Access" }
    ],
    primaryButton: {
      text: "Book Your Escape",
      link: "/cruises/mediterranean-tour"
    },
    secondaryButton: {
      text: "Learn More"
    },
    offerEnds: 48, // hours
    destinations: ["Barcelona", "Rome", "Athens"],
    cruiseLine: "Norwegian",
    priority: 8
  },
  {
    id: 3,
    title: "Alaska Wilderness Cruise",
    subtitle: "Experience Nature's Majesty",
    imagePath: "/cruise/alaska-cruise.jpg",
    badge: "New Itinerary",
    price: 799,
    pricePeriod: "per person",
    features: [
      { icon: "mountain", text: "Glacier Viewing" },
      { icon: "binoculars", text: "Wildlife Tours" },
      { icon: "camera", text: "Photo Workshops" }
    ],
    primaryButton: {
      text: "Explore Alaska",
      link: "/cruises/alaska-adventure"
    },
    secondaryButton: {
      text: "See Details"
    },
    offerEnds: 72, // hours
    destinations: ["Vancouver", "Juneau", "Ketchikan"],
    cruiseLine: "Princess",
    priority: 7
  },
  {
    id: 4,
    title: "Luxury Bahamas Getaway",
    subtitle: "5-Star All-Inclusive Experience",
    imagePath: "/cruise/bahamas-cruise.jpg",
    badge: "Premium Package",
    price: 699,
    pricePeriod: "all inclusive",
    features: [
      { icon: "cocktail", text: "Premium Drinks" },
      { icon: "sun", text: "Private Beach" },
      { icon: "concierge", text: "Butler Service" }
    ],
    primaryButton: {
      text: "Reserve Your Suite",
      link: "/cruises/bahamas-luxury"
    },
    secondaryButton: {
      text: "View Amenities"
    },
    offerEnds: 36, // hours
    destinations: ["Miami", "Nassau", "Coco Cay"],
    cruiseLine: "Celebrity",
    priority: 9
  },
  {
    id: 5,
    title: "Hawaiian Island Hopping",
    subtitle: "Discover Paradise Islands",
    imagePath: "/cruise/hawaii-cruise.jpg",
    badge: "Family Friendly",
    price: 849,
    pricePeriod: "per person",
    features: [
      { icon: "umbrella-beach", text: "Beach Excursions" },
      { icon: "volcano", text: "Volcano Tours" },
      { icon: "child", text: "Kids Club" }
    ],
    primaryButton: {
      text: "Book Family Adventure",
      link: "/cruises/hawaii-family"
    },
    secondaryButton: {
      text: "Learn More"
    },
    offerEnds: 48, // hours
    destinations: ["Honolulu", "Maui", "Kauai"],
    cruiseLine: "Carnival",
    priority: 6
  }
];

export default adData; 