# Technical Documentation: SAHI Travel App

## 1. Introduction

This document provides a detailed technical overview of the SAHI travel app. It is intended for developers who are new to the project and need to understand its architecture, setup, and key features.

## 2. Technology Stack

- **Frontend:**
  - **React:** A JavaScript library for building user interfaces.
  - **Vite:** A fast build tool for modern web projects.
  - **Tailwind CSS:** A utility-first CSS framework for rapid UI development.

- **Backend:**
  - **Node.js:** A JavaScript runtime for building server-side applications.
  - **Express.js:** A web application framework for Node.js.

- **Database:**
  - **Supabase:** An open-source Firebase alternative for building secure and scalable backends.

- **APIs and Services:**
  - **Amadeus:** A global distribution system (GDS) providing APIs for flight and hotel data.
  - **Resend:** An email API for developers.

- **Deployment:**
  - **Vercel:** A cloud platform for static sites and serverless functions.

## 3. Getting Started

### 3.1. Prerequisites

- Node.js (v18 or higher)
- npm

### 3.2. Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd sahi/prod
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

### 3.3. Environment Variables

Create a `.env` file in the `prod` directory and add the following environment variables. You will need to obtain the API keys from the respective services.

```
# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key

# Amadeus
AMADEUS_API_KEY=your_amadeus_api_key
AMADEUS_API_SECRET=your_amadeus_api_secret

# Resend
RESEND_API_KEY=your_resend_api_key

# Server
PORT=5002
CORS_ORIGIN=http://localhost:5173
```

### 3.4. Running the Application

- **Start the development server:**
  ```bash
  npm run dev
  ```
  This will start both the backend server and the frontend development server concurrently.

- **Access the application:**
  - Frontend: `http://localhost:5173`
  - Backend: `http://localhost:5002`

## 4. Project Structure

```
sahi/
└── prod/
    ├── backend/
    │   ├── config/       # Configuration files (e.g., Supabase)
    │   ├── controllers/  # Request handlers
    │   ├── models/       # Data models
    │   └── routes/       # API routes
    ├── public/           # Static assets
    ├── resources/
    │   └── js/           # React frontend source code
    │       ├── Components/ # Reusable React components
    │       ├── Pages/      # Page components
    │       └── App.jsx     # Main React app component
    ├── .env              # Environment variables
    ├── package.json      # Project dependencies and scripts
    └── server.js         # Main backend server file
```

## 5. Backend Architecture

The backend is a Node.js application using the Express.js framework. It exposes a RESTful API for the frontend to consume.

### 5.1. API Endpoints

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/users/:id`
- `GET /api/flights/search`
- `POST /api/flights/book`
- `GET /api/hotels/search`
- `POST /api/hotels/book`
- `POST /api/payments/charge`
- `POST /api/email/send`

### 5.2. Middleware

- **CORS:** Enables Cross-Origin Resource Sharing.
- **JSON Parser:** Parses incoming JSON requests.

## 6. Frontend Architecture

The frontend is a single-page application (SPA) built with React. It uses React Router for client-side routing and communicates with the backend via API calls. The main entry point for the application is `src/main.jsx`, which renders the `App` component from `resources/js/app.jsx`.

### 6.1. Routing

The application uses `react-router-dom` for routing. The main routes are defined in `resources/js/app.jsx`. Here is a summary of the key routes:

- `/`: The main landing page.
- `/login`: The user login page.
- `/signup`: The user signup page.
- `/dashboard`: The user's dashboard.
- `/profile`: The user's profile page.
- `/mytrips`: A page displaying the user's booked trips.
- `/flights`: The flight search page.
- `/flights/search`: The flight search results page.
- `/flights/booking/confirmation`: The flight booking confirmation page.
- `/flights/payment`: The flight payment page.
- `/flights/booking/success`: A page displayed after a successful flight booking.
- `/hotels`: The hotel search page.
- `/hotels/search`: The hotel search results page.
- `/hotels/details/:id`: The details page for a specific hotel.
- `/cruises`: The cruise search page.
- `/cruises/itinerary/:id`: The itinerary for a specific cruise.
- `/cruises/booking/summary`: The cruise booking summary page.

### 6.2. Key Components

The frontend is built with a component-based architecture. Here are some of the key components:

- **`FlightSearch`:** A form for searching flights. It allows users to input their origin, destination, dates, and number of passengers.
- **`HotelSearch`:** A form for searching hotels. It allows users to input their destination, check-in and check-out dates, and number of guests.
- **`CruiseSearch`:** A form for searching for cruises.
- **`BookingForm`:** A generic form for collecting passenger or guest details for bookings.
- **`PaymentForm`:** A secure form for processing payments using a payment gateway.
- **`Itinerary`:** A component that displays the detailed itinerary for a cruise or trip package.

### 6.3. Hotel and Cruise Features

- **Hotel Booking:** The application integrates with the Amadeus API to fetch hotel data. Users can search for hotels, view details, and book rooms. The hotel booking flow includes search, results, details, and booking confirmation pages.
- **Cruise Booking:** The application also supports cruise bookings. Users can search for cruises, view itineraries, and book their trips. The cruise booking flow includes search, itinerary, and booking summary pages.

## 7. Deployment

The application is deployed on Vercel. The `vercel.json` file in the root directory contains the deployment configuration. The `npm run build` command creates a production-ready build in the `dist` directory, which is then deployed by Vercel.
