import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../Navbar';
import Footer from '../Footer';
import { apiGet, apiPost } from '../../../utils/apiHelper';

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)
// Screen 4: Customer Status Dashboard

const CustomerStatusDashboard = () => {
    const [application, setApplication] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState('');
    const [chatHistory, setChatHistory] = useState([]);
    const [sending, setSending] = useState(false);

    const fetchApplication = useCallback(async () => {
        try {
            const response = await apiGet('visa/applications/my');
            const data = await response.json();
            if (data.success && data.data && data.data.length > 0) {
                // Get the most recent application
                const app = data.data[0];
                setApplication(app);
                fetchMessages(app.id);
            } else {
                setLoading(false);
            }
        } catch (err) {
            console.error('fetchApplication error:', err);
            setError('Failed to load application data.');
            setLoading(false);
        }
    }, []);

    const fetchMessages = async (appId) => {
        try {
            const response = await apiGet(`visa/applications/${appId}/messages`);
            const data = await response.json();
            if (data.success) {
                const mappedMessages = data.data.map(m => ({
                    id: m.id,
                    type: m.sender_type === 'customer' ? 'user' : 'agent',
                    name: m.sender_name || 'Agent',
                    time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    content: m.content,
                    isFile: !!m.attachment_url,
                    fileName: m.attachment_name,
                    fileSize: '—'
                }));
                setChatHistory(mappedMessages);
            }
        } catch (err) {
            console.error('fetchMessages error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchApplication();
    }, [fetchApplication]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!message.trim() || !application || sending) return;

        setSending(true);
        try {
            const response = await apiPost(`visa/applications/${application.id}/messages`, {
                content: message,
                senderType: 'customer',
                senderName: `${application.personal_info?.firstName || ''} ${application.personal_info?.lastName || ''}`.trim()
            });
            const data = await response.json();
            if (data.success) {
                const newMessage = {
                    id: data.data.id,
                    type: 'user',
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    content: message
                };
                setChatHistory([...chatHistory, newMessage]);
                setMessage('');
            }
        } catch (err) {
            console.error('handleSendMessage error:', err);
        } finally {
            setSending(false);
        }
    };

    // Status mapping for stepper
    const getStepStatus = (step) => {
        if (!application) return 'pending';
        const status = application.status;
        
        const statusFlow = [
            { step: 'applied', statuses: ['submitted', 'documents_pending', 'under_review', 'additional_info_required', 'approved', 'completed'] },
            { step: 'verified', statuses: ['under_review', 'additional_info_required', 'approved', 'completed'] },
            { step: 'processing', statuses: ['under_review', 'approved', 'completed'] },
            { step: 'ready', statuses: ['approved', 'completed'] }
        ];

        const stepConfig = statusFlow.find(s => s.step === step);
        if (stepConfig.statuses.includes(status)) {
            // For processing step, if it's the current active one, color it differently
            if (step === 'processing' && (status === 'under_review' || status === 'additional_info_required')) return 'active';
            return 'completed';
        }
        return 'pending';
    };

    return (
        <div className="min-h-screen bg-[#f6f6f8] font-sans text-slate-900 flex flex-col overflow-hidden">
            <Navbar forceScrolled={true} />
            <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />

            <div className="flex flex-1 overflow-hidden pt-16">
                {/* Main Content */}
                <main className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-[900px] mx-auto">
                        {/* Quick Nav */}
                        <div className="flex flex-wrap gap-2 mb-6">
                            <Link to="/visa" className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-[#1152d4]/10 hover:text-[#1152d4] transition-all no-underline">
                                <span className="material-symbols-outlined text-sm">home</span>Visa Home
                            </Link>
                            <Link to="/visa/apply" className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-[#1152d4]/10 hover:text-[#1152d4] transition-all no-underline">
                                <span className="material-symbols-outlined text-sm">edit_document</span>Apply
                            </Link>
                            <Link to="/visa/track" className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-[#1152d4]/10 hover:text-[#1152d4] transition-all no-underline">
                                <span className="material-symbols-outlined text-sm">search</span>Track
                            </Link>
                            <Link to="/visa/booking" className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-[#1152d4]/10 hover:text-[#1152d4] transition-all no-underline">
                                <span className="material-symbols-outlined text-sm">calendar_month</span>Book Consultation
                            </Link>
                            <Link to="/visa/documents" className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-[#1152d4]/10 hover:text-[#1152d4] transition-all no-underline">
                                <span className="material-symbols-outlined text-sm">folder_open</span>Documents
                            </Link>
                        </div>

                        {loading ? (
                            <div className="flex flex-col items-center justify-center p-20 bg-white rounded-3xl border border-slate-100 shadow-sm animate-pulse">
                                <div className="size-16 bg-slate-100 rounded-full mb-4"></div>
                                <div className="h-4 bg-slate-100 rounded w-48 mb-2"></div>
                                <div className="h-3 bg-slate-50 rounded w-32"></div>
                            </div>
                        ) : !application ? (
                            <div className="p-20 text-center bg-white rounded-3xl border border-slate-100 shadow-sm">
                                <span className="material-symbols-outlined text-5xl text-slate-200 block mb-3">folder_open</span>
                                <h3 className="text-slate-500 font-black uppercase tracking-widest text-sm">No Active Application</h3>
                                <p className="text-slate-400 text-xs mt-2 font-medium">You don't have any submitted visa applications yet.</p>
                                <Link to="/visa/apply" className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-[#1152d4] text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-[#0e42b0] transition-all no-underline shadow-lg shadow-[#1152d4]/20">Start New Application</Link>
                            </div>
                        ) : (
                            <>
                                <div className="flex justify-between items-end gap-4 mb-8">
                                    <div>
                                        <h1 className="text-2xl font-black text-slate-900 leading-tight">
                                            Application: {application.travel_details?.visaType} - {application.travel_details?.destination}
                                        </h1>
                                        <p className="text-slate-500 text-sm mt-1">
                                            Application ID: <span className="font-mono text-[#1152d4] font-bold">#{application.application_ref}</span> • Submitted on {new Date(application.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </p>
                                    </div>
                                    <button className="flex items-center gap-2 h-10 px-4 bg-white border border-slate-200 rounded-lg text-slate-700 text-sm font-bold shadow-sm hover:bg-slate-50">
                                        <span className="material-symbols-outlined text-lg">download</span>
                                        Download Receipt
                                    </button>
                                </div>

                                {/* Progress Stepper */}
                                <div className="bg-white rounded-2xl p-8 mb-8 border border-slate-200 shadow-sm relative overflow-hidden">
                                    <div className="flex justify-between items-center relative z-10 font-bold">
                                        {/* Applied */}
                                        <div className="flex flex-col items-center gap-2">
                                            <div className={`size-10 rounded-full flex items-center justify-center shadow-md ${getStepStatus('applied') === 'completed' ? 'bg-[#1152d4] text-white' : 'bg-slate-100 text-slate-400'}`}>
                                                <span className="material-symbols-outlined text-xl">{getStepStatus('applied') === 'completed' ? 'check' : 'edit_document'}</span>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-xs">Applied</p>
                                                <p className="text-slate-400 text-[10px]">{new Date(application.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                                            </div>
                                        </div>
                                        {/* Progress Line */}
                                        <div className={`flex-1 h-1 mx-2 -mt-6 ${getStepStatus('verified') === 'completed' ? 'bg-[#1152d4]' : 'bg-slate-100'}`}></div>
                                        
                                        {/* Verified */}
                                        <div className="flex flex-col items-center gap-2">
                                            <div className={`size-10 rounded-full flex items-center justify-center shadow-md ${getStepStatus('verified') === 'completed' ? 'bg-[#1152d4] text-white' : 'bg-slate-100 text-slate-400'}`}>
                                                <span className="material-symbols-outlined text-xl">{getStepStatus('verified') === 'completed' ? 'check' : 'verified_user'}</span>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-xs">Verified</p>
                                                <p className="text-slate-400 text-[10px]">Step 2</p>
                                            </div>
                                        </div>
                                        
                                        {/* Progress Line Active/Empty */}
                                        <div className="flex-1 h-1 bg-slate-100 mx-2 -mt-6 overflow-hidden">
                                            <div className={`h-full bg-[#1152d4] transition-all duration-1000 ${getStepStatus('processing') === 'completed' ? 'w-full' : getStepStatus('processing') === 'active' ? 'w-1/2 animate-pulse' : 'w-0'}`}></div>
                                        </div>
                                        
                                        {/* Processing */}
                                        <div className="flex flex-col items-center gap-2">
                                            <div className={`size-12 rounded-full flex items-center justify-center shadow-xl ring-4 ring-[#1152d4]/10 ${getStepStatus('processing') === 'completed' ? 'bg-[#1152d4] text-white' : getStepStatus('processing') === 'active' ? 'bg-[#1152d4] text-white' : 'bg-slate-100 text-slate-400'}`}>
                                                <span className="material-symbols-outlined text-2xl">account_balance</span>
                                            </div>
                                            <div className="text-center">
                                                <p className={`text-xs ${getStepStatus('processing') !== 'pending' ? 'text-[#1152d4]' : 'text-slate-400'}`}>Processing</p>
                                                <p className="text-slate-400 text-[10px]">{getStepStatus('processing') === 'active' ? 'Active' : 'Embassy'}</p>
                                            </div>
                                        </div>
                                        
                                        {/* Progress Line Empty */}
                                        <div className={`flex-1 h-1 mx-2 -mt-6 ${getStepStatus('ready') === 'completed' ? 'bg-[#1152d4]' : 'bg-slate-100'}`}></div>
                                        
                                        {/* Ready */}
                                        <div className="flex flex-col items-center gap-2">
                                            <div className={`size-10 rounded-full flex items-center justify-center shadow-md ${getStepStatus('ready') === 'completed' ? 'bg-[#1152d4] text-white' : 'bg-slate-100 text-slate-400'}`}>
                                                <span className="material-symbols-outlined text-xl">verified_user</span>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-xs text-slate-400">Visa Ready</p>
                                                <p className="text-slate-400 text-[10px]">Grant</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Action Items */}
                                <div className="mb-8">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-lg font-black text-slate-900">Action Items</h2>
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${application.documents?.filter(d => d.status === 'pending' || d.status === 'rejected').length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                                            {application.documents?.filter(d => d.status === 'pending' || d.status === 'rejected').length || 0} Pending
                                        </span>
                                    </div>
                                    <div className="space-y-4">
                                        {(application.documents || [])
                                            .filter(d => d.status === 'pending' || d.status === 'rejected')
                                            .map((doc, idx) => (
                                                <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                                                    <div className="size-10 bg-[#1152d4]/10 rounded-xl flex items-center justify-center text-[#1152d4]">
                                                        <span className="material-symbols-outlined">upload_file</span>
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-sm font-bold text-slate-900">{doc.name}</p>
                                                        <p className="text-xs text-slate-500 mt-0.5">{doc.status === 'rejected' ? 'Previously rejected. Please re-upload.' : 'Upload required for verification.'}</p>
                                                    </div>
                                                    <button className="h-9 px-5 bg-[#1152d4] text-white rounded-lg text-xs font-bold hover:bg-[#0e42b0] transition-colors shadow-lg shadow-[#1152d4]/20">Upload</button>
                                                </div>
                                            ))
                                        }
                                        {application.status === 'additional_info_required' && (
                                             <div className="bg-amber-50 p-5 rounded-2xl border border-amber-200 shadow-sm flex items-center gap-4">
                                                <div className="size-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
                                                    <span className="material-symbols-outlined">warning</span>
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-sm font-bold text-slate-900">Additional Information Required</p>
                                                    <p className="text-xs text-slate-500 mt-0.5">Please check your messages for details from your agent.</p>
                                                </div>
                                                <button onClick={() => document.querySelector('textarea')?.focus()} className="h-9 px-5 bg-white border border-amber-200 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-100 transition-colors">Reply Now</button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Info Card */}
                                <div className="bg-[#1152d4]/5 border border-[#1152d4]/20 rounded-2xl p-5 flex gap-4">
                                    <span className="material-symbols-outlined text-[#1152d4] text-2xl">info</span>
                                    <div>
                                        <h4 className="text-sm font-bold text-[#1152d4]">Application Status: {application.status.replace(/_/g, ' ')}</h4>
                                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                                            {application.status === 'under_review' ? 'Your representative has submitted your documents. The embassy is currently reviewing your file.' : 
                                             application.status === 'submitted' ? 'Your case has been created. Our agents will begin verification shortly.' :
                                             'Our team is working on your application. We will notify you of any changes.'}
                                        </p>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </main>

                {/* Sidebar Chat */}
                <aside className="w-[380px] border-l border-slate-200 bg-white flex flex-col shrink-0">
                    <div className="p-4 border-b border-slate-100 flex items-center gap-3">
                        <div className="relative">
                            <img className="size-10 rounded-full border-2 border-slate-50 shadow-sm" src="https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah" alt="Agent" />
                            <div className="absolute bottom-0 right-0 size-3 bg-green-500 border-2 border-white rounded-full"></div>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-900">Sarah Jenkins</p>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-black uppercase text-green-600 tracking-wider">Online</span>
                                <span className="size-1 bg-slate-300 rounded-full"></span>
                                <span className="text-[10px] font-medium text-slate-500">Assigned Agent</span>
                            </div>
                        </div>
                        <div className="ml-auto flex items-center gap-1 text-slate-400">
                            <button className="p-1 hover:text-[#1152d4]"><span className="material-symbols-outlined text-lg">shield_lock</span></button>
                            <button className="p-1 hover:text-[#1152d4]"><span className="material-symbols-outlined text-lg">more_vert</span></button>
                        </div>
                    </div>

                    <div className="bg-slate-50/80 px-4 py-1.5 flex items-center justify-center gap-2 border-b border-slate-100">
                        <span className="material-symbols-outlined text-slate-400 text-xs">lock</span>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tight">Messages are end-to-end encrypted</p>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {chatHistory.map(msg => (
                            <div key={msg.id} className={`flex flex-col gap-1 max-w-[85%] ${msg.type === 'user' ? 'ml-auto items-end' : ''}`}>
                                <div className={`p-3 rounded-2xl shadow-sm ${msg.type === 'user'
                                    ? 'bg-[#1152d4] text-white rounded-tr-none shadow-[#1152d4]/10'
                                    : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200'
                                    }`}>
                                    <p className="text-sm leading-relaxed">{msg.content}</p>
                                    {msg.isFile && (
                                        <div className="mt-3 bg-white/90 p-2 rounded-xl flex items-center gap-3 border border-slate-100">
                                            <div className="size-9 bg-red-50 text-red-600 rounded-lg flex items-center justify-center">
                                                <span className="material-symbols-outlined">picture_as_pdf</span>
                                            </div>
                                            <div className="overflow-hidden">
                                                <p className="text-[11px] font-bold text-slate-900 truncate">{msg.fileName}</p>
                                                <p className="text-[9px] text-slate-500 uppercase font-black">{msg.fileSize}</p>
                                            </div>
                                            <button className="ml-auto text-[#1152d4] p-1">
                                                <span className="material-symbols-outlined text-lg">download</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 px-1">
                                    <p className="text-[10px] text-slate-400 font-medium">{msg.time}</p>
                                    {msg.type === 'user' && <span className="material-symbols-outlined text-[14px] text-[#1152d4]">done_all</span>}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="p-4 border-t border-slate-100">
                        <form onSubmit={handleSendMessage} className="space-y-3">
                            <div className="flex items-center gap-2">
                                <button type="button" className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-full text-[10px] font-bold transition-all">
                                    <span className="material-symbols-outlined text-sm">add_circle</span> File
                                </button>
                                <button type="button" className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-full text-[10px] font-bold transition-all">
                                    <span className="material-symbols-outlined text-sm">image</span> Photo
                                </button>
                            </div>
                            <div className="flex items-end gap-2 bg-slate-100 rounded-2xl px-3 py-2 focus-within:ring-2 focus-within:ring-[#1152d4]/20 transition-all">
                                <textarea
                                    rows="1"
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    className="bg-transparent border-none focus:ring-0 text-sm w-full py-1 placeholder:text-slate-400 text-slate-900 resize-none max-h-32"
                                    placeholder="Type a secure message..."
                                />
                                <button type="submit" className="bg-[#1152d4] text-white size-8 rounded-full flex items-center justify-center shrink-0 shadow-lg shadow-[#1152d4]/20 hover:scale-110 active:scale-95 transition-all">
                                    <span className="material-symbols-outlined text-lg">send</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </aside>
            </div>
            <Footer />
        </div>
    );
};

export default CustomerStatusDashboard;
