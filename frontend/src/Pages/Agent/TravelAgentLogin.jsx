import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

/**
 * Sign-in for travel agents, at /agent/login.
 *
 * Agents used to sign in on /admin/login, which tried the admin login and then
 * quietly retried the same email and password against the agents table: one
 * form guessing at two account stores, admins and agents through one door.
 * Agents now sign in here, against their own endpoint, and the admin page signs
 * in admins only.
 */
const signedInAgent = () => {
  try {
    const u = JSON.parse(localStorage.getItem("adminUser") || "null");
    return u?.role === "agent" ? u : null;
  } catch {
    return null;
  }
};

export default function TravelAgentLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expired] = useState(() => new URLSearchParams(window.location.search).has("expired"));

  useEffect(() => {
    if (signedInAgent()) navigate("/agent", { replace: true });
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/payments?action=agent-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.error || "Invalid email or password.");
        return;
      }
      // The session is the httpOnly cookie the server has just set. This is
      // only the profile the portal shows, not a credential.
      localStorage.setItem("adminUser", JSON.stringify({
        id: data.id,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        role: "agent",
        agentId: data.agentId,
      }));
      localStorage.removeItem("isSuperAdmin");
      navigate("/agent", { replace: true });
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f6f8] font-sans flex items-center justify-center px-4 py-12">
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200/40 p-8 sm:p-10 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-[#1152d4]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-3xl text-[#1152d4]">badge</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900">Agent Portal</h1>
          <p className="text-slate-500 text-sm mt-1">Sign in to see your sales and commission.</p>
        </div>

        <form onSubmit={handleSubmit}>
          {expired && !error && (
            <div className="mb-4 rounded-xl bg-amber-50 text-amber-800 ring-1 ring-amber-200 px-4 py-2.5 text-sm font-medium">
              Your session has expired. Please sign in again.
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-xl bg-red-50 text-red-700 ring-1 ring-red-200 px-4 py-2.5 text-sm font-medium" role="alert">{error}</div>
          )}
          <label htmlFor="agent-email" className="block text-xs font-bold text-slate-500 mb-1.5">Email</label>
          <input id="agent-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#1152d4]/30" />
          <label htmlFor="agent-password" className="block text-xs font-bold text-slate-500 mb-1.5">Password</label>
          <input id="agent-password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm mb-6 focus:outline-none focus:ring-2 focus:ring-[#1152d4]/30" />
          <button type="submit" disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-3 bg-[#1152d4] text-white rounded-xl font-bold text-sm hover:bg-[#0e42b0] transition-all disabled:opacity-60">
            <span className="material-symbols-outlined text-lg">{submitting ? "hourglass_empty" : "login"}</span>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-6">
          New agent? Use the link in your invitation email to set your password.
          <br />
          Staff member? <Link to="/admin/login" className="text-[#1152d4] font-bold no-underline">Admin sign-in</Link>
        </p>
      </div>
    </div>
  );
}
