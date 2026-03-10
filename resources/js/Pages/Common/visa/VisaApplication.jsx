import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../Navbar';
import Footer from '../Footer';

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)
// Screen: Customer Visa Application Portal - Document Upload Step (494bef6be2e04010b12bdaa05c332257)

const STEPS = [
    { id: 1, label: 'Personal Information', icon: 'person' },
    { id: 2, label: 'Travel Details', icon: 'flight_takeoff' },
    { id: 3, label: 'Document Upload', icon: 'description' },
    { id: 4, label: 'Review & Pay', icon: 'payments' },
];

const VisaApplication = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [currentStep, setCurrentStep] = useState(1);
    const [uploadedFiles, setUploadedFiles] = useState({});

    const destination = searchParams.get('destination') || '';
    const nationality = searchParams.get('nationality') || '';

    const [personalInfo, setPersonalInfo] = useState({
        firstName: '',
        lastName: '',
        dateOfBirth: '',
        nationality: nationality,
        passportNumber: '',
        passportExpiry: '',
        email: '',
        phone: '',
    });

    const [travelDetails, setTravelDetails] = useState({
        destination: destination,
        visaType: 'tourist',
        arrivalDate: '',
        departureDate: '',
        accommodation: '',
        purposeOfVisit: '',
    });

    const [selectedTier, setSelectedTier] = useState('standard');

    const tiers = [
        {
            id: 'standard',
            name: 'Standard',
            price: '$49',
            features: ['Processing in 5-7 days', 'Email updates', 'Document checklist', 'Basic support'],
        },
        {
            id: 'express',
            name: 'Express',
            price: '$89',
            features: ['Processing in 2-3 days', 'SMS & email updates', 'Priority review', 'Phone support', 'Document pre-check'],
            recommended: true,
        },
        {
            id: 'premium',
            name: 'Premium Concierge',
            price: '$149',
            features: ['Processing in 24 hours', 'Dedicated agent', 'Video consultation', '24/7 support', 'Embassy liaison', 'Guaranteed review'],
        },
    ];

    const documents = [
        {
            id: 'passport',
            icon: 'menu_book',
            title: 'Passport Bio Page',
            description: 'Submit a clear color copy of the main page of your passport containing your photo and personal details.',
            formats: ['PDF, JPG, PNG'],
            maxSize: 'Max 10MB',
            uploadIcon: 'upload',
            uploadLabel: 'Upload File',
            required: true,
        },
        {
            id: 'photos',
            icon: 'account_box',
            title: 'Passport Size Photographs',
            description: 'Two recent color photographs (taken within the last 6 months) with a white background.',
            formats: ['35mm x 45mm'],
            maxSize: 'Digital Copy',
            uploadIcon: 'add_a_photo',
            uploadLabel: 'Add Photo',
            required: true,
        },
        {
            id: 'bank_statements',
            icon: 'account_balance_wallet',
            title: 'Financial Proof (Bank Statements)',
            description: 'Last 6 months of bank statements showing sufficient funds for the duration of stay.',
            formats: ['PDF Format Only'],
            maxSize: 'E-Statements Preferred',
            uploadIcon: 'account_balance',
            uploadLabel: 'Import PDF',
            required: true,
            crucial: true,
        },
    ];

    const handleFileUpload = (docId, file) => {
        if (file) {
            setUploadedFiles(prev => ({ ...prev, [docId]: file.name }));
        }
    };

    const handleNext = () => {
        if (currentStep < 4) setCurrentStep(currentStep + 1);
    };

    const handlePrev = () => {
        if (currentStep > 1) setCurrentStep(currentStep - 1);
    };

    const handleSubmit = () => {
        // Submit the application and navigate to success page
        const dest = travelDetails.destination || destination;
        navigate(`/visa/success?destination=${encodeURIComponent(dest)}&tier=${selectedTier}`);
    };

    const completionPercent = ((currentStep - 1) / (STEPS.length - 1)) * 100;

    return (
        <div className="min-h-screen bg-[#f6f6f8] font-sans text-slate-900">
            <Navbar forceScrolled={true} />

            {/* Google Material Symbols */}
            <link
                href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
                rel="stylesheet"
            />

            <div className="pt-16 flex flex-1 overflow-hidden min-h-screen">

                {/* Sidebar Stepper */}
                <aside className="w-72 bg-white border-r border-slate-200 p-6 flex flex-col justify-between fixed top-16 bottom-0 overflow-y-auto hidden lg:flex">
                    <div className="flex flex-col gap-8">
                        <div>
                            <h1 className="text-slate-900 text-lg font-bold">
                                {travelDetails.visaType === 'tourist' ? 'Tourist Visa (B-2)' : 'Visa Application'}
                            </h1>
                            <p className="text-slate-500 text-sm">
                                Application ID: <span className="font-mono text-[#1152d4]">#VD-{Math.floor(Math.random() * 90000) + 10000}</span>
                            </p>
                            {destination && (
                                <p className="text-slate-500 text-sm mt-1">
                                    Destination: <span className="font-medium text-slate-700">{destination}</span>
                                </p>
                            )}
                        </div>

                        <nav className="flex flex-col gap-2">
                            {STEPS.map((step) => {
                                const isCompleted = step.id < currentStep;
                                const isActive = step.id === currentStep;
                                const isPending = step.id > currentStep;

                                return (
                                    <div
                                        key={step.id}
                                        className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all border ${isActive
                                            ? 'bg-[#1152d4]/5 border-[#1152d4]/20'
                                            : 'border-transparent'
                                            } ${isPending ? 'opacity-60' : ''}`}
                                    >
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isCompleted
                                            ? 'bg-green-100 text-green-600'
                                            : isActive
                                                ? 'bg-[#1152d4] text-white shadow-lg shadow-[#1152d4]/30'
                                                : 'bg-slate-100 text-slate-400'
                                            }`}>
                                            {isCompleted ? (
                                                <span className="material-symbols-outlined text-lg">check</span>
                                            ) : (
                                                <span className="material-symbols-outlined text-lg">{step.icon}</span>
                                            )}
                                        </div>
                                        <div className="flex flex-col">
                                            <p className={`text-xs font-semibold uppercase tracking-wider ${isActive ? 'text-[#1152d4]' : 'text-slate-500'
                                                }`}>
                                                Step {step.id}
                                            </p>
                                            <p className={`text-sm font-medium ${isCompleted
                                                ? 'text-slate-400 line-through'
                                                : isActive
                                                    ? 'text-slate-900 font-bold'
                                                    : 'text-slate-600'
                                                }`}>
                                                {step.label}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </nav>

                        {/* Progress Bar */}
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-bold text-slate-700">Completion</span>
                                <span className="text-xs font-bold text-[#1152d4]">{Math.round(completionPercent)}%</span>
                            </div>
                            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                <div
                                    className="bg-[#1152d4] h-full rounded-full transition-all duration-500"
                                    style={{ width: `${completionPercent}%` }}
                                />
                            </div>
                            <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
                                <span className="material-symbols-outlined text-[14px] align-middle mr-1">info</span>
                                You can save your progress and return later to finish the application.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <button className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-slate-100 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-200 transition-colors">
                            <span className="material-symbols-outlined text-lg">save</span>
                            Save for Later
                        </button>
                        <button className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-[#1152d4]/10 text-[#1152d4] rounded-lg font-bold text-sm hover:bg-[#1152d4]/20 transition-colors">
                            <span className="material-symbols-outlined text-lg">contact_support</span>
                            Get Live Help
                        </button>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto p-6 lg:p-10 lg:ml-72">
                    <div className="max-w-3xl mx-auto">

                        {/* Step 1: Personal Information */}
                        {currentStep === 1 && (
                            <div>
                                <div className="mb-8">
                                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">Personal Information</h2>
                                    <p className="text-slate-500 mt-2 text-lg">Please provide your personal details as they appear on your passport.</p>
                                </div>
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {[
                                            { label: 'First Name', key: 'firstName', type: 'text', placeholder: 'As on passport' },
                                            { label: 'Last Name', key: 'lastName', type: 'text', placeholder: 'As on passport' },
                                            { label: 'Date of Birth', key: 'dateOfBirth', type: 'date', placeholder: '' },
                                            { label: 'Nationality', key: 'nationality', type: 'text', placeholder: 'e.g. Indian' },
                                            { label: 'Passport Number', key: 'passportNumber', type: 'text', placeholder: 'e.g. A1234567' },
                                            { label: 'Passport Expiry Date', key: 'passportExpiry', type: 'date', placeholder: '' },
                                            { label: 'Email Address', key: 'email', type: 'email', placeholder: 'your@email.com' },
                                            { label: 'Phone Number', key: 'phone', type: 'tel', placeholder: '+1 (555) 000-0000' },
                                        ].map((field) => (
                                            <div key={field.key}>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">{field.label} *</label>
                                                <input
                                                    type={field.type}
                                                    value={personalInfo[field.key]}
                                                    onChange={(e) => setPersonalInfo({ ...personalInfo, [field.key]: e.target.value })}
                                                    className="w-full rounded-lg border border-slate-300 h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]"
                                                    placeholder={field.placeholder}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Travel Details */}
                        {currentStep === 2 && (
                            <div>
                                <div className="mb-8">
                                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">Travel Details</h2>
                                    <p className="text-slate-500 mt-2 text-lg">Tell us about your planned trip and the type of visa you need.</p>
                                </div>
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-2">Destination Country *</label>
                                            <input
                                                type="text"
                                                value={travelDetails.destination}
                                                onChange={(e) => setTravelDetails({ ...travelDetails, destination: e.target.value })}
                                                className="w-full rounded-lg border border-slate-300 h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]"
                                                placeholder="e.g. Japan"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-2">Visa Type *</label>
                                            <select
                                                value={travelDetails.visaType}
                                                onChange={(e) => setTravelDetails({ ...travelDetails, visaType: e.target.value })}
                                                className="w-full rounded-lg border border-slate-300 h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]"
                                            >
                                                <option value="tourist">Tourist / Visitor</option>
                                                <option value="business">Business</option>
                                                <option value="student">Student</option>
                                                <option value="transit">Transit</option>
                                                <option value="work">Work</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-2">Planned Arrival Date *</label>
                                            <input
                                                type="date"
                                                value={travelDetails.arrivalDate}
                                                onChange={(e) => setTravelDetails({ ...travelDetails, arrivalDate: e.target.value })}
                                                className="w-full rounded-lg border border-slate-300 h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-2">Planned Departure Date *</label>
                                            <input
                                                type="date"
                                                value={travelDetails.departureDate}
                                                onChange={(e) => setTravelDetails({ ...travelDetails, departureDate: e.target.value })}
                                                className="w-full rounded-lg border border-slate-300 h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]"
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-slate-700 mb-2">Accommodation Address</label>
                                            <input
                                                type="text"
                                                value={travelDetails.accommodation}
                                                onChange={(e) => setTravelDetails({ ...travelDetails, accommodation: e.target.value })}
                                                className="w-full rounded-lg border border-slate-300 h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]"
                                                placeholder="Hotel name or address in destination country"
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-slate-700 mb-2">Purpose of Visit</label>
                                            <textarea
                                                value={travelDetails.purposeOfVisit}
                                                onChange={(e) => setTravelDetails({ ...travelDetails, purposeOfVisit: e.target.value })}
                                                rows={3}
                                                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4] resize-none"
                                                placeholder="Brief description of your travel purpose..."
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Document Upload */}
                        {currentStep === 3 && (
                            <div>
                                <div className="mb-8">
                                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">Required Documents</h2>
                                    <p className="text-slate-500 mt-2 text-lg">
                                        Please upload clear scans or high-quality photos of the following documents to support your application.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 gap-6">
                                    {documents.map((doc) => (
                                        <div
                                            key={doc.id}
                                            className={`bg-white rounded-xl p-8 border-2 border-dashed transition-all ${uploadedFiles[doc.id]
                                                ? 'border-green-300 bg-green-50/30'
                                                : 'border-slate-200 hover:border-[#1152d4]/50'
                                                }`}
                                        >
                                            <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                                                <div className="w-16 h-16 rounded-xl bg-[#1152d4]/5 text-[#1152d4] flex items-center justify-center shrink-0">
                                                    <span className="material-symbols-outlined text-3xl">{doc.icon}</span>
                                                </div>
                                                <div className="flex-1 text-center md:text-left">
                                                    <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                                                        <h3 className="text-lg font-bold text-slate-900">{doc.title}</h3>
                                                        {doc.crucial && (
                                                            <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded font-black uppercase">
                                                                Crucial
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-slate-500 text-sm mt-1">{doc.description}</p>
                                                    <div className="mt-3 flex flex-wrap justify-center md:justify-start gap-2">
                                                        {doc.formats.map((fmt, i) => (
                                                            <span key={i} className="inline-flex items-center py-1 px-3 rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                                                                {fmt}
                                                            </span>
                                                        ))}
                                                        <span className="inline-flex items-center py-1 px-3 rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                                                            {doc.maxSize}
                                                        </span>
                                                    </div>
                                                    {uploadedFiles[doc.id] && (
                                                        <div className="mt-3 flex items-center gap-2 text-green-600 text-sm font-medium">
                                                            <span className="material-symbols-outlined text-sm">check_circle</span>
                                                            {uploadedFiles[doc.id]}
                                                        </div>
                                                    )}
                                                </div>
                                                <label className="mt-4 md:mt-0 flex items-center gap-2 px-6 py-2.5 bg-[#1152d4] text-white rounded-lg font-bold text-sm shadow-md shadow-[#1152d4]/20 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer">
                                                    <span className="material-symbols-outlined text-lg">{doc.uploadIcon}</span>
                                                    {uploadedFiles[doc.id] ? 'Replace' : doc.uploadLabel}
                                                    <input
                                                        type="file"
                                                        className="hidden"
                                                        accept=".pdf,.jpg,.jpeg,.png"
                                                        onChange={(e) => handleFileUpload(doc.id, e.target.files[0])}
                                                    />
                                                </label>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Warning Notice */}
                                <div className="mt-8 p-6 bg-amber-50 border border-amber-100 rounded-xl flex gap-4">
                                    <span className="material-symbols-outlined text-amber-600 mt-0.5">warning</span>
                                    <div>
                                        <p className="text-amber-900 font-bold text-sm leading-none">Important Notice</p>
                                        <p className="text-amber-800 text-sm mt-2 leading-relaxed">
                                            Ensure all documents are translated into English by a certified translator if they are in another language.
                                            Applications with illegible documents will be rejected immediately.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 4: Review & Pay */}
                        {currentStep === 4 && (
                            <div>
                                <div className="mb-8">
                                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">Service Selection & Final Review</h2>
                                    <p className="text-slate-500 mt-2 text-lg">Choose your processing tier and review your application before submitting.</p>
                                </div>

                                {/* Tier Selection */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                                    {tiers.map((tier) => (
                                        <button
                                            key={tier.id}
                                            onClick={() => setSelectedTier(tier.id)}
                                            className={`relative p-6 rounded-xl border-2 text-left transition-all ${selectedTier === tier.id
                                                ? 'border-[#1152d4] bg-[#1152d4]/5'
                                                : 'border-slate-200 hover:border-[#1152d4]/40'
                                                }`}
                                        >
                                            {tier.recommended && (
                                                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1152d4] text-white text-xs px-3 py-1 rounded-full font-bold">
                                                    Recommended
                                                </span>
                                            )}
                                            <div className="text-2xl font-black text-[#1152d4] mb-1">{tier.price}</div>
                                            <div className="font-bold text-slate-900 mb-3">{tier.name}</div>
                                            <ul className="space-y-2">
                                                {tier.features.map((feature, i) => (
                                                    <li key={i} className="flex items-center gap-2 text-xs text-slate-600">
                                                        <span className="material-symbols-outlined text-xs text-green-500">check_circle</span>
                                                        {feature}
                                                    </li>
                                                ))}
                                            </ul>
                                        </button>
                                    ))}
                                </div>

                                {/* Application Summary */}
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
                                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-[#1152d4]">summarize</span>
                                        Application Summary
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                                        <div>
                                            <p className="text-slate-500 font-medium mb-3">Personal Details</p>
                                            <div className="space-y-2">
                                                <div className="flex justify-between">
                                                    <span className="text-slate-600">Name</span>
                                                    <span className="font-medium">{personalInfo.firstName} {personalInfo.lastName}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-600">Nationality</span>
                                                    <span className="font-medium">{personalInfo.nationality || nationality || '—'}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-600">Passport</span>
                                                    <span className="font-medium">{personalInfo.passportNumber || '—'}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-slate-500 font-medium mb-3">Travel Details</p>
                                            <div className="space-y-2">
                                                <div className="flex justify-between">
                                                    <span className="text-slate-600">Destination</span>
                                                    <span className="font-medium">{travelDetails.destination || destination || '—'}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-600">Visa Type</span>
                                                    <span className="font-medium capitalize">{travelDetails.visaType}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-600">Arrival</span>
                                                    <span className="font-medium">{travelDetails.arrivalDate || '—'}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-slate-500 font-medium mb-3">Documents Uploaded</p>
                                            <div className="space-y-2">
                                                {documents.map((doc) => (
                                                    <div key={doc.id} className="flex items-center gap-2">
                                                        <span className={`material-symbols-outlined text-sm ${uploadedFiles[doc.id] ? 'text-green-500' : 'text-slate-300'}`}>
                                                            {uploadedFiles[doc.id] ? 'check_circle' : 'radio_button_unchecked'}
                                                        </span>
                                                        <span className={`text-sm ${uploadedFiles[doc.id] ? 'text-slate-700' : 'text-slate-400'}`}>
                                                            {doc.title}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-slate-500 font-medium mb-3">Selected Service</p>
                                            <div className="p-3 bg-[#1152d4]/5 rounded-lg border border-[#1152d4]/20">
                                                <div className="font-bold text-[#1152d4]">{tiers.find(t => t.id === selectedTier)?.name}</div>
                                                <div className="text-2xl font-black text-slate-900">{tiers.find(t => t.id === selectedTier)?.price}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Navigation Buttons */}
                        <div className="mt-10 flex flex-col sm:flex-row justify-between items-center gap-4 pt-8 border-t border-slate-200">
                            <button
                                onClick={handlePrev}
                                disabled={currentStep === 1}
                                className="flex items-center gap-2 px-6 py-3 bg-slate-100 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-200 transition-colors w-full sm:w-auto justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <span className="material-symbols-outlined text-lg">arrow_back</span>
                                Previous Step
                            </button>
                            <div className="flex gap-4 w-full sm:w-auto">
                                {currentStep < 4 ? (
                                    <button
                                        onClick={handleNext}
                                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-10 py-3 bg-[#1152d4] text-white rounded-lg font-bold text-sm shadow-xl shadow-[#1152d4]/30 hover:scale-[1.02] active:scale-95 transition-all"
                                    >
                                        {currentStep === 3 ? 'Review & Continue' : 'Continue'}
                                        <span className="material-symbols-outlined text-lg">arrow_forward</span>
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleSubmit}
                                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-10 py-3 bg-green-600 text-white rounded-lg font-bold text-sm shadow-xl shadow-green-600/30 hover:scale-[1.02] active:scale-95 transition-all"
                                    >
                                        <span className="material-symbols-outlined text-lg">send</span>
                                        Pay & Submit Application
                                    </button>
                                )}
                            </div>
                        </div>

                    </div>
                </main>
            </div>
        </div>
    );
};

export default VisaApplication;
