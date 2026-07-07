# Product

JETSET13 (Jetsetters) is a comprehensive travel booking platform. It lets users search and book across multiple travel verticals, and gives staff an admin workflow for quotes and inquiries.

## Surfaces

- **Flights** — search, results, seat maps, booking confirmation
- **Hotels** — search and details
- **Cruises** — luxury cruise experiences
- **Vacation packages**
- **Visas**
- **Rentals**
- **Admin / Quote / Inquiry** — internal workflow for managing customer requests, quotes, and inquiries

## Companion mobile app

A separate React Native (Expo) client lives in a sibling directory (not in this repo) and consumes the **same backend API**. Backend changes that affect auth response shape, payments, or cruise/flight/hotel/request payloads must be sanity-checked against that app's services layer before shipping.

## Audience

End travelers (booking flows) and internal staff (admin panel).
