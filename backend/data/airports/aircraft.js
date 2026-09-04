/**
 * IATA aircraft type codes -> readable names.
 *
 * MasterPricer returns `productDetail/equipmentType` as a three-character IATA
 * code (7M9, 32Q, 388). The Self-Service REST API resolved these through its
 * `dictionaries.aircraft`; the WSAP has no equivalent, and showing a customer
 * "7M9" where they expect "Boeing 737 MAX 9" is a visible regression.
 *
 * Covers the types that appear in scheduled GDS results. Anything missing falls
 * back to the raw code, which is what the route already does. Every key is
 * quoted: codes such as 77L and 7M9 are not valid identifiers.
 */
export const AIRCRAFT_NAMES = Object.freeze({
  // Airbus narrowbody
  '318': 'Airbus A318',
  '319': 'Airbus A319',
  '320': 'Airbus A320',
  '321': 'Airbus A321',
  '31H': 'Airbus A319neo',
  '32N': 'Airbus A320neo',
  '32Q': 'Airbus A321neo',
  '32A': 'Airbus A320',
  '32B': 'Airbus A321',
  '32C': 'Airbus A320',
  '32S': 'Airbus A320 Family',
  '221': 'Airbus A220-100',
  '223': 'Airbus A220-300',

  // Airbus widebody
  '330': 'Airbus A330',
  '332': 'Airbus A330-200',
  '333': 'Airbus A330-300',
  '338': 'Airbus A330-800neo',
  '339': 'Airbus A330-900neo',
  '340': 'Airbus A340',
  '342': 'Airbus A340-200',
  '343': 'Airbus A340-300',
  '345': 'Airbus A340-500',
  '346': 'Airbus A340-600',
  '350': 'Airbus A350',
  '351': 'Airbus A350-1000',
  '359': 'Airbus A350-900',
  '380': 'Airbus A380',
  '388': 'Airbus A380-800',

  // Boeing narrowbody
  '733': 'Boeing 737-300',
  '734': 'Boeing 737-400',
  '735': 'Boeing 737-500',
  '736': 'Boeing 737-600',
  '737': 'Boeing 737-700',
  '738': 'Boeing 737-800',
  '739': 'Boeing 737-900',
  '73H': 'Boeing 737-800',
  '73J': 'Boeing 737-900',
  '7M7': 'Boeing 737 MAX 7',
  '7M8': 'Boeing 737 MAX 8',
  '7M9': 'Boeing 737 MAX 9',
  '7MJ': 'Boeing 737 MAX 10',
  '752': 'Boeing 757-200',
  '753': 'Boeing 757-300',

  // Boeing widebody
  '762': 'Boeing 767-200',
  '763': 'Boeing 767-300',
  '764': 'Boeing 767-400',
  '772': 'Boeing 777-200',
  '773': 'Boeing 777-300',
  '77L': 'Boeing 777-200LR',
  '77W': 'Boeing 777-300ER',
  '778': 'Boeing 777-8',
  '779': 'Boeing 777-9',
  '787': 'Boeing 787 Dreamliner',
  '788': 'Boeing 787-8',
  '789': 'Boeing 787-9',
  '78J': 'Boeing 787-10',
  '744': 'Boeing 747-400',
  '748': 'Boeing 747-8',
  '74H': 'Boeing 747-8',

  // Regional
  'E70': 'Embraer 170',
  'E75': 'Embraer 175',
  'E7W': 'Embraer 175',
  'E90': 'Embraer 190',
  'E95': 'Embraer 195',
  'ER3': 'Embraer RJ135',
  'ER4': 'Embraer RJ145',
  'E45': 'Embraer RJ145',
  'CR2': 'Bombardier CRJ200',
  'CR7': 'Bombardier CRJ700',
  'CR9': 'Bombardier CRJ900',
  'CRK': 'Bombardier CRJ1000',
  'DH4': 'De Havilland Dash 8-400',
  'DH8': 'De Havilland Dash 8',
  'AT7': 'ATR 72',
  'AT5': 'ATR 42',
  'ATR': 'ATR 72',
  'SU9': 'Sukhoi Superjet 100',
  '100': 'Fokker 100',
  'F70': 'Fokker 70',

  // Surface segments sold as part of an itinerary
  'BUS': 'Bus',
  'TRN': 'Train',
});

export default AIRCRAFT_NAMES;
