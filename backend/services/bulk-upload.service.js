import xlsx from 'xlsx';
import Papa from 'papaparse';
import supabase from '../config/supabase.js';
import { VisaApplication } from '../models/visa.model.js';
import { validateVisaApplication } from './validation.service.js';
import { uploadToCDN, getCDNUrl } from './cdn.service.js';

const VALID_FORMATS = ['csv', 'xlsx', 'xls'];

export async function parseBulkUploadFile(buffer, fileName) {
  const extension = fileName.split('.').pop().toLowerCase();
  
  if (!VALID_FORMATS.includes(extension)) {
    throw new Error(`Invalid file format. Supported: ${VALID_FORMATS.join(', ')}`);
  }

  if (extension === 'csv') {
    const csv = buffer.toString('utf-8');
    const { data, errors } = Papa.parse(csv, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_')
    });

    if (errors.length > 0) {
      throw new Error(`CSV parsing errors: ${errors.map(e => e.message).join('; ')}`);
    }

    return data;
  }

  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet);
  
  return data.map(row => {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key.trim().toLowerCase().replace(/\s+/g, '_')] = value;
    }
    return normalized;
  });
}

export async function processBulkApplications(fileBuffer, fileName, uploadedBy, options = {}) {
  const { skipValidation = false, notifyOnComplete = true } = options;

  let rows;
  try {
    rows = await parseBulkUploadFile(fileBuffer, fileName);
  } catch (error) {
    return {
      success: false,
      error: error.message,
      processed: 0,
      successful: 0,
      failed: 0,
      results: []
    };
  }

  const results = [];
  const errors = [];
  let successful = 0;
  let failed = 0;

  const columnMapping = {
    first_name: 'firstName',
    firstname: 'firstName',
    name: 'firstName',
    last_name: 'lastName',
    lastname: 'lastName',
    surname: 'lastName',
    email: 'email',
    phone: 'phone',
    nationality: 'nationality',
    passport_number: 'passportNumber',
    passport: 'passportNumber',
    passport_no: 'passportNumber',
    destination: 'destination',
    travel_date: 'travelDate',
    departure_date: 'travelDate',
    service_tier: 'serviceTier',
    service: 'serviceTier'
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2;

    try {
      const mappedData = {};
      for (const [col, value] of Object.entries(row)) {
        const mappedKey = columnMapping[col.toLowerCase()] || col.toLowerCase();
        if (mappedKey) {
          mappedData[mappedKey] = value;
        }
      }

      const personalInfo = {
        firstName: mappedData.firstName || row.first_name,
        lastName: mappedData.lastName || row.last_name,
        email: mappedData.email || row.email,
        phone: mappedData.phone || row.phone,
        nationality: mappedData.nationality || row.nationality,
        passportNumber: mappedData.passportNumber || row.passport_number
      };

      const travelDetails = {
        destination: mappedData.destination || row.destination,
        travelDate: mappedData.travelDate || row.travel_date
      };

      if (skipValidation) {
        const application = await VisaApplication.create({
          personalInfo,
          travelDetails,
          serviceTier: mappedData.serviceTier || 'standard',
          userId: null,
          uploadedBy
        });

        results.push({
          row: rowNumber,
          success: true,
          applicationRef: application.application_ref,
          id: application.id
        });
        successful++;
      } else {
        const validation = validateVisaApplication({ personalInfo, travelDetails });
        
        if (!validation.valid) {
          errors.push({
            row: rowNumber,
            errors: validation.errors
          });
          failed++;
          continue;
        }

        const application = await VisaApplication.create({
          personalInfo,
          travelDetails,
          serviceTier: mappedData.serviceTier || 'standard',
          userId: null,
          uploadedBy
        });

        results.push({
          row: rowNumber,
          success: true,
          applicationRef: application.application_ref,
          id: application.id
        });
        successful++;
      }
    } catch (error) {
      errors.push({
        row: rowNumber,
        errors: [error.message]
      });
      failed++;
    }
  }

  await supabase.from('bulk_uploads').insert({
    uploaded_by: uploadedBy,
    file_name: fileName,
    total_rows: rows.length,
    successful_count: successful,
    failed_count: failed,
    processed_at: new Date().toISOString()
  });

  return {
    success: true,
    processed: rows.length,
    successful,
    failed,
    results,
    errors
  };
}

export function generateBulkUploadTemplate(type = 'visa') {
  if (type === 'visa') {
    return [
      ['First Name', 'Last Name', 'Email', 'Phone', 'Nationality', 'Passport Number', 'Destination', 'Travel Date', 'Service Tier'],
      ['John', 'Doe', 'john@example.com', '+1234567890', 'South Africa', 'P123456', 'France', '2026-06-15', 'express'],
      ['Jane', 'Smith', 'jane@example.com', '+0987654321', 'Nigeria', 'N987654', 'USA', '2026-07-01', 'standard']
    ];
  }

  return [];
}

export async function getBulkUploadHistory(uploadedBy, limit = 20) {
  const { data, error } = await supabase
    .from('bulk_uploads')
    .select('*')
    .eq('uploaded_by', uploadedBy)
    .order('processed_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}