import express from 'express';
import supabase from '../config/supabase.js';
import { checkoutSaveRefusal, checkoutOwner, checkoutAmount } from '../utils/checkoutSave.js';
import { protect, admin } from '../middleware/auth.middleware.js';
import { cruises } from '../data/catalog.js';
const router = express.Router();

const norm = (s) => String(s || '').toLowerCase();

// Save a cruise booking to the database
router.post('/bookings', async (req, res) => {
  try {
    const {
      orderId,
      cruiseName,
      cruiseImage,
      duration,
      departure,
      arrival,
      departureDate,
      returnDate,
      basePrice,
      taxesAndFees,
      portCharges,
      totalAmount,
      passengerDetails,
      transactionId,
      sessionId,

    } = req.body;

    console.log('🚢 Saving cruise booking to database:', {
      orderId,
      cruiseName,
      totalAmount,
      passengers: passengerDetails?.adults?.length || 0
    });

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Order ID is required'
      });
    }

    if (!supabase) {
      console.log('⚠️ Supabase not configured, skipping database save');
      return res.json({
        success: true,
        message: 'Booking processed (database not available)',
        data: { orderId }
      });
    }

    // Build passenger array for storage
    const passengers = [];
    if (passengerDetails?.adults) {
      passengerDetails.adults.forEach((adult, i) => {
        passengers.push({
          id: `A${i + 1}`,
          type: 'adult',
          firstName: adult.firstName || adult.first_name || '',
          lastName: adult.lastName || adult.last_name || '',
          age: adult.age || '',
          gender: adult.gender || '',
          nationality: adult.nationality || ''
        });
      });
    }
    if (passengerDetails?.children) {
      passengerDetails.children.forEach((child, i) => {
        if (child.firstName || child.lastName || child.first_name || child.last_name) {
          passengers.push({
            id: `C${i + 1}`,
            type: 'child',
            firstName: child.firstName || child.first_name || '',
            lastName: child.lastName || child.last_name || '',
            age: child.age || ''
          });
        }
      });
    }

    // Fetch the pending row created at checkout (carries success_indicator + session)
    let existing = null;
    try {
      const { data: found } = await supabase
        .from('bookings')
        .select('*')
        .eq('booking_reference', orderId)
        .single();
      existing = found;
    } catch (_) { /* no pending row — proceed */ }

    // Verify payment: ARC Pay resultIndicator must match the stored successIndicator
    // Only the checkout row this payment belongs to, proven paid by ARC's
    // indicator (utils/checkoutSave.js). A reference alone rewrote any row -
    // a customer's flight booking included - and a wrong indicator reset it.
    const providedIndicator = transactionId || sessionId;
    const refusal = checkoutSaveRefusal(existing, { travelType: 'cruise', indicator: providedIndicator });
    if (refusal) {
      console.warn('⛔ Cruise save refused', { orderId, status: refusal.status });
      return res.status(refusal.status).json(refusal.body);
    }

    const buildRow = (uid) => ({
      user_id: uid || null,
      booking_reference: orderId,
      travel_type: 'cruise',
      status: 'confirmed',
      total_amount: checkoutAmount(existing, totalAmount),
      payment_status: 'paid',
      booking_details: {
        ...(existing?.booking_details || {}),
        order_id: orderId,
        transaction_id: providedIndicator || existing?.booking_details?.transaction_id || null,
        cruise_name: cruiseName || '',
        cruise_image: cruiseImage || '',
        duration: duration || '',
        departure: departure || '',
        arrival: arrival || '',
        departure_date: departureDate || '',
        return_date: returnDate || '',
        base_price: parseFloat(basePrice) || 0,
        taxes_and_fees: parseFloat(taxesAndFees) || 0,
        port_charges: parseFloat(portCharges) || 0,
        amount: checkoutAmount(existing, totalAmount),
        currency: 'USD',
        paid_at: new Date().toISOString(),
        original_user_id: checkoutOwner(existing)
      },
      passenger_details: passengers
    });

    // Upsert on booking_reference so the pending/unpaid row is upgraded to confirmed/paid
    let { data, error } = await supabase
      .from('bookings')
      .upsert(buildRow(checkoutOwner(existing)), { onConflict: 'booking_reference' })
      .select()
      .single();

    // No retry without the owner: the owner is the checkout row's own, which
    // the table already holds. The retry existed for an owner taken from the
    // body, and it wrote the row with no owner at all.

    if (error) {
      console.error('❌ Error saving cruise booking:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to save booking'
      });
    }

    console.log('✅ Cruise booking saved/confirmed in database:', data.id);

    res.json({
      success: true,
      message: 'Cruise booking saved successfully',
      data: {
        id: data.id,
        orderId,
        bookingReference: orderId,
        status: 'confirmed'
      }
    });

  } catch (error) {
    console.error('❌ Cruise booking save error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save cruise booking'
    });
  }
});

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

// ── Cruise catalog (static inventory) ────────────────────────
// Search / filter the catalog. No filters → full list, so the mobile
// CruiseResultsScreen (searchCruises with empty params) gets everything.
router.get('/search', (req, res) => {
  const { destination, departurePort, cruiseLine, minPrice, maxPrice } = req.query;
  let results = [...cruises];

  if (destination) results = results.filter(
    (c) => (c.destinations || []).some((d) => norm(d).includes(norm(destination)))
  );
  if (departurePort) results = results.filter(
    (c) => norm(c.departure_port).includes(norm(departurePort)) ||
           (c.departurePorts || []).some((p) => norm(p).includes(norm(departurePort)))
  );
  if (cruiseLine) results = results.filter((c) => norm(c.cruise_line).includes(norm(cruiseLine)));
  if (minPrice) results = results.filter((c) => Number(c.priceValue || 0) >= Number(minPrice));
  if (maxPrice) results = results.filter((c) => Number(c.priceValue || 0) <= Number(maxPrice));

  res.json({ success: true, data: results, meta: { total: results.length } });
});

// Cruise details by id. Declared before the list root; /details prefix keeps it
// clear of the /bookings routes above.
router.get('/details/:id', (req, res) => {
  const cruise = cruises.find((c) => String(c.id) === String(req.params.id));
  if (!cruise) return res.status(404).json({ success: false, error: 'Cruise not found' });
  res.json({ success: true, data: cruise });
});

// Full cruise catalog.
router.get('/', (req, res) => {
  res.json({ success: true, data: cruises, total: cruises.length });
});

export default router;
