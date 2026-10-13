import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const rows = { data: null, error: { code: 'PGRST116', message: 'no rows' } };
const query = {};
for (const op of ['select', 'eq', 'insert']) query[op] = vi.fn(() => query);
query.single = vi.fn(async () => rows);

vi.mock('../../frontend/src/lib/supabase', () => ({
  default: {
    from: () => query,
    auth: {
      getSession: async () => ({ data: { session: { access_token: 't' } }, error: null }),
      mfa: { listFactors: async () => ({ data: { totp: [] }, error: null }) },
    },
  },
}));
const auth = {
  user: { id: 'user-1', email: 'traveller@example.com', user_metadata: { first_name: 'Asha' }, identities: [] },
  loading: false,
  isAuthenticated: true,
  updateProfile: vi.fn(),
  updatePassword: vi.fn(),
};
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => auth }));
vi.mock('../../frontend/src/hooks/useMembership', () => ({ default: () => ({ isActive: false }) }));
vi.mock('../../frontend/src/lib/pushNotifications', () => ({ registerForPushNotifications: vi.fn() }));
vi.mock('../../frontend/src/Pages/Common/components/PhoneInputWithCountry', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/login/JetWalletPanel', () => ({ default: () => <div>wallet panel</div> }));

const { default: ProfilePage } = await import('../../frontend/src/Pages/Common/login/profiledashboard.jsx');

const open = (url) => render(<MemoryRouter initialEntries={[url]}><ProfilePage /></MemoryRouter>);

describe('the Jet Wallet tab on the profile page', () => {
  it('opens on the wallet when the link says ?tab=wallet', async () => {
    open('/profile?tab=wallet');
    expect(await screen.findByText('wallet panel')).toBeTruthy();
    expect(screen.queryByDisplayValue('Asha')).toBeNull();
  });

  it('opens on the personal details otherwise, and the sidebar button switches to the wallet', async () => {
    open('/profile');
    const tab = await screen.findByRole('button', { name: 'Jet Wallet' });
    expect(await screen.findByDisplayValue('Asha')).toBeTruthy();
    expect(screen.queryByText('wallet panel')).toBeNull();
    fireEvent.click(tab);
    expect(await screen.findByText('wallet panel')).toBeTruthy();
    expect(screen.queryByDisplayValue('Asha')).toBeNull();
  });
});
