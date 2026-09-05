import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import supabase from "../../../lib/supabase";

/**
 * Set a new password from a recovery link.
 *
 * This page used to read `?token=` and `?email=` from the URL and POST them to
 * `/api/auth/reset-password`, which checked a token table that does not exist
 * and then wrote a bcrypt hash to `public.users.password`. The login form
 * authenticates with `supabase.auth.signInWithPassword`, which reads
 * `auth.users` — so even the success path changed a password nobody could sign
 * in with.
 *
 * Recovery now runs through Supabase Auth, and the email links here with a
 * `token_hash` that this page redeems with `verifyOtp`.
 *
 * The token deliberately does NOT travel as Supabase's own `action_link`. That
 * URL is a single-use GET, so anything that fetches it redeems it — and Gmail
 * scans links in incoming mail. It burned the first customer's token twelve
 * seconds after the email was sent, and their click came back
 * `error_code=otp_expired` on a link nobody had opened. This page is inert
 * HTML: a scanner that fetches it consumes nothing, because the token is only
 * redeemed by the `verifyOtp` call below, which a scanner does not run.
 *
 * The fragment path is kept as well, for links already in flight and for
 * Supabase's own templates. Both are asynchronous and race the first render,
 * which is why this waits on a session rather than reading the URL
 * synchronously.
 */
const ResetPassword = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  // 'checking' until we know whether this link produced a usable session.
  const [linkState, setLinkState] = useState("checking");

  useEffect(() => {
    let cancelled = false;

    const fail = (message) => {
      if (cancelled) return;
      setLinkState("invalid");
      setError(message);
    };

    // Supabase reports an expired or already-used link in the fragment rather
    // than as a failed request, so this is the only place it can be read.
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (hash.get("error")) {
      const code = hash.get("error_code") || "";
      fail(
        /expired|invalid/i.test(code)
          ? "This reset link has expired. Reset links are valid for one hour and can be used once — please request a new one."
          : hash.get("error_description")?.replace(/\+/g, " ") ||
              "This reset link is not valid. Please request a new one.",
      );
      return () => { cancelled = true; };
    }

    // PASSWORD_RECOVERY fires once detectSessionInUrl has consumed the
    // fragment. Subscribing before checking avoids missing it by a tick.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        setLinkState("ready");
      }
    });

    // The normal path: our own email links here with the token, and this is
    // the moment it is redeemed - in a real browser, on a real page load.
    const tokenHash = new URLSearchParams(window.location.search).get("token_hash");
    if (tokenHash) {
      supabase.auth
        .verifyOtp({ token_hash: tokenHash, type: "recovery" })
        .then(({ error: verifyError }) => {
          if (cancelled) return;
          if (verifyError) {
            fail(
              /expired|invalid/i.test(verifyError.message || "")
                ? "This reset link has expired or has already been used. Links are valid for one hour and work once — please request a new one."
                : verifyError.message || "This reset link is not valid. Please request a new one.",
            );
            return;
          }
          // Drop the token from the address bar so it is not left in history,
          // and so a reload does not try to redeem a spent token.
          window.history.replaceState({}, "", window.location.pathname);
          setLinkState("ready");
        });
      return () => {
        cancelled = true;
        sub?.subscription?.unsubscribe();
      };
    }

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data?.session) {
        setLinkState("ready");
        return;
      }
      // The exchange may still be in flight on a slow connection. Give it a
      // moment before calling the link dead, rather than showing an error the
      // user would have to reload past.
      setTimeout(async () => {
        if (cancelled) return;
        const { data: retry } = await supabase.auth.getSession();
        if (cancelled) return;
        if (retry?.session) setLinkState("ready");
        else fail("This reset link is invalid or has expired. Please request a new one.");
      }, 2500);
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe();
    };
  }, []);

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
      const { error: updateError } = await supabase.auth.updateUser({
        password: formData.newPassword,
      });

      if (updateError) {
        // Supabase rejects a password identical to the current one, and
        // rejects the whole call once the recovery session has expired.
        setError(
          /same.*password|different from the old/i.test(updateError.message)
            ? "That is already your password. Please choose a different one."
            : updateError.message || "Could not set your new password. Please request a new link.",
        );
        return;
      }

      setSuccess(true);
      // Sign the recovery session out so the new password is actually used to
      // get back in, rather than leaving a half-authenticated tab behind.
      await supabase.auth.signOut().catch(() => {});
      // A customer resetting their password belongs on the customer sign-in
      // page. This used to send them to /admin/login.
      setTimeout(() => navigate("/login"), 3000);
    } catch (err) {
      console.error("Reset password error:", err);
      setError("Unable to reach the server. Please try again.");
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

          {/* Verifying the link is a real wait - the token exchange is a network
              round trip - so say so rather than showing an empty card. */}
          {!success && linkState === "checking" && (
            <div className="py-6 flex items-center justify-center gap-3">
              <span className="w-5 h-5 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
              <p className="text-slate-400 text-sm font-medium">Checking your reset link…</p>
            </div>
          )}

          {!success && linkState === "invalid" && (
            <Link
              to="/forgot-password"
              className="block w-full text-center bg-[#1152d4] hover:bg-[#0d47b1] text-white font-bold text-sm py-4 rounded-2xl no-underline transition-colors"
            >
              Request a new reset link
            </Link>
          )}

          {!success && linkState === "ready" && (
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
            <Link to="/login" className="text-xs font-bold text-slate-500 hover:text-white no-underline transition-colors uppercase tracking-widest flex items-center justify-center gap-2">
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
