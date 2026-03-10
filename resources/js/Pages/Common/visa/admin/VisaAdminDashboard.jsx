import React from 'react';
import { Link } from 'react-router-dom';

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)
// Screen 11: Admin Visa Stats & Revenue Dashboard

const VisaAdminDashboard = () => {
    const stats = [
        { label: 'Total Applications', val: '12,450', grow: '+12%', icon: 'assignment', color: 'primary' },
        { label: 'Pending Reviews', val: '842', grow: '-5%', icon: 'pending_actions', color: 'orange' },
        { label: 'Revenue Growth', val: '+24%', grow: '+4%', icon: 'payments', color: 'emerald' },
        { label: 'Approval Rate', val: '98.2%', grow: '+0.5%', icon: 'verified', color: 'blue' }
    ];

    const countries = [
        { name: 'USA', val: 4250, height: '85%' },
        { name: 'UK', val: 3120, height: '65%' },
        { name: 'Canada', val: 2400, height: '45%' },
        { name: 'Schengen', val: 2850, height: '55%' },
        { name: 'Australia', val: 1150, height: '30%' },
        { name: 'UAE', val: 680, height: '15%' }
    ];

    const activities = [
        { title: 'USA Business Visa Approved', user: 'Alex Rivera', time: '2 mins ago', icon: 'check_circle', color: 'emerald' },
        { title: 'New Review Required', user: 'Sarah Chen (UK)', time: '15 mins ago', icon: 'hourglass_top', color: 'amber' },
        { title: 'Payment Confirmed', user: 'Revenue ID: #88921', time: '42 mins ago', icon: 'info', color: 'blue' }
    ];

    return (
        <div className="bg-[#f8f9fc] min-h-screen font-sans">
            <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />



            <div className="p-4 sm:p-6 lg:p-10 max-w-[1600px] mx-auto">

                {/* Header */}
                <div className="mb-8 lg:mb-12">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                        <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">Intelligence Hub</h1>
                        <div className="flex gap-2 w-full sm:w-auto">
                            <button className="flex-1 sm:flex-none px-4 lg:px-5 py-2 lg:py-2.5 bg-white border border-slate-100 rounded-xl lg:rounded-2xl text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-slate-500 shadow-sm hover:bg-slate-50 transition-all">Extract PDF</button>
                            <button className="flex-1 sm:flex-none px-4 lg:px-5 py-2 lg:py-2.5 bg-[#1152d4] rounded-xl lg:rounded-2xl text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-[#1152d4]/20 hover:scale-105 transition-all">New Campaign</button>
                        </div>
                    </div>
                    <p className="text-[10px] lg:text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em]">Real-time corridor analytics & revenue flow</p>
                </div>

                {/* Top Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 mb-8 lg:mb-12">
                    {stats.map(s => (
                        <div key={s.label} className="bg-white p-5 lg:p-7 rounded-3xl lg:rounded-[2.5rem] border border-white shadow-xl shadow-slate-200/40 relative overflow-hidden group hover:scale-[1.02] transition-all">
                            <div className="flex justify-between items-start mb-4 lg:mb-6">
                                <span className="text-[9px] lg:text-[10px] font-black text-slate-300 uppercase tracking-widest">{s.label}</span>
                                <div className={`p-2.5 lg:p-3 bg-${s.color === 'primary' ? '[#1152d4]' : s.color}-500/10 text-${s.color === 'primary' ? '[#1152d4]' : s.color}-600 rounded-xl lg:rounded-2xl transition-all group-hover:rotate-12`}>
                                    <span className="material-symbols-outlined text-xl lg:text-2xl">{s.icon}</span>
                                </div>
                            </div>
                            <p className="text-2xl lg:text-3xl font-black text-slate-900 mb-2 leading-none tracking-tighter">{s.val}</p>
                            <div className="flex items-center gap-1.5 text-emerald-600 font-black text-[9px] lg:text-[10px] uppercase tracking-widest">
                                <span className="material-symbols-outlined text-xs">trending_up</span>
                                <span>{s.grow} growth</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
                    {/* Chart Area */}
                    <div className="lg:col-span-2 bg-white p-6 lg:p-10 rounded-3xl lg:rounded-[3rem] border border-white shadow-2xl shadow-slate-200/30">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 lg:mb-12">
                            <div>
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-1.5">Volume by Corridor</h3>
                                <p className="text-[9px] lg:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Top performing global routes</p>
                            </div>
                            <select className="bg-slate-50 border-none rounded-xl lg:rounded-2xl text-[9px] lg:text-[10px] font-black uppercase tracking-widest px-4 lg:px-6 py-2 lg:py-2.5 text-slate-500 w-full sm:w-auto">
                                <option>Monthly View</option>
                                <option>Quarterly</option>
                            </select>
                        </div>

                        <div className="h-60 lg:h-72 flex items-end justify-between gap-2 lg:gap-6 px-0 lg:px-4">
                            {countries.map(c => (
                                <div key={c.name} className="flex-1 flex flex-col items-center gap-4 lg:gap-6 group">
                                    <div
                                        className="w-full bg-[#1152d4]/5 hover:bg-[#1152d4] transition-all duration-500 rounded-lg lg:rounded-2xl relative shadow-inner"
                                        style={{ height: c.height }}
                                    >
                                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[8px] lg:text-[9px] font-black px-2 lg:px-3 py-1 lg:py-1.5 rounded-lg lg:rounded-xl opacity-0 group-hover:opacity-100 transition-all shadow-xl z-20">
                                            {c.val}
                                        </div>
                                    </div>
                                    <span className="text-[8px] lg:text-[10px] font-black text-slate-400 uppercase tracking-tight lg:tracking-widest">{c.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Activity Feed */}
                    <div className="bg-white p-6 lg:p-10 rounded-3xl lg:rounded-[3rem] border border-white shadow-2xl shadow-slate-200/30">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-6 lg:mb-8">Pulse Feed</h3>
                        <div className="space-y-6 lg:space-y-10">
                            {activities.map((a, i) => (
                                <div key={i} className="flex gap-4 lg:gap-5 group">
                                    <div className={`size-10 lg:size-12 rounded-xl lg:rounded-2xl bg-${a.color}-500/10 text-${a.color}-600 flex items-center justify-center shrink-0 transition-all group-hover:scale-110 shadow-lg shadow-${a.color}-100/50`}>
                                        <span className="material-symbols-outlined text-lg lg:text-xl">{a.icon}</span>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] lg:text-[11px] font-black text-slate-900 leading-tight mb-1 truncate">{a.title}</p>
                                        <p className="text-[9px] lg:text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1 truncate">{a.user}</p>
                                        <p className="text-[8px] font-black text-slate-200 uppercase tracking-[0.2em]">{a.time}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button className="w-full mt-8 lg:mt-12 py-3 lg:py-4 text-[#1152d4] font-black text-[9px] uppercase tracking-widest hover:bg-[#1152d4]/5 rounded-xl lg:rounded-2xl transition-all border-2 border-[#1152d4]/10">
                            Full Activity Log
                        </button>
                    </div>
                </div>

                {/* Regional Table */}
                <div className="mt-8 lg:mt-12 bg-white rounded-3xl lg:rounded-[3rem] border border-white shadow-2xl shadow-slate-200/30 overflow-hidden">
                    <div className="p-6 lg:p-8 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/30">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Geo-Economic Distribution</h3>
                        <button className="flex items-center gap-2 text-[10px] font-black text-[#1152d4] uppercase tracking-widest hover:opacity-70 transition-all justify-center sm:justify-start">
                            <span className="material-symbols-outlined text-lg">download</span> Export Dataset
                        </button>
                    </div>
                    <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-100">
                        <table className="w-full text-left min-w-[800px] lg:min-w-full">
                            <thead className="bg-slate-50/50 text-slate-300 text-[8px] lg:text-[9px] font-black uppercase tracking-widest border-b border-slate-50">
                                <tr>
                                    <th className="px-6 lg:px-10 py-4 lg:py-5">Global Region</th>
                                    <th className="px-6 lg:px-10 py-4 lg:py-5">Corridor</th>
                                    <th className="px-6 lg:px-10 py-4 lg:py-5">Processed</th>
                                    <th className="px-6 lg:px-10 py-4 lg:py-5">Velocity</th>
                                    <th className="px-6 lg:px-10 py-4 lg:py-5">Rev Impact</th>
                                    <th className="px-6 lg:px-10 py-4 lg:py-5">Health</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {[
                                    { reg: 'North America', name: 'United States', vol: '4,250', grow: '+15.2%', rev: '$1.2M', status: 'Optimal' },
                                    { reg: 'Europe', name: 'Schengen Area', vol: '2,850', grow: '+8.4%', rev: '$640K', status: 'Optimal' },
                                    { reg: 'Asia Pacific', name: 'Australia', vol: '1,150', grow: '-2.1%', rev: '$280K', status: 'Review' }
                                ].map((row, i) => (
                                    <tr key={i} className="hover:bg-slate-50/50 transition-all group">
                                        <td className="px-6 lg:px-10 py-4 lg:py-6 text-[10px] lg:text-[11px] font-black text-slate-900">{row.reg}</td>
                                        <td className="px-6 lg:px-10 py-4 lg:py-6">
                                            <div className="flex items-center gap-3">
                                                <div className="size-5 lg:size-6 bg-slate-100 rounded shadow-inner"></div>
                                                <span className="text-[9px] lg:text-[10px] font-bold text-slate-500 uppercase tracking-widest">{row.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 lg:px-10 py-4 lg:py-6 text-[10px] lg:text-[11px] font-black text-slate-900">{row.vol}</td>
                                        <td className="px-6 lg:px-10 py-4 lg:py-6 text-[9px] lg:text-[10px] font-black text-emerald-600 uppercase tracking-tighter">{row.grow}</td>
                                        <td className="px-6 lg:px-10 py-4 lg:py-6 text-[10px] lg:text-[11px] font-black text-slate-900 uppercase">{row.rev}</td>
                                        <td className="px-6 lg:px-10 py-4 lg:py-6">
                                            <span className={`px-2 lg:px-3 py-1 rounded-full text-[7px] lg:text-[8px] font-black uppercase ${row.status === 'Optimal' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                                {row.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VisaAdminDashboard;
