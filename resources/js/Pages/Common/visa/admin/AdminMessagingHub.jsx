import React, { useState } from 'react';
import { Link } from 'react-router-dom';

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)
// Screen 14: Admin Multi-Chat Messaging Hub

const AdminMessagingHub = () => {
    const [activeChat, setActiveChat] = useState(1);
    const [message, setMessage] = useState('');
    const [view, setView] = useState('list'); // 'list' or 'chat'
    const [showInfo, setShowInfo] = useState(false);

    const chats = [
        { id: 1, name: 'John Richards', time: '2m ago', lastMsg: "I've re-uploaded the bank statements.", unread: false, online: true, img: 'https://api.dicebear.com/7.x/avataaars/svg?seed=John' },
        { id: 2, name: 'Sarah Jenkins', time: '5m ago', lastMsg: "Wait, is my insurance valid?", unread: true, online: false, img: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah' },
        { id: 3, name: 'Marco Rossi', time: '1h ago', lastMsg: "Thank you for the quick update.", unread: false, online: true, img: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Marco' },
        { id: 4, name: 'Elena Petrova', time: '3h ago', lastMsg: "I'm having trouble with the SMS code.", unread: false, online: false, img: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Elena' }
    ];

    const activeUser = chats.find(c => c.id === activeChat);

    return (
        <div className="bg-[#f6f6f8] font-sans text-slate-900 flex flex-col h-[calc(100vh-80px)] lg:h-[calc(100vh-130px)] overflow-hidden">
            <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />

            <div className="flex h-full overflow-hidden relative">
                {/* Left Chat List - Hidden on mobile when chat is active */}
                <aside className={`w-full lg:w-80 border-r border-slate-200 bg-white flex flex-col shrink-0 z-20 transition-all duration-300 lg:translate-x-0 ${view === 'chat' ? '-translate-x-full absolute lg:relative lg:translate-x-0' : 'translate-x-0 relative'}`}>
                    <div className="p-6 border-b border-slate-50 bg-white">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-950 leading-none">Intelligence Inbox</h3>
                            <span className="bg-[#1152d4] text-white text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-lg shadow-[#1152d4]/20">12 NEW</span>
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none no-scrollbar">
                            <button className="whitespace-nowrap px-5 py-2 rounded-2xl bg-[#1152d4] text-white text-[9px] font-black uppercase tracking-widest shadow-md">Active</button>
                            <button className="whitespace-nowrap px-5 py-2 rounded-2xl bg-slate-50 text-slate-400 text-[9px] font-black uppercase tracking-widest hover:bg-slate-100 transition-colors">Pending</button>
                            <button className="whitespace-nowrap px-5 py-2 rounded-2xl bg-slate-50 text-slate-400 text-[9px] font-black uppercase tracking-widest hover:bg-slate-100 transition-colors">Closed</button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/20">
                        {chats.map(chat => (
                            <div
                                key={chat.id}
                                onClick={() => { setActiveChat(chat.id); setView('chat'); }}
                                className={`flex items-center gap-4 p-6 cursor-pointer transition-all border-b border-slate-50 relative ${activeChat === chat.id ? 'bg-white shadow-xl shadow-slate-200/40 z-10 border-l-4 border-l-[#1152d4]' : 'hover:bg-white/60 border-l-4 border-l-transparent'
                                    }`}
                            >
                                <div className="relative shrink-0">
                                    <img src={chat.img} className="size-14 rounded-[1.25rem] border-2 border-white shadow-xl" alt="C" />
                                    {chat.online && <div className="absolute -bottom-1 -right-1 size-4 bg-emerald-500 border-2 border-white rounded-full shadow-lg"></div>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center mb-1.5">
                                        <span className={`text-xs font-black tracking-tight ${activeChat === chat.id ? 'text-[#1152d4]' : 'text-slate-900'}`}>{chat.name}</span>
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{chat.time}</span>
                                    </div>
                                    <p className={`text-[10px] truncate leading-tight tracking-tight ${chat.unread ? 'font-black text-slate-900' : 'font-bold text-slate-400 opacity-80'}`}>
                                        {chat.lastMsg}
                                    </p>
                                </div>
                                {chat.unread && <div className="size-2.5 bg-[#1152d4] rounded-full shrink-0 shadow-lg shadow-[#1152d4]/30 animate-pulse"></div>}
                            </div>
                        ))}
                    </div>
                </aside>

                {/* Center Conversation */}
                <section className={`flex-1 flex flex-col bg-white lg:bg-[#f8f9fc] relative transition-transform duration-300 z-10 ${view === 'list' ? 'translate-x-full absolute lg:relative lg:translate-x-0' : 'translate-x-0 relative'}`}>
                    {/* Chat Header */}
                    <div className="px-4 lg:px-10 py-5 bg-white border-b border-slate-100 flex items-center justify-between z-20 shadow-sm relative">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setView('list')} className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-slate-900">
                                <span className="material-symbols-outlined font-black">arrow_back_ios_new</span>
                            </button>
                            <div className="relative group cursor-pointer" onClick={() => setShowInfo(!showInfo)}>
                                <div className="relative">
                                    <img src={activeUser?.img} className="size-11 rounded-[1.25rem] border-2 border-[#1152d4]/10 shadow-lg shadow-[#1152d4]/5 transition-transform group-hover:scale-105" alt="A" />
                                    <div className="absolute -bottom-1 -right-1 size-3.5 bg-emerald-500 border-2 border-white rounded-full shadow-md"></div>
                                </div>
                            </div>
                            <div className="flex flex-col">
                                <h4 className="text-[13px] font-black text-slate-900 leading-none mb-1 md:mb-1.5">{activeUser?.name}</h4>
                                <div className="flex items-center gap-2">
                                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                        Live Pulse <span className="mx-1 text-slate-200">|</span> Ref: #APP-8921
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button className="hidden sm:flex px-5 py-2.5 text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 bg-slate-50 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">Transfer</button>
                            <button className="px-5 py-2.5 text-[9px] font-black uppercase tracking-[0.15em] text-white bg-[#1152d4] rounded-xl hover:bg-slate-950 transition-all shadow-xl shadow-[#1152d4]/20">Finish Sync</button>
                            <button onClick={() => setShowInfo(!showInfo)} className="lg:hidden p-2 text-slate-400">
                                <span className="material-symbols-outlined">info</span>
                            </button>
                        </div>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 lg:p-12 flex flex-col gap-10 lg:gap-14 custom-scrollbar relative z-0">
                        <div className="absolute inset-0 bg-[radial-gradient(#1152d4_1px,transparent_1px)] [background-size:24px_24px] opacity-10 pointer-events-none"></div>

                        {/* Floating Date */}
                        <div className="flex justify-center sticky top-0 z-20 pointer-events-none mb-4">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] px-8 py-2 bg-white/60 backdrop-blur-xl rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.05)] border border-white/50">Intelligence Horizon • Oct 24</span>
                        </div>

                        {/* Applicant Msg */}
                        <div className="flex items-end gap-3 lg:gap-5 max-w-[90%] lg:max-w-[75%] group animate-in fade-in slide-in-from-left-4 duration-500">
                            <div className="relative shrink-0 hidden sm:block">
                                <img src={activeUser?.img} className="size-9 rounded-xl shadow-lg border-2 border-white" alt="C" />
                                <div className="absolute -bottom-1 -right-1 size-3 bg-emerald-500 border-2 border-white rounded-full"></div>
                            </div>
                            <div className="flex flex-col gap-2">
                                <div className="bg-white p-5 lg:p-7 rounded-[2rem] rounded-bl-none shadow-2xl shadow-slate-200/30 text-[13px] font-bold text-slate-700 leading-relaxed border border-white relative">
                                    Hi, I received a notification that my Bank Statement was rejected. Could you tell me why? I thought it met all requirements.
                                    <div className="absolute left-[-12px] bottom-0 w-4 h-4 bg-white clip-path-triangle-left lg:hidden" />
                                </div>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-3">10:42 AM</span>
                            </div>
                        </div>

                        {/* System Alert msg */}
                        <div className="flex justify-center px-4 animate-in fade-in zoom-in-95 duration-700">
                            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 lg:gap-6 bg-red-500/5 backdrop-blur-sm border border-red-500/10 rounded-[2.5rem] p-6 lg:p-8 max-w-2xl shadow-sm relative overflow-hidden group">
                                <div className="absolute right-0 top-0 p-4 opacity-5">
                                    <span className="material-symbols-outlined text-[80px]">warning</span>
                                </div>
                                <div className="p-3 bg-red-500 text-white rounded-2xl shadow-xl shadow-red-500/20">
                                    <span className="material-symbols-outlined text-2xl">shield_alert</span>
                                </div>
                                <div className="text-center sm:text-left">
                                    <p className="font-black text-red-600 uppercase tracking-[0.2em] mb-2 leading-none text-[10px]">Security Infrastructure Alert</p>
                                    <p className="text-slate-500 font-bold leading-relaxed text-[11px] lg:text-xs">Automatic analysis detected a delta in <span className="text-slate-900 font-black">BankStatement_Q3.pdf</span>. Data coverage fails to bridge the requested <span className="text-red-500 underline decoration-red-500/20 underline-offset-4">90-day window</span>.</p>
                                </div>
                            </div>
                        </div>

                        {/* Admin Msg */}
                        <div className="flex items-end gap-3 lg:gap-5 max-w-[90%] lg:max-w-[75%] self-end flex-row-reverse animate-in fade-in slide-in-from-right-4 duration-500">
                            <div className="relative shrink-0 hidden sm:block">
                                <div className="size-9 rounded-xl bg-slate-950 flex items-center justify-center text-white shadow-xl shadow-slate-950/20 border-2 border-white">
                                    <span className="material-symbols-outlined text-sm">robot_2</span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 items-end">
                                <div className="bg-slate-950 text-white p-5 lg:p-7 rounded-[2rem] rounded-br-none shadow-[0_20px_50px_rgba(0,0,0,0.1)] text-[13px] font-bold leading-relaxed border border-white/10">
                                    Hello John, I've checked the file. It appears the statement only shows up to the 15th of last month, but we require a full 3-month period ending within the last 7 days.
                                </div>
                                <div className="flex items-center gap-3 mr-3">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">10:45 AM</span>
                                    <div className="flex text-[#1152d4]">
                                        <span className="material-symbols-outlined text-sm">done_all</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Applicant Msg 2 */}
                        <div className="flex items-end gap-3 lg:gap-5 max-w-[90%] lg:max-w-[75%] group animate-in fade-in slide-in-from-left-4 duration-500">
                            <div className="relative shrink-0 hidden sm:block">
                                <img src={activeUser?.img} className="size-9 rounded-xl shadow-lg border-2 border-white" alt="C" />
                            </div>
                            <div className="flex flex-col gap-2">
                                <div className="bg-white p-5 lg:p-7 rounded-[2rem] rounded-bl-none shadow-2xl shadow-slate-200/30 text-[13px] font-bold text-slate-700 leading-relaxed border border-white">
                                    Ah, I see. I've re-uploaded the bank statements including the current month. Could you take a look?
                                </div>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-3">10:48 AM</span>
                            </div>
                        </div>
                    </div>

                    {/* Input Box */}
                    <div className="p-4 lg:p-10 bg-white border-t border-slate-100 lg:bg-transparent z-20">
                        <div className="bg-white rounded-[2.5rem] p-3 lg:p-4 border border-slate-200/60 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] transition-all focus-within:ring-8 focus-within:ring-[#1152d4]/5 focus-within:border-[#1152d4]/40 max-w-4xl mx-auto w-full">
                            <textarea
                                className="w-full bg-transparent border-none focus:ring-0 text-sm font-bold py-3 px-6 min-h-[50px] lg:min-h-[80px] resize-none placeholder:text-slate-300 custom-scrollbar tracking-tight text-slate-900"
                                placeholder={`Drafting intelligence report for ${activeUser?.name.split(' ')[0]}...`}
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                            ></textarea>
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-2 pt-4 px-4 border-t border-slate-100">
                                <div className="flex gap-1.5 lg:gap-3">
                                    <button className="p-2.5 text-slate-400 hover:text-[#1152d4] hover:bg-[#1152d4]/5 rounded-xl transition-all"><span className="material-symbols-outlined text-xl">attach_file_add</span></button>
                                    <button className="p-2.5 text-slate-400 hover:text-[#1152d4] hover:bg-[#1152d4]/5 rounded-xl transition-all"><span className="material-symbols-outlined text-xl">face</span></button>
                                    <button className="hidden lg:flex p-2.5 text-slate-400 hover:text-[#1152d4] hover:bg-[#1152d4]/5 rounded-xl transition-all"><span className="material-symbols-outlined text-xl">history_edu</span></button>
                                </div>
                                <button className="w-full sm:w-auto bg-[#1152d4] hover:bg-slate-950 text-white px-10 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-2xl shadow-[#1152d4]/30 transition-all active:scale-95 group">
                                    Dispatch Securely
                                    <span className="material-symbols-outlined text-base group-hover:translate-x-1 transition-transform">send</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Right Info Pane - Optimized Mobile Drawer */}
                <aside className={`fixed lg:relative inset-y-0 right-0 w-80 lg:w-72 border-l border-slate-100 bg-white flex flex-col overflow-y-auto custom-scrollbar p-8 z-40 transform transition-transform duration-300 ${showInfo ? 'translate-x-0 shadow-2xl' : 'translate-x-full lg:translate-x-0'} ${showInfo ? '' : 'lg:flex hidden'}`}>
                    <button onClick={() => setShowInfo(false)} className="lg:hidden absolute left-4 top-8 p-2 text-slate-300">
                        <span className="material-symbols-outlined">close</span>
                    </button>

                    <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#1152d4] mb-10 border-b-2 border-[#1152d4]/20 w-full pb-3 text-center sm:text-left">Intelligence Context</h5>

                    <div className="space-y-10">
                        {[
                            { label: 'Visa Mission', val: 'Tier 2 Specialist', icon: 'shield_person' },
                            { label: 'Territory', val: 'United Kingdom', icon: 'location_on' },
                            { label: 'Secure Identifier', val: 'APP-8921-UK', icon: 'fingerprint', mono: true },
                            { label: 'Temporal Entry', val: 'Oct 12, 2023', icon: 'calendar_month' }
                        ].map(({ label, val, icon, mono }) => (
                            <div key={label} className="flex flex-col gap-3 group">
                                <span className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] px-1 group-hover:text-[#1152d4] transition-colors">{label}</span>
                                <div className="flex items-center gap-4 p-3 bg-slate-50/50 rounded-2xl border border-slate-100/50 group-hover:bg-white group-hover:shadow-md transition-all">
                                    <span className="material-symbols-outlined text-[#1152d4] text-xl opacity-60">{icon}</span>
                                    <span className={`text-[11px] font-black tracking-tight ${mono ? 'font-mono text-slate-900' : 'text-slate-600'}`}>{val}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-14 pt-10 border-t border-slate-50">
                        <h6 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-8 px-1">Integrity Audit</h6>
                        <div className="space-y-6">
                            {[
                                { name: 'Passport Sync', status: 'verified' },
                                { name: 'Sponsorship Hub', status: 'verified' },
                                { name: 'Financial Reserve', status: 'alert' },
                                { name: 'Insurance Logic', status: 'pending' }
                            ].map(doc => (
                                <div key={doc.name} className="flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 transition-colors cursor-help">
                                    <span className={`text-[11px] font-bold ${doc.status === 'pending' ? 'text-slate-300 italic' : 'text-slate-700'}`}>{doc.name}</span>
                                    {doc.status === 'verified' && <span className="material-symbols-outlined text-emerald-500 text-lg">check_circle</span>}
                                    {doc.status === 'alert' && <div className="px-3 py-1 bg-amber-500 text-white rounded-lg text-[8px] font-black uppercase tracking-widest shadow-lg shadow-amber-500/20">Action</div>}
                                    {doc.status === 'pending' && <div className="size-3 rounded-full border-2 border-slate-100"></div>}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="mt-auto pt-10">
                        <button className="w-full py-5 bg-slate-950 text-white hover:bg-[#1152d4] rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-slate-950/10 flex items-center justify-center gap-3">
                            Full Dossier View
                            <span className="material-symbols-outlined text-lg">visibility</span>
                        </button>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default AdminMessagingHub;
