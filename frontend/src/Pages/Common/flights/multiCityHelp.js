// Smaller airports whose flights Amadeus mostly reaches by coach or rail, so a
// multi-city ticket through them rarely prices. The city code searches every
// airport of the city (DXB-LON-SFO found 192 trips where DXB-LTN-SFO found none).
const CITY_OF_SMALLER_AIRPORT = {
  LTN: ['LON', 'London'],
  STN: ['LON', 'London'],
  SEN: ['LON', 'London'],
  LCY: ['LON', 'London'],
  BVA: ['PAR', 'Paris'],
  CIA: ['ROM', 'Rome'],
  BGY: ['MIL', 'Milan'],
};

const codeOf = (place) => {
  const text = String(place ?? '').trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(text)) return text;
  return text.match(/\(([A-Z]{3})\)/)?.[1] || '';
};

export function citySearchInstead(legs = []) {
  const cityNames = [];
  const swap = (place) => {
    const city = CITY_OF_SMALLER_AIRPORT[codeOf(place)];
    if (!city) return place;
    if (!cityNames.includes(city[1])) cityNames.push(city[1]);
    return city[0];
  };
  const swapped = legs.map((leg) => ({ ...leg, from: swap(leg.from), to: swap(leg.to) }));
  return cityNames.length > 0 ? { cityNames, legs: swapped } : null;
}
