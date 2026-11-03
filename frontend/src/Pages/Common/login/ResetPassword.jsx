import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { FaSpinner } from "react-icons/fa";
import supabase from "../../../lib/supabase";
import AuthShell from "./AuthShell";

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
    <AuthShell>
      <header className="jsl-form-head">
        <h2 className="jsl-form-title">Set a new password</h2>
        <p className="jsl-form-sub">Choose a new password for your account.</p>
      </header>

      {error && <div className="jsl-alert" role="alert">{error}</div>}
      {success && (
        <div className="jsl-alert is-success" role="status">Password reset successfully! Redirecting to sign in…</div>
      )}

      {/* Verifying the link is a real wait - the token exchange is a network
          round trip - so say so rather than showing an empty card. */}
      {!success && linkState === "checking" && (
        <div className="jsl-form">
          <p className="jsl-status">
            <FaSpinner className="jsl-spin" />
            Checking your reset link…
          </p>
        </div>
      )}

      {!success && linkState === "invalid" && (
        <div className="jsl-form">
          <Link to="/forgot-password" className="jsl-submit">Request a new reset link</Link>
        </div>
      )}

      {!success && linkState === "ready" && (
        <form className="jsl-form" onSubmit={handleSubmit}>
          <div className="jsl-field">
            <label htmlFor="newPassword">New password</label>
            <input
              id="newPassword"
              type="password"
              name="newPassword"
              required
              autoComplete="new-password"
              value={formData.newPassword}
              onChange={handleChange}
              placeholder="At least 8 characters"
              className="jsl-input"
              disabled={isLoading}
            />
          </div>

          <div className="jsl-field">
            <label htmlFor="confirmPassword">Confirm new password</label>
            <input
              id="confirmPassword"
              type="password"
              name="confirmPassword"
              required
              autoComplete="new-password"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Type it again"
              className="jsl-input"
              disabled={isLoading}
            />
          </div>

          <button type="submit" className="jsl-submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <FaSpinner className="jsl-spin" />
                Updating password…
              </>
            ) : (
              "Update password"
            )}
          </button>
        </form>
      )}

      {error.includes("missing reset link") && (
        <div className="jsl-form">
          <Link to="/forgot-password" className="jsl-submit">Request a new link</Link>
        </div>
      )}

      <p className="jsl-signup">
        <Link to="/login" className="jsl-link strong">Back to sign in</Link>
      </p>
    </AuthShell>
  );
};

export default ResetPassword;
