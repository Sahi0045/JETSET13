// Central data store for the flight application

// Popular destinations data
export const destinations = [
  {
    id: 1,
    name: "New York",
    code: "JFK",
    region: "United States",
    image: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?q=80&w=2074&auto=format&fit=crop",
  },
  {
    id: 2,
    name: "London",
    code: "LHR",
    region: "United Kingdom",
    image: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?q=80&w=2074&auto=format&fit=crop",
  },
  {
    id: 3,
    name: "Paris",
    code: "CDG",
    region: "France",
    image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?q=80&w=2074&auto=format&fit=crop",
  },
  {
    id: 4,
    name: "Tokyo",
    code: "HND",
    region: "Japan",
    image: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?q=80&w=2074&auto=format&fit=crop",
  },
  {
    id: 5,
    name: "Dubai",
    code: "DXB",
    region: "UAE",
    image: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?q=80&w=2074&auto=format&fit=crop",
  },
  {
    id: 6,
    name: "Singapore",
    code: "SIN",
    region: "Singapore",
    image: "https://images.unsplash.com/photo-1508964942454-1a56651d54ac?q=80&w=2074&auto=format&fit=crop",
  },
  {
    id: 7,
    name: "Sydney",
    code: "SYD",
    region: "Australia",
    image: "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?q=80&w=2074&auto=format&fit=crop",
  },
  {
    id: 8,
    name: "Barcelona",
    code: "BCN",
    region: "Spain",
    image: "https://images.unsplash.com/photo-1583422409516-2895a77efded?q=80&w=2074&auto=format&fit=crop",
  }
];

// International and domestic destinations
export const allDestinations = [
  // Domestic - India
  { id: 1, name: "New Delhi", code: "DEL", country: "India", type: "domestic" },
  { id: 2, name: "Mumbai", code: "BOM", country: "India", type: "domestic" },
  { id: 3, name: "Bangalore", code: "BLR", country: "India", type: "domestic" },
  { id: 4, name: "Chennai", code: "MAA", country: "India", type: "domestic" },
  { id: 5, name: "Kolkata", code: "CCU", country: "India", type: "domestic" },
  { id: 6, name: "Hyderabad", code: "HYD", country: "India", type: "domestic" },
  { id: 7, name: "Ahmedabad", code: "AMD", country: "India", type: "domestic" },
  { id: 8, name: "Goa", code: "GOI", country: "India", type: "domestic" },
  { id: 9, name: "Jaipur", code: "JAI", country: "India", type: "domestic" },
  { id: 10, name: "Lucknow", code: "LKO", country: "India", type: "domestic" },
  { id: 11, name: "Pune", code: "PNQ", country: "India", type: "domestic" },
  { id: 12, name: "Kochi", code: "COK", country: "India", type: "domestic" },
  { id: 13, name: "Thiruvananthapuram", code: "TRV", country: "India", type: "domestic" },
  { id: 14, name: "Guwahati", code: "GAU", country: "India", type: "domestic" },
  { id: 15, name: "Varanasi", code: "VNS", country: "India", type: "domestic" },
  { id: 16, name: "Amritsar", code: "ATQ", country: "India", type: "domestic" },
  { id: 17, name: "Bhopal", code: "BHO", country: "India", type: "domestic" },
  { id: 18, name: "Indore", code: "IDR", country: "India", type: "domestic" },
  { id: 19, name: "Patna", code: "PAT", country: "India", type: "domestic" },
  { id: 20, name: "Bhubaneswar", code: "BBI", country: "India", type: "domestic" },
  { id: 21, name: "Nagpur", code: "NAG", country: "India", type: "domestic" },
  { id: 22, name: "Vadodara", code: "BDQ", country: "India", type: "domestic" },
  { id: 23, name: "Surat", code: "STV", country: "India", type: "domestic" },
  { id: 24, name: "Visakhapatnam", code: "VTZ", country: "India", type: "domestic" },
  { id: 25, name: "Coimbatore", code: "CJB", country: "India", type: "domestic" },
  { id: 26, name: "Mangalore", code: "IXE", country: "India", type: "domestic" },
  { id: 27, name: "Madurai", code: "IXM", country: "India", type: "domestic" },
  { id: 28, name: "Tiruchirappalli", code: "TRZ", country: "India", type: "domestic" },
  { id: 29, name: "Dehradun", code: "DED", country: "India", type: "domestic" },
  { id: 30, name: "Srinagar", code: "SXR", country: "India", type: "domestic" },
  { id: 31, name: "Chandigarh", code: "IXC", country: "India", type: "domestic" },
  { id: 32, name: "Aurangabad", code: "IXU", country: "India", type: "domestic" },
  { id: 33, name: "Jammu", code: "IXJ", country: "India", type: "domestic" },
  { id: 34, name: "Ranchi", code: "IXR", country: "India", type: "domestic" },
  { id: 35, name: "Bagdogra", code: "IXB", country: "India", type: "domestic" },
  { id: 36, name: "Port Blair", code: "IXZ", country: "India", type: "domestic" },
  { id: 37, name: "Agartala", code: "IXA", country: "India", type: "domestic" },
  { id: 38, name: "Allahabad", code: "IXD", country: "India", type: "domestic" },
  { id: 39, name: "Belgaum", code: "IXG", country: "India", type: "domestic" },
  { id: 40, name: "Kailashahar", code: "IXH", country: "India", type: "domestic" },
  { id: 41, name: "Lilabari", code: "IXI", country: "India", type: "domestic" },
  { id: 42, name: "Keshod", code: "IXK", country: "India", type: "domestic" },
  { id: 43, name: "Leh", code: "IXL", country: "India", type: "domestic" },
  { id: 44, name: "Khowai", code: "IXN", country: "India", type: "domestic" },
  { id: 45, name: "Pathankot", code: "IXP", country: "India", type: "domestic" },
  { id: 46, name: "Kamalpur", code: "IXQ", country: "India", type: "domestic" },
  { id: 47, name: "Silchar", code: "IXS", country: "India", type: "domestic" },
  { id: 48, name: "Pasighat", code: "IXT", country: "India", type: "domestic" },
  { id: 49, name: "Along", code: "IXV", country: "India", type: "domestic" },
  { id: 50, name: "Jamshedpur", code: "IXW", country: "India", type: "domestic" },
  { id: 51, name: "Kandla", code: "IXY", country: "India", type: "domestic" },

  // United States - Alabama
  { id: 52, name: "Birmingham", code: "BHM", country: "United States", state: "Alabama", type: "international" },
  { id: 53, name: "Dothan", code: "DHN", country: "United States", state: "Alabama", type: "international" },
  { id: 54, name: "Huntsville", code: "HSV", country: "United States", state: "Alabama", type: "international" },
  { id: 55, name: "Mobile", code: "MOB", country: "United States", state: "Alabama", type: "international" },
  { id: 56, name: "Montgomery", code: "MGM", country: "United States", state: "Alabama", type: "international" },

  // United States - Alaska
  { id: 57, name: "Anchorage", code: "ANC", country: "United States", state: "Alaska", type: "international" },
  { id: 58, name: "Fairbanks", code: "FAI", country: "United States", state: "Alaska", type: "international" },
  { id: 59, name: "Juneau", code: "JNU", country: "United States", state: "Alaska", type: "international" },
  { id: 60, name: "Ketchikan", code: "KTN", country: "United States", state: "Alaska", type: "international" },

  // United States - Arizona
  { id: 61, name: "Flagstaff", code: "FLG", country: "United States", state: "Arizona", type: "international" },
  { id: 62, name: "Phoenix", code: "PHX", country: "United States", state: "Arizona", type: "international" },
  { id: 63, name: "Tucson", code: "TUS", country: "United States", state: "Arizona", type: "international" },
  { id: 64, name: "Yuma", code: "YUM", country: "United States", state: "Arizona", type: "international" },

  // United States - Arkansas
  { id: 65, name: "Fayetteville", code: "XNA", country: "United States", state: "Arkansas", type: "international" },
  { id: 66, name: "Fort Smith", code: "FSM", country: "United States", state: "Arkansas", type: "international" },
  { id: 67, name: "Little Rock", code: "LIT", country: "United States", state: "Arkansas", type: "international" },

  // United States - California
  { id: 68, name: "Bakersfield", code: "BFL", country: "United States", state: "California", type: "international" },
  { id: 69, name: "Burbank", code: "BUR", country: "United States", state: "California", type: "international" },
  { id: 70, name: "Fresno", code: "FAT", country: "United States", state: "California", type: "international" },
  { id: 71, name: "Long Beach", code: "LGB", country: "United States", state: "California", type: "international" },
  { id: 72, name: "Los Angeles", code: "LAX", country: "United States", state: "California", type: "international" },
  { id: 73, name: "Monterey", code: "MRY", country: "United States", state: "California", type: "international" },
  { id: 74, name: "Oakland", code: "OAK", country: "United States", state: "California", type: "international" },
  { id: 75, name: "Ontario", code: "ONT", country: "United States", state: "California", type: "international" },
  { id: 76, name: "Palm Springs", code: "PSP", country: "United States", state: "California", type: "international" },
  { id: 77, name: "Redding", code: "RDD", country: "United States", state: "California", type: "international" },
  { id: 78, name: "Sacramento", code: "SMF", country: "United States", state: "California", type: "international" },
  { id: 79, name: "San Diego", code: "SAN", country: "United States", state: "California", type: "international" },
  { id: 80, name: "San Francisco", code: "SFO", country: "United States", state: "California", type: "international" },
  { id: 81, name: "San Jose", code: "SJC", country: "United States", state: "California", type: "international" },
  { id: 82, name: "Santa Barbara", code: "SBA", country: "United States", state: "California", type: "international" },
  { id: 83, name: "Santa Rosa", code: "STS", country: "United States", state: "California", type: "international" },

  // United States - Colorado
  { id: 84, name: "Aspen", code: "ASE", country: "United States", state: "Colorado", type: "international" },
  { id: 85, name: "Colorado Springs", code: "COS", country: "United States", state: "Colorado", type: "international" },
  { id: 86, name: "Denver", code: "DEN", country: "United States", state: "Colorado", type: "international" },
  { id: 87, name: "Durango", code: "DRO", country: "United States", state: "Colorado", type: "international" },
  { id: 88, name: "Grand Junction", code: "GJT", country: "United States", state: "Colorado", type: "international" },

  // United States - Connecticut
  { id: 89, name: "Hartford", code: "BDL", country: "United States", state: "Connecticut", type: "international" },
  { id: 90, name: "New Haven", code: "HVN", country: "United States", state: "Connecticut", type: "international" },

  // United States - Delaware
  { id: 91, name: "Wilmington", code: "ILG", country: "United States", state: "Delaware", type: "international" },

  // United States - Florida
  { id: 92, name: "Daytona Beach", code: "DAB", country: "United States", state: "Florida", type: "international" },
  { id: 93, name: "Fort Lauderdale", code: "FLL", country: "United States", state: "Florida", type: "international" },
  { id: 94, name: "Fort Myers", code: "RSW", country: "United States", state: "Florida", type: "international" },
  { id: 95, name: "Gainesville", code: "GNV", country: "United States", state: "Florida", type: "international" },
  { id: 96, name: "Jacksonville", code: "JAX", country: "United States", state: "Florida", type: "international" },
  { id: 97, name: "Key West", code: "EYW", country: "United States", state: "Florida", type: "international" },
  { id: 98, name: "Miami", code: "MIA", country: "United States", state: "Florida", type: "international" },
  { id: 99, name: "Orlando", code: "MCO", country: "United States", state: "Florida", type: "international" },
  { id: 100, name: "Pensacola", code: "PNS", country: "United States", state: "Florida", type: "international" },
  { id: 101, name: "Tallahassee", code: "TLH", country: "United States", state: "Florida", type: "international" },
  { id: 102, name: "Tampa", code: "TPA", country: "United States", state: "Florida", type: "international" },
  { id: 103, name: "West Palm Beach", code: "PBI", country: "United States", state: "Florida", type: "international" },

  // United States - Georgia
  { id: 104, name: "Albany", code: "ABY", country: "United States", state: "Georgia", type: "international" },
  { id: 105, name: "Atlanta", code: "ATL", country: "United States", state: "Georgia", type: "international" },
  { id: 106, name: "Augusta", code: "AGS", country: "United States", state: "Georgia", type: "international" },
  { id: 107, name: "Columbus", code: "CSG", country: "United States", state: "Georgia", type: "international" },
  { id: 108, name: "Savannah", code: "SAV", country: "United States", state: "Georgia", type: "international" },

  // United States - Hawaii
  { id: 109, name: "Hilo", code: "ITO", country: "United States", state: "Hawaii", type: "international" },
  { id: 110, name: "Honolulu", code: "HNL", country: "United States", state: "Hawaii", type: "international" },
  { id: 111, name: "Kahului", code: "OGG", country: "United States", state: "Hawaii", type: "international" },
  { id: 112, name: "Kona", code: "KOA", country: "United States", state: "Hawaii", type: "international" },
  { id: 113, name: "Lihue", code: "LIH", country: "United States", state: "Hawaii", type: "international" },

  // United States - Idaho
  { id: 114, name: "Boise", code: "BOI", country: "United States", state: "Idaho", type: "international" },
  { id: 115, name: "Idaho Falls", code: "IDA", country: "United States", state: "Idaho", type: "international" },
  { id: 116, name: "Lewiston", code: "LWS", country: "United States", state: "Idaho", type: "international" },

  // United States - Illinois
  { id: 117, name: "Chicago Midway", code: "MDW", country: "United States", state: "Illinois", type: "international" },
  { id: 118, name: "Chicago O'Hare", code: "ORD", country: "United States", state: "Illinois", type: "international" },
  { id: 119, name: "Peoria", code: "PIA", country: "United States", state: "Illinois", type: "international" },
  { id: 120, name: "Rockford", code: "RFD", country: "United States", state: "Illinois", type: "international" },
  { id: 121, name: "Springfield", code: "SPI", country: "United States", state: "Illinois", type: "international" },

  // United States - Indiana
  { id: 122, name: "Evansville", code: "EVV", country: "United States", state: "Indiana", type: "international" },
  { id: 123, name: "Fort Wayne", code: "FWA", country: "United States", state: "Indiana", type: "international" },
  { id: 124, name: "Indianapolis", code: "IND", country: "United States", state: "Indiana", type: "international" },
  { id: 125, name: "South Bend", code: "SBN", country: "United States", state: "Indiana", type: "international" },

  // United States - Iowa
  { id: 126, name: "Cedar Rapids", code: "CID", country: "United States", state: "Iowa", type: "international" },
  { id: 127, name: "Des Moines", code: "DSM", country: "United States", state: "Iowa", type: "international" },
  { id: 128, name: "Dubuque", code: "DBQ", country: "United States", state: "Iowa", type: "international" },
  { id: 129, name: "Sioux City", code: "SUX", country: "United States", state: "Iowa", type: "international" },

  // United States - Kansas
  { id: 130, name: "Garden City", code: "GCK", country: "United States", state: "Kansas", type: "international" },
  { id: 131, name: "Manhattan", code: "MHK", country: "United States", state: "Kansas", type: "international" },
  { id: 132, name: "Wichita", code: "ICT", country: "United States", state: "Kansas", type: "international" },

  // United States - Kentucky
  { id: 133, name: "Cincinnati", code: "CVG", country: "United States", state: "Kentucky", type: "international" },
  { id: 134, name: "Lexington", code: "LEX", country: "United States", state: "Kentucky", type: "international" },
  { id: 135, name: "Louisville", code: "SDF", country: "United States", state: "Kentucky", type: "international" },
  { id: 136, name: "Paducah", code: "PAH", country: "United States", state: "Kentucky", type: "international" },

  // United States - Louisiana
  { id: 137, name: "Baton Rouge", code: "BTR", country: "United States", state: "Louisiana", type: "international" },
  { id: 138, name: "Lafayette", code: "LFT", country: "United States", state: "Louisiana", type: "international" },
  { id: 139, name: "Lake Charles", code: "LCH", country: "United States", state: "Louisiana", type: "international" },
  { id: 140, name: "New Orleans", code: "MSY", country: "United States", state: "Louisiana", type: "international" },
  { id: 141, name: "Shreveport", code: "SHV", country: "United States", state: "Louisiana", type: "international" },

  // United States - Maine
  { id: 142, name: "Bangor", code: "BGR", country: "United States", state: "Maine", type: "international" },
  { id: 143, name: "Bar Harbor", code: "BHB", country: "United States", state: "Maine", type: "international" },
  { id: 144, name: "Portland", code: "PWM", country: "United States", state: "Maine", type: "international" },

  // United States - Maryland
  { id: 145, name: "Baltimore", code: "BWI", country: "United States", state: "Maryland", type: "international" },
  { id: 146, name: "Hagerstown", code: "HGR", country: "United States", state: "Maryland", type: "international" },
  { id: 147, name: "Salisbury", code: "SBY", country: "United States", state: "Maine", type: "international" },

  // United States - Massachusetts
  { id: 148, name: "Boston", code: "BOS", country: "United States", state: "Massachusetts", type: "international" },
  { id: 149, name: "Hyannis", code: "HYA", country: "United States", state: "Massachusetts", type: "international" },
  { id: 150, name: "Nantucket", code: "ACK", country: "United States", state: "Massachusetts", type: "international" },
  { id: 151, name: "New Bedford", code: "EWB", country: "United States", state: "Massachusetts", type: "international" },
  { id: 152, name: "Worcester", code: "ORH", country: "United States", state: "Massachusetts", type: "international" },

  // United States - Michigan
  { id: 153, name: "Detroit", code: "DTW", country: "United States", state: "Michigan", type: "international" },
  { id: 154, name: "Flint", code: "FNT", country: "United States", state: "Michigan", type: "international" },
  { id: 155, name: "Grand Rapids", code: "GRR", country: "United States", state: "Michigan", type: "international" },
  { id: 156, name: "Kalamazoo", code: "AZO", country: "United States", state: "Michigan", type: "international" },
  { id: 157, name: "Lansing", code: "LAN", country: "United States", state: "Michigan", type: "international" },
  { id: 158, name: "Marquette", code: "MQT", country: "United States", state: "Michigan", type: "international" },
  { id: 159, name: "Saginaw", code: "MBS", country: "United States", state: "Michigan", type: "international" },

  // United States - Minnesota
  { id: 160, name: "Bemidji", code: "BJI", country: "United States", state: "Minnesota", type: "international" },
  { id: 161, name: "Duluth", code: "DLH", country: "United States", state: "Minnesota", type: "international" },
  { id: 162, name: "Minneapolis", code: "MSP", country: "United States", state: "Minnesota", type: "international" },
  { id: 163, name: "Rochester", code: "RST", country: "United States", state: "Minnesota", type: "international" },

  // United States - Mississippi
  { id: 164, name: "Gulfport", code: "GPT", country: "United States", state: "Mississippi", type: "international" },
  { id: 165, name: "Jackson", code: "JAN", country: "United States", state: "Mississippi", type: "international" },
  { id: 166, name: "Meridian", code: "MEI", country: "United States", state: "Mississippi", type: "international" },
  { id: 167, name: "Tupelo", code: "TUP", country: "United States", state: "Mississippi", type: "international" },

  // United States - Missouri
  { id: 168, name: "Columbia", code: "COU", country: "United States", state: "Missouri", type: "international" },
  { id: 169, name: "Joplin", code: "JLN", country: "United States", state: "Missouri", type: "international" },
  { id: 170, name: "Kansas City", code: "MCI", country: "United States", state: "Missouri", type: "international" },
  { id: 171, name: "Springfield", code: "SGF", country: "United States", state: "Missouri", type: "international" },
  { id: 172, name: "St. Louis", code: "STL", country: "United States", state: "Missouri", type: "international" },

  // United States - Montana
  { id: 173, name: "Billings", code: "BIL", country: "United States", state: "Montana", type: "international" },
  { id: 174, name: "Bozeman", code: "BZN", country: "United States", state: "Montana", type: "international" },
  { id: 175, name: "Great Falls", code: "GTF", country: "United States", state: "Montana", type: "international" },
  { id: 176, name: "Helena", code: "HLN", country: "United States", state: "Montana", type: "international" },
  { id: 177, name: "Missoula", code: "MSO", country: "United States", state: "Montana", type: "international" },

  // United States - Nebraska
  { id: 178, name: "Grand Island", code: "GRI", country: "United States", state: "Nebraska", type: "international" },
  { id: 179, name: "Lincoln", code: "LNK", country: "United States", state: "Nebraska", type: "international" },
  { id: 180, name: "North Platte", code: "LBF", country: "United States", state: "Nebraska", type: "international" },
  { id: 181, name: "Omaha", code: "OMA", country: "United States", state: "Nebraska", type: "international" },

  // United States - Nevada
  { id: 182, name: "Elko", code: "EKO", country: "United States", state: "Nevada", type: "international" },
  { id: 183, name: "Las Vegas", code: "LAS", country: "United States", state: "Nevada", type: "international" },
  { id: 184, name: "Reno", code: "RNO", country: "United States", state: "Nevada", type: "international" },

  // United States - New Hampshire
  { id: 185, name: "Lebanon", code: "LEB", country: "United States", state: "New Hampshire", type: "international" },
  { id: 186, name: "Manchester", code: "MHT", country: "United States", state: "New Hampshire", type: "international" },

  // United States - New Jersey
  { id: 187, name: "Atlantic City", code: "ACY", country: "United States", state: "New Jersey", type: "international" },
  { id: 188, name: "Newark", code: "EWR", country: "United States", state: "New Jersey", type: "international" },
  { id: 189, name: "Trenton", code: "TTN", country: "United States", state: "New Jersey", type: "international" },

  // United States - New Mexico
  { id: 190, name: "Albuquerque", code: "ABQ", country: "United States", state: "New Mexico", type: "international" },
  { id: 191, name: "Roswell", code: "ROW", country: "United States", state: "New Mexico", type: "international" },
  { id: 192, name: "Santa Fe", code: "SAF", country: "United States", state: "New Mexico", type: "international" },

  // United States - New York
  { id: 193, name: "Albany", code: "ALB", country: "United States", state: "New York", type: "international" },
  { id: 194, name: "Binghamton", code: "BGM", country: "United States", state: "New York", type: "international" },
  { id: 195, name: "Buffalo", code: "BUF", country: "United States", state: "New York", type: "international" },
  { id: 196, name: "Elmira", code: "ELM", country: "United States", state: "New York", type: "international" },
  { id: 197, name: "Ithaca", code: "ITH", country: "United States", state: "New York", type: "international" },
  { id: 198, name: "New York JFK", code: "JFK", country: "United States", state: "New York", type: "international" },
  { id: 199, name: "New York LaGuardia", code: "LGA", country: "United States", state: "New York", type: "international" },
  { id: 200, name: "Rochester", code: "ROC", country: "United States", state: "New York", type: "international" },
  { id: 201, name: "Syracuse", code: "SYR", country: "United States", state: "New York", type: "international" },
  { id: 202, name: "White Plains", code: "HPN", country: "United States", state: "New York", type: "international" },

  // United States - North Carolina
  { id: 203, name: "Asheville", code: "AVL", country: "United States", state: "North Carolina", type: "international" },
  { id: 204, name: "Charlotte", code: "CLT", country: "United States", state: "North Carolina", type: "international" },
  { id: 205, name: "Fayetteville", code: "FAY", country: "United States", state: "North Carolina", type: "international" },
  { id: 206, name: "Greensboro", code: "GSO", country: "United States", state: "North Carolina", type: "international" },
  { id: 207, name: "Raleigh", code: "RDU", country: "United States", state: "North Carolina", type: "international" },
  { id: 208, name: "Wilmington", code: "ILM", country: "United States", state: "North Carolina", type: "international" },

  // United States - North Dakota
  { id: 209, name: "Bismarck", code: "BIS", country: "United States", state: "North Dakota", type: "international" },
  { id: 210, name: "Fargo", code: "FAR", country: "United States", state: "North Dakota", type: "international" },
  { id: 211, name: "Grand Forks", code: "GFK", country: "United States", state: "North Dakota", type: "international" },
  { id: 212, name: "Minot", code: "MOT", country: "United States", state: "North Dakota", type: "international" },

  // United States - Ohio
  { id: 213, name: "Akron", code: "CAK", country: "United States", state: "Ohio", type: "international" },
  { id: 214, name: "Cleveland", code: "CLE", country: "United States", state: "Ohio", type: "international" },
  { id: 215, name: "Columbus", code: "CMH", country: "United States", state: "Ohio", type: "international" },
  { id: 216, name: "Dayton", code: "DAY", country: "United States", state: "Ohio", type: "international" },
  { id: 217, name: "Toledo", code: "TOL", country: "United States", state: "Ohio", type: "international" },

  // United States - Oklahoma
  { id: 218, name: "Lawton", code: "LAW", country: "United States", state: "Oklahoma", type: "international" },
  { id: 219, name: "Oklahoma City", code: "OKC", country: "United States", state: "Oklahoma", type: "international" },
  { id: 220, name: "Tulsa", code: "TUL", country: "United States", state: "Oklahoma", type: "international" },

  // United States - Oregon
  { id: 221, name: "Eugene", code: "EUG", country: "United States", state: "Oregon", type: "international" },
  { id: 222, name: "Medford", code: "MFR", country: "United States", state: "Oregon", type: "international" },
  { id: 223, name: "Portland", code: "PDX", country: "United States", state: "Oregon", type: "international" },
  { id: 224, name: "Redmond", code: "RDM", country: "United States", state: "Oregon", type: "international" },

  // United States - Pennsylvania
  { id: 225, name: "Allentown", code: "ABE", country: "United States", state: "Pennsylvania", type: "international" },
  { id: 226, name: "Erie", code: "ERI", country: "United States", state: "Pennsylvania", type: "international" },
  { id: 227, name: "Harrisburg", code: "MDT", country: "United States", state: "Pennsylvania", type: "international" },
  { id: 228, name: "Philadelphia", code: "PHL", country: "United States", state: "Pennsylvania", type: "international" },
  { id: 229, name: "Pittsburgh", code: "PIT", country: "United States", state: "Pennsylvania", type: "international" },
  { id: 230, name: "Scranton", code: "AVP", country: "United States", state: "Pennsylvania", type: "international" },

  // United States - Rhode Island
  { id: 231, name: "Providence", code: "PVD", country: "United States", state: "Rhode Island", type: "international" },

  // United States - South Carolina
  { id: 232, name: "Charleston", code: "CHS", country: "United States", state: "South Carolina", type: "international" },
  { id: 233, name: "Columbia", code: "CAE", country: "United States", state: "South Carolina", type: "international" },
  { id: 234, name: "Greenville", code: "GSP", country: "United States", state: "South Carolina", type: "international" },
  { id: 235, name: "Myrtle Beach", code: "MYR", country: "United States", state: "South Carolina", type: "international" },

  // United States - South Dakota
  { id: 236, name: "Rapid City", code: "RAP", country: "United States", state: "South Dakota", type: "international" },
  { id: 237, name: "Sioux Falls", code: "FSD", country: "United States", state: "South Dakota", type: "international" },

  // United States - Tennessee
  { id: 238, name: "Chattanooga", code: "CHA", country: "United States", state: "Tennessee", type: "international" },
  { id: 239, name: "Knoxville", code: "TYS", country: "United States", state: "Tennessee", type: "international" },
  { id: 240, name: "Memphis", code: "MEM", country: "United States", state: "Tennessee", type: "international" },
  { id: 241, name: "Nashville", code: "BNA", country: "United States", state: "Tennessee", type: "international" },

  // United States - Texas
  { id: 242, name: "Amarillo", code: "AMA", country: "United States", state: "Texas", type: "international" },
  { id: 243, name: "Austin", code: "AUS", country: "United States", state: "Texas", type: "international" },
  { id: 244, name: "Corpus Christi", code: "CRP", country: "United States", state: "Texas", type: "international" },
  { id: 245, name: "Dallas", code: "DFW", country: "United States", state: "Texas", type: "international" },
  { id: 246, name: "El Paso", code: "ELP", country: "United States", state: "Texas", type: "international" },
  { id: 247, name: "Houston", code: "IAH", country: "United States", state: "Texas", type: "international" },
  { id: 248, name: "Lubbock", code: "LBB", country: "United States", state: "Texas", type: "international" },
  { id: 249, name: "Midland", code: "MAF", country: "United States", state: "Texas", type: "international" },
  { id: 250, name: "San Antonio", code: "SAT", country: "United States", state: "Texas", type: "international" },

  // United States - Utah
  { id: 251, name: "Cedar City", code: "CDC", country: "United States", state: "Utah", type: "international" },
  { id: 252, name: "Salt Lake City", code: "SLC", country: "United States", state: "Utah", type: "international" },
  { id: 253, name: "St. George", code: "SGU", country: "United States", state: "Utah", type: "international" },

  // United States - Vermont
  { id: 254, name: "Burlington", code: "BTV", country: "United States", state: "Vermont", type: "international" },

  // United States - Virginia
  { id: 255, name: "Charlottesville", code: "CHO", country: "United States", state: "Virginia", type: "international" },
  { id: 256, name: "Norfolk", code: "ORF", country: "United States", state: "Virginia", type: "international" },
  { id: 257, name: "Richmond", code: "RIC", country: "United States", state: "Virginia", type: "international" },
  { id: 258, name: "Roanoke", code: "ROA", country: "United States", state: "Virginia", type: "international" },
  { id: 259, name: "Washington Dulles", code: "IAD", country: "United States", state: "Virginia", type: "international" },

  // United States - Washington
  { id: 260, name: "Pasco", code: "PSC", country: "United States", state: "Washington", type: "international" },
  { id: 261, name: "Seattle", code: "SEA", country: "United States", state: "Washington", type: "international" },
  { id: 262, name: "Spokane", code: "GEG", country: "United States", state: "Washington", type: "international" },

  // United States - West Virginia
  { id: 263, name: "Charleston", code: "CRW", country: "United States", state: "West Virginia", type: "international" },
  { id: 264, name: "Huntington", code: "HTS", country: "United States", state: "West Virginia", type: "international" },

  // United States - Wisconsin
  { id: 265, name: "Green Bay", code: "GRB", country: "United States", state: "Wisconsin", type: "international" },
  { id: 266, name: "Madison", code: "MSN", country: "United States", state: "Wisconsin", type: "international" },
  { id: 267, name: "Milwaukee", code: "MKE", country: "United States", state: "Wisconsin", type: "international" },

  // United States - Wyoming
  { id: 268, name: "Casper", code: "CPR", country: "United States", state: "Wyoming", type: "international" },
  { id: 269, name: "Jackson Hole", code: "JAC", country: "United States", state: "Wyoming", type: "international" },

  // United States - Territories
  { id: 270, name: "Guam", code: "GUM", country: "United States", state: "Guam", type: "international" },
  { id: 271, name: "San Juan", code: "SJU", country: "United States", state: "Puerto Rico", type: "international" },
  { id: 272, name: "St. Croix", code: "STX", country: "United States", state: "U.S. Virgin Islands", type: "international" },
  { id: 273, name: "St. Thomas", code: "STT", country: "United States", state: "U.S. Virgin Islands", type: "international" },

  // United Kingdom - England
  { id: 274, name: "Birmingham", code: "BHX", country: "United Kingdom", region: "England", type: "international" },
  { id: 275, name: "Bournemouth", code: "BOH", country: "United Kingdom", region: "England", type: "international" },
  { id: 276, name: "Bristol", code: "BRS", country: "United Kingdom", region: "England", type: "international" },
  { id: 277, name: "Doncaster", code: "DSA", country: "United Kingdom", region: "England", type: "international" },
  { id: 278, name: "East Midlands", code: "EMA", country: "United Kingdom", region: "England", type: "international" },
  { id: 279, name: "Exeter", code: "EXT", country: "United Kingdom", region: "England", type: "international" },
  { id: 280, name: "Humberside", code: "HUY", country: "United Kingdom", region: "England", type: "international" },
  { id: 281, name: "Leeds Bradford", code: "LBA", country: "United Kingdom", region: "England", type: "international" },
  { id: 282, name: "Liverpool", code: "LPL", country: "United Kingdom", region: "England", type: "international" },
  { id: 283, name: "London City", code: "LCY", country: "United Kingdom", region: "England", type: "international" },
  { id: 284, name: "London Gatwick", code: "LGW", country: "United Kingdom", region: "England", type: "international" },
  { id: 285, name: "London Heathrow", code: "LHR", country: "United Kingdom", region: "England", type: "international" },
  { id: 286, name: "London Luton", code: "LTN", country: "United Kingdom", region: "England", type: "international" },
  { id: 287, name: "London Stansted", code: "STN", country: "United Kingdom", region: "England", type: "international" },
  { id: 288, name: "Manchester", code: "MAN", country: "United Kingdom", region: "England", type: "international" },
  { id: 289, name: "Newcastle", code: "NCL", country: "United Kingdom", region: "England", type: "international" },
  { id: 290, name: "Norwich", code: "NWI", country: "United Kingdom", region: "England", type: "international" },
  { id: 291, name: "Southampton", code: "SOU", country: "United Kingdom", region: "England", type: "international" },
  { id: 292, name: "Teesside", code: "MME", country: "United Kingdom", region: "England", type: "international" },

  // United Kingdom - Northern Ireland
  { id: 293, name: "Belfast City", code: "BHD", country: "United Kingdom", region: "Northern Ireland", type: "international" },
  { id: 294, name: "Belfast International", code: "BFS", country: "United Kingdom", region: "Northern Ireland", type: "international" },
  { id: 295, name: "Derry", code: "LDY", country: "United Kingdom", region: "Northern Ireland", type: "international" },

  // United Kingdom - Scotland
  { id: 296, name: "Aberdeen", code: "ABZ", country: "United Kingdom", region: "Scotland", type: "international" },
  { id: 297, name: "Edinburgh", code: "EDI", country: "United Kingdom", region: "Scotland", type: "international" },
  { id: 298, name: "Glasgow", code: "GLA", country: "United Kingdom", region: "Scotland", type: "international" },
  { id: 299, name: "Inverness", code: "INV", country: "United Kingdom", region: "Scotland", type: "international" },
  { id: 300, name: "Prestwick", code: "PIK", country: "United Kingdom", region: "Scotland", type: "international" },

  // United Kingdom - Wales
  { id: 301, name: "Cardiff", code: "CWL", country: "United Kingdom", region: "Wales", type: "international" },

  // Middle East
  { id: 302, name: "Amman", code: "AMM", country: "Jordan", type: "international" },
  { id: 303, name: "Bahrain", code: "BAH", country: "Bahrain", type: "international" },
  { id: 304, name: "Beirut", code: "BEY", country: "Lebanon", type: "international" },
  { id: 305, name: "Doha", code: "DOH", country: "Qatar", type: "international" },
  { id: 306, name: "Dubai", code: "DXB", country: "UAE", type: "international" },
  { id: 307, name: "Jeddah", code: "JED", country: "Saudi Arabia", type: "international" },
  { id: 308, name: "Kuwait", code: "KWI", country: "Kuwait", type: "international" },
  { id: 309, name: "Muscat", code: "MCT", country: "Oman", type: "international" },
  { id: 310, name: "Riyadh", code: "RUH", country: "Saudi Arabia", type: "international" },
  { id: 311, name: "Abu Dhabi", code: "AUH", country: "UAE", type: "international" },

  // Asia Pacific
  { id: 312, name: "Auckland", code: "AKL", country: "New Zealand", type: "international" },
  { id: 313, name: "Bangkok", code: "BKK", country: "Thailand", type: "international" },
  { id: 314, name: "Beijing", code: "PEK", country: "China", type: "international" },
  { id: 315, name: "Fukuoka", code: "FUK", country: "Japan", type: "international" },
  { id: 316, name: "Hanoi", code: "HAN", country: "Vietnam", type: "international" },
  { id: 317, name: "Ho Chi Minh City", code: "SGN", country: "Vietnam", type: "international" },
  { id: 318, name: "Hong Kong", code: "HKG", country: "Hong Kong", type: "international" },
  { id: 319, name: "Jakarta", code: "CGK", country: "Indonesia", type: "international" },
  { id: 320, name: "Kuala Lumpur", code: "KUL", country: "Malaysia", type: "international" },
  { id: 321, name: "Manila", code: "MNL", country: "Philippines", type: "international" },
  { id: 322, name: "Melbourne", code: "MEL", country: "Australia", type: "international" },
  { id: 323, name: "Nagoya", code: "NGO", country: "Japan", type: "international" },
  { id: 324, name: "Osaka", code: "KIX", country: "Japan", type: "international" },
  { id: 325, name: "Sapporo", code: "CTS", country: "Japan", type: "international" },
  { id: 326, name: "Seoul", code: "ICN", country: "South Korea", type: "international" },
  { id: 327, name: "Shanghai", code: "PVG", country: "China", type: "international" },
  { id: 328, name: "Singapore", code: "SIN", country: "Singapore", type: "international" },
  { id: 329, name: "Sydney", code: "SYD", country: "Australia", type: "international" },
  { id: 330, name: "Taipei", code: "TPE", country: "Taiwan", type: "international" },
  { id: 331, name: "Tokyo", code: "HND", country: "Japan", type: "international" },

  // Europe
  { id: 332, name: "Amsterdam", code: "AMS", country: "Netherlands", type: "international" },
  { id: 333, name: "Athens", code: "ATH", country: "Greece", type: "international" },
  { id: 334, name: "Barcelona", code: "BCN", country: "Spain", type: "international" },
  { id: 335, name: "Berlin", code: "BER", country: "Germany", type: "international" },
  { id: 336, name: "Brussels", code: "BRU", country: "Belgium", type: "international" },
  { id: 337, name: "Budapest", code: "BUD", country: "Hungary", type: "international" },
  { id: 338, name: "Copenhagen", code: "CPH", country: "Denmark", type: "international" },
  { id: 339, name: "Dublin", code: "DUB", country: "Ireland", type: "international" },
  { id: 340, name: "Frankfurt", code: "FRA", country: "Germany", type: "international" },
  { id: 341, name: "Helsinki", code: "HEL", country: "Finland", type: "international" },
  { id: 342, name: "Istanbul", code: "IST", country: "Turkey", type: "international" },
  { id: 343, name: "Lisbon", code: "LIS", country: "Portugal", type: "international" },
  { id: 344, name: "Madrid", code: "MAD", country: "Spain", type: "international" },
  { id: 345, name: "Milan", code: "MXP", country: "Italy", type: "international" },
  { id: 346, name: "Munich", code: "MUC", country: "Germany", type: "international" },
  { id: 347, name: "Oslo", code: "OSL", country: "Norway", type: "international" },
  { id: 348, name: "Paris", code: "CDG", country: "France", type: "international" },
  { id: 349, name: "Prague", code: "PRG", country: "Czech Republic", type: "international" },
  { id: 350, name: "Rome", code: "FCO", country: "Italy", type: "international" },
  { id: 351, name: "Stockholm", code: "ARN", country: "Sweden", type: "international" },
  { id: 352, name: "Vienna", code: "VIE", country: "Austria", type: "international" },
  { id: 353, name: "Warsaw", code: "WAW", country: "Poland", type: "international" },
  { id: 354, name: "Zurich", code: "ZRH", country: "Switzerland", type: "international" }
];

// Detailed airline information
export const airlines = [
  { id: 1, name: "IndiGo", code: "IGO", logo: "indigo.png", alliance: "None" },
  { id: 2, name: "Air India", code: "AIC", logo: "airindia.png", alliance: "Star Alliance" },
  { id: 3, name: "SpiceJet", code: "SJT", logo: "spicejet.png", alliance: "None" },
  { id: 4, name: "GoAir", code: "GAI", logo: "goair.png", alliance: "None" },
  { id: 5, name: "Vistara", code: "VTI", logo: "vistara.png", alliance: "None" },
  { id: 6, name: "AirAsia India", code: "IAD", logo: "airasia.png", alliance: "None" },
  { id: 7, name: "Emirates", code: "UAE", logo: "emirates.png", alliance: "None" },
  { id: 8, name: "Lufthansa", code: "DLH", logo: "lufthansa.png", alliance: "Star Alliance" },
  { id: 9, name: "British Airways", code: "BAW", logo: "britishairways.png", alliance: "Oneworld" },
  { id: 10, name: "Singapore Airlines", code: "SIA", logo: "singaporeairlines.png", alliance: "Star Alliance" },
  { id: 11, name: "Qatar Airways", code: "QTR", logo: "qatarairways.png", alliance: "Oneworld" },
  { id: 12, name: "Etihad Airways", code: "ETD", logo: "etihadairways.png", alliance: "None" },
];

// Aircraft types
export const aircraftTypes = [
  { model: "Boeing 737-800", capacity: 189, range: 5765 },
  { model: "Airbus A320", capacity: 180, range: 6100 },
  { model: "Boeing 777-300ER", capacity: 396, range: 13650 },
  { model: "Airbus A380", capacity: 525, range: 15000 },
  { model: "Boeing 787-9 Dreamliner", capacity: 296, range: 14140 },
  { model: "Airbus A350-900", capacity: 325, range: 15000 },
];

// Cabin classes
export const cabinClasses = [
  { name: "Economy", code: "Y", features: ["Standard seat", "Complimentary meal", "In-flight entertainment"] },
  { name: "Premium Economy", code: "W", features: ["Extra legroom", "Premium meal", "Priority boarding", "Enhanced entertainment"] },
  { name: "Business", code: "C", features: ["Lie-flat seats", "Gourmet dining", "Lounge access", "Priority check-in", "Premium amenity kit"] },
  { name: "First", code: "F", features: ["Private suite", "Exclusive lounge", "Personalized service", "Fine dining", "Luxury amenities"] },
];

export const cheapFlightsBySource = {
  "New York": [
    {
      id: 1,
      destination: "London",
      region: "United Kingdom",
      price: "$450",
      date: "Wed, 05 Feb",
      image: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?q=80&w=1200&auto=format&fit=crop",
    },
    {
      id: 2,
      destination: "Paris",
      region: "France",
      price: "$480",
      date: "Sat, 28 Dec",
      image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?q=80&w=1200&auto=format&fit=crop",
    },
    {
      id: 3,
      destination: "Barcelona",
      region: "Spain",
      price: "$520",
      date: "Thu, 02 Jan",
      image: "https://images.unsplash.com/photo-1583422409516-2895a77efded?q=80&w=1200&auto=format&fit=crop",
    }
  ],
  "London": [
    {
      id: 4,
      destination: "Paris",
      region: "France",
      price: "£89",
      date: "Mon, 15 Jan",
      image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?q=80&w=1200&auto=format&fit=crop",
    },
    {
      id: 5,
      destination: "Amsterdam",
      region: "Netherlands",
      price: "£120",
      date: "Tue, 09 Feb",
      image: "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?q=80&w=1200&auto=format&fit=crop",
    },
    {
      id: 6,
      destination: "Rome",
      region: "Italy",
      price: "£150",
      date: "Wed, 22 Mar",
      image: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?q=80&w=1200&auto=format&fit=crop",
    }
  ],
  "Tokyo": [
    {
      id: 7,
      destination: "Seoul",
      region: "South Korea",
      price: "¥35,000",
      date: "Thu, 28 Jan",
      image: "https://images.unsplash.com/photo-1538485399081-7c8070d2b08f?q=80&w=1200&auto=format&fit=crop",
    },
    {
      id: 8,
      destination: "Singapore",
      region: "Singapore",
      price: "¥45,000",
      date: "Fri, 15 Feb",
      image: "https://images.unsplash.com/photo-1525625293386-38f0e1d2b5e5?q=80&w=1200&auto=format&fit=crop",
    }
  ]
};

// Maintain backward compatibility with cheapFlights
export const cheapFlights = cheapFlightsBySource["New York"];

// Source cities for the flight search
export const sourceCities = [
  "New York",
  "London",
  "Paris",
  "Tokyo",
  "Dubai",
  "Singapore",
  "Sydney",
  "Hong Kong",
  "Frankfurt",
  "Amsterdam"
];

// Special fares categories
export const specialFares = [
  { id: 1, label: "Student", discount: "10%" },
  { id: 2, label: "Senior Citizen", discount: "12%" },
  { id: 3, label: "Armed Forces", discount: "15%" },
  { id: 4, label: "Healthcare Worker", discount: "8%" },
  { id: 5, label: "Family", discount: "5%" },
];

// Default search data for flights
export const defaultSearchData = {
  from: "",
  to: "",
  departDate: "",
  returnDate: "",
  tripType: "oneWay",
  travelers: "1",
  class: "Economy"
};

// Flight amenities
export const flightAmenities = {
  entertainment: ["Movies", "TV Shows", "Music", "Games"],
  food: ["Vegetarian", "Non-Vegetarian", "Vegan", "Kosher", "Halal"],
  connectivity: ["Wi-Fi", "USB Port", "Power Outlet"],
  comfort: ["Extra Legroom", "Reclining Seats", "Neck Pillow", "Blanket"]
};

// Popular flight routes with their average prices
export const popularRoutes = [
  { from: "New Delhi", to: "Mumbai", avgPrice: "₹4,369" },
  { from: "Mumbai", to: "Bangalore", avgPrice: "₹3,200" },
  { from: "New Delhi", to: "Bangalore", avgPrice: "₹4,700" },
  { from: "New Delhi", to: "Goa", avgPrice: "₹4,229" },
  { from: "Mumbai", to: "Goa", avgPrice: "₹1,499" },
  { from: "New Delhi", to: "Dubai", avgPrice: "₹12,500" },
  { from: "Mumbai", to: "London", avgPrice: "₹45,750" },
  { from: "New Delhi", to: "Singapore", avgPrice: "₹19,200" },
  { from: "Mumbai", to: "New York", avgPrice: "₹75,800" },
];

// Payment methods accepted
export const paymentMethods = [
  { name: "Credit Card", fee: "0%" },
  { name: "Debit Card", fee: "0%" },
  { name: "NetBanking", fee: "0%" },
  { name: "UPI", fee: "0%" },
  { name: "EMI", fee: "Standard bank charges apply" },
  { name: "Wallet", fee: "0%" },
];

export const flightBookingData = {
  bookings: [
    {
      bookingId: "BK789012",
      bookingDate: "2024-07-15T12:00:00Z",
      status: "Confirmed",
      passengers: [
        {
          id: 1,
          name: "John Smith",
          age: 35,
          gender: "Male",
          seatNumber: "12A"
        },
        {
          id: 2,
          name: "Emma Smith",
          age: 30,
          gender: "Female",
          seatNumber: "12B"
        }
      ],
      flight: {
        flightNumber: "AI101",
        airline: "Air India",
        departureCity: "Mumbai",
        arrivalCity: "Delhi",
        departureTime: "2024-08-10T10:00:00Z",
        arrivalTime: "2024-08-10T12:30:00Z",
        duration: "2h 30m",
        aircraft: "Boeing 787",
        terminal: "T2",
        gate: "G12"
      },
      payment: {
        amount: 12500,
        currency: "INR",
        method: "Credit Card",
        status: "Paid"
      }
    },
    {
      bookingId: "BK123456",
      bookingDate: "2024-06-20T09:30:00Z",
      status: "Confirmed",
      passengers: [
        {
          id: 1,
          name: "Raj Sharma",
          age: 28,
          gender: "Male",
          seatNumber: "18F"
        }
      ],
      flight: {
        flightNumber: "IGO244",
        airline: "IndiGo",
        departureCity: "Bangalore",
        arrivalCity: "Kolkata",
        departureTime: "2024-07-25T16:15:00Z",
        arrivalTime: "2024-07-25T18:45:00Z",
        duration: "2h 30m",
        aircraft: "Airbus A320",
        terminal: "T1",
        gate: "G07"
      },
      payment: {
        amount: 5800,
        currency: "INR",
        method: "UPI",
        status: "Paid"
      }
    }
  ],
  internationalBookings: [
    {
      bookingId: "BK567890",
      bookingDate: "2024-08-10T14:30:00Z",
      status: "Confirmed",
      passengers: [
        {
          id: 1,
          name: "Priya Patel",
          age: 32,
          gender: "Female",
          seatNumber: "23K",
          passport: "J8745692",
          visaDetails: {
            country: "United States",
            type: "B2",
            expiryDate: "2026-05-15"
          }
        },
        {
          id: 2,
          name: "Vikram Patel",
          age: 35,
          gender: "Male",
          seatNumber: "23J",
          passport: "M1234587",
          visaDetails: {
            country: "United States",
            type: "B2",
            expiryDate: "2026-05-15"
          }
        }
      ],
      flight: {
        flightNumber: "AI101",
        airline: "Air India",
        departureCity: "New Delhi",
        arrivalCity: "New York",
        departureTime: "2024-09-15T01:30:00Z",
        arrivalTime: "2024-09-15T18:45:00Z",
        duration: "16h 15m",
        aircraft: "Boeing 777-300ER",
        terminal: "T3",
        gate: "G15",
        class: "Business",
        layovers: [
          {
            airport: "London Heathrow",
            duration: "2h 30m"
          }
        ]
      },
      payment: {
        amount: 185000,
        currency: "INR",
        method: "Credit Card",
        status: "Paid"
      },
      additionalServices: {
        meal: "Asian Vegetarian",
        extraBaggage: "1 piece (23kg)",
        insurance: true,
        airportPickup: false
      }
    }
  ]
};

// Hero image for the flight landing page
export const heroImage = "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=2074&auto=format&fit=crop";

// Airplane SVG path for subscription section
export const subscriptionAirplane = "M15.5 4.5a2 2 0 0 1 2 2v10.2a.5.5 0 0 1-.39.5h-.01a.5.5 0 0 1-.5-.45L16 13.4V7a1 1 0 0 0-1-1h-3.8a.5.5 0 0 1-.36-.85l1.48-1.48a2 2 0 0 1 1.41-.59h1.77Zm-4.78.5-.94.93a.5.5 0 0 1-.54.13.5.5 0 0 1-.32-.46v-.6h-3a1 1 0 0 0-1 1v1.5a.5.5 0 0 1-.5.5h-.5a.5.5 0 0 1-.5-.5V6a2 2 0 0 1 2-2h3v-.5a.5.5 0 0 1 .84-.36l.92.92a.5.5 0 0 1 0 .71.5.5 0 0 1-.36.14.44.44 0 0 1-.1 0Zm-3.22 4 .4.0v-1h-.4c-.46 0-.74.54-.47.9l.47.1Zm9 1a2 2 0 0 1 2 2v3.8a.5.5 0 0 1-.85.36l-1.48-1.48a.5.5 0 0 1-.15-.35H13.4V13a1 1 0 0 0-1-1h-2v-1a2 2 0 0 1 2-2h3.5Z";

export default flightBookingData;