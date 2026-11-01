// Destination photos for a city, shared by the flights home page and My Trips.

// Curated Unsplash images keyed by city name (no API key needed)
const cityImages = {
  "London": "/images/destinations/photo-1513635269975-59663e0ac1ad.webp",
  "Paris": "/images/destinations/photo-1502602898657-3e91760cbb34.webp",
  "Dubai": "/images/destinations/photo-1512453979798-5ea266f8880c.webp",
  "Singapore": "/images/destinations/photo-1565967511849-76a60a516170.webp",
  "Bangkok": "/images/destinations/photo-1563492065599-3520f775eeed.webp",
  "New York": "/images/destinations/photo-1496442226666-8d4d0e62e6e9.webp",
  "Sydney": "/images/destinations/photo-1506973035872-a4ec16b8e8d9.webp",
  "Tokyo": "/images/destinations/photo-1540959733332-eab4deabeeaf.webp",
  "Barcelona": "/images/destinations/photo-1583422409516-2895a77efded.webp",
  "Rome": "/images/destinations/photo-1552832230-c0197dd311b5.webp",
  "Amsterdam": "/images/destinations/photo-1534351590666-13e3e96b5017.webp",
  "Istanbul": "/images/destinations/photo-1524231757912-21f4fe3a7200.webp",
  "Mumbai": "/images/destinations/photo-1566552881560-0be862a7c445.webp",
  "New Delhi": "/images/destinations/photo-1587474260584-136574528ed5.webp",
  "Bangalore": "/images/destinations/photo-1596176530529-78163a4f7af2.webp",
  "Hong Kong": "/images/destinations/photo-1536599018102-9f803c140fc1.webp",
  "Seoul": "/images/destinations/photo-1506351421178-63b52a2d2562.webp",
  "Kuala Lumpur": "/images/destinations/photo-1596422846543-75c6fc197f07.webp",
  "Los Angeles": "/images/destinations/photo-1534190760961-74e8c1c5c3da.webp",
  "San Francisco": "/images/destinations/photo-1501594907352-04cda38ebc29.webp",
  "Berlin": "/images/destinations/photo-1560969184-10fe8719e047.webp",
  "Madrid": "/images/destinations/photo-1543783207-ec64e4d95325.webp",
  "Lisbon": "/images/destinations/photo-1585208798174-6cedd86e019a.webp",
  "Athens": "/images/destinations/photo-1555993539-1732b0258235.webp",
  "Vienna": "/images/destinations/photo-1516550893923-42d28e5677af.webp",
  "Prague": "/images/destinations/photo-1541849546-216549ae216d.webp",
  "Zurich": "/images/destinations/photo-1515488764276-beab7607c1e6.webp",
  "Frankfurt": "/images/destinations/photo-1467269204594-9661b134dd2b.webp",
  "Milan": "/images/destinations/photo-1520440229-6469a149ac59.webp",
  "Goa": "/images/destinations/photo-1512343879784-a960bf40e7f2.webp",
  "Jaipur": "/images/destinations/photo-1477587458883-47145ed94245.webp",
  "Chennai": "/images/destinations/photo-1582510003544-4d00b7f74220.webp",
  "Kolkata": "/images/destinations/photo-1558431382-27e303142255.webp",
  "Hyderabad": "/images/destinations/photo-1551161242-b5af797b7233.webp",
  "Copenhagen": "/images/destinations/photo-1513622470522-26c3c8a854bc.webp",
  "Stockholm": "/images/destinations/photo-1509356843151-3e7d96241e11.webp",
};

// Reliable image lookup keyed by IATA code. Airport names returned by the data
// set are long ("Goa Dabolim", "Singapore Changi", "London Heathrow"), so name
// matching against cityImages misses constantly — code keys never do. Covers
// every destination in the country fallback pools below.
const cityImageByCode = {
  // India
  BOM: "/images/destinations/photo-1566552881560-0be862a7c445.webp", // Mumbai
  BLR: "/images/destinations/photo-1596176530529-78163a4f7af2.webp", // Bangalore
  GOI: "/images/destinations/photo-1512343879784-a960bf40e7f2.webp", // Goa
  JAI: "/images/destinations/photo-1477587458883-47145ed94245.webp", // Jaipur
  CCU: "/images/destinations/photo-1558431382-27e303142255.webp", // Kolkata
  HYD: "/images/destinations/photo-1551161242-b5af797b7233.webp", // Hyderabad
  MAA: "/images/destinations/photo-1582510003544-4d00b7f74220.webp", // Chennai
  DEL: "/images/destinations/photo-1587474260584-136574528ed5.webp", // New Delhi
  // Asia / Middle East
  DXB: "/images/destinations/photo-1512453979798-5ea266f8880c.webp", // Dubai
  BKK: "/images/destinations/photo-1563492065599-3520f775eeed.webp", // Bangkok
  SIN: "/images/destinations/photo-1565967511849-76a60a516170.webp", // Singapore
  KUL: "/images/destinations/photo-1596422846543-75c6fc197f07.webp", // Kuala Lumpur
  NRT: "/images/destinations/photo-1540959733332-eab4deabeeaf.webp", // Tokyo
  // North America
  LAX: "/images/destinations/photo-1534190760961-74e8c1c5c3da.webp", // Los Angeles
  JFK: "/images/destinations/photo-1496442226666-8d4d0e62e6e9.webp", // New York
  ORD: "/images/destinations/photo-1494522855154-9297ac14b55f.webp", // Chicago
  SFO: "/images/destinations/photo-1501594907352-04cda38ebc29.webp", // San Francisco
  MIA: "/images/destinations/photo-1506966953602-c20cc11f75e3.webp", // Miami
  HNL: "/images/destinations/photo-1545459720-aac8509eb02c.webp", // Honolulu
  CUN: "/images/destinations/photo-1510097467424-192d713fd8b2.webp", // Cancun
  // Europe
  LHR: "/images/destinations/photo-1513635269975-59663e0ac1ad.webp", // London
  CDG: "/images/destinations/photo-1502602898657-3e91760cbb34.webp", // Paris
  BCN: "/images/destinations/photo-1583422409516-2895a77efded.webp", // Barcelona
  FCO: "/images/destinations/photo-1552832230-c0197dd311b5.webp", // Rome
  AMS: "/images/destinations/photo-1534351590666-13e3e96b5017.webp", // Amsterdam
  IST: "/images/destinations/photo-1524231757912-21f4fe3a7200.webp", // Istanbul
  ATH: "/images/destinations/photo-1555993539-1732b0258235.webp", // Athens
  LIS: "/images/destinations/photo-1585208798174-6cedd86e019a.webp", // Lisbon
  // Africa
  CAI: "/images/destinations/photo-1572252009286-268acec5ca0a.webp", // Cairo
};

// Distinct generic travel photos. Any unmapped destination picks one
// deterministically from its key so different cities never share the same
// fallback image (the old single fallback made every miss look identical).
const FALLBACK_IMAGES = [
  "/images/destinations/photo-1476514525535-07fb3b4ae5f1.webp",
  "/images/destinations/photo-1488646953014-85cb44e25828.webp",
  "/images/destinations/photo-1503220317375-aaad61436b1b.webp",
  "/images/destinations/photo-1469854523086-cc02fe5d8800.webp",
  "/images/destinations/photo-1500835556837-99ac94a94552.webp",
];

// Stable pick from FALLBACK_IMAGES based on a key (code or city name)
export const fallbackImageFor = (key = "") => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return FALLBACK_IMAGES[hash % FALLBACK_IMAGES.length];
};

// Resolve a destination image: by code (reliable) → by city name → distinct fallback
export const getDestImage = (code, cityName) =>
  cityImageByCode[code] || cityImages[cityName] || fallbackImageFor(code || cityName);
