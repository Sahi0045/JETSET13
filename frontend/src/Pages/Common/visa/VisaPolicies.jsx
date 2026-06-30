import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../Navbar';
import Footer from '../Footer';

/**
 * Legal pages for the visa service: Refund Policy, Terms & Conditions, Privacy.
 * One component, three tabs — routed as /visa/refund-policy, /visa/terms, /visa/privacy.
 */
const TABS = [
  { key: 'refund', label: 'Refund Policy', icon: 'currency_exchange' },
  { key: 'terms', label: 'Terms & Conditions', icon: 'gavel' },
  { key: 'privacy', label: 'Privacy', icon: 'lock' },
];

const Section = ({ title, children }) => (
  <section className="mb-8">
    <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
    <div className="text-slate-600 text-sm leading-relaxed space-y-2">{children}</div>
  </section>
);

export default function VisaPolicies({ tab = 'refund' }) {
  const [active, setActive] = useState(tab);
  useEffect(() => { setActive(tab); window.scrollTo(0, 0); }, [tab]);

  return (
    <div className="min-h-screen bg-[#f6f6f8] font-sans text-slate-900">
      <Navbar forceScrolled={true} />
      <link
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        rel="stylesheet"
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-24">
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2">Visa Service — Policies</h1>
        <p className="text-slate-500 mb-8">Please read these before submitting a visa application or payment.</p>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-8 bg-white rounded-xl border border-slate-200 p-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors ${
                active === t.key ? 'bg-[#1152d4] text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <span className="material-symbols-outlined text-base">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-10">
          {active === 'refund' && (
            <>
              <h2 className="text-2xl font-black mb-1">Refund Policy</h2>
              <p className="text-xs text-slate-400 mb-6">Last updated: 2026</p>

              <Section title="Service fee vs. government fee">
                <p>Your payment covers our <strong>service fee</strong> (application handling, document review and submission support). Any <strong>government / embassy / consulate fees</strong> paid on your behalf to a third party are <strong>non-refundable</strong> once submitted, as those authorities do not return them.</p>
              </Section>

              <Section title="When the service fee is refundable">
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>Before processing begins</strong> (status “Submitted”, “Documents Pending” or “Additional Info Required”): you may cancel for a <strong>100% refund of the service fee</strong>, returned to your original payment method.</li>
                  <li><strong>After review has started</strong> (status “Under Review” or later): the service fee is generally non-refundable because work has been performed. Our team may issue a partial or full refund at its discretion — contact support.</li>
                  <li><strong>If we are unable to process your application</strong> for reasons within our control, we will refund the service fee in full.</li>
                </ul>
              </Section>

              <Section title="Rejections">
                <p>A visa decision is made solely by the destination authorities. A rejection is not by itself grounds for an automatic refund of government fees. We will refund the service fee where our processing was incomplete or where stated for a specific route.</p>
              </Section>

              <Section title="How to request a refund">
                <p>Cancel from your application status page, or contact support with your application reference (e.g. <code>VISA-2026-00001</code>). Approved refunds are issued to the original payment method and may take 5–10 business days to appear, depending on your bank.</p>
              </Section>
            </>
          )}

          {active === 'terms' && (
            <>
              <h2 className="text-2xl font-black mb-1">Terms &amp; Conditions</h2>
              <p className="text-xs text-slate-400 mb-6">Last updated: 2026</p>

              <Section title="What we provide">
                <p>We provide a <strong>visa assistance and document-management service</strong>: we help you prepare, review and submit your application. We are <strong>not</strong> a government body and <strong>do not issue visas</strong>. Visa approval is decided exclusively by the relevant authorities.</p>
              </Section>

              <Section title="No guarantee of approval">
                <p>We do not and cannot guarantee that a visa will be granted, nor a specific processing time beyond published estimates. Our service tiers affect how quickly <em>we</em> handle your application, not the authority’s decision timeline.</p>
              </Section>

              <Section title="Your responsibilities">
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Provide accurate, truthful information and valid documents (passport valid for the required period, genuine supporting documents).</li>
                  <li>Respond promptly to requests for additional information.</li>
                  <li>You are responsible for meeting the destination’s entry requirements; we are not liable for denied entry.</li>
                </ul>
              </Section>

              <Section title="Fees & payment">
                <p>Service fees are shown before payment and collected at submission via our payment provider (ARC Pay). Government fees, where applicable, are additional. See the Refund Policy for cancellations.</p>
              </Section>

              <Section title="Limitation of liability">
                <p>To the extent permitted by law, our liability for any claim relating to the service is limited to the service fee you paid. We are not liable for authority decisions, processing delays outside our control, or consequential losses (e.g. missed travel).</p>
              </Section>
            </>
          )}

          {active === 'privacy' && (
            <>
              <h2 className="text-2xl font-black mb-1">Privacy Notice</h2>
              <p className="text-xs text-slate-400 mb-6">Last updated: 2026</p>

              <Section title="What we collect">
                <p>To process a visa application we collect your personal details (name, date of birth, contact info), <strong>passport details</strong>, travel details, and the <strong>documents you upload</strong> (passport scan, photo, financial/employment documents).</p>
              </Section>

              <Section title="How we use it">
                <p>Solely to prepare, review and submit your visa application and to communicate with you about it. We do not sell your personal data.</p>
              </Section>

              <Section title="Storage & sharing">
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Application data and documents are stored securely with our infrastructure provider.</li>
                  <li>Payment is processed by our payment provider (ARC Pay); we never store full card details.</li>
                  <li>We share only the information necessary with the relevant visa authority / processing partner to submit your application.</li>
                </ul>
              </Section>

              <Section title="Retention & your rights">
                <p>We retain application records as needed to provide the service and meet legal obligations, then delete or anonymise them. You may request access to, correction of, or deletion of your data by contacting support (subject to records we must retain).</p>
              </Section>
            </>
          )}

          <div className="mt-8 pt-6 border-t border-slate-100 text-sm">
            <Link to="/visa" className="text-[#1152d4] font-bold hover:underline">← Back to Visa Services</Link>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
