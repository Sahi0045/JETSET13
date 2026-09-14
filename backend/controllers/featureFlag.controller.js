import supabase from '../config/supabase.js';
import { GUEST_FLIGHT_BOOKING_FLAG, isGuestFlightBookingEnabled } from '../services/guestBooking.service.js';

// A flag is keyed by `flag_name`, the table's own column. These handlers used
// to ask for `flag_key`, a column feature_flags does not have, so every read
// answered 500 and every toggle failed: the Feature Flags page only ever showed
// its built-in defaults, and a change "saved" there was never stored.

// @desc    Get all feature flags
// @route   GET /api/feature-flags
// @access  Public
export const getAllFeatureFlags = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('feature_flags')
      .select('*')
      .order('flag_name', { ascending: true });

    if (error) throw error;

    res.status(200).json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Get feature flags error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch feature flags',
      error: error.message
    });
  }
};

// @desc    Get enabled feature flags
// @route   GET /api/feature-flags/enabled
// @access  Public
export const getEnabledFeatureFlags = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('feature_flags')
      .select('*')
      .eq('enabled', true);

    if (error) throw error;

    // Return as an object map for easier lookup
    const flagsMap = {};
    data?.forEach(flag => {
      flagsMap[flag.flag_name] = flag.enabled;
    });

    res.status(200).json({
      success: true,
      data: flagsMap
    });
  } catch (error) {
    console.error('Get enabled flags error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch enabled flags',
      error: error.message
    });
  }
};

// @desc    Whether a flight can be booked without an account
// @route   GET /api/feature-flags/guest-flight-booking
// @access  Public - the review page asks before sending a signed-out visitor to log in
//
// The same reader checkout refuses a guest with, so the page and the server
// cannot disagree about what "off" means: no row or an unreadable one is off.
export const getGuestFlightBooking = async (req, res) => {
  const enabled = await isGuestFlightBookingEnabled(supabase);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    success: true,
    data: { flag: GUEST_FLIGHT_BOOKING_FLAG, enabled }
  });
};

// @desc    Create or update a feature flag
// @route   PUT /api/feature-flags/:key
// @access  Admin
export const upsertFeatureFlag = async (req, res) => {
  try {
    const { key } = req.params;
    const { enabled, description } = req.body || {};

    // A flag is on or off. An update without `enabled` used to write nothing
    // and still answer "disabled successfully".
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: '`enabled` must be true or false'
      });
    }

    const { data: existingFlag, error: readError } = await supabase
      .from('feature_flags')
      .select('id')
      .eq('flag_name', key)
      .maybeSingle();

    if (readError) throw readError;

    let result;
    if (existingFlag) {
      result = await supabase
        .from('feature_flags')
        .update({
          enabled,
          ...(description && { description }),
          updated_at: new Date().toISOString()
        })
        .eq('flag_name', key)
        .select()
        .single();
    } else {
      result = await supabase
        .from('feature_flags')
        .insert({
          flag_name: key,
          enabled,
          description: description || ''
        })
        .select()
        .single();
    }

    if (result.error) throw result.error;

    console.log(`🚩 Feature flag ${key} set to ${enabled} by admin ${req.user?.id || 'unknown'}`);

    res.status(200).json({
      success: true,
      data: result.data,
      message: `Feature flag ${enabled ? 'enabled' : 'disabled'} successfully`
    });
  } catch (error) {
    console.error('Upsert feature flag error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update feature flag',
      error: error.message
    });
  }
};

// @desc    Delete a feature flag
// @route   DELETE /api/feature-flags/:key
// @access  Admin
export const deleteFeatureFlag = async (req, res) => {
  try {
    const { key } = req.params;

    const { error } = await supabase
      .from('feature_flags')
      .delete()
      .eq('flag_name', key);

    if (error) throw error;

    res.status(200).json({
      success: true,
      message: 'Feature flag deleted successfully'
    });
  } catch (error) {
    console.error('Delete feature flag error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete feature flag',
      error: error.message
    });
  }
};
