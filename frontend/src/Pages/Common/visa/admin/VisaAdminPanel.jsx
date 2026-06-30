import React, { useState, useEffect, useCallback } from "react";
import {
  Routes,
  Route,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import Navbar from "../../Navbar";
import Footer from "../../Footer";
import VisaAdminDashboard from "./VisaAdminDashboard";
import VisaApplicationsList from "./VisaApplicationsList";
import VisaApplicationDetail from "./VisaApplicationDetail";
import VisaRequirementsManager from "./VisaRequirementsManager";
import DocumentServicesList from "./DocumentServicesList";
import ConsultantDashboard from "./ConsultantDashboard";
import AppointmentDetail from "./AppointmentDetail";
import AdminDocumentReview from "./AdminDocumentReview";
import AdminMessagingHub from "./AdminMessagingHub";
import VisaAdminLogin from "./VisaAdminLogin";
import VisaAgentsManager from "./VisaAgentsManager";
import { getApiUrl } from "../../../../utils/apiHelper";

// ─── Auth helpers ─────────────────────────────────────────────────────────────

/**
 * Check whether the current session has valid admin credentials stored in
 * localStorage. Supports tokens stored by both the main AdminLogin and the
 * VisaAdminLogin flows.
 */
function getStoredAdminSession() {
  try {
    // Prefer the dedicated visa-admin token first, then fall back to the
    // general admin token that is set by AdminLogin.jsx.
    const token =
      localStorage.getItem("visaAdminToken") ||
      localStorage.getItem("adminToken") ||
      localStorage.getItem("token");

    if (!token) return null;

    // Check role from the user objects stored during login.
    const userStr =
      localStorage.getItem("visaAdminUser") ||
      localStorage.getItem("adminUser") ||
      localStorage.getItem("user");

    if (!userStr) return null;

    const user = JSON.parse(userStr);

    // Only superadmin, admin, and agent roles are permitted in the visa admin panel.
    if (!user || !["superadmin", "admin", "agent"].includes(user.role)) return null;

    return { token, user };
  } catch (_) {
    return null;
  }
}

function clearAdminSession() {
  [
    "visaAdminToken",
    "visaAdminUser",
    "adminToken",
    "adminUser",
    "token",
    "user",
    "isAuthenticated",
    "visaIsSuperAdmin",
  ].forEach((key) => localStorage.removeItem(key));
}

// ─── Sub-header nav ───────────────────────────────────────────────────────────

// `roles` controls visibility. STAFF = everyone in the panel; ADMINS = back-office config.
// `superOnly` items (agent management) show only to a super admin (see isSuperAdmin flag).
const STAFF = ["superadmin", "admin", "agent"];
const ADMINS = ["superadmin", "admin"];

const NAV_ITEMS = [
  { to: "/visa/admin", label: "Dashboard", icon: "dashboard", roles: ADMINS },
  { to: "/visa/admin/applications", label: "Applications", icon: "assignment", roles: STAFF },
  { to: "/visa/admin/requirements", label: "Requirements", icon: "checklist", roles: ADMINS },
  {
    to: "/visa/admin/document-services",
    label: "Doc Services",
    icon: "folder_open",
    roles: ADMINS,
  },
  { to: "/visa/admin/schedule", label: "Schedule", icon: "calendar_month", roles: ADMINS },
  { to: "/visa/admin/messages", label: "Messages", icon: "chat", roles: STAFF },
  { to: "/visa/admin/agents", label: "Agents", icon: "groups", superOnly: true },
];

const AdminSubHeader = ({ user, onLogout }) => {
  const location = useLocation();
  const isActive = (path) => location.pathname === path;
  const role = user?.role || "agent";
  const isSuper = !!user?.isSuperAdmin;
  const navItems = NAV_ITEMS.filter((item) =>
    item.superOnly ? isSuper : item.roles.includes(role)
  );

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-10 flex items-center justify-between h-12 sm:h-14 gap-2 overflow-x-auto scrollbar-none">
        {/* Brand badge */}
        <div className="shrink-0 hidden sm:flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#1152d4] bg-[#1152d4]/5 px-3 py-1.5 rounded-lg border border-[#1152d4]/10 flex items-center gap-1.5 whitespace-nowrap">
            <span className="material-symbols-outlined text-xs">
              admin_panel_settings
            </span>
            Visa Admin
          </span>
          {user && (
            <span className="hidden lg:inline text-[10px] font-bold text-slate-400 truncate max-w-[140px]">
              {user.firstName || user.email || "Administrator"}
            </span>
          )}
        </div>

        {/* Nav links */}
        <nav className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto scrollbar-none flex-1 px-1">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`px-2.5 sm:px-3.5 py-2 text-[10px] sm:text-[11px] font-bold rounded-lg no-underline transition-all flex items-center gap-1 sm:gap-1.5 whitespace-nowrap shrink-0 ${
                isActive(item.to)
                  ? "text-[#1152d4] bg-[#1152d4]/5 shadow-sm ring-1 ring-[#1152d4]/10"
                  : "text-slate-500 hover:text-[#1152d4] hover:bg-slate-50"
              }`}
            >
              <span className="material-symbols-outlined text-sm">
                {item.icon}
              </span>
              <span className="hidden xs:inline sm:inline">{item.label}</span>
            </Link>
          ))}

          {/* Divider */}
          <div className="h-4 w-px bg-slate-200 mx-1 shrink-0 hidden sm:block" />

          {/* Customer portal link */}
          <Link
            to="/visa"
            className="px-2.5 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-[#1152d4] no-underline flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors hidden sm:flex"
          >
            <span className="material-symbols-outlined text-sm">
              arrow_back
            </span>
            <span className="hidden lg:inline">Customer View</span>
          </Link>

          {/* Logout */}
          <button
            onClick={onLogout}
            className="px-2.5 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500 flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors hidden sm:flex bg-transparent border-none cursor-pointer group"
          >
            <span className="material-symbols-outlined text-sm group-hover:rotate-12 transition-transform">
              logout
            </span>
            <span className="hidden lg:inline">Logout</span>
          </button>
        </nav>
      </div>
    </header>
  );
};

// ─── Unauthorized screen ──────────────────────────────────────────────────────

const UnauthorizedScreen = ({ onRetry }) => (
  <div className="min-h-screen bg-[#f6f6f8] font-sans flex items-center justify-center px-4">
    <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200/40 p-10 max-w-md w-full text-center">
      <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <span className="material-symbols-outlined text-4xl text-red-500">
          lock
        </span>
      </div>
      <h2 className="text-2xl font-black text-slate-900 mb-3">
        Access Restricted
      </h2>
      <p className="text-slate-500 text-sm mb-8 leading-relaxed">
        You do not have permission to access the Visa Admin Panel. Please sign
        in with an administrator account to continue.
      </p>
      <div className="flex flex-col gap-3">
        <button
          onClick={onRetry}
          className="flex items-center justify-center gap-2 py-3 bg-[#1152d4] text-white rounded-xl font-bold text-sm hover:bg-[#0e42b0] transition-all"
        >
          <span className="material-symbols-outlined text-lg">login</span>
          Sign In as Admin
        </button>
        <Link
          to="/visa"
          className="flex items-center justify-center gap-2 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-50 transition-colors no-underline"
        >
          <span className="material-symbols-outlined text-lg">home</span>
          Back to Visa Portal
        </Link>
      </div>
    </div>
  </div>
);

// ─── Main panel ───────────────────────────────────────────────────────────────

const VisaAdminPanel = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Derive auth state from localStorage, then VALIDATE it against the backend.
  const [session, setSession] = useState(() => getStoredAdminSession());
  const [verifying, setVerifying] = useState(true);

  /**
   * localStorage alone is spoofable (anyone could set user.role='admin'), so confirm
   * with the server that the token really belongs to an admin/agent before rendering
   * the panel. A token the backend rejects clears the session → login screen. This runs
   * on mount and whenever the route changes (e.g. right after VisaAdminLogin redirects).
   */
  useEffect(() => {
    let cancelled = false;
    const stored = getStoredAdminSession();
    if (!stored) {
      setSession(null);
      setVerifying(false);
      return;
    }
    setVerifying(true);
    (async () => {
      try {
        const res = await fetch(getApiUrl("visa/admin/verify"), {
          headers: { Authorization: `Bearer ${stored.token}` },
        });
        if (cancelled) return;
        if (res.ok) {
          // Capture the server's authoritative role + super-admin flag (the super admin is an
          // allowlisted admin, not a DB role, so the client can't derive it on its own).
          let v = {};
          try { v = await res.json(); } catch { /* ignore */ }
          localStorage.setItem("visaIsSuperAdmin", String(!!v.isSuperAdmin));
          setSession({
            ...stored,
            user: {
              ...stored.user,
              role: v.role || stored.user.role,
              isSuperAdmin: !!v.isSuperAdmin,
            },
          });
        } else {
          // Backend says this isn't a real admin → drop the (possibly spoofed) session.
          clearAdminSession();
          setSession(null);
        }
      } catch {
        // Network hiccup: keep the stored session — every data call is still enforced
        // server-side, so nothing sensitive loads without a real admin token anyway.
        if (!cancelled) setSession(stored);
      } finally {
        if (!cancelled) setVerifying(false);
      }
    })();
    return () => { cancelled = true; };
  }, [location.pathname]);

  // ── Logout ──────────────────────────────────────────────────────────────────
  const handleLogout = useCallback(() => {
    clearAdminSession();
    setSession(null);
    navigate("/visa/admin/login");
  }, [navigate]);

  // ── Route: dedicated login page ────────────────────────────────────────────
  if (location.pathname === "/visa/admin/login") {
    return <VisaAdminLogin />;
  }

  // ── Verifying the session with the backend ──────────────────────────────────
  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9fc]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#055B75]/30 border-t-[#055B75] rounded-full animate-spin"></div>
          <p className="text-slate-500 text-sm font-medium">Verifying admin access…</p>
        </div>
      </div>
    );
  }

  // ── Route: not authenticated → show login ──────────────────────────────────
  if (!session) {
    // If this is a direct navigation to an admin sub-route, show the
    // unauthorized helper which redirects to the login form.
    return <UnauthorizedScreen onRetry={() => navigate("/visa/admin/login")} />;
  }

  // ── Authenticated layout ───────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen">
      {/* Material Symbols */}
      <link
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        rel="stylesheet"
      />

      <Navbar forceScrolled={true} />

      <AdminSubHeader user={session.user} onLogout={handleLogout} />

      <main className="flex-1 bg-[#f8f9fc] pt-4">
        <Routes>
          {/* Dashboard. Agents have no aggregate dashboard (the stats endpoint is
              admin-only) — their home is their assigned-applications list. */}
          <Route
            path="/"
            element={
              session.user?.role === "agent" ? (
                <VisaApplicationsList />
              ) : (
                <VisaAdminDashboard />
              )
            }
          />

          {/* Agent management — superadmin only (backend also enforces). */}
          <Route path="/agents" element={<VisaAgentsManager />} />

          {/* Dedicated login route (already handled above, but keep as
              fallback in case React Router renders it internally) */}
          <Route path="/login" element={<VisaAdminLogin />} />

          {/* Applications */}
          <Route path="/applications" element={<VisaApplicationsList />} />
          <Route path="/applications/:id" element={<VisaApplicationDetail />} />

          {/* Requirements */}
          <Route path="/requirements" element={<VisaRequirementsManager />} />

          {/* Document services */}
          <Route path="/document-services" element={<DocumentServicesList />} />

          {/* Consultant schedule */}
          <Route path="/schedule" element={<ConsultantDashboard />} />
          <Route path="/appointments/:id" element={<AppointmentDetail />} />

          {/* Document review */}
          <Route
            path="/document-review/:id"
            element={<AdminDocumentReview />}
          />

          {/* Messaging */}
          <Route path="/messages" element={<AdminMessagingHub />} />

          {/* Catch-all → redirect to dashboard */}
          <Route
            path="*"
            element={
              <div className="flex items-center justify-center min-h-[60vh] px-4">
                <div className="text-center">
                  <span className="material-symbols-outlined text-6xl text-slate-200 block mb-4">
                    search_off
                  </span>
                  <h2 className="text-xl font-black text-slate-700 mb-2">
                    Page Not Found
                  </h2>
                  <p className="text-slate-400 text-sm mb-6">
                    The admin page you're looking for doesn't exist.
                  </p>
                  <Link
                    to="/visa/admin"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#1152d4] text-white rounded-xl font-bold text-sm hover:bg-[#0e42b0] transition-all no-underline"
                  >
                    <span className="material-symbols-outlined text-lg">
                      dashboard
                    </span>
                    Go to Dashboard
                  </Link>
                </div>
              </div>
            }
          />
        </Routes>
      </main>

      <Footer />
    </div>
  );
};

export default VisaAdminPanel;
