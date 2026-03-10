import React, { useState } from 'react';
import { Link } from 'react-router-dom';

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)
// Admin - All Visa Applications List with filters, search, bulk actions

const STATUS_CONFIG = {
    submitted: { label: 'Submitted', color: 'bg-blue-100 text-blue-800' },
    documents_pending: { label: 'Docs Pending', color: 'bg-amber-100 text-amber-800' },
    under_review: { label: 'Under Review', color: 'bg-purple-100 text-purple-800' },
    additional_info_required: { label: 'Info Needed', color: 'bg-orange-100 text-orange-800' },
    approved: { label: 'Approved', color: 'bg-green-100 text-green-800' },
    rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800' },
    cancelled: { label: 'Cancelled', color: 'bg-slate-100 text-slate-600' },
};

const PRIORITY_CONFIG = {
    low: { label: 'Low', dot: 'bg-slate-300' },
    normal: { label: 'Normal', dot: 'bg-blue-400' },
    high: { label: 'High', dot: 'bg-amber-500' },
    urgent: { label: 'Urgent', dot: 'bg-red-500' },
};

const MOCK_APPLICATIONS = [
    { id: 'VISA-2026-00347', name: 'Rahul Sharma', email: 'rahul@example.com', nationality: 'India', destination: 'United States', type: 'Tourist (B-2)', status: 'submitted', priority: 'high', serviceTier: 'Express', fee: '$89', date: '2026-03-10', assignedTo: null },
    { id: 'VISA-2026-00346', name: 'Emily Chen', email: 'emily@example.com', nationality: 'China', destination: 'Japan', type: 'Business', status: 'under_review', priority: 'normal', serviceTier: 'Standard', fee: '$49', date: '2026-03-10', assignedTo: 'Sarah M.' },
    { id: 'VISA-2026-00345', name: 'Marco Rossi', email: 'marco@example.com', nationality: 'Italy', destination: 'United Kingdom', type: 'Tourist', status: 'documents_pending', priority: 'normal', serviceTier: 'Standard', fee: '$49', date: '2026-03-09', assignedTo: null },
    { id: 'VISA-2026-00344', name: 'Aisha Khan', email: 'aisha@example.com', nationality: 'Pakistan', destination: 'Germany', type: 'Student', status: 'under_review', priority: 'urgent', serviceTier: 'Premium', fee: '$149', date: '2026-03-09', assignedTo: 'John D.' },
    { id: 'VISA-2026-00343', name: 'John Smith', email: 'john@example.com', nationality: 'United States', destination: 'Australia', type: 'Tourist', status: 'approved', priority: 'normal', serviceTier: 'Express', fee: '$89', date: '2026-03-08', assignedTo: 'Sarah M.' },
    { id: 'VISA-2026-00342', name: 'Yuki Tanaka', email: 'yuki@example.com', nationality: 'Japan', destination: 'France', type: 'Tourism', status: 'approved', priority: 'low', serviceTier: 'Standard', fee: '$49', date: '2026-03-08', assignedTo: 'John D.' },
    { id: 'VISA-2026-00341', name: 'Carlos Garcia', email: 'carlos@example.com', nationality: 'Mexico', destination: 'Canada', type: 'Business', status: 'rejected', priority: 'normal', serviceTier: 'Express', fee: '$89', date: '2026-03-07', assignedTo: 'Sarah M.' },
    { id: 'VISA-2026-00340', name: 'Sofia Andersen', email: 'sofia@example.com', nationality: 'Denmark', destination: 'Thailand', type: 'Tourist', status: 'additional_info_required', priority: 'high', serviceTier: 'Standard', fee: '$49', date: '2026-03-07', assignedTo: 'John D.' },
];

const VisaApplicationsList = () => {
    const [statusFilter, setStatusFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedApps, setSelectedApps] = useState([]);

    const filtered = MOCK_APPLICATIONS.filter(app => {
        const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
        const matchesSearch = !searchQuery ||
            app.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            app.destination.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    const toggleSelect = (id) => {
        setSelectedApps(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        if (selectedApps.length === filtered.length) {
            setSelectedApps([]);
        } else {
            setSelectedApps(filtered.map(a => a.id));
        }
    };

    const statusCounts = Object.keys(STATUS_CONFIG).reduce((acc, key) => {
        acc[key] = MOCK_APPLICATIONS.filter(a => a.status === key).length;
        return acc;
    }, {});

    return (
        <div className="min-h-screen bg-[#f6f6f8] font-sans text-slate-900">
            <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />



            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 lg:py-8">
                {/* Title + Search */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 lg:mb-8">
                    <div>
                        <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight">Visa Applications</h1>
                        <p className="text-slate-500 text-xs lg:text-sm mt-0.5 lg:mt-1 font-medium">{MOCK_APPLICATIONS.length} total applications</p>
                    </div>
                    <div className="relative w-full lg:w-96 group">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg transition-colors group-focus-within:text-[#1152d4]">search</span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white h-10 lg:h-11 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-[#1152d4]/10 focus:border-[#1152d4]/50 transition-all shadow-sm placeholder:text-slate-400"
                            placeholder="Search ID, name, or destination..."
                        />
                    </div>
                </div>

                {/* Status Filter Tabs - Scrollable on mobile */}
                <div className="flex items-center gap-2 mb-6 lg:mb-8 overflow-x-auto scrollbar-none pb-1 -mx-4 px-4 lg:mx-0 lg:px-0">
                    <button
                        onClick={() => setStatusFilter('all')}
                        className={`px-4 py-2 rounded-xl text-[10px] lg:text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all shadow-sm ${statusFilter === 'all'
                            ? 'bg-[#1152d4] text-white ring-4 ring-[#1152d4]/10'
                            : 'bg-white border border-slate-100 text-slate-500 hover:text-[#1152d4] hover:bg-slate-50'
                            }`}
                    >
                        All ({MOCK_APPLICATIONS.length})
                    </button>
                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                        statusCounts[key] > 0 && (
                            <button
                                key={key}
                                onClick={() => setStatusFilter(key)}
                                className={`px-4 py-2 rounded-xl text-[10px] lg:text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all shadow-sm ${statusFilter === key
                                    ? 'bg-[#1152d4] text-white ring-4 ring-[#1152d4]/10'
                                    : 'bg-white border border-slate-100 text-slate-500 hover:text-[#1152d4] hover:bg-slate-50'
                                    }`}
                            >
                                {cfg.label} ({statusCounts[key]})
                            </button>
                        )
                    ))}
                </div>

                {/* Bulk Actions */}
                {selectedApps.length > 0 && (
                    <div className="bg-[#1152d4]/5 border border-[#1152d4]/20 rounded-2xl px-4 lg:px-6 py-3 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                        <span className="text-xs lg:text-sm font-black text-[#1152d4] uppercase tracking-widest">{selectedApps.length} Selected</span>
                        <div className="flex flex-wrap gap-2">
                            <button className="flex-1 sm:flex-none px-3 py-2 bg-white border border-slate-200 rounded-lg text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
                                Assign Agent
                            </button>
                            <button className="flex-1 sm:flex-none px-3 py-2 bg-white border border-slate-200 rounded-lg text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
                                Change Priority
                            </button>
                            <button className="flex-1 sm:flex-none px-3 py-2 bg-white border border-slate-200 rounded-lg text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
                                Export CSV
                            </button>
                        </div>
                    </div>
                )}

                {/* Table Section */}
                <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden">
                    <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-100">
                        <table className="w-full text-sm min-w-[1000px]">
                            <thead>
                                <tr className="bg-slate-50/50 text-slate-300 text-[9px] lg:text-[10px] font-black uppercase tracking-widest border-b border-slate-50">
                                    <th className="text-left px-6 py-5 w-12">
                                        <input type="checkbox" checked={selectedApps.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="rounded border-slate-300 text-[#1152d4] focus:ring-[#1152d4]/20" />
                                    </th>
                                    <th className="text-left px-6 py-5">Reference</th>
                                    <th className="text-left px-6 py-5">Applicant</th>
                                    <th className="text-left px-6 py-5">Destination</th>
                                    <th className="text-left px-6 py-5">Visa Type</th>
                                    <th className="text-left px-6 py-5">Status</th>
                                    <th className="text-left px-6 py-5">Priority</th>
                                    <th className="text-left px-6 py-5">Service</th>
                                    <th className="text-left px-6 py-5">Assigned</th>
                                    <th className="text-left px-6 py-5">Date</th>
                                    <th className="text-right px-6 py-5">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(app => (
                                    <tr key={app.id} className={`border-t border-slate-100 hover:bg-slate-50/50 transition-colors ${selectedApps.includes(app.id) ? 'bg-[#1152d4]/5' : ''}`}>
                                        <td className="px-4 py-3">
                                            <input type="checkbox" checked={selectedApps.includes(app.id)} onChange={() => toggleSelect(app.id)} className="rounded" />
                                        </td>
                                        <td className="px-4 py-3">
                                            <Link to={`/visa/admin/applications/${app.id}`} className="font-mono font-bold text-[#1152d4] text-xs hover:underline no-underline">
                                                {app.id}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-slate-900">{app.name}</p>
                                            <p className="text-xs text-slate-400">{app.email}</p>
                                        </td>
                                        <td className="px-4 py-3 text-slate-700">{app.destination}</td>
                                        <td className="px-4 py-3 text-slate-600">{app.type}</td>
                                        <td className="px-4 py-3">
                                            <span className={`${STATUS_CONFIG[app.status]?.color} text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap`}>
                                                {STATUS_CONFIG[app.status]?.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5">
                                                <div className={`w-2 h-2 rounded-full ${PRIORITY_CONFIG[app.priority]?.dot}`}></div>
                                                <span className="text-xs font-medium">{PRIORITY_CONFIG[app.priority]?.label}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-600">{app.serviceTier}</td>
                                        <td className="px-4 py-3 text-xs text-slate-600">{app.assignedTo || <span className="text-slate-300">Unassigned</span>}</td>
                                        <td className="px-4 py-3 text-xs text-slate-500">{app.date}</td>
                                        <td className="px-4 py-3 text-right">
                                            <Link to={`/visa/admin/applications/${app.id}`} className="text-[#1152d4] text-xs font-bold hover:underline no-underline">
                                                Review →
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filtered.length === 0 && (
                        <div className="p-12 text-center">
                            <span className="material-symbols-outlined text-4xl text-slate-300 block mb-2">search_off</span>
                            <p className="text-slate-500 text-sm">No applications match your criteria</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VisaApplicationsList;
