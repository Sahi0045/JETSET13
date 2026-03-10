import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../Navbar';
import Footer from '../Footer';

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)
// Screen 4: Customer Status Dashboard

const CustomerStatusDashboard = () => {
    const [message, setMessage] = useState('');
    const [chatHistory, setChatHistory] = useState([
        { id: 1, type: 'agent', name: 'Sarah Jenkins', time: '10:15 AM', content: "Hello Mark! I've reviewed your latest documents. Everything looks great, but the embassy requested one more bank statement for clarity." },
        { id: 2, type: 'user', time: '10:22 AM', content: "Thanks Sarah, I just saw the action item. I'll upload it within the next hour." },
        { id: 3, type: 'agent', name: 'Sarah Jenkins', time: '10:25 AM', content: "Perfect. I'll notify the embassy as soon as it's received. Let me know if you have any other questions!" },
        { id: 4, type: 'agent', name: 'Sarah Jenkins', time: '10:26 AM', content: "I've also attached a guide on what to expect at your biometric appointment.", isFile: true, fileName: 'biometric_guide.pdf', fileSize: '1.2 MB' }
    ]);

    const handleSendMessage = (e) => {
        e.preventDefault();
        if (!message.trim()) return;

        const newMessage = {
            id: Date.now(),
            type: 'user',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            content: message
        };

        setChatHistory([...chatHistory, newMessage]);
        setMessage('');
    };

    return (
        <div className="min-h-screen bg-[#f6f6f8] font-sans text-slate-900 flex flex-col overflow-hidden">
            <Navbar forceScrolled={true} />
            <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />

            <div className="flex flex-1 overflow-hidden pt-16">
                {/* Main Content */}
                <main className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-[900px] mx-auto">
                        {/* Quick Nav */}
                        <div className="flex flex-wrap gap-2 mb-6">
                            <Link to="/visa" className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-[#1152d4]/10 hover:text-[#1152d4] transition-all no-underline">
                                <span className="material-symbols-outlined text-sm">home</span>Visa Home
                            </Link>
                            <Link to="/visa/apply" className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-[#1152d4]/10 hover:text-[#1152d4] transition-all no-underline">
                                <span className="material-symbols-outlined text-sm">edit_document</span>Apply
                            </Link>
                            <Link to="/visa/track" className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-[#1152d4]/10 hover:text-[#1152d4] transition-all no-underline">
                                <span className="material-symbols-outlined text-sm">search</span>Track
                            </Link>
                            <Link to="/visa/booking" className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-[#1152d4]/10 hover:text-[#1152d4] transition-all no-underline">
                                <span className="material-symbols-outlined text-sm">calendar_month</span>Book Consultation
                            </Link>
                            <Link to="/visa/documents" className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-[#1152d4]/10 hover:text-[#1152d4] transition-all no-underline">
                                <span className="material-symbols-outlined text-sm">folder_open</span>Documents
                            </Link>
                        </div>

                        <div className="flex justify-between items-end gap-4 mb-8">
                            <div>
                                <h1 className="text-2xl font-black text-slate-900 leading-tight">Application: Tourist Visa - France</h1>
                                <p className="text-slate-500 text-sm mt-1">Application ID: <span className="font-mono text-[#1152d4] font-bold">#V-882910</span> • Submitted on Oct 12, 2023</p>
                            </div>
                            <button className="flex items-center gap-2 h-10 px-4 bg-white border border-slate-200 rounded-lg text-slate-700 text-sm font-bold shadow-sm hover:bg-slate-50">
                                <span className="material-symbols-outlined text-lg">download</span>
                                Download Receipt
                            </button>
                        </div>

                        {/* Progress Stepper */}
                        <div className="bg-white rounded-2xl p-8 mb-8 border border-slate-200 shadow-sm relative overflow-hidden">
                            <div className="flex justify-between items-center relative z-10 font-bold">
                                {/* Applied */}
                                <div className="flex flex-col items-center gap-2">
                                    <div className="size-10 rounded-full bg-[#1152d4] text-white flex items-center justify-center shadow-md">
                                        <span className="material-symbols-outlined text-xl">check</span>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xs">Applied</p>
                                        <p className="text-slate-400 text-[10px]">Oct 12</p>
                                    </div>
                                </div>
                                {/* Progress Line */}
                                <div className="flex-1 h-1 bg-[#1152d4] mx-2 -mt-6"></div>
                                {/* Verified */}
                                <div className="flex flex-col items-center gap-2">
                                    <div className="size-10 rounded-full bg-[#1152d4] text-white flex items-center justify-center shadow-md">
                                        <span className="material-symbols-outlined text-xl">check</span>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xs">Verified</p>
                                        <p className="text-slate-400 text-[10px]">Oct 15</p>
                                    </div>
                                </div>
                                {/* Progress Line Active */}
                                <div className="flex-1 h-1 bg-slate-100 mx-2 -mt-6 overflow-hidden">
                                    <div className="w-1/2 h-full bg-[#1152d4]"></div>
                                </div>
                                {/* Processing */}
                                <div className="flex flex-col items-center gap-2">
                                    <div className="size-12 rounded-full bg-[#1152d4] text-white flex items-center justify-center shadow-xl ring-4 ring-[#1152d4]/10">
                                        <span className="material-symbols-outlined text-2xl">account_balance</span>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xs text-[#1152d4]">Processing</p>
                                        <p className="text-[#1152d4]/70 text-[10px]">Active</p>
                                    </div>
                                </div>
                                {/* Progress Line Empty */}
                                <div className="flex-1 h-1 bg-slate-100 mx-2 -mt-6"></div>
                                {/* Ready */}
                                <div className="flex flex-col items-center gap-2">
                                    <div className="size-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-xl">verified_user</span>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xs text-slate-400">Visa Ready</p>
                                        <p className="text-slate-400 text-[10px]">Est. Oct 30</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Action Items */}
                        <div className="mb-8">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-black text-slate-900">Action Items</h2>
                                <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">2 Pending</span>
                            </div>
                            <div className="space-y-4">
                                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                                    <div className="size-10 bg-[#1152d4]/10 rounded-xl flex items-center justify-center text-[#1152d4]">
                                        <span className="material-symbols-outlined">upload_file</span>
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-slate-900">Upload additional bank statement</p>
                                        <p className="text-xs text-slate-500 mt-0.5">Financial verification required for last 3 months.</p>
                                    </div>
                                    <button className="h-9 px-5 bg-[#1152d4] text-white rounded-lg text-xs font-bold hover:bg-[#0e42b0] transition-colors shadow-lg shadow-[#1152d4]/20">Upload</button>
                                </div>
                                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                                    <div className="size-10 bg-[#1152d4]/10 rounded-xl flex items-center justify-center text-[#1152d4]">
                                        <span className="material-symbols-outlined">calendar_today</span>
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-slate-900">Confirm Biometric Appointment</p>
                                        <p className="text-xs text-slate-500 mt-0.5">Slot reserved for Oct 22, 10:30 AM.</p>
                                    </div>
                                    <button className="h-9 px-5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors">Confirm</button>
                                </div>
                            </div>
                        </div>

                        {/* Info Card */}
                        <div className="bg-[#1152d4]/5 border border-[#1152d4]/20 rounded-2xl p-5 flex gap-4">
                            <span className="material-symbols-outlined text-[#1152d4] text-2xl">info</span>
                            <div>
                                <h4 className="text-sm font-bold text-[#1152d4]">Next Steps</h4>
                                <p className="text-xs text-slate-600 mt-1 leading-relaxed">Once the embassy completes processing, you'll receive an email notification for passport collection or visa grant letter.</p>
                            </div>
                        </div>
                    </div>
                </main>

                {/* Sidebar Chat */}
                <aside className="w-[380px] border-l border-slate-200 bg-white flex flex-col shrink-0">
                    <div className="p-4 border-b border-slate-100 flex items-center gap-3">
                        <div className="relative">
                            <img className="size-10 rounded-full border-2 border-slate-50 shadow-sm" src="https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah" alt="Agent" />
                            <div className="absolute bottom-0 right-0 size-3 bg-green-500 border-2 border-white rounded-full"></div>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-900">Sarah Jenkins</p>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-black uppercase text-green-600 tracking-wider">Online</span>
                                <span className="size-1 bg-slate-300 rounded-full"></span>
                                <span className="text-[10px] font-medium text-slate-500">Assigned Agent</span>
                            </div>
                        </div>
                        <div className="ml-auto flex items-center gap-1 text-slate-400">
                            <button className="p-1 hover:text-[#1152d4]"><span className="material-symbols-outlined text-lg">shield_lock</span></button>
                            <button className="p-1 hover:text-[#1152d4]"><span className="material-symbols-outlined text-lg">more_vert</span></button>
                        </div>
                    </div>

                    <div className="bg-slate-50/80 px-4 py-1.5 flex items-center justify-center gap-2 border-b border-slate-100">
                        <span className="material-symbols-outlined text-slate-400 text-xs">lock</span>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tight">Messages are end-to-end encrypted</p>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {chatHistory.map(msg => (
                            <div key={msg.id} className={`flex flex-col gap-1 max-w-[85%] ${msg.type === 'user' ? 'ml-auto items-end' : ''}`}>
                                <div className={`p-3 rounded-2xl shadow-sm ${msg.type === 'user'
                                    ? 'bg-[#1152d4] text-white rounded-tr-none shadow-[#1152d4]/10'
                                    : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200'
                                    }`}>
                                    <p className="text-sm leading-relaxed">{msg.content}</p>
                                    {msg.isFile && (
                                        <div className="mt-3 bg-white/90 p-2 rounded-xl flex items-center gap-3 border border-slate-100">
                                            <div className="size-9 bg-red-50 text-red-600 rounded-lg flex items-center justify-center">
                                                <span className="material-symbols-outlined">picture_as_pdf</span>
                                            </div>
                                            <div className="overflow-hidden">
                                                <p className="text-[11px] font-bold text-slate-900 truncate">{msg.fileName}</p>
                                                <p className="text-[9px] text-slate-500 uppercase font-black">{msg.fileSize}</p>
                                            </div>
                                            <button className="ml-auto text-[#1152d4] p-1">
                                                <span className="material-symbols-outlined text-lg">download</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 px-1">
                                    <p className="text-[10px] text-slate-400 font-medium">{msg.time}</p>
                                    {msg.type === 'user' && <span className="material-symbols-outlined text-[14px] text-[#1152d4]">done_all</span>}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="p-4 border-t border-slate-100">
                        <form onSubmit={handleSendMessage} className="space-y-3">
                            <div className="flex items-center gap-2">
                                <button type="button" className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-full text-[10px] font-bold transition-all">
                                    <span className="material-symbols-outlined text-sm">add_circle</span> File
                                </button>
                                <button type="button" className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-full text-[10px] font-bold transition-all">
                                    <span className="material-symbols-outlined text-sm">image</span> Photo
                                </button>
                            </div>
                            <div className="flex items-end gap-2 bg-slate-100 rounded-2xl px-3 py-2 focus-within:ring-2 focus-within:ring-[#1152d4]/20 transition-all">
                                <textarea
                                    rows="1"
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    className="bg-transparent border-none focus:ring-0 text-sm w-full py-1 placeholder:text-slate-400 text-slate-900 resize-none max-h-32"
                                    placeholder="Type a secure message..."
                                />
                                <button type="submit" className="bg-[#1152d4] text-white size-8 rounded-full flex items-center justify-center shrink-0 shadow-lg shadow-[#1152d4]/20 hover:scale-110 active:scale-95 transition-all">
                                    <span className="material-symbols-outlined text-lg">send</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </aside>
            </div>
            <Footer />
        </div>
    );
};

export default CustomerStatusDashboard;
