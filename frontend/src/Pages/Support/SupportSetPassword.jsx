import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getApiUrl } from '../../utils/apiHelper';

/**
 * The page an invited support person lands on.
 *
 * The same onboarding travel agents have: the admin invites an address, the
 * link arrives by email, and the person chooses their own password here. The
 * owner never sees or sends a password, and the link is single use and expires
 * after 48 hours (backend/routes/staff.routes.js).
 */
function SupportSetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');

  const [invite, setInvite] = useState(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setError('This link is incomplete. Please use the link from your invitation email.');
        setChecking(false);
        return;
      }
      try {
        const response = await fetch(getApiUrl(`staff/invite?token=${encodeURIComponent(token)}`));
        const body = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok || !body.success) throw new Error(body.error || 'This invitation link is not valid any more.');
        setInvite(body);
      } catch (problem) {
        if (!cancelled) setError(problem.message);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (password !== again) {
      setError('The two passwords are different.');
      return;
    }
    if (password.length < 10) {
      setError('Please use at least 10 characters.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(getApiUrl('staff/accept-invite'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || 'Could not set the password.');
      setDone(true);
      setTimeout(() => navigate('/desk/login'), 2500);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7FBFC] flex items-center justify-center p-4">
      <div className="bg-white border border-[#D1E9F0] rounded-xl p-6 w-full max-w-sm">
        <h1 className="text-xl font-bold text-[#055B75] mb-1">Support desk</h1>

        {checking && <p className="text-sm text-gray-500">Checking your invitation…</p>}

        {!checking && error && !invite && (
          <p className="text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        {done && (
          <p className="text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            Password set. Taking you to the sign-in page…
          </p>
        )}

        {!checking && invite && !done && (
          <form onSubmit={submit}>
            <p className="text-sm text-gray-600 mb-4">
              Welcome{invite.name ? `, ${invite.name}` : ''}. Choose a password for <strong>{invite.email}</strong>.
            </p>
            {error && <p className="mb-3 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Password
              <input
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full border border-[#B9D0DC] rounded-lg p-2.5 text-sm font-normal"
              />
            </label>
            <label className="block text-sm font-semibold text-gray-700 mb-4">
              Password again
              <input
                type="password"
                autoComplete="new-password"
                required
                value={again}
                onChange={(event) => setAgain(event.target.value)}
                className="mt-1 w-full border border-[#B9D0DC] rounded-lg p-2.5 text-sm font-normal"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full px-3 py-2.5 rounded-lg bg-[#055B75] text-white text-sm font-semibold disabled:opacity-50"
            >
              {busy ? 'Setting…' : 'Set password'}
            </button>
            <p className="text-xs text-gray-500 mt-3">At least 10 characters. The link works once and expires 48 hours after it was sent.</p>
          </form>
        )}
      </div>
    </div>
  );
}

export default SupportSetPassword;
