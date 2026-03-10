import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)
// Screen 8: Admin Document Review System

const AdminDocumentReview = () => {
    const { id } = useParams();
    const [selectedDoc, setSelectedDoc] = useState(1);
    const [zoom, setZoom] = useState(100);
    const [rejectionComment, setRejectionComment] = useState('');
    const [showSidebar, setShowSidebar] = useState(false);
    const [showControls, setShowControls] = useState(false);

    const documents = [
        { id: 1, name: 'Passport Scan (Main)', time: '2h ago', status: 'Reviewing', icon: 'badge' },
        { id: 2, name: 'Bank Statement - 3 Mo', time: '5h ago', status: 'Pending', icon: 'account_balance' },
        { id: 3, name: 'Visa Photo', time: '1d ago', status: 'Pending', icon: 'image' },
        { id: 4, name: 'Employment Letter', time: '1d ago', status: 'Reviewing', icon: 'work' }
    ];

    const history = [
        { event: 'Document Uploaded', time: 'Today, 2:14 PM', desc: 'John Doe uploaded Passport_Final.pdf (2.4MB)', type: 'system' },
        { event: 'Previous Version Rejected', time: 'Oct 24, 11:30 AM', desc: 'Scan is too blurry, edges are cut off. Please provide a clear flat scan. - Agent Sarah', type: 'error' }
    ];

    return (
        <div className="bg-[#f6f6f8] font-sans text-slate-900 flex flex-col h-[calc(100vh-80px)] lg:h-[calc(100vh-130px)] overflow-hidden">
            <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />

            {/* Mobile Header Navigation */}
            <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100 z-30">
                <button onClick={() => setShowSidebar(!showSidebar)} className="p-2 bg-slate-50 rounded-xl text-slate-600">
                    <span className="material-symbols-outlined">folder_open</span>
                </button>
                <div className="text-center">
                    <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Document Review</p>
                    <p className="text-[9px] font-bold text-[#1152d4] uppercase tracking-tighter mt-0.5">App: #98422</p>
                </div>
                <button onClick={() => setShowControls(!showControls)} className="p-2 bg-[#1152d4]/5 rounded-xl text-[#1152d4]">
                    <span className="material-symbols-outlined">gavel</span>
                </button>
            </div>

            <div className="flex flex-1 h-full overflow-hidden relative">
                {/* Left Sidebar: Docs */}
                <aside className={`fixed inset-y-0 left-0 w-80 bg-white border-r border-slate-200 flex flex-col z-40 transform transition-transform duration-300 lg:relative lg:translate-x-0 ${showSidebar ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
                    <div className="p-6 border-b border-slate-100 relative">
                        <div className="mb-6 flex items-center justify-between">
                            <Link to={`/visa/admin/applications/${id || 1}`} className="flex items-center gap-2 group no-underline">
                                <span className="material-symbols-outlined text-sm font-black text-slate-400 group-hover:text-[#1152d4] transition-colors">arrow_back</span>
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 group-hover:text-[#1152d4] transition-colors">Back to Application</span>
                            </Link>
                            <button onClick={() => setShowSidebar(false)} className="lg:hidden p-2 text-slate-400 hover:text-slate-600">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="flex items-center gap-4 mb-8">
                            <div className="size-12 bg-gradient-to-br from-[#1152d4] to-[#3b82f6] rounded-[1.25rem] flex items-center justify-center text-white font-black text-sm shadow-lg shadow-[#1152d4]/20">JD</div>
                            <div>
                                <h2 className="text-base font-black text-slate-900 leading-none tracking-tight">John Doe</h2>
                                <p className="text-[10px] font-black text-[#1152d4] uppercase tracking-[0.1em] mt-1.5 opacity-80">Germany • Student Visa</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">File Dossier</span>
                            <span className="bg-[#1152d4]/5 text-[#1152d4] px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter">{documents.length} Items</span>
                        </div>
                    </div>
                    <nav className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/20 custom-scrollbar">
                        {documents.map(doc => (
                            <button
                                key={doc.id}
                                onClick={() => { setSelectedDoc(doc.id); setShowSidebar(false); }}
                                className={`w-full flex items-center gap-4 px-5 py-5 rounded-3xl transition-all border ${selectedDoc === doc.id
                                    ? 'bg-white border-[#1152d4]/20 shadow-xl shadow-[#1152d4]/5 ring-1 ring-[#1152d4]/5'
                                    : 'bg-transparent border-transparent hover:bg-white/60 text-slate-500'
                                    }`}
                            >
                                <div className={`p-2.5 rounded-xl transition-colors ${selectedDoc === doc.id ? 'bg-[#1152d4]/5 text-[#1152d4]' : 'bg-slate-100 text-slate-400'}`}>
                                    <span className="material-symbols-outlined text-xl">{doc.icon}</span>
                                </div>
                                <div className="text-left flex-1 min-w-0">
                                    <p className={`text-[11px] font-black truncate leading-none mb-2 ${selectedDoc === doc.id ? 'text-slate-900' : ''}`}>{doc.name}</p>
                                    <p className="text-[9px] font-bold uppercase tracking-widest opacity-60">{doc.time} • {doc.status}</p>
                                </div>
                                {selectedDoc === doc.id && <span className="material-symbols-outlined text-base text-[#1152d4]">check_circle</span>}
                            </button>
                        ))}
                    </nav>
                    <div className="p-6 bg-white border-t border-slate-100">
                        <button className="w-full bg-slate-950 text-white rounded-[1.25rem] py-4 text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all hover:bg-slate-800 shadow-xl shadow-slate-900/10">
                            <span className="material-symbols-outlined text-lg">person_search</span> View Applicant
                        </button>
                    </div>
                </aside>

                {/* Overlay for mobile sidebars */}
                {(showSidebar || showControls) && <div onClick={() => { setShowSidebar(false); setShowControls(false); }} className="fixed inset-0 bg-slate-950/20 backdrop-blur-sm z-30 lg:hidden transition-all duration-300"></div>}

                {/* Center: Viewer */}
                <section className="flex-1 bg-slate-100 flex flex-col overflow-hidden relative">
                    <div className="absolute inset-0 bg-[radial-gradient(#1152d4_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.03]"></div>

                    <div className="px-4 lg:px-8 py-4 lg:py-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white/50 backdrop-blur-xl border-b border-slate-200/50 z-10 relative">
                        <div className="flex items-center gap-4 w-full sm:w-auto">
                            <div className="flex-1 sm:flex-none">
                                <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest truncate max-w-[200px] lg:max-w-none">Passport_JohnDoe_FINAL.pdf</p>
                                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">2.4 MB • Updated Today, 2:14 PM</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-6 bg-white px-5 py-2 rounded-2xl border border-slate-100 shadow-sm relative z-20">
                            <div className="flex items-center gap-3">
                                <button onClick={() => setZoom(z => Math.max(50, z - 10))} className="size-8 flex items-center justify-center hover:bg-slate-50 rounded-xl text-slate-400 transition-colors"><span className="material-symbols-outlined text-xl">remove</span></button>
                                <span className="text-[11px] font-black w-14 text-center text-slate-900 tracking-tighter">{zoom}%</span>
                                <button onClick={() => setZoom(z => Math.min(200, z + 10))} className="size-8 flex items-center justify-center hover:bg-slate-50 rounded-xl text-slate-400 transition-colors"><span className="material-symbols-outlined text-xl">add</span></button>
                            </div>
                            <div className="w-px h-4 bg-slate-100"></div>
                            <div className="flex items-center gap-1">
                                <button className="size-8 flex items-center justify-center hover:bg-slate-50 rounded-xl text-slate-400"><span className="material-symbols-outlined text-xl">rotate_right</span></button>
                                <button className="size-8 flex items-center justify-center text-[#1152d4] bg-[#1152d4]/5 rounded-xl hover:bg-[#1152d4] hover:text-white transition-all"><span className="material-symbols-outlined text-xl">download</span></button>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto bg-slate-200/50 flex justify-center p-6 lg:p-12 custom-scrollbar relative z-0">
                        {/* Document Mock */}
                        <div
                            style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
                            className="bg-white shadow-[0_40px_100px_-20px_rgba(17,82,212,0.15)] w-full max-w-[800px] min-h-[1100px] flex-shrink-0 relative overflow-hidden transition-all duration-500 rounded-[2rem] border border-white flex flex-col items-center justify-center group"
                        >
                            <div className="absolute inset-0 bg-cover bg-center opacity-90 blur-[2px] blur-mask grayscale-50 group-hover:grayscale-0 transition-all duration-700" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1544027993-37dbfe43562a?auto=format&fit=crop&q=80&w=1200')" }}></div>
                            <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-slate-900/40 opacity-40"></div>

                            <div className="relative z-10 bg-white/95 backdrop-blur-2xl p-10 lg:p-14 rounded-[3rem] border border-white shadow-3xl text-slate-900 text-center max-w-[85%] scale-90 lg:scale-100 transition-transform">
                                <div className="size-20 bg-[#1152d4] rounded-[2rem] flex items-center justify-center text-white mx-auto mb-8 shadow-2xl shadow-[#1152d4]/30">
                                    <span className="material-symbols-outlined text-4xl">verified_user</span>
                                </div>
                                <h4 className="font-black text-3xl lg:text-4xl tracking-tighter uppercase mb-4">Official Scan</h4>
                                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mb-8">Passport Validation Layer</p>
                                <div className="space-y-4 px-6">
                                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full w-[85%] bg-[#1152d4] rounded-full"></div>
                                    </div>
                                    <p className="text-[9px] font-black text-[#1152d4] uppercase tracking-widest text-right">MRZ MATCH: 98.4%</p>
                                </div>
                            </div>

                            <div className="absolute bottom-12 left-12 right-12 h-40 bg-slate-950/90 backdrop-blur-2xl rounded-[2rem] border border-white/10 p-8 font-mono text-[11px] text-emerald-400 leading-relaxed break-all shadow-2xl overflow-hidden group/mrz">
                                <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/50"></div>
                                <span className="opacity-50"># MRZ_DECRYPTED_READY</span><br />
                                P&lt;UNITED_STATES&lt;&lt;DOE&lt;&lt;JOHN&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;<br />
                                984224090&lt;8USA8501014M2810312&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;<br />
                                <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/10 to-transparent opacity-0 group-hover/mrz:opacity-100 transition-opacity"></div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Right: Controls */}
                <aside className={`fixed inset-y-0 right-0 w-80 bg-white border-l border-slate-200 flex flex-col z-40 transform transition-transform duration-300 lg:relative lg:translate-x-0 ${showControls ? 'translate-x-0 shadow-2xl' : 'translate-x-full'}`}>
                    <div className="p-8 border-b border-slate-100 bg-slate-50/50 relative">
                        <button onClick={() => setShowControls(false)} className="lg:hidden absolute left-4 top-8 p-2 text-slate-400 hover:text-slate-600">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-8 text-center sm:text-left">Legal Adjudication</h3>
                        <div className="grid grid-cols-1 gap-4">
                            <button className="w-full flex items-center justify-center gap-3 bg-emerald-500 hover:bg-emerald-600 text-white font-black py-5 rounded-[1.5rem] text-[10px] uppercase tracking-[0.2em] transition-all shadow-xl shadow-emerald-500/20 active:scale-95">
                                <span className="material-symbols-outlined text-xl">verified</span> Approve File
                            </button>
                            <button className="w-full flex items-center justify-center gap-3 border-2 border-slate-100 bg-white hover:border-[#1152d4]/20 hover:text-[#1152d4] text-slate-400 font-black py-5 rounded-[1.5rem] text-[10px] uppercase tracking-[0.2em] transition-all">
                                <span className="material-symbols-outlined text-xl">replay</span> Request Update
                            </button>
                        </div>
                    </div>
                    <div className="p-8 border-b border-slate-100">
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between px-1">
                                <label className="text-[10px] font-black uppercase text-slate-300 tracking-[0.2em]">Review Notes</label>
                                <span className="material-symbols-outlined text-slate-200 text-lg">edit_note</span>
                            </div>
                            <textarea
                                className="w-full h-40 rounded-[1.5rem] border-slate-100 bg-slate-50/80 text-[11px] font-black p-5 focus:ring-4 focus:ring-[#1152d4]/5 focus:border-[#1152d4]/20 focus:bg-white transition-all shadow-inner placeholder:text-slate-300 resize-none tracking-tight"
                                placeholder="Start annotating discrepancies..."
                                value={rejectionComment}
                                onChange={(e) => setRejectionComment(e.target.value)}
                            ></textarea>
                            <button className="w-full bg-red-50 text-red-600 font-black py-4 rounded-[1.25rem] text-[9px] uppercase tracking-[0.2em] hover:bg-red-500 hover:text-white transition-all border border-red-100 active:scale-95 shadow-lg shadow-red-500/5">
                                Signal Inconsistency
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden flex flex-col">
                        <div className="px-8 py-5 border-b border-slate-50 flex items-center justify-between">
                            <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">Decision Trail</h3>
                            <div className="size-2 rounded-full bg-amber-400 animate-pulse"></div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                            {history.map((h, i) => (
                                <div key={i} className="relative pl-10 group">
                                    <div className={`absolute left-0 top-1.5 size-3.5 rounded-full border-4 border-white shadow-md transition-all group-hover:scale-125 z-10 ${h.type === 'error' ? 'bg-red-500 shadow-red-500/20' : 'bg-[#1152d4] shadow-[#1152d4]/20'}`}></div>
                                    {i < history.length - 1 && <div className="absolute left-[6px] top-4 bottom-[-40px] w-px bg-slate-100"></div>}
                                    <div className="flex flex-col gap-1">
                                        <p className="text-[11px] font-black text-slate-900 leading-tight tracking-tight">{h.event}</p>
                                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{h.time}</p>
                                    </div>
                                    <div className={`mt-4 p-4 rounded-2xl border text-[10px] font-bold leading-relaxed tracking-tight ${h.type === 'error' ? 'bg-red-50/20 border-red-50 text-red-600/80' : 'bg-slate-50 border-slate-50 text-slate-500/80'}`}>
                                        {h.desc}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="p-6 bg-slate-50/50 border-t border-slate-100">
                        <button className="w-full flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 hover:text-[#1152d4] transition-all group">
                            <span className="group-hover:translate-x-1 transition-transform">Export Audit Report</span>
                            <span className="material-symbols-outlined text-lg">ios_share</span>
                        </button>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default AdminDocumentReview;
