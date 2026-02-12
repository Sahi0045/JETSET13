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

    const { data, error } = await supabase
      .from('bookings')
      .insert({
        user_id: userId || null,
        booking_reference: orderId,
        travel_type: 'cruise',
        status: 'confirmed',
        total_amount: parseFloat(totalAmount) || 0,
        payment_status: 'paid',
        booking_details: {
          order_id: orderId,
          transaction_id: transactionId || sessionId || null,
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
          currency: 'USD'
        },
        passenger_details: passengers
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error saving cruise booking:', error);
      // If it's a duplicate, that's okay
      if (error.code === '23505') {
        console.log('ℹ️ Cruise booking already exists for order:', orderId);
        return res.json({
          success: true,
          message: 'Booking already exists',
          data: { orderId }
        });
      }
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to save booking'
      });
    }

    console.log('✅ Cruise booking saved to database:', data.id);

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
