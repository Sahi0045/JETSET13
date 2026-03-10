import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Navbar from '../Navbar';
import Footer from '../Footer';

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)

// Mock application data for demo purposes
const MOCK_APPLICATIONS = [
    {
        id: 'VISA-2026-00142',
        destination: 'United States',
        visaType: 'Tourist (B-2)',
        status: 'under_review',
        priority: 'normal',
        submittedAt: '2026-03-08T10:30:00Z',
        lastUpdate: '2026-03-10T14:20:00Z',
        serviceTier: 'Express',
        applicantName: 'Demo Applicant',
        timeline: [
            { status: 'submitted', date: '2026-03-08T10:30:00Z', note: 'Application received and payment confirmed.', by: 'System' },
            { status: 'documents_pending', date: '2026-03-08T12:00:00Z', note: 'Documents uploaded and under preliminary review.', by: 'System' },
            { status: 'under_review', date: '2026-03-09T09:15:00Z', note: 'Application assigned to visa specialist for detailed review.', by: 'Agent Sarah M.' },
        ],
        documents: [
            { name: 'Passport Bio Page', status: 'verified', icon: 'menu_book' },
            { name: 'Passport Photos', status: 'verified', icon: 'account_box' },
            { name: 'Bank Statements', status: 'pending', icon: 'account_balance_wallet' },
        ]
    },
    {
        id: 'VISA-2026-00098',
        destination: 'Japan',
        visaType: 'Tourist',
        status: 'approved',
        priority: 'normal',
        submittedAt: '2026-02-20T08:00:00Z',
        lastUpdate: '2026-03-01T16:45:00Z',
        serviceTier: 'Standard',
        applicantName: 'Demo Applicant',
        timeline: [
            { status: 'submitted', date: '2026-02-20T08:00:00Z', note: 'Application received.', by: 'System' },
            { status: 'under_review', date: '2026-02-21T10:00:00Z', note: 'Assigned to specialist.', by: 'System' },
            { status: 'approved', date: '2026-03-01T16:45:00Z', note: 'Visa approved. E-visa sent to email.', by: 'Agent John D.' },
        ],
        documents: [
            { name: 'Passport Bio Page', status: 'verified', icon: 'menu_book' },
            { name: 'Passport Photos', status: 'verified', icon: 'account_box' },
            { name: 'Bank Statements', status: 'verified', icon: 'account_balance_wallet' },
        ]
    }
];

const STATUS_CONFIG = {
    submitted: { label: 'Submitted', color: 'bg-blue-100 text-blue-800', icon: 'send', dotColor: 'bg-blue-500' },
    documents_pending: { label: 'Documents Pending', color: 'bg-amber-100 text-amber-800', icon: 'description', dotColor: 'bg-amber-500' },
    under_review: { label: 'Under Review', color: 'bg-purple-100 text-purple-800', icon: 'rate_review', dotColor: 'bg-purple-500' },
    additional_info_required: { label: 'Info Required', color: 'bg-orange-100 text-orange-800', icon: 'help', dotColor: 'bg-orange-500' },
    approved: { label: 'Approved', color: 'bg-green-100 text-green-800', icon: 'check_circle', dotColor: 'bg-green-500' },
    rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800', icon: 'cancel', dotColor: 'bg-red-500' },
    cancelled: { label: 'Cancelled', color: 'bg-slate-100 text-slate-600', icon: 'block', dotColor: 'bg-slate-400' },
    completed: { label: 'Completed', color: 'bg-green-100 text-green-800', icon: 'verified', dotColor: 'bg-green-600' },
};

const VisaApplicationTracker = () => {
    const [searchParams] = useSearchParams();
    const [searchQuery, setSearchQuery] = useState(searchParams.get('ref') || '');
    const [selectedApp, setSelectedApp] = useState(null);
    const [applications, setApplications] = useState([]);
    const [hasSearched, setHasSearched] = useState(false);

    useEffect(() => {
        if (searchParams.get('ref')) {
            handleSearch();
        }
    }, []);

    const handleSearch = () => {
        setHasSearched(true);
        // In production: API call to fetch application(s)
        if (searchQuery.trim()) {
            const found = MOCK_APPLICATIONS.filter(a =>
                a.id.toLowerCase().includes(searchQuery.toLowerCase())
            );
            setApplications(found);
            if (found.length === 1) setSelectedApp(found[0]);
        } else {
            // Show all for logged-in user
            setApplications(MOCK_APPLICATIONS);
        }
    };

    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div className="min-h-screen bg-[#f6f6f8] font-sans text-slate-900">
            <Navbar forceScrolled={true} />
            <link
                href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
                rel="stylesheet"
            />

            <div className="px-4 md:px-10 lg:px-40 flex flex-1 justify-center py-8 pt-24">
                <div className="flex flex-col w-full max-w-[1200px] flex-1">

                    {/* Header */}
                    <div className="mb-8">
                        <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
                            <Link to="/visa" className="hover:text-[#1152d4] transition-colors">Visa & Documents</Link>
                            <span className="material-symbols-outlined text-xs">chevron_right</span>
                            <span className="text-slate-900 font-medium">Track Application</span>
                        </div>
                        <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight mb-3">
                            Track Your Application
                        </h1>
                        <p className="text-slate-600 text-lg">Enter your application reference number to check the real-time status.</p>
                    </div>

                    {/* Quick Nav Links */}
                    <div className="flex flex-wrap gap-3 mb-8">
                        <Link to="/visa" className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-[#1152d4]/10 hover:text-[#1152d4] transition-all no-underline">
                            <span className="material-symbols-outlined text-sm">home</span>Visa Home
                        </Link>
                        <Link to="/visa/status" className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-[#1152d4]/10 hover:text-[#1152d4] transition-all no-underline">
                            <span className="material-symbols-outlined text-sm">dashboard</span>My Status Dashboard
                        </Link>
                        <Link to="/visa/booking" className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-[#1152d4]/10 hover:text-[#1152d4] transition-all no-underline">
                            <span className="material-symbols-outlined text-sm">calendar_month</span>Book Consultation
                        </Link>
                        <Link to="/visa/apply" className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1152d4] text-white text-xs font-bold hover:bg-[#0e42b0] transition-all no-underline shadow-sm">
                            <span className="material-symbols-outlined text-sm">add</span>New Application
                        </Link>
                    </div>

                    {/* Search Bar */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-8">
                        <div className="flex flex-col md:flex-row gap-4">
                            <div className="relative flex-1">
                                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    className="w-full rounded-lg border border-slate-300 h-12 pl-12 pr-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1152d4] placeholder:font-sans"
                                    placeholder="Enter reference number (e.g. VISA-2026-00142)"
                                />
                            </div>
                            <button
                                onClick={handleSearch}
                                className="px-8 h-12 bg-[#1152d4] text-white rounded-lg font-bold text-sm hover:bg-[#0e42b0] transition-all flex items-center justify-center gap-2"
                            >
                                <span className="material-symbols-outlined text-lg">search</span>
                                Track
                            </button>
                        </div>
                        <p className="text-xs text-slate-400 mt-3 flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">info</span>
                            Leave empty and click Track to view all your applications
                        </p>
                    </div>

                    {/* Results */}
                    {hasSearched && applications.length === 0 && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center mb-8">
                            <span className="material-symbols-outlined text-5xl text-slate-300 mb-4 block">search_off</span>
                            <h3 className="text-lg font-bold text-slate-700 mb-2">No Applications Found</h3>
                            <p className="text-slate-500 text-sm max-w-md mx-auto mb-6">
                                We couldn't find any applications matching your reference number. Please check and try again.
                            </p>
                            <Link
                                to="/visa/apply"
                                className="inline-flex items-center gap-2 px-6 py-3 bg-[#1152d4] text-white rounded-lg font-bold text-sm hover:bg-[#0e42b0] transition-all no-underline"
                            >
                                <span className="material-symbols-outlined">add</span>
                                Start New Application
                            </Link>
                        </div>
                    )}

                    {applications.length > 0 && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Applications List */}
                            <div className={`space-y-4 ${selectedApp ? 'lg:col-span-1' : 'lg:col-span-3'}`}>
                                {applications.map(app => {
                                    const statusCfg = STATUS_CONFIG[app.status] || STATUS_CONFIG.submitted;
                                    return (
                                        <button
                                            key={app.id}
                                            onClick={() => setSelectedApp(app)}
                                            className={`w-full text-left bg-white rounded-xl border-2 p-5 transition-all hover:shadow-md ${selectedApp?.id === app.id
                                                ? 'border-[#1152d4] shadow-md'
                                                : 'border-slate-200'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between mb-3">
                                                <div>
                                                    <p className="font-mono font-bold text-sm text-[#1152d4]">{app.id}</p>
                                                    <p className="text-slate-700 font-bold mt-1">{app.destination}</p>
                                                </div>
                                                <span className={`${statusCfg.color} text-xs px-2.5 py-1 rounded-full font-bold`}>
                                                    {statusCfg.label}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-slate-500">
                                                <span className="flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-xs">flight_takeoff</span>
                                                    {app.visaType}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-xs">schedule</span>
                                                    {formatDate(app.submittedAt)}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Application Detail Panel */}
                            {selectedApp && (
                                <div className="lg:col-span-2 space-y-6">
                                    {/* Status Header */}
                                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <div>
                                                <p className="font-mono font-bold text-lg text-[#1152d4]">{selectedApp.id}</p>
                                                <p className="text-slate-500 text-sm">Submitted {formatDate(selectedApp.submittedAt)}</p>
                                            </div>
                                            <div className={`${STATUS_CONFIG[selectedApp.status]?.color} px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2`}>
                                                <span className="material-symbols-outlined text-sm">{STATUS_CONFIG[selectedApp.status]?.icon}</span>
                                                {STATUS_CONFIG[selectedApp.status]?.label}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
                                            {[
                                                { label: 'Destination', value: selectedApp.destination, icon: 'pin_drop' },
                                                { label: 'Visa Type', value: selectedApp.visaType, icon: 'description' },
                                                { label: 'Service', value: selectedApp.serviceTier, icon: 'workspace_premium' },
                                                { label: 'Last Update', value: formatDate(selectedApp.lastUpdate), icon: 'update' },
                                            ].map((item, i) => (
                                                <div key={i}>
                                                    <div className="flex items-center gap-1 text-xs text-slate-400 mb-1">
                                                        <span className="material-symbols-outlined text-xs">{item.icon}</span>
                                                        {item.label}
                                                    </div>
                                                    <p className="text-sm font-bold">{item.value}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Timeline */}
                                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                                        <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[#1152d4]">timeline</span>
                                            Application Timeline
                                        </h3>
                                        <div className="space-y-1">
                                            {selectedApp.timeline.map((event, i) => {
                                                const sc = STATUS_CONFIG[event.status] || STATUS_CONFIG.submitted;
                                                return (
                                                    <div key={i} className="flex gap-4 pb-6 last:pb-0">
                                                        <div className="flex flex-col items-center">
                                                            <div className={`w-3 h-3 rounded-full shrink-0 ${sc.dotColor} ring-4 ring-white`}></div>
                                                            {i < selectedApp.timeline.length - 1 && (
                                                                <div className="w-0.5 h-full bg-slate-200 mt-1"></div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2 -mt-1">
                                                                <span className={`${sc.color} text-[10px] px-2 py-0.5 rounded-full font-bold`}>{sc.label}</span>
                                                                <span className="text-xs text-slate-400">{formatDate(event.date)}</span>
                                                            </div>
                                                            <p className="text-sm text-slate-700 mt-1">{event.note}</p>
                                                            {event.by !== 'System' && (
                                                                <p className="text-xs text-slate-400 mt-0.5">By {event.by}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Documents Status */}
                                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[#1152d4]">folder_open</span>
                                            Document Status
                                        </h3>
                                        <div className="space-y-3">
                                            {selectedApp.documents.map((doc, i) => (
                                                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                                    <div className="flex items-center gap-3">
                                                        <span className="material-symbols-outlined text-[#1152d4]">{doc.icon}</span>
                                                        <span className="text-sm font-medium">{doc.name}</span>
                                                    </div>
                                                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${doc.status === 'verified'
                                                        ? 'bg-green-100 text-green-700'
                                                        : 'bg-amber-100 text-amber-700'
                                                        }`}>
                                                        {doc.status === 'verified' ? '✓ Verified' : '⏳ Pending'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex flex-wrap gap-3">
                                        <button className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-50 transition-colors">
                                            <span className="material-symbols-outlined text-lg">upload_file</span>
                                            Upload Documents
                                        </button>
                                        <Link to="/contact" className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-50 transition-colors no-underline">
                                            <span className="material-symbols-outlined text-lg">contact_support</span>
                                            Contact Support
                                        </Link>
                                        {selectedApp.status !== 'cancelled' && selectedApp.status !== 'rejected' && selectedApp.status !== 'approved' && (
                                            <button className="flex items-center gap-2 px-5 py-2.5 bg-white border border-red-200 text-red-600 rounded-lg font-bold text-sm hover:bg-red-50 transition-colors ml-auto">
                                                <span className="material-symbols-outlined text-lg">cancel</span>
                                                Cancel Application
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Not searched yet */}
                    {!hasSearched && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                            <span className="material-symbols-outlined text-6xl text-slate-200 mb-4 block">manage_search</span>
                            <h3 className="text-lg font-bold text-slate-700 mb-2">Enter Your Reference Number</h3>
                            <p className="text-slate-500 text-sm max-w-md mx-auto">
                                Use the search bar above to look up your visa application status. Your reference number was provided at the time of submission.
                            </p>
                        </div>
                    )}

                </div>
            </div>
            <Footer />
        </div>
    );
};

export default VisaApplicationTracker;
