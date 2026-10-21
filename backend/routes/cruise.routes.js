import express from 'express';
import supabase from '../config/supabase.js';
import { protect, admin } from '../middleware/auth.middleware.js';
import { listPublished } from '../services/cruiseCatalog/publishedSailings.js';
import { toAppCruise } from '../services/cruiseCatalog/appFeed.js';
import { regionByKey } from '../../shared/cruiseRegions.js';

const router = express.Router();

const norm = (s) => String(s || '').toLowerCase();

// Cruises are booked by our team, not paid for here: the old save that
// confirmed a cruise payment is gone, and checkout refuses cruises.

// Get all cruise bookings
/**
 * Staff only, and it never was.
 *
 * This answered `GET /bookings` with `select('*')` on every row of its travel
 * type, with no authentication, no ownership filter and no limit - through
 * config/supabase.js, which holds the SERVICE ROLE key and therefore bypasses
 * RLS entirely. One unauthenticated curl returned every customer's
 * `passenger_details`, `customer_email`, amount and `booking_details` - which
 * carries the ARC `success_indicator`, the single secret that authorises
 * `?action=get-pending-booking`.
 *
 * Migration 20260911000000_fix_bookings_anon_read_rls.sql closed exactly this
 * data to the anon role after 27 rows were found readable in production. This
 * route was the same leak through the front door, and the RLS fix could not
 * touch it because the service-role client is not subject to RLS.
 *
 * Verified live on 16 Sep 2026: no credentials, real rows returned. No page in
 * the app has ever called it - the frontend only POSTs here - so gating it
 * breaks nothing.
 */
router.get('/bookings', protect, admin, async (req, res) => {
  try {
    if (!supabase) {
      return res.json({ success: true, data: [] });
    }

    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('travel_type', 'cruise')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching cruise bookings:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      data: data || []
    });

  } catch (error) {
    console.error('❌ Error fetching cruise bookings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch cruise bookings'
    });
  }
});

// ── The published cruise catalog, for the Android app ───────
const appCruises = async () => {
  const { data, error } = await listPublished();
  if (error) throw error;
  return data.map((s) => ({ app: toAppCruise(s), region: regionByKey(s.region)?.name ?? '' }));
};

// No filters returns everything, so the app's results screen (searchCruises
// with empty params) still gets the full list.
router.get('/search', async (req, res) => {
  try {
    const { destination, departurePort, cruiseLine } = req.query;
    let results = await appCruises();
    if (destination) results = results.filter(({ app, region }) => norm(region).includes(norm(destination)) || app.destinations.some((d) => norm(d).includes(norm(destination))));
    if (departurePort) results = results.filter(({ app }) => norm(app.departure_port).includes(norm(departurePort)));
    if (cruiseLine) results = results.filter(({ app }) => norm(app.cruise_line).includes(norm(cruiseLine)));
    res.json({ success: true, data: results.map(({ app }) => app), meta: { total: results.length } });
  } catch (error) {
    console.error('❌ Cruise search failed:', error?.message ?? error);
    res.status(500).json({ success: false, error: 'Cruises could not be loaded. Try again.' });
  }
});

router.get('/details/:id', async (req, res) => {
  try {
    const found = (await appCruises()).find(({ app }) => app.id === String(req.params.id));
    if (!found) return res.status(404).json({ success: false, error: 'Cruise not found' });
    res.json({ success: true, data: found.app });
  } catch (error) {
    console.error('❌ Cruise lookup failed:', error?.message ?? error);
    res.status(500).json({ success: false, error: 'Cruises could not be loaded. Try again.' });
  }
});

router.get('/', async (_req, res) => {
  try {
    const cruises = (await appCruises()).map(({ app }) => app);
    res.json({ success: true, data: cruises, total: cruises.length });
  } catch (error) {
    console.error('❌ Cruise list failed:', error?.message ?? error);
    res.status(500).json({ success: false, error: 'Cruises could not be loaded. Try again.' });
  }
});

export default router;
