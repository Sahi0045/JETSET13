import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)
// Admin - Single Application Detail / Review Page

const STATUS_OPTIONS = [
    { value: 'submitted', label: 'Submitted' },
    { value: 'documents_pending', label: 'Documents Pending' },
    { value: 'under_review', label: 'Under Review' },
    { value: 'additional_info_required', label: 'Additional Info Required' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'completed', label: 'Completed' },
];

const STATUS_COLORS = {
    submitted: 'bg-blue-100 text-blue-800',
    documents_pending: 'bg-amber-100 text-amber-800',
    under_review: 'bg-purple-100 text-purple-800',
    additional_info_required: 'bg-orange-100 text-orange-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    cancelled: 'bg-slate-100 text-slate-600',
    completed: 'bg-green-100 text-green-800',
};

const MOCK_APP = {
    id: 'VISA-2026-00347',
    status: 'under_review',
    priority: 'high',
    serviceTier: 'Express',
    fee: '$89',
    paymentStatus: 'paid',
    submittedAt: '2026-03-10T10:30:00Z',
    lastUpdate: '2026-03-10T14:20:00Z',
    assignedTo: 'Sarah M.',
    applicant: {
        firstName: 'Rahul', lastName: 'Sharma',
        email: 'rahul.sharma@example.com', phone: '+91 98765 43210',
        dob: '1992-06-15', nationality: 'India',
        passportNumber: 'J1234567', passportExpiry: '2030-04-20',
    },
    travel: {
        destination: 'United States', visaType: 'Tourist (B-2)',
        arrivalDate: '2026-05-15', departureDate: '2026-06-14',
        accommodation: 'Hilton Hotel, New York', purpose: 'Tourism and sightseeing',
    },
    documents: [
        { id: 1, name: 'Passport Bio Page', type: 'passport', status: 'verified', size: '2.1 MB', uploadedAt: '2026-03-10' },
        { id: 2, name: 'Passport Photos', type: 'photos', status: 'verified', size: '1.5 MB', uploadedAt: '2026-03-10' },
        { id: 3, name: 'Bank Statements (6 months)', type: 'bank_statements', status: 'pending', size: '4.3 MB', uploadedAt: '2026-03-10' },
    ],
    timeline: [
        { status: 'submitted', date: '2026-03-10T10:30:00Z', note: 'Application received and payment confirmed.', by: 'System' },
        { status: 'documents_pending', date: '2026-03-10T12:00:00Z', note: 'All documents uploaded. Preliminary review started.', by: 'System' },
        { status: 'under_review', date: '2026-03-10T14:20:00Z', note: 'Assigned to agent Sarah M. for detailed review.', by: 'Admin' },
    ],
    internalNotes: 'Applicant has strong financials. Previous US visa expired 2023. Priority processing needed.',
};

const VisaApplicationDetail = () => {
    const { id } = useParams();
    const [app] = useState(MOCK_APP);
    const [newStatus, setNewStatus] = useState(app.status);
    const [statusNote, setStatusNote] = useState('');
    const [internalNote, setInternalNote] = useState(app.internalNotes);
    const [showStatusModal, setShowStatusModal] = useState(false);

    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    const handleStatusUpdate = () => {
        // API call to update status
        alert(`Status updated to: ${newStatus}\nNote: ${statusNote}`);
        setShowStatusModal(false);
        setStatusNote('');
    };

    return (
        <div className="min-h-screen bg-[#f6f6f8] font-sans text-slate-900">
            <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />



            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 border-b border-slate-100 bg-white/50 backdrop-blur-sm lg:hidden">
                <Link to="/visa/admin/applications" className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#1152d4] no-underline">
                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                    Back to Applications
                </Link>
            </div>

            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-6 lg:pt-10">
                {/* Breadcrumbs - Desktop */}
                <nav className="hidden lg:flex items-center gap-2 mb-8 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                    <Link to="/visa/admin" className="hover:text-[#1152d4] no-underline flex items-center gap-1.5 transition-colors">
                        <span className="material-symbols-outlined text-sm font-bold">dashboard</span> Admin
                    </Link>
                    <span className="text-slate-200">/</span>
                    <Link to="/visa/admin/applications" className="hover:text-[#1152d4] no-underline flex items-center gap-1.5 transition-colors">
                        <span className="material-symbols-outlined text-sm font-bold">assignment</span> Applications
                    </Link>
                    <span className="text-slate-200">/</span>
                    <span className="text-slate-900 font-black">{app.id} Review</span>
                </nav>

                {/* Header */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8 lg:mb-10">
                    <div>
                        <div className="flex flex-wrap items-center gap-2 lg:gap-3 mb-3 lg:mb-2">
                            <h1 className="text-xl lg:text-3xl font-black tracking-tight">{app.id}</h1>
                            <span className={`${STATUS_COLORS[app.status]} px-3 lg:px-4 py-1 lg:py-1.5 rounded-full text-[10px] lg:text-xs font-black uppercase tracking-wider`}>
                                {STATUS_OPTIONS.find(s => s.value === app.status)?.label}
                            </span>
                            {app.priority === 'high' && (
                                <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded text-[10px] lg:text-xs font-black uppercase tracking-wider">⚡ High</span>
                            )}
                            {app.priority === 'urgent' && (
                                <span className="bg-red-100 text-red-800 px-2.5 py-1 rounded text-[10px] lg:text-xs font-black uppercase tracking-wider">🔴 Urgent</span>
                            )}
                        </div>
                        <p className="text-slate-400 text-[11px] lg:text-sm font-medium">
                            Submitted <span className="text-slate-600 font-bold">{formatDate(app.submittedAt)}</span> · Last updated <span className="text-slate-600 font-bold">{formatDate(app.lastUpdate)}</span>
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2.5 w-full lg:w-auto">
                        <button
                            onClick={() => setShowStatusModal(true)}
                            className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-[#1152d4] text-white rounded-xl font-black text-[11px] lg:text-xs uppercase tracking-[0.15em] hover:bg-[#0e42b0] transition-all shadow-xl shadow-[#1152d4]/20"
                        >
                            <span className="material-symbols-outlined text-lg">edit</span>
                            Update Status
                        </button>
                        <button className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-black text-[11px] lg:text-xs uppercase tracking-[0.15em] hover:bg-slate-50 transition-all shadow-sm">
                            <span className="material-symbols-outlined text-lg">mail</span>
                            Email Applicant
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
                    {/* Left Column */}
                    <div className="lg:col-span-2 space-y-6 lg:space-y-8">
                        {/* Applicant Information */}
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40 p-6 lg:p-8">
                            <h2 className="text-sm lg:text-base font-black text-slate-900 uppercase tracking-tight mb-6 flex items-center gap-2.5">
                                <span className="p-2 bg-[#1152d4]/5 text-[#1152d4] rounded-lg">
                                    <span className="material-symbols-outlined text-xl">person</span>
                                </span>
                                Applicant Profile
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                                {[
                                    { label: 'Full Name', value: `${app.applicant.firstName} ${app.applicant.lastName}` },
                                    { label: 'Email', value: app.applicant.email },
                                    { label: 'Phone', value: app.applicant.phone },
                                    { label: 'Date of Birth', value: app.applicant.dob },
                                    { label: 'Nationality', value: app.applicant.nationality },
                                    { label: 'Passport No.', value: app.applicant.passportNumber },
                                    { label: 'Passport Expiry', value: app.applicant.passportExpiry },
                                ].map((field, i) => (
                                    <div key={i} className="min-w-0">
                                        <p className="text-[9px] lg:text-[10px] text-slate-400 font-black uppercase tracking-[0.15em] mb-1.5">{field.label}</p>
                                        <p className="text-sm font-bold text-slate-800 truncate">{field.value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Travel Details */}
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40 p-6 lg:p-8">
                            <h2 className="text-sm lg:text-base font-black text-slate-900 uppercase tracking-tight mb-6 flex items-center gap-2.5">
                                <span className="p-2 bg-[#1152d4]/5 text-[#1152d4] rounded-lg">
                                    <span className="material-symbols-outlined text-xl">flight_takeoff</span>
                                </span>
                                Journey Overview
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                                {[
                                    { label: 'Destination', value: app.travel.destination },
                                    { label: 'Visa Category', value: app.travel.visaType },
                                    { label: 'Arrival', value: app.travel.arrivalDate },
                                    { label: 'Departure', value: app.travel.departureDate },
                                    { label: 'Accommodation', value: app.travel.accommodation },
                                    { label: 'Travel Purpose', value: app.travel.purpose },
                                ].map((field, i) => (
                                    <div key={i} className="min-w-0">
                                        <p className="text-[9px] lg:text-[10px] text-slate-400 font-black uppercase tracking-[0.15em] mb-1.5">{field.label}</p>
                                        <p className="text-sm font-bold text-slate-800 truncate">{field.value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Documents */}
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40 p-6 lg:p-8">
                            <h2 className="text-sm lg:text-base font-black text-slate-900 uppercase tracking-tight mb-6 flex items-center gap-2.5">
                                <span className="p-2 bg-[#1152d4]/5 text-[#1152d4] rounded-lg">
                                    <span className="material-symbols-outlined text-xl">folder_managed</span>
                                </span>
                                Verified Documentation ({app.documents.length})
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {app.documents.map(doc => (
                                    <div key={doc.id} className="flex flex-col gap-4 p-5 border border-slate-100 rounded-2xl hover:bg-slate-50 transition-all group">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-slate-50 text-slate-400 group-hover:bg-[#1152d4]/10 group-hover:text-[#1152d4] rounded-lg transition-colors">
                                                    <span className="material-symbols-outlined text-xl">description</span>
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[13px] font-black text-slate-900 truncate">{doc.name}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 tracking-tight">{doc.size} · {doc.uploadedAt}</p>
                                                </div>
                                            </div>
                                            <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${doc.status === 'verified' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                                                }`}>
                                                {doc.status === 'verified' ? 'Verified' : 'Pending'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-auto">
                                            <button className="flex-1 py-2 bg-[#1152d4]/5 hover:bg-[#1152d4] text-[#1152d4] hover:text-white rounded-lg font-black text-[10px] uppercase tracking-widest transition-all">View File</button>
                                            {doc.status === 'pending' && (
                                                <button className="flex-1 py-2 bg-emerald-50 hover:bg-emerald-500 text-emerald-600 hover:text-white rounded-lg font-black text-[10px] uppercase tracking-widest transition-all">Verify Now</button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Timeline */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#1152d4]">timeline</span>
                                Status History
                            </h2>
                            <div className="space-y-4">
                                {[...app.timeline].reverse().map((event, i) => (
                                    <div key={i} className="flex gap-4 pb-4 border-b border-slate-100 last:border-b-0 last:pb-0">
                                        <div className="w-2 h-2 rounded-full bg-[#1152d4] mt-2 shrink-0 ring-4 ring-[#1152d4]/10"></div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className={`${STATUS_COLORS[event.status]} text-[10px] px-2 py-0.5 rounded-full font-bold`}>
                                                    {STATUS_OPTIONS.find(s => s.value === event.status)?.label}
                                                </span>
                                                <span className="text-xs text-slate-400">{formatDate(event.date)}</span>
                                                <span className="text-xs text-slate-400">by {event.by}</span>
                                            </div>
                                            <p className="text-sm text-slate-700 mt-1">{event.note}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Column - Actions & Meta */}
                    <div className="space-y-6">
                        {/* Service & Payment */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                            <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#1152d4] text-sm">payments</span>
                                Service & Payment
                            </h3>
                            <div className="space-y-3">
                                {[
                                    { label: 'Service Tier', value: app.serviceTier },
                                    { label: 'Service Fee', value: app.fee },
                                    { label: 'Payment Status', value: app.paymentStatus, badge: true },
                                    { label: 'Priority', value: app.priority.charAt(0).toUpperCase() + app.priority.slice(1) },
                                    { label: 'Assigned To', value: app.assignedTo || 'Unassigned' },
                                ].map((item, i) => (
                                    <div key={i} className="flex justify-between items-center text-sm py-1.5 border-b border-slate-50 last:border-b-0">
                                        <span className="text-slate-500">{item.label}</span>
                                        {item.badge ? (
                                            <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-bold capitalize">
                                                {item.value}
                                            </span>
                                        ) : (
                                            <span className="font-bold capitalize">{item.value}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Internal Notes */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                            <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#1152d4] text-sm">sticky_note_2</span>
                                Internal Notes
                            </h3>
                            <textarea
                                value={internalNote}
                                onChange={(e) => setInternalNote(e.target.value)}
                                rows={4}
                                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4] resize-none"
                                placeholder="Add internal notes..."
                            />
                            <button className="mt-3 w-full py-2 bg-slate-100 text-slate-700 rounded-lg font-bold text-xs hover:bg-slate-200 transition-colors">
                                Save Notes
                            </button>
                        </div>

                        {/* Quick Actions */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                            <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#1152d4] text-sm">bolt</span>
                                Quick Actions
                            </h3>
                            <div className="space-y-2">
                                <button className="w-full flex items-center gap-2 px-3 py-2.5 bg-green-50 text-green-700 rounded-lg font-bold text-sm hover:bg-green-100 transition-colors text-left">
                                    <span className="material-symbols-outlined text-lg">check_circle</span>
                                    Approve Application
                                </button>
                                <button className="w-full flex items-center gap-2 px-3 py-2.5 bg-orange-50 text-orange-700 rounded-lg font-bold text-sm hover:bg-orange-100 transition-colors text-left">
                                    <span className="material-symbols-outlined text-lg">help</span>
                                    Request More Info
                                </button>
                                <button className="w-full flex items-center gap-2 px-3 py-2.5 bg-red-50 text-red-700 rounded-lg font-bold text-sm hover:bg-red-100 transition-colors text-left">
                                    <span className="material-symbols-outlined text-lg">cancel</span>
                                    Reject Application
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Status Update Modal */}
            {showStatusModal && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={() => setShowStatusModal(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <span className="material-symbols-outlined text-[#1152d4]">edit</span>
                            Update Application Status
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">New Status</label>
                                <select
                                    value={newStatus}
                                    onChange={(e) => setNewStatus(e.target.value)}
                                    className="w-full rounded-lg border border-slate-300 h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]"
                                >
                                    {STATUS_OPTIONS.map(s => (
                                        <option key={s.value} value={s.value}>{s.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Note (visible to applicant)</label>
                                <textarea
                                    value={statusNote}
                                    onChange={(e) => setStatusNote(e.target.value)}
                                    rows={3}
                                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4] resize-none"
                                    placeholder="Add note about this status change..."
                                />
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowStatusModal(false)}
                                    className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleStatusUpdate}
                                    className="flex-1 py-2.5 bg-[#1152d4] text-white rounded-lg font-bold text-sm hover:bg-[#0e42b0] transition-all"
                                >
                                    Update & Notify
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VisaApplicationDetail;
