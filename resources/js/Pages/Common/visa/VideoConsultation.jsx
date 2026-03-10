import React, { useState } from 'react';
import { Link } from 'react-router-dom';

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)
// Screen 17: Shared Form Review with Secure e-Signature

const VideoConsultation = () => {
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [signed, setSigned] = useState(false);
    const [zoom, setZoom] = useState(100);
    const [message, setMessage] = useState('');

    return (
        <div className="flex h-screen bg-[#f8fafc] font-sans text-slate-900 overflow-hidden relative">
            <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
            <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap" rel="stylesheet" />

            {/* Signature Overlay */}
            {showSignatureModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-md transition-all">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl border border-white overflow-hidden flex flex-col scale-100 transition-all">
                        <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-[#1152d4]/10 text-[#1152d4] rounded-2xl">
                                    <span className="material-symbols-outlined text-2xl">draw</span>
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-slate-900 uppercase tracking-tighter leading-none">Secure e-Signature</h2>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">DS-160 Nonimmigrant Visa Application</p>
                                </div>
                            </div>
                            <button onClick={() => setShowSignatureModal(false)} className="p-2 text-slate-300 hover:text-slate-900 transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-8 flex-1 flex flex-col gap-8">
                            <div className="flex gap-6 border-b border-slate-100">
                                <button className="pb-4 px-2 text-[10px] font-black uppercase tracking-widest text-[#1152d4] border-b-2 border-[#1152d4]">Draw</button>
                                <button className="pb-4 px-2 text-[10px] font-black uppercase tracking-widest text-slate-300">Type</button>
                            </div>
                            <div className="flex-1 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] flex items-center justify-center min-h-[220px] relative cursor-crosshair group hover:bg-white transition-all">
                                <span className="absolute top-6 left-8 text-[9px] font-black text-slate-300 uppercase tracking-[0.2em]">Sign Here</span>
                                <div className="absolute inset-x-12 bottom-12 border-b-2 border-slate-200"></div>
                                <span className="absolute bottom-10 left-12 text-xs font-black text-slate-200 italic">X</span>
                                <div className="text-slate-200 flex flex-col items-center gap-3">
                                    <span className="material-symbols-outlined text-5xl">gesture</span>
                                    <p className="text-[10px] font-bold uppercase tracking-widest">Draw your signature</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4 bg-blue-50/50 p-5 rounded-2xl border border-blue-50">
                                <span className="material-symbols-outlined text-[#1152d4] text-xl mt-0.5">verified_user</span>
                                <p className="text-[10px] text-blue-800/70 font-medium leading-relaxed">By signing, you agree this electronic signature is the legally binding equivalent of your handwritten signature.</p>
                            </div>
                        </div>
                        <div className="px-8 py-6 border-t border-slate-50 flex justify-end gap-3 bg-slate-50/50">
                            <button onClick={() => setShowSignatureModal(false)} className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900">Cancel</button>
                            <button
                                onClick={() => { setSigned(true); setShowSignatureModal(false); }}
                                className="px-8 py-3 text-[10px] font-black uppercase tracking-widest text-white bg-[#1152d4] rounded-2xl shadow-xl shadow-[#1152d4]/20 hover:scale-105 transition-all"
                            >
                                Apply Signature
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Wrapper */}
            <div className="flex flex-1 flex-col overflow-hidden">
                {/* Header */}
                <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-8 shrink-0 z-40">
                    <div className="flex items-center gap-4">
                        <Link to="/visa" className="flex items-center gap-2 text-[#1152d4] font-black text-xl no-underline uppercase tracking-tighter">
                            <span className="material-symbols-outlined text-2xl">flight_takeoff</span>JetSetters
                        </Link>
                        <div className="h-6 w-px bg-slate-100 hidden sm:block"></div>
                        <Link to="/visa" className="text-[10px] font-black uppercase tracking-widest text-slate-400 no-underline hover:text-[#1152d4] transition-colors hidden sm:flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">arrow_back</span>
                            Back to Visa Services
                        </Link>
                        <div className="h-6 w-px bg-slate-100 hidden sm:block"></div>
                        <div className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest ring-1 ring-red-100">
                            <span className="size-1.5 rounded-full bg-red-500 animate-pulse"></span>
                            LIVE SESSION
                        </div>
                    </div>
                    <div className="flex items-center gap-8">
                        <div className="text-right flex flex-col gap-1">
                            <p className="text-[9px] text-slate-300 font-black uppercase tracking-widest">Consultant</p>
                            <p className="text-[11px] font-black text-slate-900 uppercase">Sarah Jenkins</p>
                        </div>
                        <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah" className="size-10 rounded-2xl border-2 border-[#1152d4]/10 shadow-sm" alt="S" />
                    </div>
                </header>

                <main className="flex-1 overflow-hidden p-6 gap-6 bg-[#f8f9fc] flex">
                    {/* Left: Shared Review Area */}
                    <div className="flex-1 flex flex-col gap-6 relative">
                        {/* Control Bar */}
                        <div className="bg-white/80 backdrop-blur-md rounded-3xl shadow-xl border border-white p-4 flex items-center justify-between z-20">
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-[#1152d4]/5 rounded-xl text-[#1152d4]">
                                        <span className="material-symbols-outlined text-xl">description</span>
                                    </div>
                                    <div>
                                        <h3 className="text-[11px] font-black text-slate-900 uppercase">DS-160 Nonimmigrant Visa</h3>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Applicant: Johnathan Doe</p>
                                    </div>
                                </div>
                                <div className="h-8 w-px bg-slate-100"></div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-black bg-amber-50 text-amber-600 px-3 py-1.5 rounded-xl uppercase tracking-widest flex items-center gap-2 border border-amber-100">
                                        <span className="size-1.5 rounded-full bg-amber-500 animate-pulse"></span> Shared Review
                                    </span>
                                    {!signed && (
                                        <span className="text-[9px] font-black bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-xl uppercase tracking-widest flex items-center gap-2 border border-emerald-100">
                                            <span className="material-symbols-outlined text-xs">verified</span> Ready to Sign
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="flex items-center bg-slate-50 rounded-2xl p-1 border border-slate-100">
                                    <button onClick={() => setZoom(z => Math.max(50, z - 10))} className="p-1.5 text-slate-300 hover:text-slate-900 rounded-xl transition-all"><span className="material-symbols-outlined text-lg">remove</span></button>
                                    <span className="text-[10px] font-black px-3 w-12 text-center text-slate-500">{zoom}%</span>
                                    <button onClick={() => setZoom(z => Math.min(200, z + 10))} className="p-1.5 text-slate-300 hover:text-slate-900 rounded-xl transition-all"><span className="material-symbols-outlined text-lg">add</span></button>
                                </div>
                                {!signed && (
                                    <button onClick={() => setShowSignatureModal(true)} className="px-6 py-2.5 bg-[#1152d4] text-white text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-[#1152d4]/20 hover:scale-105 transition-all animate-pulse">
                                        Apply Signature
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Document Viewer */}
                        <div className="flex-1 bg-slate-200 rounded-[2.5rem] border border-slate-100 overflow-hidden relative flex justify-center p-12 overflow-y-auto custom-scrollbar shadow-inner">
                            <div
                                style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
                                className="bg-white w-full max-w-2xl shadow-[0_50px_100px_-20px_rgba(0,0,0,0.1)] border border-white relative p-16 pb-48 text-slate-800 flex flex-col gap-10 aspect-[1/1.41] shrink-0"
                            >
                                <div className="text-center border-b-2 border-slate-900 pb-10">
                                    <h1 className="text-2xl font-black tracking-tight uppercase leading-none mb-3">U.S. Department of State</h1>
                                    <h2 className="text-lg font-bold tracking-widest uppercase opacity-60">Nonimmigrant Visa Application</h2>
                                    <p className="text-[9px] font-mono text-slate-400 mt-4 uppercase tracking-[0.3em]">OMB CONTROL NO. 1405-0182</p>
                                </div>

                                <div className="grid grid-cols-2 gap-x-12 gap-y-10 text-[11px] relative">
                                    {[
                                        { label: 'Surnames', val: 'DOE' },
                                        { label: 'Given Names', val: 'JOHNATHAN' },
                                        { label: 'Home Address', val: '123 MAIN ST, NEW YORK, NY 10001', full: true },
                                        { label: 'Passport Number', val: 'A123456789' },
                                        { label: 'Expiration Date', val: '05/15/2030' }
                                    ].map(field => (
                                        <div key={field.label} className={field.full ? 'col-span-2' : ''}>
                                            <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest block mb-2">{field.label}</label>
                                            <div className="border-b border-slate-100 pb-2 font-mono font-bold text-slate-900 tracking-tight">{field.val}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Signature Block */}
                                <div className="absolute bottom-20 left-16 right-16 border-t-2 border-slate-900 pt-10 flex justify-between items-end">
                                    <div className="flex flex-col gap-3">
                                        <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none">Applicant Signature</label>
                                        <div
                                            onClick={() => !signed && setShowSignatureModal(true)}
                                            className={`relative w-72 h-24 border-b-2 border-slate-200 flex items-center justify-center transition-all group ${!signed ? 'cursor-pointer' : ''}`}
                                        >
                                            {!signed ? (
                                                <div className="absolute inset-0 bg-yellow-50/50 border-2 border-dashed border-yellow-200 flex items-center justify-center rounded-2xl group-hover:bg-yellow-100/50 transition-all text-yellow-600">
                                                    <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-lg">draw</span> Click to sign
                                                    </span>
                                                </div>
                                            ) : (
                                                <p className="font-signature text-4xl text-[#1152d4] opacity-80 rotate-[-1deg] select-none">Johnathan Doe</p>
                                            )}
                                            <span className="absolute -left-6 bottom-3 text-xs font-black text-slate-200">X</span>
                                        </div>
                                    </div>
                                    <div className="text-right flex flex-col gap-3">
                                        <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none">Date Signed</label>
                                        <div className="w-32 h-10 border-b-2 border-slate-200 flex items-end justify-center pb-2 font-mono text-xs font-bold text-slate-900">
                                            10/24/2023
                                        </div>
                                    </div>
                                </div>

                                {/* Shared Cursors */}
                                <div className="absolute bottom-64 right-48 z-20 pointer-events-none transition-all duration-300 ease-out translate-x-12 translate-y-8">
                                    <span className="material-symbols-outlined text-[#1152d4] text-xl drop-shadow-md">near_me</span>
                                    <div className="bg-[#1152d4] text-white text-[9px] font-black px-2 py-0.5 rounded shadow-xl whitespace-nowrap mt-1 ml-4 border border-[#1152d4]">John (You)</div>
                                </div>
                                <div className="absolute bottom-40 left-64 z-20 pointer-events-none transition-all duration-500 ease-out translate-x-[-20px]">
                                    <span className="material-symbols-outlined text-rose-500 text-xl drop-shadow-md">near_me</span>
                                    <div className="bg-rose-500 text-white text-[9px] font-black px-2 py-0.5 rounded shadow-xl whitespace-nowrap mt-1 ml-4 border border-rose-600">Sarah J.</div>
                                </div>
                            </div>

                            {/* Call Controls Overlay */}
                            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-xl border border-white/10 p-2.5 rounded-[2rem] shadow-2xl flex items-center gap-2 z-40 transition-all hover:scale-105">
                                <button className="size-12 rounded-2xl bg-white/5 flex items-center justify-center text-white hover:bg-white/10 transition-colors"><span className="material-symbols-outlined">mic</span></button>
                                <button className="size-12 rounded-2xl bg-white/5 flex items-center justify-center text-white hover:bg-white/10 transition-colors"><span className="material-symbols-outlined">videocam</span></button>
                                <button className="size-12 rounded-2xl bg-[#1152d4] text-white flex items-center justify-center shadow-xl shadow-[#1152d4]/20"><span className="material-symbols-outlined">screen_share</span></button>
                                <div className="w-px h-6 bg-white/10 mx-2"></div>
                                <button className="px-6 h-12 rounded-2xl bg-red-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-red-600 transition-all shadow-xl shadow-red-500/20 active:scale-95">
                                    <span className="material-symbols-outlined text-xl">call_end</span> End Session
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Right: Sidebar */}
                    <div className="w-80 flex flex-col gap-6 shrink-0">
                        {/* Video Feeds */}
                        <div className="flex flex-col gap-3">
                            <div className="h-44 rounded-[2rem] overflow-hidden bg-slate-900 relative border-2 border-white shadow-xl group">
                                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah" className="absolute inset-0 w-full h-full object-cover scale-150" alt="V" />
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-5 flex items-center justify-between">
                                    <span className="text-[10px] text-white font-black uppercase tracking-widest leading-none">Sarah Jenkins</span>
                                    <div className="size-5 rounded-lg bg-white/10 flex items-center justify-center backdrop-blur-md"><span className="material-symbols-outlined text-xs text-white">mic</span></div>
                                </div>
                            </div>
                            <div className="h-44 rounded-[2rem] overflow-hidden bg-slate-900 relative border border-slate-100 shadow-md">
                                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=John" className="absolute inset-0 w-full h-full object-cover scale-150" alt="V" />
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-5">
                                    <span className="text-[10px] text-white font-black uppercase tracking-widest leading-none">You (Live)</span>
                                </div>
                            </div>
                        </div>

                        {/* Status Widget */}
                        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden shadow-emerald-600/5">
                            <div className="p-4 bg-emerald-50 border-b border-emerald-50 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-emerald-600 font-black text-[9px] uppercase tracking-widest">
                                    <span className="material-symbols-outlined text-base">verified</span> Finalized
                                </div>
                                <span className="text-[8px] font-black text-emerald-400 uppercase">Ready</span>
                            </div>
                            <div className="p-8 flex flex-col items-center text-center gap-4">
                                <div className="size-16 rounded-3xl bg-emerald-100 flex items-center justify-center text-emerald-600 mb-2 rotate-3 shadow-lg shadow-emerald-100/50">
                                    <span className="material-symbols-outlined text-4xl">task</span>
                                </div>
                                <h4 className="text-xs font-black text-slate-900 uppercase leading-tight">Data Confirmed</h4>
                                <p className="text-[10px] font-medium text-slate-400 leading-relaxed px-2">The consultant has verified all fields. Please review and sign.</p>
                            </div>
                        </div>

                        {/* Chat Panel */}
                        <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-100 shadow-xl flex flex-col overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-50 flex items-center gap-3 bg-slate-50/30">
                                <span className="material-symbols-outlined text-lg text-slate-300">lock</span>
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-900">Secure Consultation Chat</h3>
                            </div>
                            <div className="flex-1 p-6 overflow-y-auto space-y-6 custom-scrollbar flex flex-col">
                                <div className="flex flex-col gap-2 items-end">
                                    <div className="bg-[#1152d4] text-white p-4 rounded-3xl rounded-tr-none text-[11px] leading-relaxed shadow-lg shadow-[#1152d4]/20">
                                        I see the highlight on the expiration date. Do I need to renew?
                                    </div>
                                    <span className="text-[8px] font-black text-slate-200 uppercase tracking-widest mr-1">10:16 AM</span>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <div className="bg-slate-50 text-slate-600 p-4 rounded-3xl rounded-tl-none text-[11px] leading-relaxed border border-slate-100 shadow-sm">
                                        Yes, I've updated it based on your copy. Perfect now.
                                    </div>
                                    <span className="text-[8px] font-black text-slate-200 uppercase tracking-widest ml-1">10:18 AM</span>
                                </div>
                                <div className="flex flex-col gap-3">
                                    <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-3xl rounded-tl-none text-[11px] text-emerald-700 leading-relaxed shadow-sm">
                                        <div className="flex items-center gap-2 font-black text-[9px] uppercase tracking-widest mb-2">
                                            <span className="material-symbols-outlined text-base">draw</span> Signature Req
                                        </div>
                                        Click the yellow box at the bottom to sign. I'll stay on the line.
                                    </div>
                                </div>
                            </div>
                            <div className="p-4 bg-slate-50 border-t border-slate-100">
                                <div className="relative bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm transition-all focus-within:ring-4 focus-within:ring-[#1152d4]/5">
                                    <input
                                        className="w-full bg-transparent border-none focus:ring-0 text-[11px] font-medium py-3 pl-5 pr-12 outline-none"
                                        placeholder="Type message..."
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                    />
                                    <button className="absolute right-2 top-1 bottom-1 w-10 flex items-center justify-center text-[#1152d4] hover:bg-[#1152d4]/5 rounded-xl transition-all">
                                        <span className="material-symbols-outlined">send</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>

                <footer className="bg-white border-t border-slate-100 px-8 py-3 flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-slate-300">
                    <div className="flex items-center gap-8">
                        <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-green-500 block animate-pulse"></span> Excellent Connection (18ms)</span>
                        <span className="flex items-center gap-2"><span className="material-symbols-outlined text-xs">lock</span> Encrypted</span>
                    </div>
                    <div className="flex items-center gap-6">
                        <span>#JS-992-004A</span>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default VideoConsultation;
