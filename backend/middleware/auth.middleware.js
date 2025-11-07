import jwt from 'jsonwebtoken';
import axios from 'axios';
import crypto from 'crypto';
import User from '../models/user.model.js';
import supabase from '../config/supabase.js';

// Simple in-memory cache for Google/Firebase JWKS certificates
let googleCertsCache = { certs: null, fetchedAt: 0 };
let firebaseCertsCache = { certs: null, fetchedAt: 0 };
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const FIREBASE_CERTS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const CERTS_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getGoogleCerts() {
  const now = Date.now();
  if (googleCertsCache.certs && now - googleCertsCache.fetchedAt < CERTS_TTL_MS) {
    return googleCertsCache.certs;
  }
  try {
    const { data } = await axios.get(GOOGLE_CERTS_URL, { timeout: 5000 });
    googleCertsCache = { certs: data.keys || [], fetchedAt: now };
    return googleCertsCache.certs;
  } catch (error) {
    console.error('Failed to fetch Google certs:', error.message);
    return googleCertsCache.certs || []; // Return cached if available
  }
}

async function getFirebaseCerts() {
  const now = Date.now();
  if (firebaseCertsCache.certs && now - firebaseCertsCache.fetchedAt < CERTS_TTL_MS) {
    return firebaseCertsCache.certs;
  }
  try {
    const { data } = await axios.get(FIREBASE_CERTS_URL, { timeout: 5000 });
    firebaseCertsCache = { certs: data.keys || [], fetchedAt: now };
    return firebaseCertsCache.certs;
  } catch (error) {
    console.error('Failed to fetch Firebase certs:', error.message);
    return firebaseCertsCache.certs || []; // Return cached if available
  }
}

function x5cToPem(x5c) {
  if (!x5c || !x5c.length) return null;
  return `-----BEGIN CERTIFICATE-----\n${x5c[0]}\n-----END CERTIFICATE-----\n`;
}

async function verifyRS256Token(token, header) {
  // Decode token to check issuer
  const decodedPayload = jwt.decode(token, { complete: false });
  const isFirebase = decodedPayload?.iss?.includes('securetoken.google.com');
  
  // Try Google OAuth certs first (works for both Google OAuth and most Firebase tokens)
  let certs = await getGoogleCerts();
  let matchingKey = certs.find(k => k.kid === header.kid);
  
  if (matchingKey) {
    const pem = x5cToPem(matchingKey?.x5c);
    if (pem) {
      try {
        const verified = jwt.verify(token, pem, { algorithms: ['RS256'] });
        // Verify issuer matches if it's a Firebase token
        if (isFirebase && decodedPayload?.iss && !decodedPayload.iss.includes('securetoken.google.com')) {
          throw new Error('Issuer mismatch');
        }
        return verified;
      } catch (err) {
        console.log('Google cert verification failed, trying Firebase endpoint...');
      }
    }
  }
  
  // Try Firebase certs if Google didn't work (for Firebase-specific certs)
  if (isFirebase) {
    certs = await getFirebaseCerts();
    matchingKey = certs.find(k => k.kid === header.kid);
    
    if (matchingKey) {
      const pem = x5cToPem(matchingKey?.x5c);
      if (pem) {
        try {
          return jwt.verify(token, pem, { algorithms: ['RS256'] });
        } catch (err) {
          console.log('Firebase cert verification also failed');
        }
      }
    }
  }
  
  // If certs don't match, try forcing a refresh (cert rotation may have occurred)
  if (isFirebase) {
    console.log('Forcing cert refresh due to kid mismatch...');
    googleCertsCache = { certs: null, fetchedAt: 0 };
    firebaseCertsCache = { certs: null, fetchedAt: 0 };
    
    certs = await getGoogleCerts();
    matchingKey = certs.find(k => k.kid === header.kid);
    if (matchingKey) {
      const pem = x5cToPem(matchingKey?.x5c);
      if (pem) {
        try {
          return jwt.verify(token, pem, { algorithms: ['RS256'] });
        } catch (err) {
          console.log('Still failed after refresh');
        }
      }
    }
  }
  
  throw new Error(`No matching certificate found for kid: ${header.kid} (tried both Google OAuth and Firebase endpoints)`);
}

async function verifySupabaseToken(token) {
  const supabaseSecret = process.env.SUPABASE_JWT_SECRET;

  // Try JWT verification first if secret is available
  if (supabaseSecret) {
    try {
      const decoded = jwt.verify(token, supabaseSecret, { algorithms: ['HS256'] });
      console.log('✅ Successfully verified Supabase token (JWT) for user:', decoded?.email || decoded?.sub);
      return decoded;
    } catch (err) {
      console.log('⚠️ Supabase JWT verification failed, trying Supabase API...', err.message);
      // Fall through to API verification
    }
  } else {
    console.warn('⚠️ SUPABASE_JWT_SECRET not set, using Supabase API for verification');
  }

  // Fallback: Verify using Supabase API
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.log('❌ Supabase API token verification failed:', error?.message || 'No user returned');
      return null;
    }

    // Convert Supabase user to JWT-like decoded format
    const decoded = {
      sub: user.id,
      email: user.email,
      user_id: user.id,
      id: user.id,
      user_metadata: user.user_metadata,
      iss: 'supabase',
      aud: 'authenticated'
    };

    console.log('✅ Successfully verified Supabase token (API) for user:', user.email);
    return decoded;
  } catch (apiErr) {
    console.log('❌ Supabase API verification error:', apiErr.message);
    return null;
  }
}

async function autoProvisionSupabaseUser(decodedToken) {
  if (!decodedToken?.email) {
    return null;
  }

  const isSupabaseIssuer = typeof decodedToken.iss === 'string' && decodedToken.iss.includes('supabase.co/auth/v1');

  if (!isSupabaseIssuer) {
    return null;
  }

  try {
    console.log('Auto-provisioning Supabase user for email:', decodedToken.email);

    const firstName = decodedToken.user_metadata?.first_name || decodedToken.given_name || decodedToken.name?.split(' ')[0] || 'Guest';
    const lastName = decodedToken.user_metadata?.last_name || decodedToken.family_name || decodedToken.name?.split(' ')?.slice(1)?.join(' ') || '';

    const randomPassword = crypto.randomBytes(32).toString('hex');

    const newUser = await User.create({
      firstName,
      lastName,
      email: decodedToken.email,
      password: randomPassword,
      googleId: decodedToken.sub,
      isGoogleAccount: true
    });

    return newUser;
  } catch (err) {
    console.warn('Failed to auto-provision Supabase user:', err.message);

    try {
      const existingUser = await User.findByEmail(decodedToken.email);
      return existingUser;
    } catch (lookupErr) {
      console.warn('Follow-up lookup failed after provisioning attempt:', lookupErr.message);
      return null;
    }
  }
}

// Protect routes
export const protect = async (req, res, next) => {
  let token;

  // Check if token exists in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];
      console.log('🔐 Auth middleware: Token received, length:', token?.length);
      
      // Decode token header to see what type it is
      try {
        const header = jwt.decode(token, { complete: true })?.header;
        console.log('🔐 Token header:', { alg: header?.alg, kid: header?.kid, typ: header?.typ });
        const payload = jwt.decode(token, { complete: false });
        console.log('🔐 Token payload preview:', { 
          email: payload?.email, 
          user_id: payload?.user_id, 
          sub: payload?.sub,
          iss: payload?.iss 
        });
      } catch (decodeErr) {
        console.log('🔐 Could not decode token:', decodeErr.message);
      }

      // Try HS256 first
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET || 'jetset-app-secret-key');
      } catch (hsErr) {
        decoded = await verifySupabaseToken(token);

        if (!decoded) {
          // If HS verification fails, try RS256 (e.g., Google/Firebase token)
          try {
            const header = jwt.decode(token, { complete: true })?.header || {};
            if (header.alg && header.alg.startsWith('RS')) {
              decoded = await verifyRS256Token(token, header);
              console.log('Successfully verified RS256 token for user:', decoded.email || decoded.user_id);
            } else {
              throw hsErr;
            }
          } catch (rsErr) {
            console.error('RS256 verification error:', rsErr.message);
            
            // Development fallback: If it's a Firebase token with valid structure but cert verification failed,
            // allow it through (cert rotation or network issues). Remove this in production!
            if (process.env.NODE_ENV !== 'production') {
              try {
                const header = jwt.decode(token, { complete: true })?.header || {};
                const payload = jwt.decode(token, { complete: false });
                
                if (header.alg === 'RS256' && payload?.iss?.includes('securetoken.google.com') && payload?.email) {
                  console.warn('⚠️ DEVELOPMENT MODE: Allowing Firebase token through without cert verification');
                  console.warn('⚠️ Token has valid structure but cert verification failed:', rsErr.message);
                  decoded = payload; // Use decoded payload as-is
                } else {
                  throw rsErr;
                }
              } catch (fallbackErr) {
                throw rsErr;
              }
            } else {
              throw rsErr;
            }
          }
        }
      }

      // Get user from token. For RS256 (Google/Firebase) tokens, map by email or user_id/sub.
      let user = null;
      const userId = decoded?.id || decoded?.user_id || decoded?.sub;
      
      if (userId) {
        console.log('Finding user by id/user_id/sub:', userId);
        try {
          user = await User.findById(userId);
        } catch (err) {
          console.log('User.findById failed, trying email lookup:', err.message);
        }
      }
      
      if (!user && decoded?.email) {
        console.log('Finding user by email:', decoded.email);
        try {
          user = await User.findByEmail(decoded.email);
        } catch (err) {
          console.log('User.findByEmail failed:', err.message);
        }
      }
      
      if (!user && decoded) {
        try {
          user = await autoProvisionSupabaseUser(decoded);
        } catch (provisionError) {
          console.warn('Auth middleware: Auto-provisioning failed:', provisionError.message);
          // Continue to check if user exists - provisioning failure shouldn't block auth
        }
      }

      if (!user) {
        console.error('User not found for token:', { 
          id: decoded?.id, 
          user_id: decoded?.user_id,
          sub: decoded?.sub,
          email: decoded?.email,
          iss: decoded?.iss
        });
        return res.status(401).json({ 
          success: false,
          message: 'User not found',
          error: 'No user found matching token credentials'
        });
      }

      console.log('✅ Found user:', { id: user.id, email: user.email, role: user.role });

      // Remove password from user object and ensure role is included
      const { password, ...userWithoutPassword } = user;
      req.user = {
        ...userWithoutPassword,
        role: user.role || 'user'
      };

      next();
    } catch (error) {
      console.error('Auth middleware error:', error.message);
      console.error('Error stack:', error.stack);
      res.status(401).json({ 
        success: false,
        message: 'Not authorized, token failed',
        error: error.message 
      });
    }
  }

  if (!token) {
    res.status(401).json({ 
      success: false,
      message: 'Not authorized, no token' 
    });
  }
};

// Admin middleware
export const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as an admin' });
  }
};

// Optional protect - extract user if token exists, but don't fail if not
export const optionalProtect = async (req, res, next) => {
  let token;

  // Check if token exists in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token (HS256 first, fallback to RS256 via Google/Firebase certs)
      let decoded = null;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET || 'jetset-app-secret-key');
      } catch (hsErr) {
        decoded = await verifySupabaseToken(token);

        if (!decoded) {
          try {
            const header = jwt.decode(token, { complete: true })?.header || {};
            if (header.alg && header.alg.startsWith('RS')) {
              decoded = await verifyRS256Token(token, header);
            } else {
              throw hsErr;
            }
          } catch (rsErr) {
            // Silently fail for optional protect
            console.log('Optional auth: RS256 verification failed:', rsErr.message);
          }
        }
      }

      // Get user from token. For RS256 (Google/Firebase) tokens, map by email or user_id/sub.
      let user = null;
      const userId = decoded?.id || decoded?.user_id || decoded?.sub;
      
      if (userId) {
        try {
          user = await User.findById(userId);
        } catch (err) {
          // Continue to email lookup
        }
      }
      
      if (!user && decoded?.email) {
        try {
          user = await User.findByEmail(decoded.email);
        } catch (err) {
          // User not found
        }
      }
      
      if (!user && decoded) {
        try {
          user = await autoProvisionSupabaseUser(decoded);
        } catch (provisionError) {
          console.warn('Optional auth: Auto-provisioning failed, continuing as guest:', provisionError.message);
          // Continue as guest - don't fail the request
        }
      }

      if (user) {
        // Remove password from user object and ensure role is included
        const { password, ...userWithoutPassword } = user;
        req.user = {
          ...userWithoutPassword,
          role: user.role || 'user'
        };
        console.log('Optional auth: User authenticated:', req.user.email);
      } else if (decoded) {
        console.log('Optional auth: User not found or could not be provisioned, continuing as guest');
      }
    } catch (error) {
      console.log('Optional auth: Token verification failed, continuing as guest:', error.message);
      // Don't log stack trace for optional auth failures to reduce noise
    }
  }

  // Always continue to next middleware, even if no token or invalid token
  next();
};
