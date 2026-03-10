import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../Navbar';
import Footer from '../Footer';

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)
// Screen: JetSetters Visa Landing & Eligibility Checker (8cb26df459824893b12fbae8bc74bc88)

const VisaLanding = () => {
    const navigate = useNavigate();
    const [nationality, setNationality] = useState('');
    const [destination, setDestination] = useState('');

    const handleEligibilityCheck = () => {
        if (nationality && destination) {
            navigate(`/visa/apply?nationality=${encodeURIComponent(nationality)}&destination=${encodeURIComponent(destination)}`);
        }
    };

    const services = [
        {
            icon: 'description',
            title: 'Visa Application',
            description: 'Streamlined processing for tourist, business, and transit visas globally.',
            link: '/visa/apply',
        },
        {
            icon: 'menu_book',
            title: 'Passport Renewal',
            description: 'Fast-track passport renewals and new applications with expert guidance.',
            link: '/visa/documents',
        },
        {
            icon: 'health_and_safety',
            title: 'Travel Insurance',
            description: 'Comprehensive coverage for medical emergencies, delays, and cancellations.',
            link: '/visa/documents',
        },
        {
            icon: 'translate',
            title: 'Document Translation',
            description: 'Certified translation services for all your essential travel documents.',
            link: '/visa/documents',
        },
    ];

    const destinations = [
        {
            name: 'United States',
            type: 'ESTA / Visa',
            typeColor: 'bg-green-100 text-green-800',
            processing: '3-5 days',
            validity: 'Up to 10 years',
            image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB4U_eTcJbVPmkg_FSW57b3dJDOPZ5Y2MLbNBln8XjDwGRCSS92qtlNBozCgheJYBmhkyvdcUGfKy35TPHyBSUEO7RWoLwCfTdyvVjPoLbUsOMloS1Lvvh28xZymoATEtwzejD8waLDLTdQVQ4Fit_lVUlDC5Uub7cC6ushwqFUOD6knQEh355TGPQs5W4FEITPHS1jYV5FMKwIbvZ07ZqF9XfIh1hWfLNnu_OQo9XXanMBovHPiPdFc32rMz-7eoMgn33I5nYK2cJi',
        },
        {
            name: 'United Kingdom',
            type: 'eTA / Visa',
            typeColor: 'bg-blue-100 text-blue-800',
            processing: '1-3 weeks',
            validity: '6 months - 10 years',
            image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDKlszl6QYgO5Cb3UdZh5xapqZV8B1AtntWCHLlC3w5SWaKybtFVw8spoVVrCKhXuruVUlZrdAzDYH9eo_D2EtkT8cMFYLrh1P81HrfQWmMSNSO_OPQY2uTYmNEkVUN8kq5fhA0cP9HT09WA_AgQLEKrq18jlLveLQ23L9Cr0XAr948jkLVpLSx0KEX6IGFYfS35G97lsYteP20qRgMz45C16iz71teSVkBRrZx-GKD76Pk73NTSMgy1ZhVvZqla9OKSFrC4jMlKWUa',
        },
        {
            name: 'Japan',
            type: 'E-Visa',
            typeColor: 'bg-purple-100 text-purple-800',
            processing: '5-7 days',
            validity: '90 days',
            image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDV9FJn3lRiSGLSQNJxRmpWRlzedajJPU-d6ziy3eMB0IRHpEBOWZAS-MlF582aavcxwvWTqM7oVs6TDSF9v1L9z35rVdX9gj2DrGyIeV79Tv6xPtB_YnlBB1Y8lyL-H9eDsPcGsIcBVvAJSSItSSXaDMvDpgKjpcmz4DU08QKy2M4CJwUD-bPU7CgqdzIoThAwnT3B_UQOhtXjVQ4tTcuimQWoBkTKtp7_ZPT8nteuMAXhAtbYjCGef9V3kFUGayHH-OX8BAKtMh23',
        },
    ];

    return (
        <div className="min-h-screen bg-[#f6f6f8] font-sans text-slate-900">
            <Navbar forceScrolled={true} />

            <div className="px-4 md:px-10 lg:px-40 flex flex-1 justify-center py-8 pt-24">
                <div className="flex flex-col w-full max-w-[1200px] flex-1">

                    {/* Hero Section with Eligibility Checker */}
                    <div className="mb-12">
                        <div
                            className="relative flex min-h-[500px] flex-col gap-6 bg-cover bg-center bg-no-repeat rounded-xl items-center justify-center p-8 md:p-12 overflow-hidden shadow-lg"
                            style={{ backgroundImage: `url("https://lh3.googleusercontent.com/aida-public/AB6AXuBsxFHgnSMvdBxSPMexwzqwbg8_DkvyYNqNqF-m5wL5DFKv-CXBZVGYf6GBHWLbLYWLCwfLoM1T1StuAAXvY_CVeEsy8vwMhLCE4emOxvGEN1fklJY5ePDnQALbBhrMXykVgTzCd8h0RKj15rr-Z5ubunZxfGyphsUbJ40uAKv1BmJQjjTVnxM_TJqHjwPk5HMhROM-VcIxzgRZpprAJEGB73g0ai70HrIJX9QXhY-nNPeeEK4txhcewxLo1xz8wleViXhtDuOPE3tW")` }}
                        >
                            {/* Dark overlay */}
                            <div className="absolute inset-0 bg-slate-900/60"></div>

                            <div className="relative z-10 flex flex-col gap-4 text-center max-w-2xl mx-auto">
                                <h1 className="text-white text-4xl md:text-5xl font-black leading-tight tracking-tight drop-shadow-md">
                                    Fast &amp; Secure Visa Processing for JetSetters
                                </h1>
                                <p className="text-white/90 text-lg font-medium leading-relaxed drop-shadow-sm">
                                    Check your eligibility and apply for visas to top destinations worldwide with ease.
                                </p>
                            </div>

                            {/* Eligibility Checker Widget */}
                            <div className="relative z-10 w-full max-w-3xl mt-8 bg-white p-6 rounded-xl shadow-2xl">
                                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                                    <span className="material-symbols-outlined text-[#1152d4]">fact_check</span>
                                    Visa Eligibility Checker
                                </h3>
                                <div className="flex flex-col md:flex-row gap-4">
                                    <label className="flex flex-col flex-1">
                                        <p className="text-sm font-medium leading-normal pb-2 text-slate-700">Your Nationality</p>
                                        <div className="relative">
                                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">public</span>
                                            <input
                                                className="flex w-full rounded-lg text-slate-900 border border-slate-300 h-12 placeholder:text-slate-400 pl-10 pr-4 text-base focus:outline-none focus:ring-2 focus:ring-[#1152d4]"
                                                placeholder="e.g. United States"
                                                value={nationality}
                                                onChange={(e) => setNationality(e.target.value)}
                                            />
                                        </div>
                                    </label>
                                    <label className="flex flex-col flex-1">
                                        <p className="text-sm font-medium leading-normal pb-2 text-slate-700">Destination Country</p>
                                        <div className="relative">
                                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">pin_drop</span>
                                            <input
                                                className="flex w-full rounded-lg text-slate-900 border border-slate-300 h-12 placeholder:text-slate-400 pl-10 pr-4 text-base focus:outline-none focus:ring-2 focus:ring-[#1152d4]"
                                                placeholder="e.g. Japan"
                                                value={destination}
                                                onChange={(e) => setDestination(e.target.value)}
                                            />
                                        </div>
                                    </label>
                                    <div className="flex items-end mt-4 md:mt-0">
                                        <button
                                            onClick={handleEligibilityCheck}
                                            className="w-full md:w-auto flex cursor-pointer items-center justify-center rounded-lg h-12 px-8 bg-[#1152d4] text-white text-base font-bold shadow-md hover:bg-[#0e42b0] transition-all"
                                        >
                                            Check Now
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Quick Nav Links */}
                    <div className="mb-12 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                        <div className="flex flex-wrap gap-3 justify-center">
                            {[
                                { to: '/visa/apply', icon: 'edit_document', label: 'Apply Now', primary: true },
                                { to: '/visa/track', icon: 'search', label: 'Track Application' },
                                { to: '/visa/status', icon: 'dashboard', label: 'My Status' },
                                { to: '/visa/booking', icon: 'calendar_month', label: 'Book Consultation' },
                                { to: '/visa/documents', icon: 'folder_open', label: 'Document Services' },
                                { to: '/visa/admin', icon: 'admin_panel_settings', label: 'Admin Panel' },
                            ].map((item, i) => (
                                <Link
                                    key={i}
                                    to={item.to}
                                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all no-underline ${item.primary
                                            ? 'bg-[#1152d4] text-white shadow-md hover:bg-[#0e42b0]'
                                            : 'bg-slate-50 text-slate-700 hover:bg-[#1152d4]/10 hover:text-[#1152d4]'
                                        }`}
                                >
                                    <span className="material-symbols-outlined text-lg">{item.icon}</span>
                                    {item.label}
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* Services Section */}
                    <section className="mb-16">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-2xl font-bold">Our Services</h2>
                            <Link to="/visa/documents" className="text-[#1152d4] font-medium flex items-center gap-1 hover:underline">
                                View All <span className="material-symbols-outlined text-sm">arrow_forward</span>
                            </Link>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {services.map((service, index) => (
                                <Link
                                    key={index}
                                    to={service.link}
                                    className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group cursor-pointer no-underline"
                                >
                                    <div className="w-12 h-12 rounded-full bg-[#1152d4]/10 flex items-center justify-center mb-4 text-[#1152d4] group-hover:bg-[#1152d4] group-hover:text-white transition-colors">
                                        <span className="material-symbols-outlined">{service.icon}</span>
                                    </div>
                                    <h3 className="text-lg font-bold mb-2 text-slate-900">{service.title}</h3>
                                    <p className="text-sm text-slate-600 mb-4">{service.description}</p>
                                    <span className="text-[#1152d4] text-sm font-bold flex items-center gap-1">
                                        Learn more <span className="material-symbols-outlined text-xs">arrow_forward</span>
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </section>

                    {/* Popular Destinations */}
                    <section className="mb-16">
                        <h2 className="text-2xl font-bold mb-2">Popular Destinations</h2>
                        <p className="text-slate-600 mb-8">Quick view of visa requirements for our most requested countries.</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {destinations.map((dest, index) => (
                                <div key={index} className="rounded-xl overflow-hidden shadow-sm border border-slate-200 bg-white">
                                    <div
                                        className="h-40 bg-cover bg-center"
                                        style={{ backgroundImage: `url('${dest.image}')` }}
                                    />
                                    <div className="p-5">
                                        <div className="flex justify-between items-start mb-3">
                                            <h3 className="text-xl font-bold">{dest.name}</h3>
                                            <span className={`${dest.typeColor} text-xs px-2 py-1 rounded font-bold uppercase tracking-wide`}>
                                                {dest.type}
                                            </span>
                                        </div>
                                        <ul className="text-sm text-slate-600 space-y-2 mb-4">
                                            <li className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-sm text-[#1152d4]">schedule</span>
                                                Processing: {dest.processing}
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-sm text-[#1152d4]">event</span>
                                                Validity: {dest.validity}
                                            </li>
                                        </ul>
                                        <button
                                            onClick={() => navigate(`/visa/apply?destination=${encodeURIComponent(dest.name)}`)}
                                            className="w-full py-2 border border-[#1152d4] text-[#1152d4] rounded-lg font-medium hover:bg-[#1152d4]/5 transition-colors"
                                        >
                                            View Requirements
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* How It Works Section */}
                    <section className="mb-16 bg-white rounded-xl p-8 border border-slate-200 shadow-sm">
                        <h2 className="text-2xl font-bold mb-2 text-center">How It Works</h2>
                        <p className="text-slate-600 mb-10 text-center">Apply for your visa in 3 simple steps</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            {[
                                { step: '01', icon: 'fact_check', title: 'Check Eligibility', desc: 'Enter your nationality and destination to instantly see visa requirements and eligibility.' },
                                { step: '02', icon: 'upload_file', title: 'Submit Documents', desc: 'Upload your passport, photos, and supporting documents through our secure portal.' },
                                { step: '03', icon: 'verified', title: 'Get Your Visa', desc: 'Track your application in real-time and receive your visa decision directly.' },
                            ].map((item, i) => (
                                <div key={i} className="flex flex-col items-center text-center">
                                    <div className="w-16 h-16 rounded-full bg-[#1152d4]/10 flex items-center justify-center mb-4 text-[#1152d4]">
                                        <span className="material-symbols-outlined text-3xl">{item.icon}</span>
                                    </div>
                                    <span className="text-xs font-black text-[#1152d4] uppercase tracking-widest mb-2">Step {item.step}</span>
                                    <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                                    <p className="text-sm text-slate-600">{item.desc}</p>
                                </div>
                            ))}
                        </div>
                        <div className="mt-10 text-center">
                            <Link
                                to="/visa/apply"
                                className="inline-flex items-center gap-2 px-8 py-3 bg-[#1152d4] text-white rounded-lg font-bold text-base shadow-md hover:bg-[#0e42b0] transition-all"
                            >
                                Start Your Application
                                <span className="material-symbols-outlined">arrow_forward</span>
                            </Link>
                        </div>
                    </section>

                    {/* CTA Banner */}
                    <section className="mb-16 bg-[#1152d4] rounded-xl p-8 md:p-12 text-white text-center">
                        <h2 className="text-3xl font-black mb-3">Need Help with Your Documents?</h2>
                        <p className="text-white/80 text-lg mb-8 max-w-xl mx-auto">
                            Our expert consultants are available 24/7 to guide you through the visa and document services process.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link
                                to="/visa/documents"
                                className="px-8 py-3 bg-white text-[#1152d4] rounded-lg font-bold hover:bg-white/90 transition-colors"
                            >
                                Document Services
                            </Link>
                            <Link
                                to="/contact"
                                className="px-8 py-3 bg-white/10 text-white border border-white/30 rounded-lg font-bold hover:bg-white/20 transition-colors"
                            >
                                Contact an Expert
                            </Link>
                        </div>
                    </section>

                </div>
            </div>

            <Footer />

            {/* Google Material Symbols */}
            <link
                href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
                rel="stylesheet"
            />
        </div>
    );
};

export default VisaLanding;
