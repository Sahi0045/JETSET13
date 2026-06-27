/**
 * Deterministic hotel image assignment.
 *
 * Amadeus Self-Service hotel APIs do NOT return property photos, so we map each
 * hotel to a STABLE, DISTINCT image from a curated pool of real Unsplash photos.
 * Keying on the hotelId means a given hotel always shows the same image (stable
 * across searches) while different hotels get visually different images — fixing
 * the previous bug where every card used the same deprecated `source.unsplash.com`
 * placeholder (which redirected all requests to one fallback photo).
 */

// Curated, stable Unsplash photo IDs (exterior / lobby / room shots).
const HOTEL_PHOTOS = [
  'photo-1566073771259-6a8506099945', // resort exterior
  'photo-1551882547-ff40c63fe5fa',    // poolside
  'photo-1542314831-068cd1dbfeeb',    // luxury room
  'photo-1564501049412-61c2a3083791', // boutique exterior
  'photo-1571896349842-33c89424de2d', // suite
  'photo-1582719478250-c89cae4dc85b', // resort pool
  'photo-1520250497591-112f2f40a3f4', // modern room
  'photo-1611892440504-42a792e24d32', // grand lobby
  'photo-1618773928121-c32242e63f39', // king room
  'photo-1590490360182-c33d57733427', // hotel facade
  'photo-1535827841776-24afc1e255ac', // beach resort
  'photo-1445019980597-93fa8acb246c', // bright suite
  'photo-1631049307264-da0ec9d70304', // city hotel
  'photo-1578683010236-d716f9a3f461', // cozy room
  'photo-1551776235-dde6d482980b',    // poolside lounge
  'photo-1596436889106-be35e843f974', // resort villa
  'photo-1606402179428-a57976d71fa4', // designer room
  'photo-1551918120-9739cb430c6d',    // skyline hotel
  'photo-1582719508461-905c673771fd', // spa suite
  'photo-1542317854-2c8a30c2adb0',    // balcony room
  'photo-1584132967334-10e028bd69f7', // resort grounds
  'photo-1455587734955-081b22074882', // luxury lobby
  'photo-1517840901100-8179e982acb7', // hotel hallway
  'photo-1605346434674-a440ca4dc4c0', // mountain lodge
];

const ROOM_PHOTOS = [
  'photo-1631049307264-da0ec9d70304',
  'photo-1618773928121-c32242e63f39',
  'photo-1611892440504-42a792e24d32',
  'photo-1582719478250-c89cae4dc85b',
  'photo-1505693416388-ac5ce068fe85',
  'photo-1444201983204-c43cbd584d93',
];

const UNSPLASH = 'https://images.unsplash.com';
const PARAMS = 'auto=format&fit=crop&w=1200&q=80';

// Simple deterministic string hash (djb2) → non-negative integer.
function hashSeed(seed) {
  const str = String(seed || 'hotel');
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h |= 0; // 32-bit
  }
  return Math.abs(h);
}

function photoUrl(id) {
  return `${UNSPLASH}/${id}?${PARAMS}`;
}

/**
 * Returns { image, images[] } for a hotel, deterministically chosen from the pool.
 * @param {string} seed - hotelId (or any stable identifier)
 */
export function getHotelImages(seed) {
  const h = hashSeed(seed);
  const primaryIdx = h % HOTEL_PHOTOS.length;
  const secondaryIdx = (h + 7) % HOTEL_PHOTOS.length;
  const roomIdx = h % ROOM_PHOTOS.length;
  const room2Idx = (h + 3) % ROOM_PHOTOS.length;

  const image = photoUrl(HOTEL_PHOTOS[primaryIdx]);
  const images = [
    photoUrl(HOTEL_PHOTOS[primaryIdx]),
    photoUrl(HOTEL_PHOTOS[secondaryIdx]),
    photoUrl(ROOM_PHOTOS[roomIdx]),
    photoUrl(ROOM_PHOTOS[room2Idx]),
  ];
  return { image, images };
}

export default getHotelImages;
