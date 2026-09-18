import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiUrl } from '../../utils/apiHelper';
import { isBookingStaff } from '../../../../shared/staffRoles';

/**
 * Sign-in for the support desk.
 *
 * Its own page, and its own accounts: a support person is not an admin, so
 * /admin/login turns them away ("Invalid credentials") and the admin panel is
 * not theirs to open. The server sets the same httpOnly session cookie either
 * way; what a support account may then do is decided server-side by its role
 * (shared/staffRoles.js).
 */
function SupportLogin() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await fetch(getApiUrl('auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !isBookingStaff(data.role)) {
        throw new Error(data.message || 'Those details do not open the support desk.');
      }
      // Nothing secret is kept here: the session is the httpOnly cookie. This
      // is only so the page knows who is signed in.
      try {
        localStorage.setItem('adminUser', JSON.stringify({
          id: data.id, email: data.email, firstName: data.firstName, lastName: data.lastName, role: data.role,
        }));
      } catch { /* private browsing */ }
      navigate('/desk');
    } catch (problem) {
      setError(problem.message || 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7FBFC] flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white border border-[#D1E9F0] rounded-xl p-6 w-full max-w-sm">
        <h1 className="text-xl font-bold text-[#055B75] mb-1">Support desk</h1>
        <p className="text-sm text-gray-500 mb-4">Sign in to work the bookings that need a person.</p>

        {error && <p className="mb-3 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <label className="block text-sm font-semibold text-gray-700 mb-3">
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            className="mt-1 w-full border border-[#B9D0DC] rounded-lg p-2.5 text-sm font-normal"
          />
        </label>
        <label className="block text-sm font-semibold text-gray-700 mb-4">
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            className="mt-1 w-full border border-[#B9D0DC] rounded-lg p-2.5 text-sm font-normal"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="w-full px-3 py-2.5 rounded-lg bg-[#055B75] text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

export default SupportLogin;
