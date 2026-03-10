import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Navbar from '../../Navbar';
import Footer from '../../Footer';
import VisaAdminDashboard from './VisaAdminDashboard';
import VisaApplicationsList from './VisaApplicationsList';
import VisaApplicationDetail from './VisaApplicationDetail';
import VisaRequirementsManager from './VisaRequirementsManager';
import DocumentServicesList from './DocumentServicesList';
import ConsultantDashboard from './ConsultantDashboard';
import AppointmentDetail from './AppointmentDetail';
import AdminDocumentReview from './AdminDocumentReview';
import AdminMessagingHub from './AdminMessagingHub';
import VisaAdminLogin from './VisaAdminLogin';

const AdminSubHeader = ({ onLogout }) => {
    const location = useLocation();
    const isActive = (path) => location.pathname === path;

    return (
        <header className="sticky top-16 z-40 bg-white border-b border-slate-200 shadow-sm">
            <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-10 flex items-center justify-between h-12 sm:h-14 gap-2 overflow-x-auto scrollbar-none">
                {/* Brand badge — hidden on very small screens to save space */}
                <div className="shrink-0 hidden sm:flex items-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#1152d4] bg-[#1152d4]/5 px-3 py-1.5 rounded-lg border border-[#1152d4]/10 flex items-center gap-1.5 whitespace-nowrap">
                        <span className="material-symbols-outlined text-xs">admin_panel_settings</span>
                        Visa Admin
                    </span>
                </div>
                {/* Nav links — always visible, scroll on small */}
                <nav className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto scrollbar-none flex-1 px-1">
                    {[
                        { to: '/visa/admin', label: 'Dashboard', icon: 'dashboard' },
                        { to: '/visa/admin/applications', label: 'Applications', icon: 'assignment' },
                        { to: '/visa/admin/requirements', label: 'Requirements', icon: 'checklist' },
                        { to: '/visa/admin/document-services', label: 'Doc Services', icon: 'folder_open' },
                        { to: '/visa/admin/schedule', label: 'Schedule', icon: 'calendar_month' },
                        { to: '/visa/admin/messages', label: 'Messages', icon: 'chat' },
                    ].map((item) => (
                        <Link
                            key={item.to}
                            to={item.to}
                            className={`px-2.5 sm:px-3.5 py-2 text-[10px] sm:text-[11px] font-bold rounded-lg no-underline transition-all flex items-center gap-1 sm:gap-1.5 whitespace-nowrap shrink-0 ${isActive(item.to)
                                ? 'text-[#1152d4] bg-[#1152d4]/5 shadow-sm ring-1 ring-[#1152d4]/10'
                                : 'text-slate-500 hover:text-[#1152d4] hover:bg-slate-50'
                                }`}
                        >
                            <span className="material-symbols-outlined text-sm">{item.icon}</span>
                            <span className="hidden xs:inline sm:inline">{item.label}</span>
                        </Link>
                    ))}
                    {/* Divider + back links inline for small screens */}
                    <div className="h-4 w-px bg-slate-200 mx-1 shrink-0 hidden sm:block" />
                    <Link to="/visa" className="px-2.5 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-[#1152d4] no-underline flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors hidden sm:flex">
                        <span className="material-symbols-outlined text-sm">arrow_back</span>
                        <span className="hidden lg:inline">Customer View</span>
                    </Link>
                    <button
                        onClick={onLogout}
                        className="px-2.5 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500 no-underline flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors hidden sm:flex bg-transparent border-none cursor-pointer group"
                    >
                        <span className="material-symbols-outlined text-sm group-hover:rotate-12 transition-transform">logout</span>
                        <span className="hidden lg:inline">Logout</span>
                    </button>
                </nav>
            </div>
        </header>
    );
};

const VisaAdminPanel = () => {
    const location = useLocation();
    const [isAuthenticated, setIsAuthenticated] = React.useState(true); // Defaulted for dev

    if (location.pathname === '/visa/admin/login') {
        return <VisaAdminLogin />;
    }

    if (!isAuthenticated) {
        return <VisaAdminLogin />;
    }

    return (
        <div className="flex flex-col min-h-screen">
            <Navbar forceScrolled={true} />
            <AdminSubHeader onLogout={() => setIsAuthenticated(false)} />
            <main className="flex-1 bg-[#f8f9fc] pt-4">
                <Routes>
                    <Route path="/" element={<VisaAdminDashboard />} />
                    <Route path="/login" element={<VisaAdminLogin />} />
                    <Route path="/applications" element={<VisaApplicationsList />} />
                    <Route path="/applications/:id" element={<VisaApplicationDetail />} />
                    <Route path="/requirements" element={<VisaRequirementsManager />} />
                    <Route path="/document-services" element={<DocumentServicesList />} />
                    <Route path="/schedule" element={<ConsultantDashboard />} />
                    <Route path="/appointments/:id" element={<AppointmentDetail />} />
                    <Route path="/document-review/:id" element={<AdminDocumentReview />} />
                    <Route path="/messages" element={<AdminMessagingHub />} />
                </Routes>
            </main>
            <Footer />
        </div>
    );
};

export default VisaAdminPanel;
