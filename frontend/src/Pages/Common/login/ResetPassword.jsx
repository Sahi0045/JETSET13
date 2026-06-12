import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { getApiUrl } from "../../../utils/apiHelper";

const ResetPassword = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [formData, setFormData] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Get token and email from URL
  const queryParams = new URLSearchParams(location.search);
  const token = queryParams.get("token");
  const email = queryParams.get("email");

  useEffect(() => {
    if (!token || !email) {
      setError("Invalid or missing reset link. Please request a new one.");
    }
  }, [token, email]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.newPassword || !formData.confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }

    if (formData.newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(getApiUrl("auth/reset-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          token,
          newPassword: formData.newPassword,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        setTimeout(() => navigate("/admin/login"), 3000);
        return;
      }

      setError(data.message || "Something went wrong. Please request a new link.");
    } catch (err) {
      console.error("Reset password error:", err);
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
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-10">
          <Link to="/" className="inline-flex items-center gap-3 text-white no-underline group mb-6">
            <div className="w-12 h-12 bg-[#1152d4] rounded-2xl flex items-center justify-center shadow-xl shadow-[#1152d4]/30 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-2xl text-white">lock_reset</span>
            </div>
            <div className="text-left">
              <p className="text-lg font-black tracking-tight leading-none">Jetsetters</p>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 leading-none mt-1">Reset Password</p>
            </div>
          </Link>

          <h1 className="text-3xl font-black tracking-tight mb-2">Set New Password</h1>
          <p className="text-slate-400 text-sm font-medium">Please choose a secure new password for your account.</p>
        </div>

        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] shadow-2xl shadow-black/40 rounded-[2rem] p-8 md:p-10">
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
              <span className="material-symbols-outlined text-red-400 text-sm shrink-0 mt-0.5">error</span>
              <p className="text-red-400 text-sm font-medium leading-relaxed">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-start gap-3">
              <span className="material-symbols-outlined text-green-400 text-sm shrink-0 mt-0.5">check_circle</span>
              <p className="text-green-400 text-sm font-medium leading-relaxed">Password reset successfully! Redirecting to login...</p>
            </div>
          )}

          {!success && !error.includes("missing reset link") && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">New Password</label>
                <div className="relative group">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-lg group-focus-within:text-[#3b82f6]">lock</span>
                  <input
                    type="password"
                    name="newPassword"
                    required
                    value={formData.newPassword}
                    onChange={handleChange}
                    placeholder="••••••••••••"
                    className="w-full bg-white/[0.05] border border-white/[0.1] rounded-2xl py-4 pl-12 pr-4 text-sm font-medium text-white placeholder:text-slate-600 focus:outline-none focus:border-[#3b82f6]/50 focus:ring-4 focus:ring-[#3b82f6]/10 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Confirm New Password</label>
                <div className="relative group">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-lg group-focus-within:text-[#3b82f6]">lock_check</span>
                  <input
                    type="password"
                    name="confirmPassword"
                    required
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="••••••••••••"
                    className="w-full bg-white/[0.05] border border-white/[0.1] rounded-2xl py-4 pl-12 pr-4 text-sm font-medium text-white placeholder:text-slate-600 focus:outline-none focus:border-[#3b82f6]/50 focus:ring-4 focus:ring-[#3b82f6]/10 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 bg-[#1152d4] hover:bg-[#0e42b0] text-white rounded-2xl font-black text-sm uppercase tracking-[0.15em] shadow-xl shadow-[#1152d4]/30 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
                {isLoading ? "Updating Password…" : "Update Password"}
              </button>
            </form>
          )}

          {error.includes("missing reset link") && (
            <Link
              to="/forgot-password"
              className="w-full py-4 bg-[#1152d4] text-white rounded-2xl font-black text-sm uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-3 no-underline"
            >
              Request New Link
            </Link>
          )}

          <div className="mt-8 text-center">
            <Link to="/admin/login" className="text-xs font-bold text-slate-500 hover:text-white no-underline transition-colors uppercase tracking-widest flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
