import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../Navbar';
import Footer from '../Footer';

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)
// Screen: Document Services Request Portal (e3bb2559089d4e2681d27d454206aa97)

const DocumentServices = () => {
    const navigate = useNavigate();
    const [selectedService, setSelectedService] = useState('');
    const [urgency, setUrgency] = useState('standard');
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        phone: '',
        passportExpiry: '',
        travelDateFrom: '',
        travelDateTo: '',
        notes: '',
    });

    const services = [
        {
            id: 'passport_renewal',
            icon: 'menu_book',
            title: 'Passport Renewal',
            description: 'Renew your expiring passport with expert assistance. We handle all paperwork and embassy submissions.',
            fee: '$89',
            processingTime: '2-4 weeks',
            fields: ['passportExpiry'],
        },
        {
            id: 'travel_insurance',
            icon: 'health_and_safety',
            title: 'Travel Insurance',
            description: 'Comprehensive travel insurance covering medical emergencies, trip cancellations, and lost baggage.',
            fee: '$45',
            processingTime: 'Instant',
            fields: ['travelDateFrom', 'travelDateTo'],
        },
        {
            id: 'document_attestation',
            icon: 'verified',
            title: 'Document Attestation',
            description: 'Official attestation and apostille services for legal documents required for international use.',
            fee: '$65',
            processingTime: '3-5 days',
            fields: [],
        },
        {
            id: 'translation',
            icon: 'translate',
            title: 'Document Translation',
            description: 'Certified translation of official documents by accredited translators for visa and legal purposes.',
            fee: '$35',
            processingTime: '1-2 days',
            fields: [],
        },
        {
            id: 'photo_service',
            icon: 'account_box',
            title: 'Visa Photo Service',
            description: 'Compliant passport and visa photos meeting all embassy specifications, delivered digitally.',
            fee: '$15',
            processingTime: 'Same day',
            fields: [],
        },
        {
            id: 'itinerary',
            icon: 'flight_takeoff',
            title: 'Travel Itinerary',
            description: 'Official travel itinerary letter for visa applications, showing your planned travel dates and routes.',
            fee: '$25',
            processingTime: '24 hours',
            fields: ['travelDateFrom', 'travelDateTo'],
        },
    ];

    const urgencyOptions = [
        { id: 'standard', label: 'Standard', time: '3-5 business days', price: 'Included', color: 'border-slate-200' },
        { id: 'express', label: 'Express', time: '1-2 business days', price: '+$30', color: 'border-amber-300' },
        { id: 'same_day', label: 'Same Day', time: 'Within 24 hours', price: '+$75', color: 'border-red-300' },
    ];

    const selectedServiceData = services.find(s => s.id === selectedService);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!selectedService) {
            alert('Please select a service type.');
            return;
        }
        // Navigate to confirmation or process the request
        navigate('/visa/apply');
    };

    return (
        <div className="min-h-screen bg-[#f6f6f8] font-sans text-slate-900">
            <Navbar forceScrolled={true} />

            {/* Google Material Symbols */}
            <link
                href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
                rel="stylesheet"
            />

            <div className="px-4 md:px-10 lg:px-40 flex flex-1 justify-center py-8 pt-24">
                <div className="flex flex-col w-full max-w-[1200px] flex-1">

                    {/* Page Header */}
                    <div className="mb-10">
                        <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
                            <Link to="/visa" className="hover:text-[#1152d4] transition-colors">Visa & Documents</Link>
                            <span className="material-symbols-outlined text-xs">chevron_right</span>
                            <span className="text-slate-900 font-medium">Document Services</span>
                        </div>
                        <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight mb-3">
                            Document Services
                        </h1>
                        <p className="text-slate-600 text-lg max-w-2xl">
                            Professional document services for all your international travel needs. Select a service below to get started.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                        {/* Left: Service Selection */}
                        <div className="lg:col-span-2 space-y-6">

                            {/* Service Cards */}
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[#1152d4]">category</span>
                                    Select Service Type
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {services.map((service) => (
                                        <button
                                            key={service.id}
                                            onClick={() => setSelectedService(service.id)}
                                            className={`text-left p-5 rounded-xl border-2 transition-all ${selectedService === service.id
                                                ? 'border-[#1152d4] bg-[#1152d4]/5'
                                                : 'border-slate-200 hover:border-[#1152d4]/40 hover:bg-slate-50'
                                                }`}
                                        >
                                            <div className="flex items-start gap-4">
                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${selectedService === service.id ? 'bg-[#1152d4] text-white' : 'bg-[#1152d4]/10 text-[#1152d4]'
                                                    }`}>
                                                    <span className="material-symbols-outlined text-xl">{service.icon}</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2 mb-1">
                                                        <h3 className="font-bold text-slate-900 text-sm">{service.title}</h3>
                                                        <span className="text-[#1152d4] font-black text-sm shrink-0">{service.fee}</span>
                                                    </div>
                                                    <p className="text-xs text-slate-500 leading-relaxed">{service.description}</p>
                                                    <div className="mt-2 flex items-center gap-1 text-xs text-slate-400">
                                                        <span className="material-symbols-outlined text-xs">schedule</span>
                                                        {service.processingTime}
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Urgency Selection */}
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[#1152d4]">speed</span>
                                    Processing Speed
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {urgencyOptions.map((option) => (
                                        <button
                                            key={option.id}
                                            onClick={() => setUrgency(option.id)}
                                            className={`p-4 rounded-xl border-2 text-left transition-all ${urgency === option.id
                                                ? `${option.color} bg-slate-50`
                                                : 'border-slate-200 hover:border-slate-300'
                                                }`}
                                        >
                                            <div className="font-bold text-slate-900 mb-1">{option.label}</div>
                                            <div className="text-xs text-slate-500 mb-2">{option.time}</div>
                                            <div className={`text-sm font-bold ${urgency === option.id ? 'text-[#1152d4]' : 'text-slate-600'}`}>
                                                {option.price}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Contact Form */}
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[#1152d4]">person</span>
                                    Your Information
                                </h2>
                                <form onSubmit={handleSubmit} className="space-y-5">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-2">Full Name *</label>
                                            <input
                                                type="text"
                                                required
                                                value={formData.fullName}
                                                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                                className="w-full rounded-lg border border-slate-300 h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]"
                                                placeholder="As shown on passport"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-2">Email Address *</label>
                                            <input
                                                type="email"
                                                required
                                                value={formData.email}
                                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                className="w-full rounded-lg border border-slate-300 h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]"
                                                placeholder="your@email.com"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-2">Phone Number</label>
                                            <input
                                                type="tel"
                                                value={formData.phone}
                                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                                className="w-full rounded-lg border border-slate-300 h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]"
                                                placeholder="+1 (555) 000-0000"
                                            />
                                        </div>

                                        {/* Conditional fields based on service */}
                                        {selectedServiceData?.fields.includes('passportExpiry') && (
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Current Passport Expiry Date *</label>
                                                <input
                                                    type="date"
                                                    value={formData.passportExpiry}
                                                    onChange={(e) => setFormData({ ...formData, passportExpiry: e.target.value })}
                                                    className="w-full rounded-lg border border-slate-300 h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]"
                                                />
                                            </div>
                                        )}
                                        {selectedServiceData?.fields.includes('travelDateFrom') && (
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Travel Start Date *</label>
                                                <input
                                                    type="date"
                                                    value={formData.travelDateFrom}
                                                    onChange={(e) => setFormData({ ...formData, travelDateFrom: e.target.value })}
                                                    className="w-full rounded-lg border border-slate-300 h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]"
                                                />
                                            </div>
                                        )}
                                        {selectedServiceData?.fields.includes('travelDateTo') && (
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Travel End Date *</label>
                                                <input
                                                    type="date"
                                                    value={formData.travelDateTo}
                                                    onChange={(e) => setFormData({ ...formData, travelDateTo: e.target.value })}
                                                    className="w-full rounded-lg border border-slate-300 h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">Additional Notes</label>
                                        <textarea
                                            value={formData.notes}
                                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                            rows={3}
                                            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4] resize-none"
                                            placeholder="Any special requirements or additional information..."
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        className="w-full flex items-center justify-center gap-2 py-3 bg-[#1152d4] text-white rounded-lg font-bold text-base shadow-md hover:bg-[#0e42b0] transition-all"
                                    >
                                        <span className="material-symbols-outlined">send</span>
                                        Request Service
                                    </button>
                                </form>
                            </div>
                        </div>

                        {/* Right: Summary Sidebar */}
                        <div className="space-y-6">

                            {/* Order Summary */}
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sticky top-24">
                                <h3 className="text-lg font-bold mb-5 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[#1152d4]">receipt</span>
                                    Order Summary
                                </h3>

                                {selectedServiceData ? (
                                    <div className="space-y-4">
                                        <div className="flex items-start gap-3 p-3 bg-[#1152d4]/5 rounded-lg">
                                            <span className="material-symbols-outlined text-[#1152d4]">{selectedServiceData.icon}</span>
                                            <div>
                                                <p className="font-bold text-sm">{selectedServiceData.title}</p>
                                                <p className="text-xs text-slate-500">{selectedServiceData.processingTime}</p>
                                            </div>
                                        </div>

                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-slate-600">Service fee</span>
                                                <span className="font-bold">{selectedServiceData.fee}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-slate-600">Processing ({urgencyOptions.find(u => u.id === urgency)?.label})</span>
                                                <span className="font-bold">{urgencyOptions.find(u => u.id === urgency)?.price}</span>
                                            </div>
                                            <div className="border-t border-slate-200 pt-2 flex justify-between font-black text-base">
                                                <span>Total</span>
                                                <span className="text-[#1152d4]">
                                                    {selectedServiceData.fee}
                                                    {urgency !== 'standard' && ` + ${urgencyOptions.find(u => u.id === urgency)?.price}`}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-slate-400">
                                        <span className="material-symbols-outlined text-4xl mb-2 block">category</span>
                                        <p className="text-sm">Select a service to see pricing</p>
                                    </div>
                                )}

                                <div className="mt-6 p-4 bg-green-50 border border-green-100 rounded-lg">
                                    <div className="flex items-center gap-2 text-green-700 font-bold text-sm mb-1">
                                        <span className="material-symbols-outlined text-sm">verified_user</span>
                                        Secure & Confidential
                                    </div>
                                    <p className="text-xs text-green-600">All documents are handled with strict confidentiality and deleted after processing.</p>
                                </div>
                            </div>

                            {/* Quick Links */}
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                                <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[#1152d4]">explore</span>
                                    Quick Links
                                </h3>
                                <div className="space-y-2">
                                    <Link to="/visa/booking" className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#1152d4]/5 transition-colors no-underline group">
                                        <span className="material-symbols-outlined text-[#1152d4] text-lg">calendar_month</span>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900 group-hover:text-[#1152d4]">Book Consultation</p>
                                            <p className="text-xs text-slate-500">Speak with a visa expert</p>
                                        </div>
                                    </Link>
                                    <Link to="/visa/track" className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#1152d4]/5 transition-colors no-underline group">
                                        <span className="material-symbols-outlined text-[#1152d4] text-lg">search</span>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900 group-hover:text-[#1152d4]">Track Application</p>
                                            <p className="text-xs text-slate-500">Check your visa status</p>
                                        </div>
                                    </Link>
                                    <Link to="/visa/apply" className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#1152d4]/5 transition-colors no-underline group">
                                        <span className="material-symbols-outlined text-[#1152d4] text-lg">edit_document</span>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900 group-hover:text-[#1152d4]">Apply for Visa</p>
                                            <p className="text-xs text-slate-500">Start a new application</p>
                                        </div>
                                    </Link>
                                </div>
                            </div>

                            {/* Need Help */}
                            <div className="bg-[#1152d4] rounded-xl p-6 text-white">
                                <h3 className="font-bold mb-2 flex items-center gap-2">
                                    <span className="material-symbols-outlined">support_agent</span>
                                    Need Expert Help?
                                </h3>
                                <p className="text-white/80 text-sm mb-4">Our visa consultants are available 24/7 to assist you.</p>
                                <Link
                                    to="/contact"
                                    className="block text-center py-2 bg-white text-[#1152d4] rounded-lg font-bold text-sm hover:bg-white/90 transition-colors"
                                >
                                    Chat with an Expert
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <Footer />
        </div>
    );
};

export default DocumentServices;
