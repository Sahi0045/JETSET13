import express from 'express';
import supabase from '../config/supabase.js';

/**
 * Hotels.
 *
 * Hotel inventory used to come from the Amadeus Self-Service REST API. That
 * host (test.api.amadeus.com) has had no DNS record since August 2026, so every
 * inventory call had been failing for months, and the Enterprise WSAP this
 * project migrated to is AIR-only - it has no hotel operations at all. There is
 * currently no hotel supplier behind this API.
 *
 * So the inventory endpoints say so, rather than calling a host that cannot
 * answer. The site already tells customers the same thing: the hotels landing
 * page carries "Self-Service Portal Coming Soon - for bookings, call
 * (877) 538-7380".
 *
 * The /bookings endpoints below are NOT part of that: they read and write real
 * hotel bookings in Supabase, taken through other channels, and they work.
 */

const router = express.Router();

/**
 * Every endpoint that needs a hotel supplier.
 *
 * 503 rather than 404: the route exists and is expected to work again once a
 * supplier is connected. The message is the one the customer can act on.
 */
const noSupplier = (req, res) => res.status(503).json({
  success: false,
  data: [],
  error: 'Hotel search is temporarily unavailable. Please call (877) 538-7380 '
    + 'or email support@jetsetterss.com and our team will book for you.',
  code: 'HOTEL_SUPPLIER_UNAVAILABLE',
});

router.get('/destinations', noSupplier);
router.get('/locations', noSupplier);
router.get('/list', noSupplier);
router.get('/search', noSupplier);
router.post('/search', noSupplier);
router.get('/details/:hotelId', noSupplier);
router.get('/availability/:hotelId', noSupplier);
router.get('/check-availability', noSupplier);
router.get('/offers/:hotelId', noSupplier);
router.get('/offer/:offerId', noSupplier);
router.get('/ratings', noSupplier);
router.get('/autocomplete', noSupplier);
router.post('/book/:hotelId', noSupplier);

// Save a hotel booking. Supabase-backed and real - this is how a booking taken
// over the phone or through another channel is recorded.
router.post('/bookings', async (req, res) => {
  try {
    const {
      orderId,
      hotelId,
      hotelName,
      hotelImage,
      location,
      roomType,
      checkInDate,
      checkOutDate,
      nights,
      guests,
      pricePerNight,
      subtotal,
      taxes,
      serviceFee,
      fixedFees,
      totalAmount,
      currency = 'USD',
      guestInfo,
      transactionId,
      resultIndicator,
      sessionId,
      userId
    } = req.body;

    console.log('🏨 Saving hotel booking to database:', {
      orderId,
      hotelName,
      totalAmount,
      nights
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

    // Fetch the pending booking row created at checkout time. It carries the
    // ARC Pay success_indicator we use to verify the payment really succeeded.
    let existing = null;
    try {
      const { data: found } = await supabase
        .from('bookings')
        .select('*')
        .eq('booking_reference', orderId)
        .single();
      existing = found;
    } catch (_) { /* no pending row — proceed */ }

    // Verify payment: ARC Pay returns resultIndicator on success which must match
    // the successIndicator captured when the checkout session was created.
    const storedIndicator = existing?.booking_details?.success_indicator;
    const providedIndicator = resultIndicator || transactionId;
    if (storedIndicator && providedIndicator && storedIndicator !== providedIndicator) {
      console.warn('⚠️ Payment indicator mismatch for hotel order:', orderId);
      try {
        await supabase
          .from('bookings')
          .update({ status: 'pending', payment_status: 'unpaid' })
          .eq('booking_reference', orderId);
      } catch (_) { /* non-blocking */ }
      return res.status(400).json({
        success: false,
        verified: false,
        error: 'Payment could not be verified'
      });
    }

    // Build the guest/passenger array from guestInfo
    const guest = guestInfo || {};
    const passengers = [{
      id: 'G1',
      type: 'adult',
      firstName: guest.firstName || guest.first_name || '',
      lastName: guest.lastName || guest.last_name || '',
      email: guest.email || '',
      phone: guest.phone || ''
    }];

    const buildRow = (uid) => ({
      user_id: uid || null,
      booking_reference: orderId,
      travel_type: 'hotel',
      status: 'confirmed',
      total_amount: parseFloat(totalAmount) || 0,
      payment_status: 'paid',
      booking_details: {
        // preserve checkout-time fields (session_id, success_indicator, etc.)
        ...(existing?.booking_details || {}),
        order_id: orderId,
        transaction_id: providedIndicator || sessionId || existing?.booking_details?.transaction_id || null,
        hotel_id: hotelId || '',
        hotel_name: hotelName || '',
        hotel_image: hotelImage || '',
        location: location || '',
        room_type: roomType || '',
        check_in_date: checkInDate || '',
        check_out_date: checkOutDate || '',
        nights: parseInt(nights) || 0,
        guests: parseInt(guests) || 0,
        price_per_night: parseFloat(pricePerNight) || 0,
        subtotal: parseFloat(subtotal) || 0,
        taxes: parseFloat(taxes) || 0,
        service_fee: parseFloat(serviceFee) || 0,
        fixed_fees: parseFloat(fixedFees) || 0,
        amount: parseFloat(totalAmount) || 0,
        currency,
        guest_info: guest,
        paid_at: new Date().toISOString(),
        original_user_id: userId || null
      },
      passenger_details: passengers
    });

    // Upsert on booking_reference so the existing pending/unpaid row is upgraded
    // to confirmed/paid (rather than colliding with the unique constraint).
    let { data, error } = await supabase
      .from('bookings')
      .upsert(buildRow(userId), { onConflict: 'booking_reference' })
      .select()
      .single();

    // FK (user_id not in auth.users) or RLS violation → retry without user_id
    if (error && userId && (error.code === '23503' || error.code === '42501' ||
        error.message?.includes('violates foreign key') || error.message?.includes('row-level security'))) {
      console.log('🔄 Retrying hotel booking save without user_id (FK/RLS constraint issue)...');
      ({ data, error } = await supabase
        .from('bookings')
        .upsert(buildRow(null), { onConflict: 'booking_reference' })
        .select()
        .single());
    }

    if (error) {
      console.error('❌ Error saving hotel booking:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to save booking'
      });
    }

    console.log('✅ Hotel booking saved/confirmed in database:', data.id);

    res.json({
      success: true,
      message: 'Hotel booking saved successfully',
      data: {
        id: data.id,
        orderId,
        bookingReference: orderId,
        status: 'confirmed'
      }
    });

  } catch (error) {
    console.error('❌ Hotel booking save error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save hotel booking'
    });
  }
});

// Get all hotel bookings
router.get('/bookings', async (req, res) => {
  try {
    if (!supabase) {
      return res.json({ success: true, data: [] });
    }

    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('travel_type', 'hotel')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching hotel bookings:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('❌ Error fetching hotel bookings:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch hotel bookings' });
  }
});

export default router;
