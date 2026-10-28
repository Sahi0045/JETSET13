/**
 * What the bundled OurAirports data cannot say, for ranking airport search.
 *
 * OurAirports gives every large airport the same score, so "hon" listed Honiara
 * above Hong Kong and "dub" Tuzla above Dubai. It files Newark under Newark and
 * Narita under Narita, so New York and Tokyo came without them. And nobody
 * types "Los Angeles" when "LA" will do.
 */

/**
 * Passengers a year, in millions, roughly (2023-24 airport statistics). Only
 * the order matters: an airport left out ranks as a small one.
 */
export const PASSENGERS = Object.freeze({
  // United States
  ATL: 105, DFW: 82, DEN: 78, LAX: 75, ORD: 74, JFK: 62, MCO: 58, LAS: 58, CLT: 53, MIA: 52,
  SEA: 51, SFO: 50, EWR: 49, PHX: 48, IAH: 46, BOS: 41, FLL: 35, MSP: 35, LGA: 32, DTW: 32,
  PHL: 29, SLC: 27, BWI: 26, DCA: 26, IAD: 25, SAN: 25, TPA: 25, BNA: 23, AUS: 22, MDW: 22,
  HNL: 21, PDX: 18, DAL: 17, STL: 15, RDU: 15, HOU: 14, MSY: 14, SMF: 13, SJU: 13, MCI: 12,
  SJC: 11, SNA: 11, OAK: 11, SAT: 11, RSW: 10, CLE: 10, IND: 9, PIT: 9, CMH: 9, CVG: 9,
  OGG: 8, PBI: 7, JAX: 7, BDL: 7, ONT: 7, BUR: 6, CHS: 6, MKE: 6, ANC: 5, OMA: 5,
  ABQ: 5, BUF: 5, BOI: 5, RNO: 4, MEM: 4, OKC: 4, SDF: 4, RIC: 4, SAV: 4, SRQ: 4,
  ELP: 4, TUS: 4, GEG: 4, ORF: 4, PVD: 4, KOA: 4, GRR: 4, LGB: 3, SFB: 3, ALB: 3,
  TUL: 3, PSP: 3, LIH: 3, MYR: 3, DSM: 3, PIE: 2, EYW: 1, ASE: 1, EGE: 1, JAC: 1,
  // Canada
  YYZ: 45, YVR: 26, YUL: 21, YYC: 18, YEG: 8, YOW: 5, YWG: 4, YHZ: 4, YTZ: 2, YQB: 2,
  // Mexico, Central and South America, the Caribbean
  MEX: 48, BOG: 40, GRU: 41, CUN: 32, SCL: 25, LIM: 24, CGH: 21, GDL: 17, PTY: 17, AEP: 15,
  BSB: 14, GIG: 13, MTY: 12, TIJ: 12, EZE: 11, VCP: 11, MDE: 11, CNF: 11, SDU: 9, PUJ: 8,
  SJD: 7, CTG: 7, PVR: 6, SJO: 6, SDQ: 6, MBJ: 5, UIO: 5, CLO: 5, GYE: 4, NAS: 4,
  HAV: 4, LIR: 2, AUA: 2, SXM: 2, MVD: 2, BGI: 2, POS: 2, CUR: 2, GCM: 1, PLS: 1,
  // Europe
  LHR: 79, IST: 76, CDG: 67, AMS: 62, MAD: 60, FRA: 59, BCN: 50, SAW: 41, LGW: 41, FCO: 41,
  SVO: 40, MUC: 37, AYT: 35, DUB: 33, LIS: 33, ORY: 32, PMI: 31, ZRH: 29, VIE: 29, STN: 28,
  MAN: 28, ATH: 28, MXP: 26, CPH: 26, OSL: 25, ARN: 23, BER: 23, BRU: 22, AGP: 22, DME: 20,
  LED: 20, DUS: 19, WAW: 18, GVA: 17, ALC: 16, LTN: 16, HEL: 15, OPO: 15, BGY: 15, LPA: 15,
  VKO: 15, OTP: 15, NCE: 14, EDI: 14, BUD: 14, HAM: 13, PRG: 13, ESB: 13, NAP: 12, CTA: 12,
  TFS: 12, ADB: 12, BHX: 11, KRK: 11, VCE: 10, MRS: 10, VLC: 10, FAO: 10, LYS: 9, BLQ: 9,
  LIN: 9, CGN: 9, STR: 9, BRS: 9, IBZ: 9, HER: 9, LCA: 9, SVQ: 8, BEG: 8, ACE: 8,
  KEF: 7, GLA: 7, TLS: 7, SKG: 7, MLA: 7, SOF: 7, RIX: 7, FUE: 7, BVA: 6, RHO: 6,
  TFN: 6, BIO: 6, GDN: 6, LCY: 5, FNC: 5, VNO: 5, DLM: 5, BJV: 5, CFU: 4, ZAG: 4,
  SPU: 4, DBV: 3, TLL: 3, PFO: 3, BOD: 7, NTE: 7, BSL: 9, PSA: 5, BRI: 7, PMO: 8,
  CAG: 5, OLB: 3, TRN: 5, FLR: 3, AMM: 9, TLV: 21, SEN: 1,
  // Middle East
  DXB: 87, DOH: 46, JED: 42, RUH: 37, CAI: 26, AUH: 22, KWI: 15, SHJ: 15, THR: 15, MCT: 13,
  DMM: 10, BAH: 9, MED: 9, IKA: 8, BEY: 7, HRG: 9, SSH: 6, DWC: 1,
  // Africa
  JNB: 19, ADD: 12, CPT: 10, CMN: 10, NBO: 8, LOS: 8, RAK: 8, ALG: 8, TUN: 6, DUR: 5,
  ABV: 4, MRU: 4, ACC: 3, DAR: 3, ZNZ: 2, SEZ: 1, KGL: 1, EBB: 2, DSS: 3, LAD: 2,
  // South Asia
  DEL: 74, BOM: 53, BLR: 37, HYD: 25, MAA: 21, CCU: 19, AMD: 11, COK: 10, CMB: 10, PNQ: 9,
  DAC: 9, KTM: 7, KHI: 7, GAU: 6, LHE: 6, GOI: 5, LKO: 5, JAI: 5, GOX: 4, TRV: 4,
  SXR: 4, BBI: 4, ISB: 4, MLE: 4, PAT: 3, IXC: 3, VNS: 3, IXB: 3, NAG: 3, IDR: 3,
  CCJ: 3, CJB: 3, ATQ: 3, VTZ: 2, IXE: 2, RPR: 2, IXR: 2, CGP: 2, BDQ: 1, TRZ: 1,
  IXM: 1, DED: 1, IXZ: 1, UDR: 1, STV: 1, NMI: 1,
  // East and South-East Asia
  HND: 79, CAN: 63, SIN: 58, CGK: 57, ICN: 56, PVG: 54, PEK: 52, SZX: 52, BKK: 51, KUL: 47,
  MNL: 45, CTU: 44, CKG: 44, KMG: 42, SHA: 42, SGN: 41, XIY: 41, HGH: 41, HKG: 39, PKX: 39,
  TPE: 35, NRT: 33, TFU: 31, NKG: 30, HAN: 29, CJU: 29, CSX: 28, DMK: 25, WUH: 25, TAO: 25,
  KIX: 24, FUK: 24, GMP: 24, XMN: 24, DPS: 23, CTS: 22, OKA: 19, HKT: 15, ITM: 15, PUS: 15,
  SUB: 12, DAD: 11, NGO: 10, CEB: 10, CNX: 8, BKI: 7, PEN: 7, KHH: 6, MFM: 6, RGN: 5,
  PNH: 4, HLP: 4, UKB: 3, REP: 1, ULN: 1,
  // Oceania
  SYD: 41, MEL: 35, BNE: 22, AKL: 18, PER: 14, ADL: 8, OOL: 6, CHC: 6, WLG: 5, CNS: 4,
  NAN: 2, ZQN: 2, PPT: 1,
});

/**
 * The airports of each IATA metropolitan code. Sending the metro code searches
 * all of them; the search list shows them under the city, as booking.com does.
 */
export const METRO_AIRPORTS = Object.freeze({
  NYC: ['JFK', 'EWR', 'LGA'],
  LON: ['LHR', 'LGW', 'STN', 'LTN', 'LCY', 'SEN'],
  PAR: ['CDG', 'ORY', 'BVA'],
  TYO: ['HND', 'NRT'],
  CHI: ['ORD', 'MDW'],
  WAS: ['IAD', 'DCA', 'BWI'],
  MIL: ['MXP', 'LIN', 'BGY'],
  ROM: ['FCO', 'CIA'],
  MOW: ['SVO', 'DME', 'VKO', 'ZIA'],
  YTO: ['YYZ', 'YTZ'],
  SAO: ['GRU', 'CGH', 'VCP'],
  RIO: ['GIG', 'SDU'],
  BUE: ['EZE', 'AEP'],
  STO: ['ARN', 'BMA', 'NYO'],
  OSA: ['KIX', 'ITM', 'UKB'],
  SEL: ['ICN', 'GMP'],
  BJS: ['PEK', 'PKX'],
  SHA: ['PVG', 'SHA'],
  JKT: ['CGK', 'HLP'],
  IST: ['IST', 'SAW'],
  TEH: ['IKA', 'THR'],
});

/** Metros the dataset has no city record for, because OurAirports files their airports elsewhere. */
export const METRO_CITIES = Object.freeze({
  MIL: { name: 'Milan', countryCode: 'IT' },
  SAO: { name: 'Sao Paulo', countryCode: 'BR', aliases: ['São Paulo'] },
});

/**
 * The short names travellers type, by city or airport code. Typed in full
 * they put the place first, ahead of an airport with that IATA code.
 */
export const SHORT_NAMES = Object.freeze({
  NYC: ['NY', 'NYC', 'New York City'],
  LAX: ['LA'],
  SFO: ['SF'],
  WAS: ['DC', 'Washington DC'],
  LAS: ['Vegas'],
  GOI: ['Goa'],
  GOX: ['Goa'],
  DEL: ['Delhi'],
  OGG: ['Maui'],
});

/**
 * The city travellers know an airport by, where OurAirports names the town it
 * stands in: Goa's airports are in Vasco da Gama and Mopa. The town still finds it.
 */
export const CITY_NAMES = Object.freeze({
  GOI: 'Goa',
  GOX: 'Goa',
  NGO: 'Nagoya',
  CTS: 'Sapporo',
  TZL: 'Tuzla',
});
