import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)
// Screen 19: Appointment Details & Preparation View

const AppointmentDetail = () => {
    const { id } = useParams();
    const [notes, setNotes] = useState('');
    const [autoFollowUp, setAutoFollowUp] = useState(false);

    const applicant = {
        name: 'John Doe',
        type: 'F1 Student Visa - USA',
        status: 'Document Review Phase',
        ref: '#VISA-98231',
        email: 'john.doe@example.com',
        phone: '+1 (555) 012-3456',
        nationality: 'Brazil',
        university: 'Stanford University',
        img: 'https://api.dicebear.com/7.x/avataaars/svg?seed=John'
    };

    const documents = [
        { name: 'Passport_Copy.pdf', type: 'pdf', size: '2.4 MB', date: '2 days ago', color: 'red', icon: 'picture_as_pdf' },
        { name: 'I-20_Form_Signed.pdf', type: 'pdf', size: '1.1 MB', date: '2 days ago', color: 'blue', icon: 'description' },
        { name: 'Financial_Statement_Oct.pdf', type: 'pdf', size: '4.5 MB', date: '1 day ago', color: 'green', icon: 'receipt_long' }
    ];

    const tasks = [
        { text: 'Verify I-20 details against passport naming conventions.', completed: true },
        { text: 'Check financial proof for tuition + living expenses coverage.', completed: true },
        { text: 'Prepare mock interview questions for "Intent to Return" section.', completed: false }
    ];

    return (
        <div className="min-h-screen bg-[#f6f6f8] font-sans text-slate-900 pb-20">
            <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />



            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
                {/* Breadcrumbs */}
                <nav className="flex flex-wrap items-center gap-2 mb-8 text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <Link to="/visa/admin/dashboard" className="hover:text-[#1152d4] no-underline flex items-center gap-1 transition-colors">
                        <span className="material-symbols-outlined text-sm font-bold">dashboard</span> Admin
                    </Link>
                    <span className="text-slate-200">/</span>
                    <Link to="/visa/admin/schedule" className="hover:text-[#1152d4] no-underline flex items-center gap-1 transition-colors">
                        <span className="material-symbols-outlined text-sm font-bold">calendar_month</span> Schedule
                    </Link>
                    <span className="text-slate-200">/</span>
                    <span className="text-slate-900 font-black">{applicant.name.split(' ')[0]} Session</span>
                </nav>

                {/* Hero */}
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-12">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="px-4 py-1 bg-[#1152d4] text-white text-[9px] font-black rounded-full uppercase tracking-widest shadow-lg shadow-[#1152d4]/20">Active Session</span>
                            <span className="text-slate-400 text-[10px] font-black tracking-[0.2em] uppercase">Ref ID: {applicant.ref}</span>
                        </div>
                        <h1 className="text-3xl lg:text-5xl font-black text-slate-900 tracking-tight lg:tracking-tighter mt-2">Preparation Phase</h1>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:gap-8 text-slate-500 mt-4">
                            <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-2xl border border-slate-100 shadow-sm">
                                <span className="material-symbols-outlined text-[#1152d4] text-xl">calendar_today</span>
                                <span className="text-xs lg:text-sm font-black text-slate-900 uppercase tracking-widest">Oct 24, 2023</span>
                            </div>
                            <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-2xl border border-slate-100 shadow-sm">
                                <span className="material-symbols-outlined text-[#1152d4] text-xl">schedule</span>
                                <span className="text-xs lg:text-sm font-black text-slate-900 uppercase tracking-widest">10:00 AM • 45m</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                        <button className="flex-1 lg:flex-none px-8 py-4 border-2 border-slate-100 bg-white rounded-[1.25rem] font-black text-[10px] uppercase tracking-widest text-slate-400 hover:text-slate-600 hover:border-slate-200 transition-all shadow-sm">
                            Reschedule
                        </button>
                        <button disabled className="flex-1 lg:flex-none px-10 py-4 bg-[#1152d4] text-white rounded-[1.25rem] font-black text-[10px] uppercase tracking-widest shadow-2xl shadow-[#1152d4]/30 flex items-center justify-center gap-3 opacity-40 cursor-not-allowed transition-all">
                            <span className="material-symbols-outlined text-xl">videocam</span>
                            Join Room (Locked)
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
                    {/* Left: Applicant & Docs */}
                    <div className="lg:col-span-12 xl:col-span-7 space-y-10">
                        {/* Profile Card */}
                        <div className="bg-white rounded-[2.5rem] border border-slate-50 shadow-2xl shadow-slate-200/40 p-8 lg:p-12 relative overflow-hidden group">
                            <div className="absolute right-0 top-0 p-8 opacity-0 lg:group-hover:opacity-10 transition-opacity">
                                <span className="material-symbols-outlined text-[120px] text-slate-900">person</span>
                            </div>
                            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8 lg:gap-10 mb-10 pb-10 border-b border-slate-50 relative z-10">
                                <div className="relative shrink-0">
                                    <img src={applicant.img} className="size-28 lg:size-32 rounded-[2.5rem] border-4 border-white shadow-2xl relative z-10" alt="P" />
                                    <div className="absolute -inset-2 bg-[#1152d4]/5 rounded-[3rem] -z-0" />
                                </div>
                                <div className="flex flex-col justify-center text-center sm:text-left">
                                    <h3 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">{applicant.name}</h3>
                                    <p className="text-[#1152d4] font-black uppercase text-[11px] mt-2 tracking-[0.2em]">{applicant.type}</p>
                                    <div className="inline-flex items-center gap-2 mt-4 px-4 py-1.5 bg-amber-50 text-amber-600 rounded-full text-[10px] font-black uppercase tracking-widest mx-auto sm:mx-0">
                                        <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                                        {applicant.status}
                                    </div>
                                </div>
                                <button className="sm:ml-auto p-4 bg-slate-50 text-[#1152d4] rounded-2xl hover:bg-[#1152d4] hover:text-white transition-all shadow-sm border border-slate-100">
                                    <span className="material-symbols-outlined">launch</span>
                                </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-8 relative z-10">
                                {[
                                    { label: 'E-Mail Correspondence', value: applicant.email, icon: 'alternate_email' },
                                    { label: 'Primary Contact', value: applicant.phone, icon: 'call' },
                                    { label: 'Nationality', value: applicant.nationality, icon: 'public' },
                                    { label: 'Target University', value: applicant.university, icon: 'school' }
                                ].map(({ label, value, icon }) => (
                                    <div key={label} className="flex gap-4">
                                        <div className="p-2.5 bg-slate-50 rounded-xl h-fit border border-slate-100">
                                            <span className="material-symbols-outlined text-slate-400 text-lg">{icon}</span>
                                        </div>
                                        <div>
                                            <p className="text-[9px] text-slate-400 uppercase font-bold tracking-widest mb-1">{label}</p>
                                            <p className="text-xs lg:text-sm font-black text-slate-900 tracking-tight">{value}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Documents */}
                        <div className="bg-white rounded-[2.5rem] border border-slate-50 shadow-2xl shadow-slate-200/40 overflow-hidden">
                            <div className="px-8 lg:px-12 py-6 lg:py-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
                                <h3 className="text-slate-900 font-black flex items-center gap-3 text-xs lg:text-sm uppercase tracking-[0.2em]">
                                    <span className="p-2 bg-[#1152d4]/5 text-[#1152d4] rounded-xl">
                                        <span className="material-symbols-outlined text-xl">inventory_2</span>
                                    </span>
                                    Applicant Dossier
                                </h3>
                                <span className="bg-[#1152d4] text-white text-[9px] font-black px-4 py-1 rounded-full uppercase tracking-widest shadow-lg shadow-[#1152d4]/20">{documents.length} Files</span>
                            </div>
                            <div className="divide-y divide-slate-50 px-4 lg:px-6">
                                {documents.map(doc => (
                                    <div key={doc.name} className="p-5 lg:p-8 flex items-center justify-between hover:bg-slate-50/50 rounded-3xl transition-all group my-2">
                                        <div className="flex items-center gap-5 lg:gap-8">
                                            <div className="relative">
                                                <div className="size-14 lg:size-16 rounded-2xl bg-white border border-slate-100 shadow-xl flex items-center justify-center relative z-10">
                                                    <span className={`material-symbols-outlined text-2xl lg:text-3xl text-slate-300`}>{doc.icon}</span>
                                                </div>
                                                <div className={`absolute -inset-1 bg-slate-100 rounded-[1.25rem] -z-0 group-hover:bg-[#1152d4]/5 transition-colors`} />
                                            </div>
                                            <div>
                                                <p className="text-sm lg:text-base font-black text-slate-900 tracking-tight group-hover:text-[#1152d4] transition-colors">{doc.name}</p>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{doc.date} • {doc.size}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 transition-all opacity-0 lg:group-hover:opacity-100 transform translate-x-4 lg:group-hover:translate-x-0">
                                            <button className="p-3 bg-white text-[#1152d4] border border-slate-100 rounded-xl hover:bg-[#1152d4] hover:text-white hover:border-[#1152d4] transition-all shadow-sm">
                                                <span className="material-symbols-outlined text-xl">visibility</span>
                                            </button>
                                            <button className="p-3 bg-white text-[#1152d4] border border-slate-100 rounded-xl hover:bg-[#1152d4] hover:text-white hover:border-[#1152d4] transition-all shadow-sm">
                                                <span className="material-symbols-outlined text-xl">download</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right: Prep & Feedback */}
                    <div className="lg:col-span-12 xl:col-span-5 space-y-10">
                        {/* Preparation */}
                        <div className="bg-[#1152d4] rounded-[2.5rem] p-8 lg:p-12 text-white shadow-2xl shadow-[#1152d4]/30 relative overflow-hidden group">
                            <div className="absolute right-0 top-0 p-8 opacity-10">
                                <span className="material-symbols-outlined text-[100px]">assignment</span>
                            </div>
                            <h3 className="font-black flex items-center gap-3 mb-10 uppercase text-xs lg:text-sm tracking-[0.2em] relative z-10">
                                <span className="p-2 bg-white/10 rounded-xl backdrop-blur-md">
                                    <span className="material-symbols-outlined text-white">checklist_rtl</span>
                                </span>
                                Preparation Matrix
                            </h3>
                            <div className="space-y-8 relative z-10">
                                {tasks.map((task, i) => (
                                    <div key={i} className="flex gap-4 group/item">
                                        <div className="mt-0.5 relative">
                                            <span className={`material-symbols-outlined text-xl transition-all ${task.completed ? 'text-emerald-400' : 'text-white/20'}`}>
                                                {task.completed ? 'check_circle' : 'radio_button_unchecked'}
                                            </span>
                                            {task.completed && <div className="absolute inset-0 bg-emerald-400/20 blur-md rounded-full" />}
                                        </div>
                                        <p className={`text-[11px] lg:text-xs font-bold leading-relaxed transition-all ${task.completed ? 'text-white/90' : 'text-white/40 italic'}`}>{task.text}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-12 pt-10 border-t border-white/10 relative z-10">
                                <div className="bg-white/5 backdrop-blur-xl p-6 rounded-[2rem] flex items-start gap-5 border border-white/10">
                                    <div className="p-2.5 bg-amber-400 text-slate-900 rounded-2xl shadow-lg shadow-amber-400/20">
                                        <span className="material-symbols-outlined text-2xl">sensors</span>
                                    </div>
                                    <p className="text-[10px] text-white/70 font-bold leading-relaxed uppercase tracking-[0.05em]">
                                        Gateway initialization scheduled for <span className="text-white font-black underline decoration-amber-400 decoration-2 underline-offset-4">09:55 AM</span>. Standby for sync.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Feedback */}
                        <div className="bg-white rounded-[2.5rem] border border-slate-50 shadow-2xl shadow-slate-200/40 p-8 lg:p-10">
                            <div className="flex justify-between items-center mb-10">
                                <h3 className="text-slate-900 font-black flex items-center gap-3 uppercase text-xs lg:text-sm tracking-[0.2em]">
                                    <span className="p-2 bg-[#1152d4]/5 text-[#1152d4] rounded-xl outline outline-1 outline-[#1152d4]/10">
                                        <span className="material-symbols-outlined text-xl">rate_review</span>
                                    </span>
                                    Session Outcome
                                </h3>
                                <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 border border-slate-100 rounded-full">
                                    <span className="size-1.5 rounded-full bg-slate-300" />
                                    <span className="text-[8px] text-slate-400 uppercase font-black tracking-widest">Secret</span>
                                </div>
                            </div>
                            <div className="space-y-8">
                                <div className="flex flex-col gap-3 group">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 ml-2 transition-colors group-focus-within:text-[#1152d4]">Consultation Minutes & Observations</label>
                                    <textarea
                                        className="w-full h-48 rounded-3xl border-slate-100 bg-slate-50/50 p-6 text-sm font-medium focus:ring-4 focus:ring-[#1152d4]/5 focus:border-[#1152d4]/20 focus:bg-white resize-none transition-all shadow-inner placeholder:text-slate-300"
                                        placeholder="Outline key breakthroughs and pending applicant requirements..."
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                    ></textarea>
                                </div>

                                <button onClick={() => setAutoFollowUp(!autoFollowUp)} className={`w-full flex items-center justify-between p-5 lg:p-6 rounded-3xl border border-slate-100 transition-all ${autoFollowUp ? 'bg-emerald-50 border-emerald-100' : 'bg-white hover:bg-slate-50'}`}>
                                    <div className="flex items-center gap-4">
                                        <div className={`size-6 rounded-xl flex items-center justify-center transition-all ${autoFollowUp ? 'bg-emerald-500 shadow-lg shadow-emerald-500/20' : 'bg-slate-50 border-2 border-slate-100'}`}>
                                            {autoFollowUp && <span className="material-symbols-outlined text-white text-base font-black">check</span>}
                                        </div>
                                        <span className={`text-[10px] lg:text-xs font-black uppercase tracking-widest ${autoFollowUp ? 'text-emerald-700' : 'text-slate-500'}`}>Auto-Schedule Next Audit</span>
                                    </div>
                                    <span className={`text-[10px] font-bold ${autoFollowUp ? 'text-emerald-600' : 'text-slate-300'}`}>+72h</span>
                                </button>

                                <div className="relative pt-4">
                                    <button disabled className="w-full py-5 bg-slate-100 text-slate-300 rounded-[1.5rem] font-black text-[11px] uppercase tracking-[0.25em] cursor-not-allowed transition-all border border-slate-50 shadow-sm">
                                        Push to Portal
                                    </button>
                                    <div className="mt-4 flex items-center justify-center gap-2 group cursor-help">
                                        <span className="material-symbols-outlined text-xs text-slate-300 group-hover:text-[#1152d4] transition-colors">info</span>
                                        <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest group-hover:text-slate-500 transition-colors">Submission Unlocked Post-Session</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AppointmentDetail;
