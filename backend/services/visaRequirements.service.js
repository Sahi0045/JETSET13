import supabase from '../config/supabase.js';
import { withCache, CacheKeys } from './cache.service.js';

export async function getVisaRequirements(originCountry, destinationCountry, visaType = 'tourist') {
  const cacheKey = `visa:req:${originCountry}:${destinationCountry}:${visaType}`;

  return withCache(cacheKey, 86400, async () => {
    const { data, error } = await supabase
      .from('visa_requirements')
      .select('*')
      .eq('origin_country', originCountry)
      .eq('destination_country', destinationCountry)
      .eq('visa_type', visaType)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[VisaRequirements] DB error:', error.message);
    }

    if (data) {
      return {
        ...data,
        requirements: typeof data.requirements === 'string' 
          ? JSON.parse(data.requirements) 
          : data.requirements
      };
    }

    return getDefaultRequirements(originCountry, destinationCountry, visaType);
  });
}

function getDefaultRequirements(origin, destination, visaType) {
  const defaultRequirements = {
    tourist: {
      required: [
        'Valid passport (6+ months)',
        'Passport-sized photos',
        'Proof of travel insurance',
        'Bank statements (3 months)',
        'Employment letter'
      ],
      optional: [
        'Hotel booking confirmation',
        'Flight itinerary',
        'Cover letter'
      ],
      processingTime: '15-30 days',
      fee: { amount: 100, currency: 'USD' }
    },
    business: {
      required: [
        'Valid passport (6+ months)',
        'Business invitation letter',
        'Company registration',
        'Bank statements (3 months)'
      ],
      optional: [
        'Previous visa copies',
        'Conference registration'
      ],
      processingTime: '10-20 days',
      fee: { amount: 150, currency: 'USD' }
    }
  };

  return {
    origin_country: origin,
    destination_country: destination,
    visa_type: visaType,
    requirements: defaultRequirements[visaType] || defaultRequirements.tourist,
    is_default: true
  };
}

export async function getVisaRequirementsByDestination(destinationCountry) {
  const { data, error } = await supabase
    .from('visa_requirements')
    .select('origin_country, visa_type, requirements, processing_time_days, fee_amount, fee_currency')
    .eq('destination_country', destinationCountry)
    .eq('is_active', true);

  if (error) throw error;
  return data;
}

export async function getVisaRequirementsByOrigin(originCountry) {
  const { data, error } = await supabase
    .from('visa_requirements')
    .select('destination_country, visa_type, requirements, processing_time_days')
    .eq('origin_country', originCountry)
    .eq('is_active', true);

  if (error) throw error;
  return data;
}

export async function createVisaRequirement(requirement) {
  const { data, error } = await supabase
    .from('visa_requirements')
    .insert([{
      origin_country: requirement.originCountry,
      destination_country: requirement.destinationCountry,
      visa_type: requirement.visaType,
      requirements: typeof requirement.requirements === 'string' 
        ? requirement.requirements 
        : JSON.stringify(requirement.requirements),
      processing_time_days: requirement.processingTimeDays,
      fee_amount: requirement.feeAmount,
      fee_currency: requirement.feeCurrency || 'USD',
      validity_months: requirement.validityMonths
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateVisaRequirement(id, updates) {
  const updateData = {};
  if (updates.requirements) {
    updateData.requirements = typeof updates.requirements === 'string' 
      ? updates.requirements 
      : JSON.stringify(updates.requirements);
  }
  if (updates.processingTimeDays) updateData.processing_time_days = updates.processingTimeDays;
  if (updates.feeAmount) updateData.fee_amount = updates.feeAmount;
  if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
  updateData.last_updated = new Date().toISOString();

  const { data, error } = await supabase
    .from('visa_requirements')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getPopularDestinations(limit = 10) {
  const { data, error } = await supabase
    .from('visa_requirements')
    .select('destination_country')
    .eq('is_active', true)
    .limit(limit);

  if (error) throw error;
  return [...new Set(data.map(r => r.destination_country))];
}

export function getVisaTypes() {
  return [
    { id: 'tourist', name: 'Tourist Visa', description: 'For leisure travel and tourism' },
    { id: 'business', name: 'Business Visa', description: 'For business meetings and activities' },
    { id: 'student', name: 'Student Visa', description: 'For education and study' },
    { id: 'work', name: 'Work Visa', description: 'For employment' },
    { id: 'transit', name: 'Transit Visa', description: 'For passing through a country' }
  ];
}