/**
 * Country Code Normalizer Utility
 * 
 * Converts various country code formats to ISO 3166-1 alpha-2 standard (2-letter codes)
 * Required for ARC Pay payment integration which expects ISO 3166-1 alpha-2 format
 * 
 * Examples:
 * - USA → US
 * - IND → IN
 * - GBR → GB
 * - United States → US
 */

// Country code mapping: various formats → ISO 3166-1 alpha-2
const COUNTRY_CODE_MAP = {
  // North America
  'USA': 'US',
  'United States': 'US',
  'United States of America': 'US',
  'CAN': 'CA',
  'Canada': 'CA',
  'MEX': 'MX',
  'Mexico': 'MX',
  
  // Europe
  'GBR': 'GB',
  'United Kingdom': 'GB',
  'UK': 'GB',
  'Great Britain': 'GB',
  'FRA': 'FR',
  'France': 'FR',
  'DEU': 'DE',
  'Germany': 'DE',
  'Deutschland': 'DE',
  'ITA': 'IT',
  'Italy': 'IT',
  'ESP': 'ES',
  'Spain': 'ES',
  'NLD': 'NL',
  'Netherlands': 'NL',
  'BEL': 'BE',
  'Belgium': 'BE',
  'CHE': 'CH',
  'Switzerland': 'CH',
  'AUT': 'AT',
  'Austria': 'AT',
  'SWE': 'SE',
  'Sweden': 'SE',
  'NOR': 'NO',
  'Norway': 'NO',
  'DNK': 'DK',
  'Denmark': 'DK',
  'FIN': 'FI',
  'Finland': 'FI',
  'POL': 'PL',
  'Poland': 'PL',
  'PRT': 'PT',
  'Portugal': 'PT',
  'GRC': 'GR',
  'Greece': 'GR',
  'IRL': 'IE',
  'Ireland': 'IE',
  
  // Asia
  'IND': 'IN',
  'India': 'IN',
  'CHN': 'CN',
  'China': 'CN',
  'JPN': 'JP',
  'Japan': 'JP',
  'KOR': 'KR',
  'Korea': 'KR',
  'South Korea': 'KR',
  'Republic of Korea': 'KR',
  'THA': 'TH',
  'Thailand': 'TH',
  'SGP': 'SG',
  'Singapore': 'SG',
  'MYS': 'MY',
  'Malaysia': 'MY',
  'IDN': 'ID',
  'Indonesia': 'ID',
  'PHL': 'PH',
  'Philippines': 'PH',
  'VNM': 'VN',
  'Vietnam': 'VN',
  'PAK': 'PK',
  'Pakistan': 'PK',
  'BGD': 'BD',
  'Bangladesh': 'BD',
  'LKA': 'LK',
  'Sri Lanka': 'LK',
  
  // Oceania
  'AUS': 'AU',
  'Australia': 'AU',
  'NZL': 'NZ',
  'New Zealand': 'NZ',
  
  // Middle East
  'ARE': 'AE',
  'United Arab Emirates': 'AE',
  'UAE': 'AE',
  'SAU': 'SA',
  'Saudi Arabia': 'SA',
  'ISR': 'IL',
  'Israel': 'IL',
  'TUR': 'TR',
  'Turkey': 'TR',
  'EGY': 'EG',
  'Egypt': 'EG',
  'QAT': 'QA',
  'Qatar': 'QA',
  'KWT': 'KW',
  'Kuwait': 'KW',
  'OMN': 'OM',
  'Oman': 'OM',
  'BHR': 'BH',
  'Bahrain': 'BH',
  'JOR': 'JO',
  'Jordan': 'JO',
  'LBN': 'LB',
  'Lebanon': 'LB',
  
  // Africa
  'ZAF': 'ZA',
  'South Africa': 'ZA',
  'NGA': 'NG',
  'Nigeria': 'NG',
  'KEN': 'KE',
  'Kenya': 'KE',
  'GHA': 'GH',
  'Ghana': 'GH',
  'ETH': 'ET',
  'Ethiopia': 'ET',
  'TZA': 'TZ',
  'Tanzania': 'TZ',
  'UGA': 'UG',
  'Uganda': 'UG',
  'MAR': 'MA',
  'Morocco': 'MA',
  
  // South America
  'BRA': 'BR',
  'Brazil': 'BR',
  'ARG': 'AR',
  'Argentina': 'AR',
  'CHL': 'CL',
  'Chile': 'CL',
  'COL': 'CO',
  'Colombia': 'CO',
  'PER': 'PE',
  'Peru': 'PE',
  'VEN': 'VE',
  'Venezuela': 'VE',
  'ECU': 'EC',
  'Ecuador': 'EC',
  'BOL': 'BO',
  'Bolivia': 'BO',
  'PRY': 'PY',
  'Paraguay': 'PY',
  'URY': 'UY',
  'Uruguay': 'UY',
  
  // Central America & Caribbean
  'CRI': 'CR',
  'Costa Rica': 'CR',
  'PAN': 'PA',
  'Panama': 'PA',
  'GTM': 'GT',
  'Guatemala': 'GT',
  'HND': 'HN',
  'Honduras': 'HN',
  'NIC': 'NI',
  'Nicaragua': 'NI',
  'SLV': 'SV',
  'El Salvador': 'SV',
  'JAM': 'JM',
  'Jamaica': 'JM',
  'CUB': 'CU',
  'Cuba': 'CU',
  'DOM': 'DO',
  'Dominican Republic': 'DO',
  'HTI': 'HT',
  'Haiti': 'HT',
  'TTO': 'TT',
  'Trinidad and Tobago': 'TT'
};

/**
 * Normalize country code to ISO 3166-1 alpha-2 format
 * 
 * @param {string} countryCode - Country code in any format (USA, IND, United States, etc.)
 * @returns {string} - Normalized 2-letter ISO 3166-1 alpha-2 country code
 * 
 * @example
 * normalizeCountryCode('USA') // Returns 'US'
 * normalizeCountryCode('IND') // Returns 'IN'
 * normalizeCountryCode('United Kingdom') // Returns 'GB'
 * normalizeCountryCode('US') // Returns 'US' (already normalized)
 */
export function normalizeCountryCode(countryCode) {
  if (!countryCode || typeof countryCode !== 'string') {
    console.warn('⚠️ Invalid country code provided:', countryCode);
    return '';
  }

  // Trim whitespace and convert to uppercase for case-insensitive matching
  const trimmed = countryCode.trim();
  const upperCased = trimmed.toUpperCase();

  // Check if already in ISO 3166-1 alpha-2 format (2 letters)
  if (/^[A-Z]{2}$/.test(upperCased)) {
    return upperCased;
  }

  // Try exact match first (case-insensitive)
  const exactMatch = COUNTRY_CODE_MAP[trimmed];
  if (exactMatch) {
    return exactMatch;
  }

  // Try uppercase match
  const upperMatch = COUNTRY_CODE_MAP[upperCased];
  if (upperMatch) {
    return upperMatch;
  }

  // Try case-insensitive match by checking all keys
  for (const [key, value] of Object.entries(COUNTRY_CODE_MAP)) {
    if (key.toUpperCase() === upperCased) {
      return value;
    }
  }

  // Unknown country code - return as-is after uppercasing (passthrough)
  console.warn(`⚠️ Unknown country code: "${countryCode}" - using as-is: "${upperCased}"`);
  return upperCased;
}

/**
 * Validate and normalize a complete billing address
 * 
 * @param {Object} address - Billing address object
 * @param {string} address.street - Street address
 * @param {string} address.city - City
 * @param {string} address.state - State/Province
 * @param {string} address.postalCode - Postal/ZIP code
 * @param {string} address.country - Country code (any format)
 * @returns {Object} - Normalized address with valid ISO 3166-1 alpha-2 country code
 * @throws {Error} - If required fields are missing
 * 
 * @example
 * normalizeBillingAddress({
 *   street: '123 Main St',
 *   city: 'New York',
 *   state: 'NY',
 *   postalCode: '10001',
 *   country: 'USA'
 * })
 * // Returns: { street: '123 Main St', city: 'New York', state: 'NY', postalCode: '10001', country: 'US' }
 */
export function normalizeBillingAddress(address) {
  if (!address || typeof address !== 'object') {
    throw new Error('Invalid address: address must be an object');
  }

  // Validate required fields
  const requiredFields = ['street', 'city', 'state', 'postalCode', 'country'];
  const missingFields = requiredFields.filter(field => !address[field] || typeof address[field] !== 'string' || address[field].trim() === '');

  if (missingFields.length > 0) {
    throw new Error(`Missing required billing address fields: ${missingFields.join(', ')}`);
  }

  // Normalize country code
  const normalizedCountry = normalizeCountryCode(address.country);

  if (!normalizedCountry) {
    throw new Error(`Invalid country code: "${address.country}"`);
  }

  // Return normalized address
  return {
    street: address.street.trim(),
    city: address.city.trim(),
    state: address.state.trim(),
    postalCode: address.postalCode.trim(),
    country: normalizedCountry
  };
}

// CommonJS export for Node.js compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeCountryCode,
    normalizeBillingAddress,
    COUNTRY_CODE_MAP
  };
}
