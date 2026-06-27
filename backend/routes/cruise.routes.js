import express from 'express';
import supabase from '../config/supabase.js';
const router = express.Router();

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
      userId
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
    const storedIndicator = existing?.booking_details?.success_indicator;
    const providedIndicator = transactionId || sessionId;
    if (storedIndicator && providedIndicator && storedIndicator !== providedIndicator) {
      console.warn('⚠️ Payment indicator mismatch for cruise order:', orderId);
      try {
        await supabase
          .from('bookings')
          .update({ status: 'pending', payment_status: 'unpaid' })
          .eq('booking_reference', orderId);
      } catch (_) { /* non-blocking */ }
      return res.status(400).json({ success: false, verified: false, error: 'Payment could not be verified' });
    }

    const buildRow = (uid) => ({
      user_id: uid || null,
      booking_reference: orderId,
      travel_type: 'cruise',
      status: 'confirmed',
      total_amount: parseFloat(totalAmount) || 0,
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
        amount: parseFloat(totalAmount) || 0,
        currency: 'USD',
        paid_at: new Date().toISOString(),
        original_user_id: userId || null
      },
      passenger_details: passengers
    });

    // Upsert on booking_reference so the pending/unpaid row is upgraded to confirmed/paid
    let { data, error } = await supabase
      .from('bookings')
      .upsert(buildRow(userId), { onConflict: 'booking_reference' })
      .select()
      .single();

    // FK (user_id not in auth.users) or RLS violation → retry without user_id
    if (error && userId && (error.code === '23503' || error.code === '42501' ||
        error.message?.includes('violates foreign key') || error.message?.includes('row-level security'))) {
      console.log('🔄 Retrying cruise booking save without user_id (FK/RLS constraint issue)...');
      ({ data, error } = await supabase
        .from('bookings')
        .upsert(buildRow(null), { onConflict: 'booking_reference' })
        .select()
        .single());
    }

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
router.get('/bookings', async (req, res) => {
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

export default router;
