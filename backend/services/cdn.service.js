/**
 * CDN Configuration for Document Delivery
 * 
 * This module provides CDN integration for fast uploads/downloads
 * Currently supports Cloudflare, but is extensible for AWS CloudFront, etc.
 * 
 * Usage:
 *   import { uploadToCDN, downloadFromCDN, getCDNUrl } from './cdn.service.js';
 */

import axios from 'axios';

const CDN_PROVIDER = process.env.CDN_PROVIDER || 'cloudflare';
const CDN_BASE_URL = process.env.CDN_BASE_URL || '';
const CDN_API_TOKEN = process.env.CDN_API_TOKEN;

export const CDN_CONFIG = {
  provider: CDN_PROVIDER,
  baseUrl: CDN_BASE_URL,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
};

export async function uploadToCDN(fileBuffer, fileName, options = {}) {
  if (!CDN_BASE_URL) {
    console.warn('[CDN] No CDN configured - using local storage fallback');
    return { local: true, path: `/uploads/${fileName}` };
  }

  try {
    const response = await axios.post(`${CDN_BASE_URL}/upload`, {
      file: fileBuffer.toString('base64'),
      fileName,
      contentType: options.contentType || 'application/octet-stream'
    }, {
      headers: {
        'Authorization': `Bearer ${CDN_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    return {
      success: true,
      url: response.data.url,
      cdn: true
    };
  } catch (error) {
    console.error('[CDN] Upload failed:', error.message);
    return { success: false, error: error.message, fallback: true };
  }
}

export async function downloadFromCDN(cdnPath) {
  if (!CDN_BASE_URL || cdnPath.startsWith('/uploads/')) {
    return { local: true, path: cdnPath };
  }

  try {
    const response = await axios.get(`${CDN_BASE_URL}${cdnPath}`, {
      responseType: 'arraybuffer',
      timeout: 30000
    });

    return {
      success: true,
      data: Buffer.from(response.data),
      contentType: response.headers['content-type']
    };
  } catch (error) {
    console.error('[CDN] Download failed:', error.message);
    return { success: false, error: error.message };
  }
}

export function getCDNUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  if (path.startsWith('/uploads/')) return `${process.env.API_BASE_URL || ''}${path}`;
  return `${CDN_BASE_URL}${path}`;
}

export async function deleteFromCDN(cdnPath) {
  if (!CDN_BASE_URL) return { success: true, local: true };

  try {
    await axios.delete(`${CDN_BASE_URL}/files`, {
      data: { path: cdnPath },
      headers: { 'Authorization': `Bearer ${CDN_API_TOKEN}` }
    });
    return { success: true };
  } catch (error) {
    console.error('[CDN] Delete failed:', error.message);
    return { success: false, error: error.message };
  }
}

export function getCDNStats() {
  return {
    provider: CDN_PROVIDER,
    configured: !!CDN_BASE_URL,
    maxFileSize: CDN_CONFIG.maxFileSize,
    allowedTypes: CDN_CONFIG.allowedTypes.length
  };
}

export async function healthCheck() {
  if (!CDN_BASE_URL) {
    return { status: 'disabled', reason: 'No CDN configured' };
  }

  try {
    await axios.get(`${CDN_BASE_URL}/health`, { timeout: 5000 });
    return { status: 'ok', provider: CDN_PROVIDER };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
}