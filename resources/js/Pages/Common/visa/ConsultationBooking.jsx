import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../Navbar';
import Footer from '../Footer';

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)
// Screen 23: Consultation Booking Calendar

const ConsultationBooking = () => {
    const [selectedConsultant, setSelectedConsultant] = useState(1);
    const [selectedDate, setSelectedDate] = useState(13);
    const [selectedTime, setSelectedTime] = useState('10:30 AM');

    const consultants = [
        { id: 1, role: 'Student Visa Expert', name: 'Sarah Miller', img: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah' },
        { id: 2, role: 'Work Permit Pro', name: 'David Chen', img: 'https://api.dicebear.com/7.x/avataaars/svg?seed=David' },
        { id: 3, role: 'Tourist Visa Lead', name: 'Elena Rodriguez', img: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Elena' },
        { id: 4, role: 'Investor Specialist', name: 'James Wilson', img: 'https://api.dicebear.com/7.x/avataaars/svg?seed=James' }
    ];

    const timeSlots = [
        { time: '09:00 AM', available: true },
        { time: '10:30 AM', available: true },
        { time: '12:00 PM', available: true },
        { time: '01:30 PM', available: true },
        { time: '03:00 PM', available: false },
        { time: '04:30 PM', available: true },
        { time: '06:00 PM', available: true },
        { time: '07:30 PM', available: true }
    ];

    const activeConsultant = consultants.find(c => c.id === selectedConsultant);

    return (
        <div className="min-h-screen bg-[#f6f6f8] font-sans text-slate-900">
            <Navbar forceScrolled={true} />
            <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />

            <main className="max-w-7xl mx-auto px-6 py-8 pt-24">
                {/* Breadcrumbs */}
                <nav className="flex items-center gap-2 mb-6 text-sm text-slate-500">
                    <Link to="/visa" className="hover:text-[#1152d4] no-underline">Visa & Documents</Link>
                    <span className="material-symbols-outlined text-sm">chevron_right</span>
                    <span className="text-slate-900 font-bold">Book a Consultation</span>
                </nav>

                {/* Quick Nav */}
                <div className="flex flex-wrap gap-2 mb-8">
                    <Link to="/visa" className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-[#1152d4]/10 hover:text-[#1152d4] transition-all no-underline">
                        <span className="material-symbols-outlined text-sm">home</span>Visa Home
                    </Link>
                    <Link to="/visa/apply" className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-[#1152d4]/10 hover:text-[#1152d4] transition-all no-underline">
                        <span className="material-symbols-outlined text-sm">edit_document</span>Apply
                    </Link>
                    <Link to="/visa/track" className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-[#1152d4]/10 hover:text-[#1152d4] transition-all no-underline">
                        <span className="material-symbols-outlined text-sm">search</span>Track
                    </Link>
                    <Link to="/visa/status" className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-[#1152d4]/10 hover:text-[#1152d4] transition-all no-underline">
                        <span className="material-symbols-outlined text-sm">dashboard</span>My Status
                    </Link>
                    <Link to="/visa/documents" className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-[#1152d4]/10 hover:text-[#1152d4] transition-all no-underline">
                        <span className="material-symbols-outlined text-sm">folder_open</span>Documents
                    </Link>
                </div>

                {/* Hero */}
                <div className="mb-8">
                    <h1 className="text-4xl font-black tracking-tight text-slate-900">Schedule a Video Consultation</h1>
                    <p className="text-slate-500 text-lg max-w-2xl mt-2 font-medium">Select your preferred consultant, date, and time to start your visa application process with our certified experts.</p>
                </div>

                {/* Consultant Selection */}
                <div className="mb-10 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="flex overflow-x-auto no-scrollbar gap-2 p-1">
                        {consultants.map(c => (
                            <button
                                key={c.id}
                                onClick={() => setSelectedConsultant(c.id)}
                                className={`flex flex-col items-center min-w-[180px] p-5 rounded-xl transition-all border-2 ${selectedConsultant === c.id
                                    ? 'bg-[#1152d4]/5 border-[#1152d4] text-[#1152d4]'
                                    : 'border-transparent hover:bg-slate-50 text-slate-600'
                                    }`}
                            >
                                <div className={`size-16 rounded-full mb-3 border-2 overflow-hidden ${selectedConsultant === c.id ? 'border-[#1152d4]' : 'border-slate-100'}`}>
                                    <img src={c.img} alt={c.name} className="w-full h-full object-cover" />
                                </div>
                                <p className="text-sm font-black text-center leading-tight">{c.role}</p>
                                <p className="text-xs font-medium opacity-70 mt-1">{c.name}</p>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Left: Calendar & Time */}
                    <div className="lg:col-span-8 space-y-8">
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="grid grid-cols-1 md:grid-cols-2">
                                {/* Calendar Mock */}
                                <div className="p-8 border-r border-slate-100">
                                    <div className="flex items-center justify-between mb-8">
                                        <h3 className="font-black text-slate-900">October 2024</h3>
                                        <div className="flex gap-1">
                                            <button className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"><span className="material-symbols-outlined">chevron_left</span></button>
                                            <button className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"><span className="material-symbols-outlined">chevron_right</span></button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-slate-400 mb-4 uppercase tracking-[0.1em]">
                                        <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
                                    </div>
                                    <div className="grid grid-cols-7 gap-1">
                                        {[...Array(31)].map((_, i) => {
                                            const day = i + 1;
                                            return (
                                                <button
                                                    key={day}
                                                    onClick={() => setSelectedDate(day)}
                                                    className={`p-2.5 text-xs font-bold rounded-xl transition-all ${selectedDate === day
                                                        ? 'bg-[#1152d4] text-white shadow-lg shadow-[#1152d4]/30 scale-110'
                                                        : 'hover:bg-slate-100 text-slate-700'
                                                        }`}
                                                >
                                                    {day}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Time Slots */}
                                <div className="p-8 bg-slate-50/50">
                                    <h3 className="font-black text-slate-900 mb-8">Available Time Slots</h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        {timeSlots.map(({ time, available }) => (
                                            <button
                                                key={time}
                                                disabled={!available}
                                                onClick={() => setSelectedTime(time)}
                                                className={`py-3.5 px-4 rounded-xl text-xs font-black transition-all border-2 ${!available
                                                    ? 'bg-slate-100 text-slate-300 border-transparent line-through cursor-not-allowed'
                                                    : selectedTime === time
                                                        ? 'bg-[#1152d4] text-white border-[#1152d4] shadow-lg shadow-[#1152d4]/20'
                                                        : 'bg-white border-slate-100 text-slate-700 hover:border-[#1152d4] hover:text-[#1152d4]'
                                                    }`}
                                            >
                                                {time}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="mt-10 pt-6 border-t border-slate-200">
                                        <p className="text-[10px] text-slate-500 font-bold flex items-center gap-2 uppercase tracking-wide">
                                            <span className="material-symbols-outlined text-sm text-[#1152d4]">info_i</span>
                                            Timezone: GMT+5:30 (India Standard Time)
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Steps */}
                        <div className="bg-[#1152d4]/5 rounded-2xl p-8 border border-[#1152d4]/10">
                            <h3 className="text-xl font-black text-slate-900 mb-8">How it works</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left">
                                {[
                                    { step: 1, title: 'Pick your expert', desc: 'Choose a consultant based on your visa type and their specific expertise.' },
                                    { step: 2, title: 'Select date & time', desc: 'Find a slot that fits your schedule. Our experts are available globally.' },
                                    { step: 3, title: 'Get your link', desc: 'After booking, you\'ll receive a secure video link via email for your call.' }
                                ].map(({ step, title, desc }) => (
                                    <div key={step} className="flex flex-col items-center md:items-start gap-4">
                                        <div className="size-10 rounded-full bg-[#1152d4] text-white flex items-center justify-center font-black shadow-lg shadow-[#1152d4]/20">{step}</div>
                                        <div>
                                            <h4 className="font-black text-slate-900 mb-1">{title}</h4>
                                            <p className="text-[11px] font-medium text-slate-500 leading-relaxed uppercase tracking-wider">{desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Sidebar Summary */}
                    <div className="lg:col-span-4 sticky top-24">
                        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-8">
                            <h3 className="text-xl font-black text-slate-900 mb-8">Booking Summary</h3>
                            <div className="space-y-4 mb-10">
                                <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <img src={activeConsultant?.img} alt={activeConsultant?.name} className="size-12 rounded-full border-2 border-white shadow-sm" />
                                    <div>
                                        <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest leading-none mb-1">Expert</p>
                                        <p className="text-slate-900 font-black leading-tight">{activeConsultant?.name}</p>
                                        <p className="text-[10px] text-[#1152d4] font-black uppercase mt-0.5">{activeConsultant?.role}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <div className="size-12 rounded-2xl bg-[#1152d4]/10 flex items-center justify-center text-[#1152d4]">
                                        <span className="material-symbols-outlined text-3xl">calendar_today</span>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest leading-none mb-1">Schedule</p>
                                        <p className="text-slate-900 font-black leading-tight">Oct {selectedDate}, 2024</p>
                                        <p className="text-[10px] text-slate-500 font-black uppercase mt-0.5">{selectedTime} (45 min)</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <div className="size-12 rounded-2xl bg-[#1152d4]/10 flex items-center justify-center text-[#1152d4]">
                                        <span className="material-symbols-outlined text-3xl">videocam</span>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest leading-none mb-1">Platform</p>
                                        <p className="text-slate-900 font-black leading-tight">Video Consultation</p>
                                        <p className="text-[10px] text-slate-500 font-black uppercase mt-0.5">Secure Link Provided</p>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-slate-100 pt-8 space-y-6">
                                <div className="flex justify-between items-center bg-[#1152d4]/5 p-4 rounded-2xl">
                                    <span className="text-slate-600 font-bold uppercase text-xs tracking-widest">Total Amount</span>
                                    <span className="text-2xl font-black text-[#1152d4]">$49.00</span>
                                </div>
                                <button className="w-full py-5 bg-[#1152d4] text-white rounded-2xl font-black text-lg hover:bg-[#0e42b0] hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-[#1152d4]/30">
                                    Confirm Booking
                                </button>
                                <p className="text-center text-[10px] text-slate-400 px-6 font-bold uppercase tracking-wide">
                                    Full refund for cancellations made 24h prior to appointment.
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 p-5 rounded-2xl border border-slate-200 bg-white shadow-sm flex items-center gap-3">
                            <span className="material-symbols-outlined text-green-500 text-2xl">verified_user</span>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Secure Checkout via Stripe</span>
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default ConsultationBooking;
