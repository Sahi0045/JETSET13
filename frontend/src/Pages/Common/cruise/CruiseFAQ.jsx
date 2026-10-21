import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const FAQS = [
  {
    q: 'What documents are required to board the cruise?',
    a: 'Guests must present a valid passport or government-issued photo ID, their cruise ticket, and any visas required for the ports on their itinerary. We recommend carrying both physical and digital copies.',
  },
  {
    q: 'What time do I need to check-in and board the cruise?',
    a: 'For offline check-in, arrive 3–4 hours before departure. Boarding typically closes 1–2 hours before sailing. Refer to your cruise ticket for the exact timings for your ship and port.',
  },
  {
    q: 'How much luggage is allowed on the cruise?',
    a: 'Most cruise lines have a generous luggage allowance, but weight and size limits vary by line. Check your booking confirmation for the specific policy, and label every bag with your name and cabin number.',
  },
  {
    q: 'Can I cancel or reschedule my cruise booking?',
    a: 'Cancellation and rescheduling policies depend on the cruise line and fare type. Many bookings offer flexible cancellation up to a cut-off date. Contact our cruise experts for help with changes to your reservation.',
  },
  {
    q: 'Are meals and activities included in the price?',
    a: 'Most cruises include main dining, entertainment, and a range of onboard activities. Specialty restaurants, premium beverages, shore excursions, and spa services are usually charged separately.',
  },
];

const CruiseFAQ = () => {
  const [open, setOpen] = useState(0);

  return (
    <section className="py-10 md:py-16 bg-[#F4F7F8]">
      <div className="max-w-4xl mx-auto px-4">
        <h2 className="text-2xl md:text-3xl font-bold text-[#034457] tracking-tight mb-2">
          Cruise FAQs &ndash; What to Know Before You Sail
        </h2>
        <p className="text-slate-500 mb-8">Everything you need to know before your voyage begins.</p>

        <div className="space-y-3">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div
                key={i}
                className={`bg-white rounded-2xl border transition-all duration-200 ${
                  isOpen ? 'border-[#0890BC]/40 shadow-md' : 'border-slate-100 shadow-sm'
                }`}
              >
                <button
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  className="w-full flex items-center justify-between gap-4 text-left px-5 py-4"
                  aria-expanded={isOpen}
                >
                  <span className="font-semibold text-[#034457]">{item.q}</span>
                  <ChevronDown
                    className={`w-5 h-5 flex-shrink-0 text-[#055B75] transition-transform duration-300 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                <div
                  className={`grid transition-all duration-300 ease-in-out ${
                    isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-5 text-slate-600 leading-relaxed">{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default CruiseFAQ;
