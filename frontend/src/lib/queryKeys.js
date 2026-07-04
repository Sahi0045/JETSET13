/**
 * Centralized query-key factory for the web app.
 * Hierarchical keys → invalidating ['flights'] clears all flight queries.
 */
export const queryKeys = {
  flights: {
    all: ['flights'],
    search: (params) => ['flights', 'search', params],
    seatMap: (offerId) => ['flights', 'seatMap', offerId],
    fareRules: (offerId) => ['flights', 'fareRules', offerId],
    fareOptions: (offerId) => ['flights', 'fareOptions', offerId],
    airports: (keyword) => ['flights', 'airports', keyword],
  },
  hotels: {
    all: ['hotels'],
    search: (params) => ['hotels', 'search', params],
    destinations: () => ['hotels', 'destinations'],
  },
  cruises: {
    all: ['cruises'],
    list: () => ['cruises', 'list'],
    search: (params) => ['cruises', 'search', params],
    details: (id) => ['cruises', 'details', id],
  },
  packages: {
    all: ['packages'],
    search: (params) => ['packages', 'search', params],
    details: (id) => ['packages', 'details', id],
  },
  pricing: {
    all: ['pricing'],
    config: (service) => ['pricing', 'config', service],
    settings: () => ['pricing', 'settings'],
  },
  geo: {
    location: () => ['geo', 'location'],
  },
  currency: {
    rates: () => ['currency', 'rates'],
  },
  subscription: {
    all: ['subscription'],
    status: (email) => ['subscription', 'status', email],
  },
};
