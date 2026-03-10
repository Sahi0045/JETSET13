import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Navbar from '../Navbar';
import Footer from '../Footer';

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)

const VisaApplicationSuccess = () => {
    const [searchParams] = useSearchParams();
    const [copied, setCopied] = useState(false);

    const applicationNumber = searchParams.get('ref') || `VISA-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}`;
    const destination = searchParams.get('destination') || 'International';
    const tier = searchParams.get('tier') || 'standard';

    const estimatedDays = tier === 'premium' ? '1-2' : tier === 'express' ? '2-3' : '5-7';

    const handleCopy = () => {
        navigator.clipboard.writeText(applicationNumber);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <div className="min-h-screen bg-[#f6f6f8] font-sans text-slate-900">
            <Navbar forceScrolled={true} />
            <link
                href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
                rel="stylesheet"
            />

            <div className="px-4 md:px-10 lg:px-40 flex flex-1 justify-center py-8 pt-24">
                <div className="flex flex-col w-full max-w-[800px] flex-1">

                    {/* Success Animation */}
                    <div className="text-center mb-10">
                        <div className="relative inline-flex items-center justify-center mb-6">
                            <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center animate-bounce-slow">
                                <span className="material-symbols-outlined text-green-600 text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                                    check_circle
                                </span>
                            </div>
                            <div className="absolute inset-0 w-24 h-24 rounded-full bg-green-200/50 animate-ping" style={{ animationDuration: '2s' }}></div>
                        </div>
                        <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight mb-3">
                            Application Submitted!
                        </h1>
                        <p className="text-slate-500 text-lg max-w-md mx-auto">
                            Your visa application has been received and is being processed by our expert team.
                        </p>
                    </div>

                    {/* Application Reference Card */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 mb-6">
                        <div className="text-center mb-6">
                            <p className="text-sm font-medium text-slate-500 mb-2">Your Application Reference</p>
                            <div className="flex items-center justify-center gap-3">
                                <span className="text-2xl md:text-3xl font-mono font-black text-[#1152d4] tracking-wider">
                                    {applicationNumber}
                                </span>
                                <button
                                    onClick={handleCopy}
                                    className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
                                    title="Copy to clipboard"
                                >
                                    <span className="material-symbols-outlined text-slate-600 text-lg">
                                        {copied ? 'check' : 'content_copy'}
                                    </span>
                                </button>
                            </div>
                            {copied && (
                                <p className="text-green-600 text-xs font-medium mt-2 animate-fade-in">Copied to clipboard!</p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-slate-100">
                            {[
                                { label: 'Destination', value: destination, icon: 'pin_drop' },
                                { label: 'Processing', value: `${estimatedDays} business days`, icon: 'schedule' },
                                { label: 'Status', value: 'Submitted', icon: 'pending', color: 'text-amber-600' },
                                { label: 'Service Tier', value: tier.charAt(0).toUpperCase() + tier.slice(1), icon: 'workspace_premium' },
                            ].map((item, i) => (
                                <div key={i} className="text-center">
                                    <span className={`material-symbols-outlined text-lg ${item.color || 'text-[#1152d4]'} mb-1 block`}>
                                        {item.icon}
                                    </span>
                                    <p className="text-xs text-slate-500 font-medium">{item.label}</p>
                                    <p className="text-sm font-bold capitalize">{item.value}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Timeline / Next Steps */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 mb-6">
                        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                            <span className="material-symbols-outlined text-[#1152d4]">timeline</span>
                            What Happens Next
                        </h2>
                        <div className="space-y-6">
                            {[
                                {
                                    step: 1, title: 'Application Received', subtitle: 'Just now',
                                    desc: 'Your application and documents have been securely received.',
                                    status: 'completed', icon: 'check_circle'
                                },
                                {
                                    step: 2, title: 'Document Verification', subtitle: `Within 24 hours`,
                                    desc: 'Our team will verify all uploaded documents and may request additional information.',
                                    status: 'current', icon: 'fact_check'
                                },
                                {
                                    step: 3, title: 'Under Review', subtitle: `${estimatedDays} business days`,
                                    desc: 'Your application will be processed by our visa specialists.',
                                    status: 'pending', icon: 'rate_review'
                                },
                                {
                                    step: 4, title: 'Decision & Delivery', subtitle: 'Email notification',
                                    desc: 'You\'ll receive an email with the decision and next steps.',
                                    status: 'pending', icon: 'mark_email_read'
                                },
                            ].map((item, i) => (
                                <div key={i} className="flex gap-4">
                                    <div className="flex flex-col items-center">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${item.status === 'completed' ? 'bg-green-100 text-green-600' :
                                                item.status === 'current' ? 'bg-[#1152d4] text-white shadow-lg shadow-[#1152d4]/30' :
                                                    'bg-slate-100 text-slate-400'
                                            }`}>
                                            <span className="material-symbols-outlined text-lg">{item.icon}</span>
                                        </div>
                                        {i < 3 && (
                                            <div className={`w-0.5 h-full min-h-[20px] mt-1 ${item.status === 'completed' ? 'bg-green-200' : 'bg-slate-200'
                                                }`}></div>
                                        )}
                                    </div>
                                    <div className="pb-4">
                                        <div className="flex items-center gap-2">
                                            <h3 className={`font-bold text-sm ${item.status === 'pending' ? 'text-slate-400' : 'text-slate-900'}`}>
                                                {item.title}
                                            </h3>
                                            <span className="text-xs text-slate-400">{item.subtitle}</span>
                                        </div>
                                        <p className={`text-sm mt-0.5 ${item.status === 'pending' ? 'text-slate-400' : 'text-slate-600'}`}>
                                            {item.desc}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <Link
                            to={`/visa/track?ref=${encodeURIComponent(applicationNumber)}`}
                            className="flex items-center justify-center gap-2 py-4 bg-[#1152d4] text-white rounded-xl font-bold text-sm shadow-md hover:bg-[#0e42b0] transition-all no-underline"
                        >
                            <span className="material-symbols-outlined">search</span>
                            Track Application
                        </Link>
                        <Link
                            to="/visa/apply"
                            className="flex items-center justify-center gap-2 py-4 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-50 transition-colors no-underline"
                        >
                            <span className="material-symbols-outlined">add</span>
                            New Application
                        </Link>
                        <Link
                            to="/visa"
                            className="flex items-center justify-center gap-2 py-4 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-50 transition-colors no-underline"
                        >
                            <span className="material-symbols-outlined">home</span>
                            Visa Home
                        </Link>
                    </div>

                    {/* Info Notice */}
                    <div className="p-6 bg-blue-50 border border-blue-100 rounded-xl flex gap-4 mb-8">
                        <span className="material-symbols-outlined text-[#1152d4] mt-0.5">info</span>
                        <div>
                            <p className="text-[#1152d4] font-bold text-sm mb-1">Keep your reference number safe</p>
                            <p className="text-blue-800 text-sm leading-relaxed">
                                A confirmation email has been sent to your registered email address. You can use your reference number
                                to track the status of your application at any time from the <Link to="/visa/track" className="font-bold underline">Application Tracker</Link>.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            <Footer />
        </div>
    );
};

export default VisaApplicationSuccess;
