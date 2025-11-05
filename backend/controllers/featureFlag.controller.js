import supabase from '../config/supabase.js';

// @desc    Get all feature flags
// @route   GET /api/feature-flags
// @access  Public
export const getAllFeatureFlags = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('feature_flags')
      .select('*')
      .order('flag_key', { ascending: true });

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
      flagsMap[flag.flag_key] = flag.enabled;
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

// @desc    Create or update a feature flag
// @route   PUT /api/feature-flags/:key
// @access  Admin
export const upsertFeatureFlag = async (req, res) => {
  try {
    const { key } = req.params;
    const { enabled, flag_name, description } = req.body;

    // First try to update
    const { data: existingFlag } = await supabase
      .from('feature_flags')
      .select('*')
      .eq('flag_key', key)
      .single();

    let result;
    if (existingFlag) {
      // Update existing flag
      result = await supabase
        .from('feature_flags')
        .update({ 
          enabled,
          ...(flag_name && { flag_name }),
          ...(description && { description })
        })
        .eq('flag_key', key)
        .select()
        .single();
    } else {
      // Create new flag
      result = await supabase
        .from('feature_flags')
        .insert({
          flag_key: key,
          flag_name: flag_name || key,
          enabled: enabled !== undefined ? enabled : true,
          description: description || ''
        })
        .select()
        .single();
    }

    if (result.error) throw result.error;

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
      .eq('flag_key', key);

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
