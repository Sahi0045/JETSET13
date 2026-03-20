import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPut } from '../../../../utils/apiHelper';

const ConsultantDashboard = () => {
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ total: 0, revenue: 0, rating: 4.8 });
    const [isOnline, setIsOnline] = useState(true);
    const [activeView, setActiveView] = useState('week'); // 'week' | 'list'
    const [complianceQueue, setComplianceQueue] = useState([]);

    const fetchConsultations = useCallback(async () => {
        try {
            const response = await apiGet('visa/consultations');
            const data = await response.json();
            if (data.success) {
                const mapped = data.data.map(c => {
                    const date = new Date(c.booking_date);
                    const dayIdx = (date.getDay() + 6) % 7; // Convert Sun=0 to Mon=0
                    
                    // Simple parser for "HH:MM AM/PM"
                    const [timePart, meridiem] = c.booking_time.split(' ');
                    let [hours, minutes] = timePart.split(':').map(Number);
                    if (meridiem === 'PM' && hours < 12) hours += 12;
                    if (meridiem === 'AM' && hours === 12) hours = 0;

                    const startMinutes = hours * 60 + minutes;
                    const nineAM = 9 * 60;
                    const totalDayMinutes = 8 * 60; // 9am to 5pm
                    
                    const topPct = ((startMinutes - nineAM) / totalDayMinutes) * 100;
                    const heightPct = (60 / totalDayMinutes) * 100; // assume 1hr

                    return {
                        id: c.id,
                        title: `Visa Consultation: ${c.consultant_role}`, // or visa type if added
                        time: c.booking_time,
                        client: c.customer_name,
                        status: c.status,
                        color: c.status === 'confirmed' ? 'blue' : c.status === 'completed' ? 'emerald' : 'indigo',
                        type: 'video',
                        day: date.toLocaleDateString('en-US', { weekday: 'short' }),
                        date: date.getDate(),
                        dayIdx,
                        topPct,
                        heightPct
                    };
                });
                setAppointments(mapped);
            }
        } catch (err) {
            console.error('fetchConsultations error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchRecentCompliance = async () => {
        try {
            // Fetch applications that need attention
            const response = await apiGet('visa/applications?limit=3&status=under_review,additional_info_required&orderBy=updated_at:desc');
            const data = await response.json();
            if (data.success) {
                setComplianceQueue(data.data.map(app => ({
                    id: app.id,
                    name: `${app.personal_info?.firstName || ''} ${app.personal_info?.lastName || ''}`.trim() || 'Anonymous',
                    stage: app.status === 'under_review' ? 'Reviewing' : 'Awaiting Info'
                })));
            }
        } catch (err) {
            console.error('fetchRecentCompliance error:', err);
        }
    };

    useEffect(() => {
        fetchConsultations();
        fetchStats();
        fetchRecentCompliance();

        const interval = setInterval(() => {
            fetchConsultations();
            fetchStats();
            fetchRecentCompliance();
        }, 30000); // 30s polling for dashboard
        
        return () => clearInterval(interval);
    }, [fetchConsultations]);

    // Calculate current week range (Mon to Sun)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 is Sun, 1 is Mon...
    const diffToMon = today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(diffToMon);
    
    const weekDays = [...Array(7)].map((_, i) => {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        return {
            name: d.toLocaleDateString('en-US', { weekday: 'short' }),
            date: d.getDate(),
            fullDate: d
        };
    });

    const weekRangeStr = `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(new Date(startOfWeek).setDate(startOfWeek.getDate() + 6)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    const colorMap = {
        blue: { bg: 'bg-blue-50', border: 'border-l-blue-500', text: 'text-blue-700', icon: 'text-blue-400', strip: 'bg-blue-500' },
        indigo: { bg: 'bg-indigo-50', border: 'border-l-indigo-500', text: 'text-indigo-700', icon: 'text-indigo-400', strip: 'bg-indigo-500' },
        emerald: { bg: 'bg-emerald-50', border: 'border-l-emerald-500', text: 'text-emerald-700', icon: 'text-emerald-400', strip: 'bg-emerald-500' },
    };

    return (
        <div className="min-h-screen bg-[#f8f9fc] font-sans text-slate-900 pb-20">
            <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10 pt-8 lg:pt-14">

                {/* Premium Header - As per screenshot */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-12">
                    <div className="max-w-xl">
                        <h1 className="text-3xl lg:text-4xl font-black text-[#1a1c1e] tracking-tight leading-none mb-4">Consultant Schedule</h1>
                        <p className="text-slate-500 font-bold text-sm lg:text-base leading-relaxed opacity-80">Manage your travel consultation hours and client meetings.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 lg:gap-4 lg:self-end">
                        <div className="flex items-center bg-white border border-slate-200/60 rounded-[1.25rem] p-1.5 shadow-2xl shadow-slate-200/50">
                            <button
                                onClick={() => setActiveView('week')}
                                className={`flex items-center gap-3 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all ${activeView === 'week' ? 'bg-[#1152d4] text-white shadow-xl shadow-[#1152d4]/30' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                <span className="material-symbols-outlined text-lg">calendar_view_week</span>
                                <span>Week</span>
                            </button>
                            <button
                                onClick={() => setActiveView('list')}
                                className={`flex items-center gap-3 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all ${activeView === 'list' ? 'bg-[#1152d4] text-white shadow-xl shadow-[#1152d4]/30' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                <span className="material-symbols-outlined text-lg">list</span>
                                <span>List</span>
                            </button>
                        </div>

                        <button className="flex items-center gap-3 px-7 py-4.5 bg-white border border-slate-200/60 rounded-[1.25rem] font-black text-[10px] uppercase tracking-[0.15em] text-[#1a1c1e] hover:bg-slate-50 transition-all shadow-xl shadow-slate-200/40 group">
                            <span className="material-symbols-outlined text-xl text-slate-400 group-hover:text-[#1152d4] transition-colors">event_repeat</span>
                            <span>Recurring Hours</span>
                        </button>

                        <button className="flex items-center gap-3 px-7 py-4.5 bg-white border border-slate-200/60 rounded-[1.25rem] font-black text-[10px] uppercase tracking-[0.15em] text-[#1a1c1e] hover:bg-slate-50 transition-all shadow-xl shadow-slate-200/40 group">
                            <span className="material-symbols-outlined text-xl text-slate-400 group-hover:text-red-500 transition-colors">block</span>
                            <span>Block Time</span>
                        </button>
                    </div>
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-12 gap-8 lg:gap-10">

                    {/* Calendar Section */}
                    <div className="col-span-12 xl:col-span-8 space-y-8">
                        <div className="bg-white rounded-[3rem] border border-slate-100 shadow-[0_30px_100px_rgba(0,0,0,0.04)] overflow-hidden">

                            {/* Week Header Navigation */}
                            <div className="flex items-center justify-between px-8 lg:px-12 py-8 bg-slate-50/40 border-b border-slate-50 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#1152d4] via-indigo-500 to-emerald-400" />

                                <button className="size-12 flex items-center justify-center hover:bg-white hover:text-[#1152d4] hover:shadow-xl rounded-2xl transition-all text-slate-300 bg-transparent border border-transparent hover:border-slate-100">
                                    <span className="material-symbols-outlined text-2xl font-black">chevron_left</span>
                                </button>

                                <div className="text-center group cursor-pointer">
                                    <h2 className="text-sm lg:text-base font-black text-slate-900 uppercase tracking-[0.3em]">{weekRangeStr}</h2>
                                    <div className="flex items-center justify-center gap-3 mt-2">
                                        <div className="h-[2px] w-4 bg-slate-200 group-hover:bg-[#1152d4] transition-all" />
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Intelligence Quarter 4</p>
                                        <div className="h-[2px] w-4 bg-slate-200 group-hover:bg-[#1152d4] transition-all" />
                                    </div>
                                </div>

                                <button className="size-12 flex items-center justify-center hover:bg-white hover:text-[#1152d4] hover:shadow-xl rounded-2xl transition-all text-slate-300 bg-transparent border border-transparent hover:border-slate-100">
                                    <span className="material-symbols-outlined text-2xl font-black">chevron_right</span>
                                </button>
                            </div>

                            {activeView === 'week' ? (
                                <div className="overflow-x-auto no-scrollbar lg:custom-scrollbar">
                                    <div className="min-w-[900px]">
                                        {/* Day Headers */}
                                        <div className="grid grid-cols-8 border-b border-slate-50 pb-2">
                                            <div className="p-8 flex items-center justify-center border-r border-slate-50 bg-slate-50/20">
                                                <div className="flex flex-col items-center">
                                                    <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Standard</span>
                                                    <span className="text-[11px] font-black text-slate-900 border-b-2 border-[#1152d4]/40">GMT+5.5</span>
                                                </div>
                                            </div>
                                            {weekDays.map((day, idx) => (
                                                <div key={day.name} className={`p-8 text-center border-r border-slate-50 last:border-r-0 ${day.date === today.getDate() ? 'bg-[#1152d4]/[0.02]' : ''}`}>
                                                    <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-3 ${day.date === today.getDate() ? 'text-[#1152d4]' : 'text-slate-400 group-hover:text-slate-600 transition-colors'}`}>{day.name}</p>
                                                    <div className={`size-12 mx-auto rounded-2xl flex items-center justify-center text-base font-black transition-all ${day.date === today.getDate() ? 'bg-[#1152d4] text-white shadow-2xl shadow-[#1152d4]/30 scale-110' : 'text-slate-900 hover:bg-slate-50'}`}>{day.date}</div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Calendar Grid Body */}
                                        <div className="relative grid grid-cols-8 overflow-y-auto no-scrollbar lg:custom-scrollbar" style={{ height: '700px' }}>
                                            {/* Time Column with better visual markers */}
                                            <div className="col-span-1 border-r border-slate-50 bg-slate-50/10">
                                                {[9, 10, 11, 12, 1, 2, 3, 4, 5].map(h => (
                                                    <div key={h} className="border-b border-slate-50/50 flex items-start justify-end pr-6 pt-3 relative" style={{ height: '80px' }}>
                                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}:00 {h >= 9 && h <= 12 ? (h === 12 ? 'PM' : 'AM') : 'PM'}</span>
                                                        <div className="absolute right-0 top-0 w-1.5 h-px bg-slate-200" />
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Days Grid with active hour tracking */}
                                            {[0, 1, 2, 3, 4, 5, 6].map(dayIdx => (
                                                <div key={dayIdx} className={`col-span-1 border-r border-slate-50 last:border-r-0 relative ${dayIdx === 1 ? 'bg-[#1152d4]/[0.01]' : ''}`}>
                                                    {[...Array(9)].map((_, i) => (
                                                        <div key={i} className="border-b border-slate-50/50 hover:bg-slate-50/30 transition-colors" style={{ height: '80px' }} />
                                                    ))}

                                                    {/* Interactive Event Blocks */}
                                                    {appointments.filter(a => a.dayIdx === dayIdx).map(app => {
                                                        const c = colorMap[app.color];
                                                        const topOffset = (app.topPct / 100) * 8 * 80; // 8 intervals shown originally, adjusted for 80px
                                                        const heightValue = (app.heightPct / 100) * 8 * 80;
                                                        return (
                                                            <div
                                                                key={app.id}
                                                                onClick={() => window.location.href = `/visa/admin/appointments/${app.id}`}
                                                                className={`absolute left-2 right-2 ${c.bg} border-2 border-white border-l-4 ${c.border} rounded-[1.5rem] p-4 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer overflow-hidden z-10 group`}
                                                                style={{ top: `${topOffset}px`, height: `${heightValue}px` }}
                                                            >
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className={`size-1.5 rounded-full ${c.strip} animate-pulse`} />
                                                                        <span className={`text-[9px] font-black uppercase ${c.text} tracking-wider`}>{app.time}</span>
                                                                    </div>
                                                                    <span className={`material-symbols-outlined text-lg ${c.icon} opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all`}>{app.type === 'video' ? 'videocam' : app.type === 'person' ? 'person' : 'call'}</span>
                                                                </div>
                                                                <p className="text-[11px] lg:text-[12px] font-black text-slate-900 leading-snug mb-3 group-hover:text-[#1152d4] transition-colors line-clamp-2">{app.title}</p>
                                                                <div className="flex items-center gap-3 mt-auto">
                                                                    <div className="relative">
                                                                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${app.client}`} className="size-6 lg:size-7 rounded-lg border-2 border-white shadow-md" alt="" />
                                                                        <div className="absolute -bottom-0.5 -right-0.5 size-2 bg-emerald-500 border border-white rounded-full" />
                                                                    </div>
                                                                    <span className={`text-[10px] font-black ${c.text} truncate uppercase tracking-widest`}>{app.client.split(' ')[0]}</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* Refined List View */
                                <div className="divide-y divide-slate-100 bg-white min-h-[500px]">
                                    {appointments.map(app => {
                                        const c = colorMap[app.color];
                                        return (
                                            <div key={app.id} className="flex flex-col sm:flex-row sm:items-center gap-6 p-8 lg:p-10 hover:bg-slate-50 transition-all group relative">
                                                <div className={`absolute left-0 top-0 w-2 h-full ${c.strip} opacity-0 group-hover:opacity-100 transition-all`} />
                                                <div className={`size-16 lg:size-20 rounded-3xl ${c.bg} flex items-center justify-center shrink-0 shadow-xl shadow-slate-200/40 relative group-hover:scale-105 transition-all`}>
                                                    <span className={`material-symbols-outlined text-3xl ${c.icon}`}>{app.type === 'video' ? 'videocam' : app.type === 'person' ? 'person' : 'call'}</span>
                                                    <div className={`absolute inset-0 rounded-3xl border-2 ${c.strip} opacity-0 group-hover:opacity-10 transition-all scale-110`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-3 mb-2">
                                                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${c.bg} ${c.text} border border-${app.color}-100`}>{app.time}</span>
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">{app.day}, {new Date(app.fullDate || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                                    </div>
                                                    <h3 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight group-hover:text-[#1152d4] transition-all">{app.title}</h3>
                                                    <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-sm">history_edu</span> Formal Session Record
                                                    </p>
                                                </div>
                                                <div className="flex items-center justify-between sm:justify-end gap-6 mt-6 sm:mt-0">
                                                    <div className="flex items-center gap-4">
                                                        <div className="text-right hidden sm:block">
                                                            <p className="text-[13px] font-black text-slate-900 leading-none">{app.client}</p>
                                                            <p className="text-[10px] font-black text-[#1152d4] uppercase mt-2 tracking-widest bg-[#1152d4]/5 px-2 py-0.5 rounded-md text-center">{app.status}</p>
                                                        </div>
                                                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${app.client}`} className="size-12 lg:size-14 rounded-2xl border-4 border-white shadow-2xl" alt="" />
                                                    </div>
                                                    <Link to={`/visa/admin/appointments/${app.id}`} className="px-8 py-4 bg-slate-950 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] no-underline hover:bg-[#1152d4] transition-all shadow-2xl shadow-slate-950/20 active:scale-95 group">
                                                        Access Vault <span className="material-symbols-outlined text-base ml-2 group-hover:translate-x-1 transition-transform">arrow_forward</span>
                                                    </Link>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Intelligence Sidebar */}
                    <div className="col-span-12 xl:col-span-4 space-y-10">

                        {/* Session Logic / Availability */}
                        <div className="bg-[#1152d4] rounded-[3rem] p-10 text-white shadow-2xl shadow-[#1152d4]/40 relative overflow-hidden group border border-white/10">
                            <div className="absolute -right-20 -top-20 size-60 bg-white/10 rounded-full blur-[80px] group-hover:scale-125 transition-transform duration-1000" />
                            <div className="absolute -left-20 -bottom-20 size-40 bg-indigo-500/20 rounded-full blur-[60px]" />

                            <div className="relative z-10">
                                <div className="flex items-center justify-between mb-10">
                                    <div className="bg-white/10 backdrop-blur-md px-5 py-2.5 rounded-2xl border border-white/20 flex items-center gap-3">
                                        <div className={`size-2.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-white/30'}`} />
                                        <span className="text-[11px] font-black uppercase tracking-[0.2em]">{isOnline ? 'Network Active' : 'Offline Mode'}</span>
                                    </div>
                                    <button
                                        onClick={() => setIsOnline(!isOnline)}
                                        className={`w-14 h-7 rounded-full transition-all relative shrink-0 border-2 ${isOnline ? 'bg-white border-white' : 'bg-white/10 border-white/20'}`}
                                    >
                                        <div className={`absolute top-1 size-4 rounded-full shadow-2xl transition-all ${isOnline ? 'right-1 bg-[#1152d4]' : 'left-1 bg-white'}`} />
                                    </button>
                                </div>
                                <h3 className="text-3xl font-black tracking-tight mb-4">Availability Engine</h3>
                                <p className="text-white/80 text-sm font-bold leading-relaxed tracking-tight max-w-[240px]">Global matching algorithms prioritize your active sessions in real-time.</p>

                                <div className="mt-10 pt-8 border-t border-white/10 flex items-center justify-between text-[11px] font-black uppercase tracking-widest">
                                    <span>Session Load</span>
                                    <div className="flex gap-1">
                                        {[1, 2, 3].map(i => <div key={i} className={`h-1.5 w-6 rounded-full ${i <= 2 ? 'bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]' : 'bg-white/20'}`} />)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Professional Metrics */}
                        <div className="bg-white rounded-[3rem] border border-slate-100 shadow-[0_30px_100px_rgba(0,0,0,0.02)] p-10">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#1152d4] mb-10 border-b border-[#1152d4]/10 pb-4 inline-block">Consultancy Intelligence</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="p-8 bg-slate-50/50 rounded-[2rem] border border-slate-100 group hover:bg-white hover:shadow-2xl hover:shadow-slate-200/40 transition-all duration-500">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Total Sessions</p>
                                    <p className="text-4xl font-black text-slate-950 tracking-tighter group-hover:scale-110 transition-transform">{stats.total}</p>
                                </div>
                                <div className="p-8 bg-emerald-500 rounded-[2rem] text-white shadow-xl shadow-emerald-500/20 group hover:shadow-2xl transition-all duration-500 active:scale-95 cursor-pointer">
                                    <p className="text-[9px] font-black text-white/70 uppercase tracking-widest mb-4">Revenue Collected</p>
                                    <div className="flex items-center gap-3">
                                        <p className="text-3xl font-black tracking-tighter">${stats.revenue}</p>
                                        <span className="material-symbols-outlined text-2xl animate-spin-slow">monetization_on</span>
                                    </div>
                                </div>
                                <div className="p-10 bg-white rounded-[2.5rem] border border-slate-100 col-span-2 shadow-xl shadow-slate-200/30 group">
                                    <div className="flex items-center justify-between mb-4">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">Consultant Rating</p>
                                        <span className="material-symbols-outlined text-[#1152d4]">insights</span>
                                    </div>
                                    <div className="flex items-end gap-5">
                                        <p className="text-5xl font-black text-slate-950 tracking-tighter leading-none">{stats.rating}<span className="text-xl text-[#1152d4]">/5.0</span></p>
                                        <div className="flex mb-2 gap-0.5">{[...Array(5)].map((_, i) => <span key={i} className="material-symbols-outlined text-xs text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>)}</div>
                                    </div>
                                    <div className="mt-8 h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
                                        <div className="h-full bg-slate-950 w-[96%] group-hover:bg-[#1152d4] transition-all duration-1000" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Recent Dossiers / Quick Links */}
                        <div className="bg-slate-950 rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-10 opacity-10">
                                <span className="material-symbols-outlined text-[120px] rotate-12">folder_shared</span>
                            </div>
                            <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40 mb-10">Compliance Queue</h3>
                            <div className="space-y-6">
                                {complianceQueue.length > 0 ? complianceQueue.map(c => (
                                    <div key={c.id} 
                                         onClick={() => window.location.href = `/visa/admin/applications/${c.id}`}
                                         className="flex items-center justify-between p-4 bg-white/5 rounded-2xl hover:bg-white/10 transition-all cursor-pointer border border-white/5">
                                        <div className="flex flex-col">
                                            <span className="text-[13px] font-black tracking-tight">{c.name}</span>
                                            <span className="text-[9px] font-black text-indigo-400 uppercase mt-1 tracking-widest">{c.stage}</span>
                                        </div>
                                        <button className="size-8 rounded-xl bg-white/10 flex items-center justify-center hover:bg-[#1152d4] transition-colors">
                                            <span className="material-symbols-outlined text-sm">open_in_new</span>
                                        </button>
                                    </div>
                                )) : (
                                    <p className="text-[11px] text-white/40 font-bold text-center py-4">No pending dossiers in queue</p>
                                )}
                                <button className="w-full py-5 text-[#1152d4] text-[10px] font-black uppercase tracking-[0.25em] bg-[#1152d4]/5 rounded-[1.75rem] hover:bg-[#1152d4] hover:text-white transition-all border border-[#1152d4]/20 shadow-xl shadow-[#1152d4]/5">
                                    Launch Enterprise Feed
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConsultantDashboard;
