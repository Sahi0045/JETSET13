import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const VisaAdminLogin = () => {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [credentials, setCredentials] = useState({ email: '', password: '' });

    const handleLogin = (e) => {
        e.preventDefault();
        setIsLoading(true);
        // Simulate auth delay
        setTimeout(() => {
            setIsLoading(false);
            navigate('/visa/admin'); // Redirect to dashboard
        }, 1200);
    };

    return (
        <div className="min-h-screen bg-[#050b1c] font-sans text-slate-200 flex items-center justify-center p-6 relative overflow-hidden">
            {/* Dynamic Background Elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#1152d4]/10 blur-[120px] rounded-full animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/5 blur-[150px] rounded-full animate-pulse decoration-1000"></div>

            <div className="w-full max-w-[440px] relative z-10">
                {/* Logo & Branding */}
                <div className="text-center mb-10">
                    <Link to="/visa" className="inline-flex items-center gap-2 text-white font-black text-2xl no-underline uppercase tracking-tighter mb-4">
                        <span className="material-symbols-outlined text-3xl text-[#3b82f6]">flight_takeoff</span>
                        JetSetters
                    </Link>
                    <h1 className="text-3xl font-black text-white tracking-tight">Visa Admin Portal</h1>
                    <p className="text-slate-400 font-medium text-sm mt-3">Authorized personnel access only</p>
                </div>

                {/* Login Card */}
                <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] shadow-2xl rounded-[32px] p-8 md:p-10">
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Work Email</label>
                            <div className="relative group">
                                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-lg transition-colors group-focus-within:text-[#3b82f6]">mail</span>
                                <input
                                    type="email"
                                    required
                                    placeholder="name@jetsetters.com"
                                    className="w-full bg-white/[0.05] border border-white/[0.1] rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:outline-none focus:border-[#3b82f6]/50 focus:ring-4 focus:ring-[#3b82f6]/10 transition-all placeholder:text-slate-600"
                                    value={credentials.email}
                                    onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between ml-1">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Security Key</label>
                                <button type="button" className="text-[10px] font-black uppercase tracking-widest text-[#3b82f6] hover:underline">Forgot?</button>
                            </div>
                            <div className="relative group">
                                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-lg transition-colors group-focus-within:text-[#3b82f6]">lock</span>
                                <input
                                    type="password"
                                    required
                                    placeholder="••••••••••••"
                                    className="w-full bg-white/[0.05] border border-white/[0.1] rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:outline-none focus:border-[#3b82f6]/50 focus:ring-4 focus:ring-[#3b82f6]/10 transition-all placeholder:text-slate-600"
                                    value={credentials.password}
                                    onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-white text-[#050b1c] font-black py-4 rounded-2xl text-[11px] uppercase tracking-[0.2em] hover:bg-[#3b82f6] hover:text-white transition-all shadow-xl shadow-black/20 flex items-center justify-center gap-2 relative overflow-hidden group disabled:opacity-50"
                            >
                                {isLoading ? (
                                    <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
                                ) : (
                                    <>
                                        Authenticate
                                        <span className="material-symbols-outlined text-lg translate-x-0 group-hover:translate-x-1 transition-transform">arrow_forward</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>

                    {/* Quick Access Info */}
                    <div className="mt-8 pt-8 border-t border-white/[0.05] flex flex-col gap-4">
                        <div className="flex items-center gap-3 p-4 bg-white/[0.02] rounded-2xl border border-white/[0.05]">
                            <span className="material-symbols-outlined text-amber-500 text-xl">verified_user</span>
                            <p className="text-[10px] font-medium text-slate-400 leading-relaxed uppercase tracking-wide">
                                Use your <span className="text-white font-black">JetSetters SecureID</span> to log in. Multi-factor authentication is required.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer Links */}
                <div className="mt-10 flex items-center justify-between px-2">
                    <Link to="/visa" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white no-underline transition-colors flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">arrow_back</span>
                        Back to Portal
                    </Link>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">v2.4.0-stable</p>
                </div>
            </div>
        </div>
    );
};

export default VisaAdminLogin;
