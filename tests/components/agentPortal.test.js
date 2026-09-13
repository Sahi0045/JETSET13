import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Travel agents sign in on their own page and see their own work.
 *
 * Agents signed in on /admin/login, which retried the admin form's email and
 * password against the agents table. Their portal then demanded a stored token
 * nothing writes since sessions moved to cookies, so it sent them straight back.
 * In the admin panel an agent's sale linked to a customer-email search that the
 * bookings search (references only) could never match.
 *
 * Source scans, like customerSurfaces.test.js: the regressions here are a
 * fallback or a stored-token check quietly coming back.
 */

const read = (p) => readFileSync(path.resolve(process.cwd(), p), 'utf8');

describe('agents sign in on their own page', () => {
  it('the admin login signs in admins only, and points agents to their page', () => {
    const src = read('frontend/src/Pages/Admin/AdminLogin.jsx');
    expect(src).not.toMatch(/agent-login/);
    expect(src).toMatch(/to="\/agent\/login"/);
    expect(src).toMatch(/\['admin', 'superadmin'\]\.includes\(data\.role\)/);
  });

  it('agents have /agent/login, posting to the agent endpoint', () => {
    expect(read('frontend/src/app.jsx')).toMatch(/path="\/agent\/login"/);
    expect(read('frontend/src/Pages/Agent/TravelAgentLogin.jsx')).toMatch(/action=agent-login/);
  });

  it('after setting a password an agent goes to the agent sign-in', () => {
    expect(read('frontend/src/Pages/Agent/TravelAgentSetPassword.jsx')).not.toMatch(/\/admin\/login/);
  });
});

describe('the portal trusts the session cookie', () => {
  const portal = read('frontend/src/Pages/Agent/TravelAgentPortal.jsx');

  it('does not require a stored token nobody writes', () => {
    expect(portal).not.toMatch(/session\.token/);
    expect(portal).not.toMatch(/Bearer/);
    expect(portal).toMatch(/credentials: "include"/);
  });

  it('never sends an agent to the admin login', () => {
    expect(portal).not.toMatch(/\/admin\/login/);
    expect(portal).toMatch(/navigate\("\/agent\/login/);
  });

  it('logs out on the server, not only on the device', () => {
    expect(portal).toMatch(/auth\/logout/);
  });
});

describe("the admin panel shows an agent's bookings", () => {
  const src = read('frontend/src/Pages/Admin/AgentManagement.jsx');

  it('links each sale to the booking it created', () => {
    expect(src).toMatch(/l\.bookingReference/);
    expect(src).not.toMatch(/l\.customer_email \|\| l\.customer_name \|\| ''\)/);
  });

  it("lists the agent's bookings", () => {
    expect(src).toMatch(/detail\.bookings/);
  });
});
