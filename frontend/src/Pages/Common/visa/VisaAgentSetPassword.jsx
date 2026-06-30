import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiGet, apiPost } from "../../../utils/apiHelper";

// apiGet/apiPost resolve to a raw fetch Response — normalise to { ok, ...json }.
async function send(promise) {
  const res = await promise;
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, ...data };
}

/**
 * Public page reached from the agent-invite email: /visa/agent/set-password?token=…
 * Validates the one-time token, lets the new agent choose a password, then sends them
 * to the visa admin login.
 */
const VisaAgentSetPassword = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";

  const [state, setState] = useState("checking"); // checking | invalid | ready | done
  const [invite, setInvite] = useState(null); // { email, name }
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setState("invalid");
      setMessage("This link is missing its invitation token.");
      return;
    }
    (async () => {
      try {
        const res = await send(apiGet(`visa/agent/invite/${token}`));
        if (res.ok && res.success) {
          setInvite({ email: res.email, name: res.name });
          setState("ready");
        } else {
          setState("invalid");
          setMessage(res.message || "This invitation link is invalid or has expired.");
        }
      } catch (e) {
        setState("invalid");
        setMessage(e.message || "This invitation link is invalid or has expired.");
      }
    })();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await send(apiPost("visa/agent/accept-invite", { token, password }));
      if (res.ok && res.success) {
        setState("done");
        // Send them to the admin login after a short beat.
        setTimeout(() => navigate("/visa/admin/login"), 2200);
      } else {
        setError(res.message || "Could not set your password.");
      }
    } catch (e) {
      setError(e.message || "Could not set your password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f6f8] font-sans flex items-center justify-center px-4 py-12">
      <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200/40 p-8 sm:p-10 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-[#1152d4]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-3xl text-[#1152d4]">badge</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900">Visa Agent Setup</h1>
        </div>

        {state === "checking" && (
          <div className="py-10 flex flex-col items-center gap-3">
            <div className="w-9 h-9 border-4 border-[#1152d4]/30 border-t-[#1152d4] rounded-full animate-spin" />
            <p className="text-slate-500 text-sm">Checking your invitation…</p>
          </div>
        )}

        {state === "invalid" && (
          <div className="text-center py-6">
            <span className="material-symbols-outlined text-5xl text-red-400 block mb-3">link_off</span>
            <p className="text-slate-600 text-sm mb-6">{message}</p>
            <Link
              to="/visa"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm no-underline"
            >
              <span className="material-symbols-outlined text-base">home</span>
              Back to Visa Portal
            </Link>
          </div>
        )}

        {state === "ready" && (
          <form onSubmit={handleSubmit}>
            <p className="text-slate-500 text-sm text-center mb-6">
              Welcome{invite?.name ? `, ${invite.name}` : ""}! Set a password for{" "}
              <span className="font-bold text-slate-700">{invite?.email}</span> to access the
              visa panel.
            </p>

            {error && (
              <div className="mb-4 rounded-xl bg-red-50 text-red-700 ring-1 ring-red-200 px-4 py-2.5 text-sm font-medium">
                {error}
              </div>
            )}

            <label className="block text-xs font-bold text-slate-500 mb-1.5">New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#1152d4]/30"
            />

            <label className="block text-xs font-bold text-slate-500 mb-1.5">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter password"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm mb-6 focus:outline-none focus:ring-2 focus:ring-[#1152d4]/30"
            />

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#1152d4] text-white rounded-xl font-bold text-sm hover:bg-[#0e42b0] transition-all disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-lg">
                {submitting ? "hourglass_empty" : "lock"}
              </span>
              {submitting ? "Setting password…" : "Set password & continue"}
            </button>
          </form>
        )}

        {state === "done" && (
          <div className="text-center py-6">
            <span className="material-symbols-outlined text-5xl text-emerald-500 block mb-3">
              check_circle
            </span>
            <p className="text-slate-700 font-bold mb-1">Password set!</p>
            <p className="text-slate-500 text-sm mb-6">Taking you to the sign-in page…</p>
            <Link
              to="/visa/admin/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1152d4] text-white rounded-xl font-bold text-sm no-underline"
            >
              <span className="material-symbols-outlined text-base">login</span>
              Sign in now
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default VisaAgentSetPassword;
