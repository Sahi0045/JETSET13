import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { getApiUrl } from "../../../../utils/apiHelper";

const VisaAdminLogin = () => {
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setCredentials({ ...credentials, [e.target.name]: e.target.value });
    if (error) setError("");
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!credentials.email || !credentials.password) {
      setError("Please enter your email and password.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      // Try the main admin auth endpoint first
      const response = await fetch(getApiUrl("auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(credentials),
      });

      const data = await response.json();

      if (response.ok && (data.role === "admin" || data.role === "agent")) {
        // Store auth tokens
        localStorage.setItem("adminToken", data.token);
        localStorage.setItem("visaAdminToken", data.token);
        localStorage.setItem("token", data.token);
        localStorage.setItem("isAuthenticated", "true");

        const userPayload = JSON.stringify({
          id: data.id,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role,
        });
        localStorage.setItem("adminUser", userPayload);
        localStorage.setItem("visaAdminUser", userPayload);
        localStorage.setItem("user", userPayload);

        navigate("/visa/admin");
        return;
      }

      // If response ok but not admin role
      if (response.ok) {
        setError("Access denied. You do not have administrator privileges.");
        return;
      }

      // Auth failed
      setError(data.message || data.error || "Invalid email or password.");
    } catch (err) {
      console.error("Visa admin login error:", err);
      setError("Unable to connect to the server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white font-sans flex items-center justify-center px-4 py-12 relative overflow-hidden">
      <link
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        rel="stylesheet"
      />

      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-[#1152d4]/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-[#1152d4]/5 rounded-full blur-3xl" />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-10">
          <Link
            to="/visa"
            className="inline-flex items-center gap-3 text-white no-underline group mb-6"
          >
            <div className="w-12 h-12 bg-[#1152d4] rounded-2xl flex items-center justify-center shadow-xl shadow-[#1152d4]/30 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-2xl text-white">
                flight_takeoff
              </span>
            </div>
            <div className="text-left">
              <p className="text-lg font-black tracking-tight leading-none">
                JetSetters
              </p>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 leading-none mt-1">
                Visa Admin Portal
              </p>
            </div>
          </Link>

          <h1 className="text-3xl font-black tracking-tight mb-2">
            Admin Access
          </h1>
          <p className="text-slate-400 text-sm font-medium">
            Sign in with your administrator credentials to continue.
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] shadow-2xl shadow-black/40 rounded-[2rem] p-8 md:p-10">
          {/* Error Banner */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
              <span className="material-symbols-outlined text-red-400 text-sm shrink-0 mt-0.5">
                error
              </span>
              <p className="text-red-400 text-sm font-medium leading-relaxed">
                {error}
              </p>
              <button
                onClick={() => setError("")}
                className="ml-auto text-red-400 hover:text-red-300 shrink-0 transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            {/* Email */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">
                Work Email
              </label>
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-lg transition-colors group-focus-within:text-[#3b82f6]">
                  mail
                </span>
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  value={credentials.email}
                  onChange={handleChange}
                  placeholder="admin@jetsetterss.com"
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-2xl py-4 pl-12 pr-4 text-sm font-medium text-white placeholder:text-slate-600 focus:outline-none focus:border-[#3b82f6]/50 focus:ring-4 focus:ring-[#3b82f6]/10 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">
                Password
              </label>
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-lg transition-colors group-focus-within:text-[#3b82f6]">
                  lock
                </span>
                <input
                  type="password"
                  name="password"
                  required
                  autoComplete="current-password"
                  value={credentials.password}
                  onChange={handleChange}
                  placeholder="••••••••••••"
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-2xl py-4 pl-12 pr-4 text-sm font-medium text-white placeholder:text-slate-600 focus:outline-none focus:border-[#3b82f6]/50 focus:ring-4 focus:ring-[#3b82f6]/10 transition-all"
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-[#1152d4] hover:bg-[#0e42b0] text-white rounded-2xl font-black text-sm uppercase tracking-[0.15em] shadow-xl shadow-[#1152d4]/30 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100 flex items-center justify-center gap-3"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Authenticating…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-xl">
                    login
                  </span>
                  Sign In to Admin Panel
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-8">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
              secure access
            </span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          {/* Footer links */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center">
            <Link
              to="/visa"
              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 no-underline transition-colors"
            >
              <span className="material-symbols-outlined text-sm">
                arrow_back
              </span>
              Customer Portal
            </Link>
            <Link
              to="/admin/login"
              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 no-underline transition-colors"
            >
              <span className="material-symbols-outlined text-sm">
                admin_panel_settings
              </span>
              Main Admin Login
            </Link>
          </div>
        </div>

        {/* Security badges */}
        <div className="flex items-center justify-center gap-6 mt-8">
          {[
            { icon: "shield_lock", label: "Encrypted" },
            { icon: "verified_user", label: "Secure" },
            { icon: "lock", label: "Private" },
          ].map((badge) => (
            <div
              key={badge.label}
              className="flex items-center gap-1.5 text-slate-600"
            >
              <span className="material-symbols-outlined text-sm">
                {badge.icon}
              </span>
              <span className="text-[9px] font-black uppercase tracking-widest">
                {badge.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default VisaAdminLogin;
