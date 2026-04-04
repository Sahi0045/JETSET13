export function validateVisaApplication(data) {
  const errors = [];
  const { personalInfo, travelDetails, serviceTier } = data;

  if (!personalInfo) {
    errors.push('Personal information is required');
    return { valid: false, errors };
  }

  const requiredPersonal = ['firstName', 'lastName', 'email', 'nationality', 'passportNumber'];
  for (const field of requiredPersonal) {
    if (!personalInfo[field] || String(personalInfo[field]).trim() === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (personalInfo.email && !emailRegex.test(personalInfo.email)) {
    errors.push('Invalid email format');
  }

  if (personalInfo.passportNumber && personalInfo.passportNumber.length < 5) {
    errors.push('Passport number must be at least 5 characters');
  }

  if (!travelDetails) {
    errors.push('Travel details are required');
    return { valid: false, errors };
  }

  if (!travelDetails.destination) {
    errors.push('Destination is required');
  }

  const validServiceTiers = ['standard', 'express', 'premium'];
  if (serviceTier && !validServiceTiers.includes(serviceTier.toLowerCase())) {
    errors.push(`Invalid service tier. Must be one of: ${validServiceTiers.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    data: {
      personalInfo: {
        ...personalInfo,
        email: personalInfo.email?.toLowerCase().trim(),
        firstName: personalInfo.firstName?.trim(),
        lastName: personalInfo.lastName?.trim(),
        passportNumber: personalInfo.passportNumber?.toUpperCase().trim()
      },
      travelDetails: {
        ...travelDetails,
        destination: travelDetails.destination?.trim()
      },
      serviceTier: serviceTier || 'standard'
    }
  };
}

export function validateBulkUploadRow(row, rowNumber) {
  const errors = [];

  if (!row.firstName && !row.name) errors.push(`Row ${rowNumber}: First name is required`);
  if (!row.lastName && !row.surname) errors.push(`Row ${rowNumber}: Last name is required`);
  if (!row.email) errors.push(`Row ${rowNumber}: Email is required`);
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push(`Row ${rowNumber}: Invalid email format`);

  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateTravelDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() + 2);

  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Invalid date format. Use YYYY-MM-DD' };
  }

  if (date < now) {
    return { valid: false, error: 'Travel date cannot be in the past' };
  }

  if (date > maxDate) {
    return { valid: false, error: 'Travel date cannot be more than 2 years in the future' };
  }

  return { valid: true, date };
}

export function validateNationality(nationality, allowedCountries) {
  if (!nationality) {
    return { valid: false, error: 'Nationality is required' };
  }

  if (allowedCountries && allowedCountries.length > 0) {
    const normalized = nationality.toLowerCase();
    const isAllowed = allowedCountries.some(
      c => c.toLowerCase() === normalized || c.code?.toLowerCase() === normalized
    );

    if (!isAllowed) {
      return { valid: false, error: `Nationality not in allowed list` };
    }
  }

  return { valid: true };
}