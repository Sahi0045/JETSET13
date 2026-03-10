import React, { useState } from 'react';
import { Link } from 'react-router-dom';

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)
// Visa Requirements Manager - CRUD for country-pair visa requirements

const MOCK_REQUIREMENTS = [
    { id: 1, nationality: 'India', destination: 'United States', visaRequired: true, visaType: 'B1/B2 Tourist/Business', processing: '3-5 weeks', validity: '10 years', maxStay: '180 days', entryType: 'Multiple', fee: 185, active: true },
    { id: 2, nationality: 'India', destination: 'United Kingdom', visaRequired: true, visaType: 'Standard Visitor', processing: '3 weeks', validity: '6 months', maxStay: '180 days', entryType: 'Multiple', fee: 115, active: true },
    { id: 3, nationality: 'India', destination: 'Japan', visaRequired: true, visaType: 'Tourist E-Visa', processing: '5-7 days', validity: '90 days', maxStay: '30 days', entryType: 'Single', fee: 27, active: true },
    { id: 4, nationality: 'India', destination: 'Thailand', visaRequired: false, visaType: 'Visa-on-Arrival', processing: 'On arrival', validity: '15 days', maxStay: '15 days', entryType: 'Single', fee: 35, active: true },
    { id: 5, nationality: 'United States', destination: 'Japan', visaRequired: false, visaType: 'Visa-Free', processing: 'N/A', validity: '90 days', maxStay: '90 days', entryType: 'N/A', fee: 0, active: true },
    { id: 6, nationality: 'India', destination: 'Singapore', visaRequired: true, visaType: 'E-Visa', processing: '3-5 days', validity: '30 days', maxStay: '30 days', entryType: 'Single', fee: 20, active: true },
    { id: 7, nationality: 'India', destination: 'Australia', visaRequired: true, visaType: 'eVisitor (600)', processing: '2-4 weeks', validity: '12 months', maxStay: '90 days', entryType: 'Multiple', fee: 150, active: true },
    { id: 8, nationality: 'India', destination: 'Canada', visaRequired: true, visaType: 'Temporary Resident', processing: '4-8 weeks', validity: '10 years', maxStay: '180 days', entryType: 'Multiple', fee: 100, active: false },
];

const VisaRequirementsManager = () => {
    const [requirements, setRequirements] = useState(MOCK_REQUIREMENTS);
    const [searchQuery, setSearchQuery] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [formData, setFormData] = useState({
        nationality: '', destination: '', visaRequired: true, visaType: '',
        processing: '', validity: '', maxStay: '', entryType: 'Single', fee: 0, active: true,
    });

    const filtered = requirements.filter(r =>
        !searchQuery ||
        r.nationality.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.destination.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.visaType.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const openAddModal = () => {
        setEditingItem(null);
        setFormData({ nationality: '', destination: '', visaRequired: true, visaType: '', processing: '', validity: '', maxStay: '', entryType: 'Single', fee: 0, active: true });
        setShowAddModal(true);
    };

    const openEditModal = (item) => {
        setEditingItem(item);
        setFormData({ ...item });
        setShowAddModal(true);
    };

    const handleSave = () => {
        if (editingItem) {
            setRequirements(prev => prev.map(r => r.id === editingItem.id ? { ...r, ...formData } : r));
        } else {
            setRequirements(prev => [...prev, { ...formData, id: Date.now() }]);
        }
        setShowAddModal(false);
    };

    const handleDelete = (id) => {
        if (confirm('Are you sure you want to delete this requirement?')) {
            setRequirements(prev => prev.filter(r => r.id !== id));
        }
    };

    return (
        <div className="min-h-screen bg-[#f6f6f8] font-sans text-slate-900">
            <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />



            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 lg:py-8">
                {/* Header */}
                <div className="flex flex-col lg:row lg:items-center justify-between gap-6 mb-8 lg:mb-10">
                    <div>
                        <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight">Visa Requirements</h1>
                        <p className="text-slate-400 text-xs lg:text-sm font-medium mt-1">{requirements.length} country pair configurations</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                        <div className="relative flex-1 sm:w-80 group">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg transition-colors group-focus-within:text-[#1152d4]">search</span>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-white h-11 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-[#1152d4]/10 focus:border-[#1152d4]/50 transition-all shadow-sm placeholder:text-slate-400"
                                placeholder="Search countries or visa types..."
                            />
                        </div>
                        <button
                            onClick={openAddModal}
                            className="flex items-center justify-center gap-2 px-6 py-3 bg-[#1152d4] text-white rounded-xl font-black text-[11px] lg:text-xs uppercase tracking-widest hover:bg-[#0e42b0] transition-all shadow-xl shadow-[#1152d4]/20"
                        >
                            <span className="material-symbols-outlined text-lg">add</span>
                            New Requirement
                        </button>
                    </div>
                </div>

                {/* Table Section */}
                <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden">
                    <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-100">
                        <table className="w-full text-sm min-w-[1000px]">
                            <thead>
                                <tr className="bg-slate-50/50 text-slate-300 text-[9px] lg:text-[10px] font-black uppercase tracking-widest border-b border-slate-50">
                                    <th className="text-left px-6 py-5">Nationality</th>
                                    <th className="text-left px-6 py-5">Destination</th>
                                    <th className="text-left px-6 py-5">Visa Type</th>
                                    <th className="text-left px-6 py-5">Required</th>
                                    <th className="text-left px-6 py-5">Processing</th>
                                    <th className="text-left px-6 py-5">Fee (USD)</th>
                                    <th className="text-left px-6 py-5">Entry</th>
                                    <th className="text-left px-6 py-5">Status</th>
                                    <th className="text-right px-6 py-5">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(req => (
                                    <tr key={req.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-6 py-4 font-black text-slate-900">{req.nationality}</td>
                                        <td className="px-6 py-4 font-black text-slate-900">{req.destination}</td>
                                        <td className="px-6 py-4 text-[13px] font-medium text-slate-600">{req.visaType}</td>
                                        <td className="px-6 py-4">
                                            <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${req.visaRequired ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                                                }`}>
                                                {req.visaRequired ? 'Yes' : 'No'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-[13px] font-medium text-slate-500">{req.processing}</td>
                                        <td className="px-6 py-4 font-black text-slate-900">${req.fee}</td>
                                        <td className="px-6 py-4 text-[13px] font-medium text-slate-500">{req.entryType}</td>
                                        <td className="px-6 py-4">
                                            <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${req.active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
                                                }`}>
                                                {req.active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => openEditModal(req)} className="text-[#1152d4] text-[10px] font-black uppercase tracking-widest hover:underline">Edit</button>
                                                <button onClick={() => handleDelete(req.id)} className="text-red-500 text-[10px] font-black uppercase tracking-widest hover:underline">Delete</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filtered.length === 0 && (
                        <div className="p-20 text-center">
                            <span className="material-symbols-outlined text-5xl text-slate-200 block mb-3">search_off</span>
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No requirements found</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Add/Edit Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setShowAddModal(false)}>
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl p-6 lg:p-10 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg lg:text-xl font-black text-slate-900 uppercase tracking-tight mb-8 flex items-center gap-3">
                            <span className="p-2.5 bg-[#1152d4]/5 text-[#1152d4] rounded-xl">
                                <span className="material-symbols-outlined">{editingItem ? 'edit' : 'add'}</span>
                            </span>
                            {editingItem ? 'Edit Requirement' : 'New Requirement'}
                        </h3>
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 ml-1">Nationality</label>
                                    <input type="text" value={formData.nationality} onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                                        className="w-full rounded-xl border border-slate-200 h-12 px-4 text-sm font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#1152d4]/10 focus:border-[#1152d4]/50 transition-all placeholder:text-slate-300" placeholder="e.g. India" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 ml-1">Destination</label>
                                    <input type="text" value={formData.destination} onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                                        className="w-full rounded-xl border border-slate-200 h-12 px-4 text-sm font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#1152d4]/10 focus:border-[#1152d4]/50 transition-all placeholder:text-slate-300" placeholder="e.g. United States" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 ml-1">Visa Type</label>
                                    <input type="text" value={formData.visaType} onChange={(e) => setFormData({ ...formData, visaType: e.target.value })}
                                        className="w-full rounded-xl border border-slate-200 h-12 px-4 text-sm font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#1152d4]/10 focus:border-[#1152d4]/50 transition-all placeholder:text-slate-300" placeholder="e.g. B1/B2 Tourist" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 ml-1">Visa Required</label>
                                    <select value={formData.visaRequired} onChange={(e) => setFormData({ ...formData, visaRequired: e.target.value === 'true' })}
                                        className="w-full rounded-xl border border-slate-200 h-12 px-4 text-sm font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#1152d4]/10 focus:border-[#1152d4]/50 transition-all">
                                        <option value="true">Yes, Required</option>
                                        <option value="false">No / Visa-Free</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 ml-1">Proc. Time</label>
                                    <input type="text" value={formData.processing} onChange={(e) => setFormData({ ...formData, processing: e.target.value })}
                                        className="w-full rounded-xl border border-slate-200 h-12 px-4 text-sm font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#1152d4]/10 focus:border-[#1152d4]/50 transition-all placeholder:text-slate-300" placeholder="3-5 weeks" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 ml-1">Validity</label>
                                    <input type="text" value={formData.validity} onChange={(e) => setFormData({ ...formData, validity: e.target.value })}
                                        className="w-full rounded-xl border border-slate-200 h-12 px-4 text-sm font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#1152d4]/10 focus:border-[#1152d4]/50 transition-all placeholder:text-slate-300" placeholder="10 years" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 ml-1">Max Stay</label>
                                    <input type="text" value={formData.maxStay} onChange={(e) => setFormData({ ...formData, maxStay: e.target.value })}
                                        className="w-full rounded-xl border border-slate-200 h-12 px-4 text-sm font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#1152d4]/10 focus:border-[#1152d4]/50 transition-all placeholder:text-slate-300" placeholder="180 days" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 ml-1">Entry Type</label>
                                    <select value={formData.entryType} onChange={(e) => setFormData({ ...formData, entryType: e.target.value })}
                                        className="w-full rounded-xl border border-slate-200 h-12 px-4 text-sm font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#1152d4]/10 focus:border-[#1152d4]/50 transition-all">
                                        <option>Single</option><option>Double</option><option>Multiple</option><option>N/A</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 ml-1">Fee (USD)</label>
                                    <input type="number" value={formData.fee} onChange={(e) => setFormData({ ...formData, fee: Number(e.target.value) })}
                                        className="w-full rounded-xl border border-slate-200 h-12 px-4 text-sm font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#1152d4]/10 focus:border-[#1152d4]/50 transition-all" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 ml-1">State</label>
                                    <select value={formData.active} onChange={(e) => setFormData({ ...formData, active: e.target.value === 'true' })}
                                        className="w-full rounded-xl border border-slate-200 h-12 px-4 text-sm font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#1152d4]/10 focus:border-[#1152d4]/50 transition-all">
                                        <option value="true">Active</option><option value="false">Hidden</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3 pt-4">
                                <button onClick={() => setShowAddModal(false)} className="flex-1 py-4 bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all">Back</button>
                                <button onClick={handleSave} className="flex-1 py-4 bg-[#1152d4] text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-[#0e42b0] transition-all shadow-xl shadow-[#1152d4]/20">
                                    {editingItem ? 'Update Database' : 'Confirm & Add'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VisaRequirementsManager;
