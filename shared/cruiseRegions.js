/**
 * The cruise regions a sailing can belong to. The lat/lon place each region's
 * pin on the globe on /cruises, so a region staff cannot pick from this list
 * would have nowhere to show.
 */
export const CRUISE_REGIONS = [
  { key: 'caribbean', name: 'Caribbean', lat: 17, lon: -72 },
  { key: 'bahamas', name: 'Bahamas', lat: 25, lon: -77.5 },
  { key: 'bermuda', name: 'Bermuda', lat: 32.3, lon: -64.8 },
  { key: 'mexican-riviera', name: 'Mexican Riviera', lat: 21, lon: -106 },
  { key: 'alaska', name: 'Alaska', lat: 58, lon: -136 },
  { key: 'hawaii', name: 'Hawaii', lat: 20.8, lon: -157 },
  { key: 'canada-new-england', name: 'Canada & New England', lat: 44, lon: -65 },
  { key: 'panama-canal', name: 'Panama Canal', lat: 9.1, lon: -79.7 },
  { key: 'mediterranean', name: 'Mediterranean', lat: 38, lon: 15 },
  { key: 'northern-europe', name: 'Northern Europe', lat: 58, lon: 10 },
  { key: 'transatlantic', name: 'Transatlantic', lat: 35, lon: -40 },
  { key: 'middle-east', name: 'Middle East', lat: 25, lon: 55 },
  { key: 'asia', name: 'Asia', lat: 15, lon: 115 },
  { key: 'australia-new-zealand', name: 'Australia & New Zealand', lat: -35, lon: 160 },
  { key: 'south-america', name: 'South America', lat: -30, lon: -55 },
];

export const regionByKey = (key) => CRUISE_REGIONS.find((region) => region.key === key) ?? null;
