import React, { useState } from "react"
import { useNavigate } from "react-router-dom"
import FlightSearchForm from "./flight-search-form"
import PopularDestinations from "./popular-destination"
import CheapestFlights from "./cheapest-flight"
import Navbar from "../Navbar"
import Footer from "../Footer"
import ScrollFlightProgress from "../../../Components/ScrollFlightProgress"
import withPageElements from "../PageWrapper"
import { searchToQuery } from "./searchQuery"
import { Mail, Phone, ExternalLink, Calendar, MessageSquare, Clock, ArrowLeft, User, CheckCircle2, Ticket, Sparkles, ArrowRight, ArrowUpRight, ShieldCheck, Headphones, BadgePercent, Check, Plane, Compass, Star, Lock } from 'lucide-react';
// Importing data from the data file
import { heroImage } from "./data.js"
// Import airports database for dynamic city-to-IATA mapping
import { allAirports } from "./airports.js";

import { useLocationContext } from "../../../Context/LocationContext"
// Dynamically build city-to-IATA map from airports database
// This replaces the previous 180+ line hardcoded map and stays in sync with airports.js
const cityToIATACode = allAirports.reduce((acc, airport) => {
  if (airport.name && airport.code) {
    acc[airport.name] = airport.code;
  }
  return acc;
}, {});



function FlightLanding() {
  const navigate = useNavigate();
  // `cityCode` was read here too and does not exist on this context - only
  // city, country, countryCode and currency do - so every use of it was
  // undefined.
  const { city } = useLocationContext();
  // A destination chosen from the gallery before we know where the visitor is
  // flying from, kept so the form can ask for the missing half.
  const [prefill, setPrefill] = useState(null);

  // Straight to the results, which run the search. This page ran it first, up
  // to 10 seconds with a spinner, and handed an answer to a results page that
  // ignores it and searches again: every search from here ran twice.
  const handleSearch = (formData) => {
    // Use IATA codes from formData (set when user selects from suggestions)
    // Fall back to cityToIATACode map, then raw input as last resort
    const searchData = {
      ...formData,
      from: formData.fromCode || cityToIATACode[formData.from] || formData.from,
      to: formData.toCode || cityToIATACode[formData.to] || formData.to,
    };
    navigate(`/flights/search?${searchToQuery(searchData)}`, { state: { searchData } });
  };

  /**
   * "Explore more destinations" - ask where to, rather than searching nowhere.
   *
   * This sent `to: ""` and navigated to the results page, on every click,
   * unconditionally. There is no such thing as a search with no destination:
   * the results page refuses it with "Please choose where you are flying from,
   * where to, and the date" and offers a Retry that repeats the identical empty
   * search. So the most prominent button under the destination gallery led
   * nowhere but an error, every single time.
   *
   * The honest thing for a button that means "somewhere else" is to put the
   * cursor in the field that answers it. The search form is at the top of this
   * same page, so this scrolls back to it and focuses "To" - no navigation, and
   * nothing that can fail.
   */
  const handleExploreDestinations = () => {
    const form = document.getElementById('flight-search');
    form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // After the scroll starts, so the field is not focused off-screen and the
    // browser does not jump back to it.
    setTimeout(() => {
      const destination = form?.querySelector('input[name="to"]');
      destination?.focus();
    }, 400);
  };

  /**
   * A destination card: search it, or ask where they are flying FROM.
   *
   * The origin came from `city`, which is empty until the geo lookup answers
   * and stays empty if the visitor blocks it - and from `cityCode`, which
   * `useLocationContext` has never exposed at all, so it was always undefined.
   * With no origin the search page gives the same "Please choose where you are
   * flying from" error as the button above, so a card clicked in the first
   * second, or with geo off, could not work.
   *
   * A destination the visitor picked is worth keeping either way. So when the
   * origin is unknown, the search form is filled in with it and asks for the
   * one missing piece, rather than throwing the choice away on an error page.
   */
  const handleBookFlight = (destination) => {
    const departDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toCode = cityToIATACode[destination] || destination;
    const fromCode = cityToIATACode[city] || (city || '');

    if (!fromCode) {
      // Only the destination. Sending `travelers: '1'` used to reset a party
      // the visitor had already chosen - the pill still read "3 Travellers"
      // while the search asked for one adult.
      setPrefill({ to: toCode, departDate });
      const form = document.getElementById('flight-search');
      form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => form?.querySelector('input[name="from"]')?.focus(), 400);
      return;
    }

    navigate('/flights/search', {
      state: {
        searchData: {
          from: fromCode, to: toCode, tripType: 'oneWay', departDate, returnDate: '', travelers: '1',
        },
      },
    });
  };

  return (
    <div className="min-h-screen bg-ivory">
      <Navbar />
      <ScrollFlightProgress />

      {/* Special Offer Banner — refined, slim */}
      <div className="w-full bg-ink text-white/90 border-b border-white/10">
        <div className="container mx-auto px-4 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[11px] md:text-xs tracking-wide leading-tight">
          <span className="inline-flex items-center gap-1.5 text-brand-sky">
            <Sparkles className="h-3.5 w-3.5" /> Self-Service Portal Coming Soon
          </span>
          <span className="hidden sm:inline text-white/25">·</span>
          <span className="hidden sm:inline">Call <span className="font-semibold text-white">(877) 538-7380</span></span>
          <span className="hidden md:inline text-white/25">·</span>
          <a href="mailto:support@jetsetterss.com" className="hidden md:inline text-white underline decoration-white/30 underline-offset-2 hover:decoration-white">support@jetsetterss.com</a>
          {/* A pill promising a fifty-dollar discount for one day sat here every
              day. No coupon or price rule stood behind it, so nobody who booked
              ever got it. */}
        </div>
      </div>

      {/* ───────────────────────── Hero ───────────────────────── */}
      <section aria-labelledby="hero-heading" className="relative w-full flex flex-col justify-center overflow-x-clip bg-ivory">
        {/* Background image + editorial ivory wash */}
        <div
          className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=2074&auto=format&fit=crop')",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-ivory/95 via-ivory/55 to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-ivory/70 via-transparent to-transparent"></div>
          {/* The photograph used to stop dead at the section edge, leaving a
              ruled line across the page. It now dissolves into the ground the
              next section stands on. */}
          <div className="absolute inset-x-0 -bottom-px h-56 md:h-72 bg-gradient-to-t from-ivory via-ivory/90 to-transparent"></div>
        </div>
        <div className="bg-grain absolute inset-0 z-[1]"></div>

        {/* Content */}
        <div className="relative z-10 w-full px-4 sm:px-6 md:px-12 pt-6 md:pt-8 pb-8 md:pb-10">
          <div className="container mx-auto">
            <div className="max-w-6xl mx-auto text-center">
              {/* Kicker */}
              <div className="reveal-up flex items-center justify-center gap-4 mb-5">
                <span className="hairline w-10 md:w-14 rotate-180" aria-hidden="true"></span>
                <span className="kicker text-brand-teal">Luxury Travel, Effortlessly Planned</span>
                <span className="hairline w-10 md:w-14" aria-hidden="true"></span>
              </div>

              <h1
                id="hero-heading"
                className="reveal-up font-grotesk text-ink font-semibold leading-[1.1] tracking-normal text-[2.4rem] sm:text-5xl md:text-6xl lg:text-7xl xl:text-[5rem]"
                style={{ animationDelay: '0.1s' }}
              >
                Find Your <span className="text-brand-teal">Perfect Flight</span>
                <br className="hidden sm:block" /> Today
              </h1>

              <p
                className="reveal-up mx-auto mt-8 max-w-xl text-neutral-600 text-base sm:text-lg leading-relaxed"
                style={{ animationDelay: '0.15s' }}
              >
                Handpicked fares, real human concierges, and a best-price promise —
                book with confidence and travel with peace of mind.
              </p>
            </div>

            {/* Booking card — relative z-30 keeps its open dropdowns above the
                content below (the reveal-up transform creates a stacking context) */}
            <div id="flight-search" className="reveal-up relative z-30 mt-11 md:mt-14 max-w-6xl mx-auto" style={{ animationDelay: '0.28s' }}>
              <FlightSearchForm onSearch={handleSearch} initialData={prefill ?? undefined} />
            </div>

            {/* What a first-time visitor needs to know before they search, beside
                the card rather than a page away. Every line here is something
                the booking flow actually does. */}
            <div
              className="reveal-up mt-8 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-sm text-ink/65"
              style={{ animationDelay: '0.36s' }}
            >
              <span className="inline-flex items-center gap-2">
                <Lock className="h-4 w-4 text-brand-teal" aria-hidden="true" /> Secure checkout · SSL encrypted
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden="true"></span>
                Seat confirmed before your card is charged
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden="true"></span>
                Ticket and e-receipt emailed in minutes
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────── Lowest fares ──────────────── */}
      {/* Prices first: someone landing here is shopping for a fare, not a
          photograph. The gallery follows. */}
      <section className="relative bg-ivory pt-8 md:pt-12 pb-10">
        <div className="container mx-auto px-4">
          <CheapestFlights onBookFlight={handleBookFlight} />

          <div className="flex justify-center mt-12">
            <button
              onClick={handleExploreDestinations}
              className="group inline-flex items-center gap-3 rounded-full border border-brand-teal/40 bg-white/60 px-7 py-3.5 text-brand-teal font-medium tracking-wide transition-all duration-300 hover:bg-brand-teal hover:text-white hover:border-brand-teal"
            >
              See every route we fly
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      </section>

      {/* ──────────────── Incredible savings ──────────────── */}
      <section className="bg-ivory pt-10 md:pt-14 pb-20">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center gap-12 md:gap-16">
            {/* Framed image */}
            <div className="md:w-1/2 w-full">
              <div className="relative">
                <img loading="lazy" decoding="async"
                  src="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=1474&auto=format&fit=crop"
                  alt="Airplane flying in sky"
                  className="w-full h-[300px] md:h-[420px] object-cover relative z-10 rounded-[1.5rem] shadow-large"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = 'https://images.unsplash.com/photo-1569154941061-e231b4725ef1?q=80&w=1470&auto=format&fit=crop';
                  }}
                />
              </div>
            </div>

            <div className="md:w-1/2">
              <p className="kicker text-brand-teal mb-5">Incredible Savings</p>
              <h2 className="font-grotesk font-semibold text-ink text-4xl md:text-5xl leading-[1.08] tracking-tight mb-6">
                Our lowest fares to the world's<span className="italic text-brand-teal"> most-loved</span> places
              </h2>
              <p className="text-neutral-600 text-lg leading-relaxed mb-8">
                Take advantage of our special deals and promotions to get the best value
                for your travel budget — the most affordable flights, without compromising on quality.
              </p>
              <ul className="space-y-3.5">
                {/* This promised there were no fees to find, over search results
                    whose prices leave out the service fee added before payment. */}
                {['Price match guarantee', 'Service fee shown before you pay', '24/7 customer support'].map((item) => (
                  <li key={item} className="flex items-center text-ink/80">
                    <span className="flex-shrink-0 mr-3 flex h-6 w-6 items-center justify-center rounded-full bg-brand-teal/10 text-brand-teal">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                    <span className="text-base">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

        </div>
      </section>

      {/* ──────────────── Festival season ──────────────── */}
      {/* A photograph you stand inside rather than look at. It promises no
          percentage off - only the seat hold, which the checkout really does. */}
      <section className="relative isolate flex items-center overflow-hidden min-h-[520px] md:min-h-[560px]">
        <img
          src="https://images.unsplash.com/photo-1530521954074-e64f6810b32d?q=70&w=2600&auto=format&fit=crop"
          alt="A traveller waiting at the gate as an aircraft climbs away"
          className="absolute inset-0 -z-10 h-full w-full object-cover object-[78%_22%]"
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#092128]/95 via-[#092128]/80 to-[#092128]/10" aria-hidden="true"></div>
        <div className="absolute inset-x-0 top-0 -z-10 h-24 bg-gradient-to-b from-ivory to-transparent" aria-hidden="true"></div>

        <div className="container mx-auto px-4 py-16">
          <div className="max-w-2xl flex flex-col items-start gap-4">
            <span className="kicker text-brand-sky">Festival season</span>
            <h2 className="font-grotesk text-white font-semibold text-4xl md:text-6xl leading-[1.04] max-w-[16ch]">
              Flying home for the festival?
            </h2>
            <p className="text-white/85 text-base md:text-lg leading-relaxed max-w-lg">
              Seats on the India routes go first and come back dearest. Hold yours now —
              we confirm the seat with the airline before your card is charged.
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              <button
                onClick={handleExploreDestinations}
                className="rounded-full bg-brand-teal px-8 py-3.5 text-white font-semibold tracking-wide transition-colors hover:bg-[#044A5F]"
              >
                Search your dates
              </button>
              <a
                href="tel:+18775387380"
                className="rounded-full border border-white/50 bg-white/10 px-7 py-3.5 text-white font-semibold backdrop-blur-sm transition-colors hover:bg-white hover:text-ink"
              >
                Call (877) 538-7380
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────── Popular Destinations ──────────────── */}
      <section className="relative bg-ivory pt-16 md:pt-20 pb-20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <p className="kicker text-brand-teal mb-5">Top Trending Destinations</p>
            <h2 className="font-grotesk font-semibold text-ink text-4xl md:text-6xl tracking-tight leading-[1.05]">
              Explore popular destinations
            </h2>
            <p className="mt-5 text-neutral-600 text-lg leading-relaxed">
              A carefully selected collection loved by travellers worldwide —
              perfect places for your next adventure.
            </p>
          </div>

          <PopularDestinations onSelectDestination={handleBookFlight} />

          <div className="flex justify-center mt-12">
            <button
              onClick={handleExploreDestinations}
              className="group inline-flex items-center gap-3 rounded-full border border-brand-teal/40 bg-white/60 px-7 py-3.5 text-brand-teal font-medium tracking-wide transition-all duration-300 hover:bg-brand-teal hover:text-white hover:border-brand-teal"
            >
              Explore more destinations
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      </section>

      {/* ──────────────── Who stands behind the booking ──────────────── */}
      <section className="bg-ivory pb-16">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4 border-t border-sand pt-8 text-sm text-neutral-600">
            <span className="inline-flex items-center gap-3">
              <img src="/images/logos/amadeus.svg" alt="" className="h-4 w-auto opacity-90" loading="lazy" />
              Fares and seats through <span className="font-semibold text-ink">Amadeus</span>
            </span>
            <span className="inline-flex items-center gap-3">
              <img src="/images/logos/arc-pay-gateway.png" alt="" className="h-6 w-auto opacity-90" loading="lazy" />
              Payments secured by <span className="font-semibold text-ink">ARC Pay</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="font-semibold text-ink">SSL encrypted</span> checkout
            </span>
          </div>
        </div>
      </section>

      {/* Newsletter signup now lives in the footer */}
      <Footer />
    </div>
  )
}

export default withPageElements(FlightLanding);
