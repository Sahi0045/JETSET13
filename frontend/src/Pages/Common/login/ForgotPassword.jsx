import React, { useState } from "react";
import { Link } from "react-router-dom";
import { FaSpinner } from "react-icons/fa";
import { getApiUrl } from "../../../utils/apiHelper";
import AuthShell from "./AuthShell";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      setError("Please enter your email address.");
      return;
    }

    setIsLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(getApiUrl("auth/forgot-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess("Success! If an account exists with this email, we've sent a password reset link.");
        return;
      }

      setError(data.message || "Something went wrong. Please try again.");
    } catch (err) {
      console.error("Forgot password error:", err);
      setError("Unable to connect to the server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell>
      <header className="jsl-form-head">
        <h2 className="jsl-form-title">Forgot your password?</h2>
        <p className="jsl-form-sub">Enter your email and we&apos;ll send you a link to reset it.</p>
      </header>

      {error && <div className="jsl-alert" role="alert">{error}</div>}
      {success && <div className="jsl-alert is-success" role="status">{success}</div>}

      {!success ? (
        <form className="jsl-form" onSubmit={handleSubmit}>
          <div className="jsl-field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              name="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="jsl-input"
              disabled={isLoading}
            />
          </div>

          <button type="submit" className="jsl-submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <FaSpinner className="jsl-spin" />
                Sending link…
              </>
            ) : (
              "Send reset link"
            )}
          </button>

          <p className="jsl-signup">
            Remembered it? <Link to="/login" className="jsl-link strong">Back to sign in</Link>
          </p>
        </form>
      ) : (
        <div className="jsl-form">
          <Link to="/login" className="jsl-submit">Return to sign in</Link>
        </div>
      )}
    </AuthShell>
  );
};

export default ForgotPassword;
