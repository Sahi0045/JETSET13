import express from 'express';
import supabase from '../config/supabase.js';

const router = express.Router();

// Default price settings
const DEFAULT_SETTINGS = {
  flight_taxes_fees: 25.00,
  flight_taxes_fees_percentage: 5.0,
  cruise_taxes_fees: 150.00,
  cruise_taxes_fees_percentage: 8.0,
  cruise_port_charges: 50.00,
  hotel_taxes_fees: 35.00,
  hotel_taxes_fees_percentage: 12.0,
  package_markup_percentage: 10.0,
  service_fee_percentage: 2.5,
  cancellation_fee: 50.00
};

// Get current price settings
router.get('/price-settings', async (req, res) => {
  try {
    console.log('📊 Fetching price settings');

    if (!supabase) {
      console.log('⚠️ Supabase not configured, returning defaults');
      return res.json({
        success: true,
        data: DEFAULT_SETTINGS
      });
    }

    // Try to get settings from database
    const { data: settings, error } = await supabase
      .from('price_settings')
      .select('*')
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('❌ Error fetching price settings:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    // If no settings found, return defaults
    if (!settings) {
      console.log('ℹ️ No price settings found, returning defaults');
      return res.json({
        success: true,
        data: DEFAULT_SETTINGS
      });
    }

    // Merge database settings with defaults (in case new fields are added)
    const mergedSettings = { ...DEFAULT_SETTINGS, ...settings.settings };

    res.json({
      success: true,
      data: mergedSettings
    });

  } catch (error) {
    console.error('❌ Price settings fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update price settings
router.put('/price-settings', async (req, res) => {
  try {
    const newSettings = req.body;

    console.log('💾 Updating price settings:', newSettings);

    if (!supabase) {
      console.log('⚠️ Supabase not configured, cannot save settings');
      return res.json({
        success: false,
        error: 'Database not configured'
      });
    }

    // Validate the settings
    const validatedSettings = {};
    for (const [key, value] of Object.entries(newSettings)) {
      if (DEFAULT_SETTINGS.hasOwnProperty(key)) {
        validatedSettings[key] = parseFloat(value) || 0;
      }
    }

    // Check if settings record exists
    const { data: existingSettings } = await supabase
      .from('price_settings')
      .select('id')
      .single();

    let result;
    if (existingSettings) {
      // Update existing settings
      result = await supabase
        .from('price_settings')
        .update({
          settings: validatedSettings,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingSettings.id)
        .select();
    } else {
      // Insert new settings
      result = await supabase
        .from('price_settings')
        .insert({
          settings: validatedSettings,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select();
    }

    if (result.error) {
      console.error('❌ Error saving price settings:', result.error);
      return res.status(500).json({
        success: false,
        error: result.error.message
      });
    }

    console.log('✅ Price settings updated successfully');

    res.json({
      success: true,
      message: 'Price settings updated successfully',
      data: validatedSettings
    });

  } catch (error) {
    console.error('❌ Price settings update error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get price settings for specific service (used by pricing logic)
router.get('/price-config/:service', async (req, res) => {
  try {
    const { service } = req.params; // flights, cruises, hotels, general

    console.log(`📊 Fetching price config for ${service}`);

    if (!supabase) {
      const serviceDefaults = getServiceDefaults(service);
      return res.json({ success: true, data: serviceDefaults });
    }

    const { data: settings } = await supabase
      .from('price_settings')
      .select('settings')
      .single();

    const allSettings = settings?.settings || DEFAULT_SETTINGS;
    const serviceConfig = getServiceDefaults(service, allSettings);

    res.json({
      success: true,
      data: serviceConfig
    });

  } catch (error) {
    console.error(`❌ Error fetching ${req.params.service} price config:`, error);
    res.json({
      success: true,
      data: getServiceDefaults(req.params.service)
    });
  }
});

// Helper function to extract service-specific settings
const getServiceDefaults = (service, allSettings = DEFAULT_SETTINGS) => {
  switch (service) {
    case 'flights':
      return {
        taxes_fees: allSettings.flight_taxes_fees || 25.00,
        taxes_fees_percentage: allSettings.flight_taxes_fees_percentage || 5.0
      };
    
    case 'cruises':
      return {
        taxes_fees: allSettings.cruise_taxes_fees || 150.00,
        taxes_fees_percentage: allSettings.cruise_taxes_fees_percentage || 8.0,
        port_charges: allSettings.cruise_port_charges || 50.00
      };
    
    case 'hotels':
      return {
        taxes_fees: allSettings.hotel_taxes_fees || 35.00,
        taxes_fees_percentage: allSettings.hotel_taxes_fees_percentage || 12.0
      };
    
    case 'general':
      return {
        package_markup_percentage: allSettings.package_markup_percentage || 10.0,
        service_fee_percentage: allSettings.service_fee_percentage || 2.5,
        cancellation_fee: allSettings.cancellation_fee || 50.00
      };
    
    default:
      return allSettings;
  }
};

export default router;