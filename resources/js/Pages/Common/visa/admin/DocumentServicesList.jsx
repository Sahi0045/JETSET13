import React, { useState } from 'react';
import { Link } from 'react-router-dom';

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)
// Admin - Document Services List

const STATUS_CONFIG = {
    pending: { label: 'Pending', color: 'bg-amber-100 text-amber-800' },
    in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
    completed: { label: 'Completed', color: 'bg-green-100 text-green-800' },
    cancelled: { label: 'Cancelled', color: 'bg-slate-100 text-slate-600' },
};

const MOCK_SERVICES = [
    { id: 'DOC-2026-00052', customer: 'Rahul Sharma', email: 'rahul@example.com', type: 'passport_renewal', label: 'Passport Renewal', urgency: 'standard', status: 'pending', fee: '$89', date: '2026-03-10', assignedTo: null },
    { id: 'DOC-2026-00051', customer: 'Emily Chen', email: 'emily@example.com', type: 'travel_insurance', label: 'Travel Insurance', urgency: 'express', status: 'in_progress', fee: '$75', date: '2026-03-09', assignedTo: 'Sarah M.' },
    { id: 'DOC-2026-00050', customer: 'Marco Rossi', email: 'marco@example.com', type: 'document_attestation', label: 'Document Attestation', urgency: 'standard', status: 'completed', fee: '$65', date: '2026-03-08', assignedTo: 'John D.' },
    { id: 'DOC-2026-00049', customer: 'Aisha Khan', email: 'aisha@example.com', type: 'translation', label: 'Document Translation', urgency: 'same_day', status: 'in_progress', fee: '$110', date: '2026-03-08', assignedTo: 'Sarah M.' },
    { id: 'DOC-2026-00048', customer: 'John Smith', email: 'john@example.com', type: 'passport_renewal', label: 'Passport Renewal', urgency: 'express', status: 'completed', fee: '$119', date: '2026-03-07', assignedTo: 'John D.' },
    { id: 'DOC-2026-00047', customer: 'Yuki Tanaka', email: 'yuki@example.com', type: 'travel_insurance', label: 'Travel Insurance', urgency: 'standard', status: 'pending', fee: '$45', date: '2026-03-07', assignedTo: null },
    { id: 'DOC-2026-00046', customer: 'Carlos Garcia', email: 'carlos@example.com', type: 'document_attestation', label: 'Document Attestation', urgency: 'express', status: 'cancelled', fee: '$95', date: '2026-03-06', assignedTo: null },
];

const URGENCY_BADGE = {
    standard: 'bg-slate-100 text-slate-600',
    express: 'bg-amber-100 text-amber-700',
    same_day: 'bg-red-100 text-red-700',
};

const DocumentServicesList = () => {
    const [statusFilter, setStatusFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [showUpdateModal, setShowUpdateModal] = useState(null);
    const [newStatus, setNewStatus] = useState('');

    const filtered = MOCK_SERVICES.filter(s => {
        const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
        const matchesSearch = !searchQuery ||
            s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.label.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    const handleStatusUpdate = () => {
        alert(`Updated ${showUpdateModal.id} to ${newStatus}`);
        setShowUpdateModal(null);
        setNewStatus('');
    };

    return (
        <div className="min-h-screen bg-[#f6f6f8] font-sans text-slate-900">
            <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />



            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 lg:py-8">
                {/* Header */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8 lg:mb-10">
                    <div>
                        <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight">Document Services</h1>
                        <p className="text-slate-400 text-xs lg:text-sm font-medium mt-1">{MOCK_SERVICES.length} active service requests</p>
                    </div>
                    <div className="relative w-full lg:w-80 group">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg transition-colors group-focus-within:text-[#1152d4]">search</span>
                        <input
                            type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white h-11 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-[#1152d4]/10 focus:border-[#1152d4]/50 transition-all shadow-sm placeholder:text-slate-400"
                            placeholder="Search requests..."
                        />
                    </div>
                </div>

                {/* Status Filters - Horizontally Scrollable on Mobile */}
                <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-4 -mx-1 px-1 scrollbar-none sm:overflow-visible sm:pb-0 sm:flex-wrap">
                    {['all', 'pending', 'in_progress', 'completed', 'cancelled'].map(key => (
                        <button
                            key={key}
                            onClick={() => setStatusFilter(key)}
                            className={`whitespace-nowrap px-5 py-2.5 rounded-xl text-[10px] lg:text-xs font-black uppercase tracking-widest transition-all ${statusFilter === key
                                ? 'bg-[#1152d4] text-white shadow-lg shadow-[#1152d4]/20'
                                : 'bg-white border border-slate-100 text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                                }`}
                        >
                            {key === 'all' ? 'All Requests' : STATUS_CONFIG[key]?.label}
                            <span className={`ml-2 px-1.5 py-0.5 rounded-md ${statusFilter === key ? 'bg-white/20' : 'bg-slate-50'}`}>
                                {key === 'all' ? MOCK_SERVICES.length : MOCK_SERVICES.filter(s => s.status === key).length}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Table Section */}
                <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden">
                    <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-100">
                        <table className="w-full text-sm min-w-[1100px]">
                            <thead>
                                <tr className="bg-slate-50/50 text-slate-300 text-[9px] lg:text-[10px] font-black uppercase tracking-widest border-b border-slate-50">
                                    <th className="text-left px-6 py-5">Reference</th>
                                    <th className="text-left px-6 py-5">Customer Profile</th>
                                    <th className="text-left px-6 py-5">Requested Service</th>
                                    <th className="text-left px-6 py-5">Urgency</th>
                                    <th className="text-left px-6 py-5">Current Status</th>
                                    <th className="text-left px-6 py-5">Service Fee</th>
                                    <th className="text-left px-6 py-5">Assigned Agent</th>
                                    <th className="text-left px-6 py-5">Request Date</th>
                                    <th className="text-right px-6 py-5">Management</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(svc => (
                                    <tr key={svc.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <span className="font-mono font-black text-[#1152d4] text-[11px] bg-[#1152d4]/5 px-2 py-1 rounded-md">{svc.id}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="font-black text-slate-900 text-[13px]">{svc.customer}</p>
                                            <p className="text-[10px] font-bold text-slate-400 tracking-tight">{svc.email}</p>
                                        </td>
                                        <td className="px-6 py-4 font-black text-slate-700 text-[13px]">{svc.label}</td>
                                        <td className="px-6 py-4">
                                            <span className={`${URGENCY_BADGE[svc.urgency]} text-[9px] px-2.5 py-1 rounded-full font-black uppercase tracking-widest bg-opacity-10 text-opacity-100`}>
                                                {svc.urgency.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`${STATUS_CONFIG[svc.status]?.color} text-[9px] px-2.5 py-1 rounded-full font-black uppercase tracking-widest bg-opacity-10 text-opacity-100`}>
                                                {STATUS_CONFIG[svc.status]?.label}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-black text-slate-900">{svc.fee}</td>
                                        <td className="px-6 py-4">
                                            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                                                {svc.assignedTo || <span className="text-slate-300">Unassigned</span>}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-[11px] font-bold text-slate-400">{svc.date}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => { setShowUpdateModal(svc); setNewStatus(svc.status); }}
                                                className="text-[#1152d4] text-[10px] font-black uppercase tracking-widest hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                Manage →
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filtered.length === 0 && (
                        <div className="p-20 text-center">
                            <span className="material-symbols-outlined text-5xl text-slate-200 block mb-3">search_off</span>
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No service requests found</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Update Status Modal */}
            {showUpdateModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setShowUpdateModal(null)}>
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm p-8 lg:p-10 animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-3">
                            <span className="p-2.5 bg-[#1152d4]/5 text-[#1152d4] rounded-xl">
                                <span className="material-symbols-outlined">edit</span>
                            </span>
                            Service Update
                        </h3>
                        <div className="bg-slate-50 rounded-2xl p-4 mb-6">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Request Reference</p>
                            <p className="text-sm font-black text-slate-900">
                                <span className="text-[#1152d4]">{showUpdateModal.id}</span> · {showUpdateModal.label}
                            </p>
                        </div>
                        <div className="space-y-6">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 ml-1">New Workflow Status</label>
                                <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 h-12 px-4 text-sm font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#1152d4]/10 focus:border-[#1152d4]/50 transition-all">
                                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                                        <option key={key} value={key}>{cfg.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex flex-col gap-3">
                                <button onClick={() => setShowUpdateModal(null)} className="py-4 bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all">Cancel</button>
                                <button onClick={handleStatusUpdate} className="py-4 bg-[#1152d4] text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-[#0e42b0] transition-all shadow-xl shadow-[#1152d4]/20">Apply Update</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DocumentServicesList;
