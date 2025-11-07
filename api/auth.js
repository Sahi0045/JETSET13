import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const jwtSecret = process.env.JWT_SECRET || 'jetset-app-secret-key';

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // Set CORS headers
  const allowedOrigins = [
    'https://www.jetsetterss.com',
    'https://jetsetterss.com',
    'http://localhost:5173',
    'http://localhost:3000'
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Route based on URL path
  const path = req.url.split('?')[0];

  if (path.includes('/login') || req.body?.action === 'login') {
    return handleLogin(req, res);
  } else if (path.includes('/register') || req.body?.action === 'register') {
    return handleRegister(req, res);
  } else {
    return res.status(404).json({
      success: false,
      message: 'Endpoint not found'
    });
  }
}

async function handleLogin(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Query the user from Supabase
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      console.error('User not found:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      console.error('Invalid password for user:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      jwtSecret,
      { expiresIn: '30d' }
    );

    console.log('User logged in successfully:', { id: user.id, email: user.email, role: user.role });

    // Return user data with role
    return res.status(200).json({
      success: true,
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      role: user.role || 'user',
      token: token
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
}

async function handleRegister(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { email, password, firstName, lastName, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('email')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const { data: newUser, error } = await supabase
      .from('users')
      .insert([{
        email,
        password: hashedPassword,
        first_name: firstName || name?.split(' ')[0] || '',
        last_name: lastName || name?.split(' ').slice(1).join(' ') || '',
        name: name || `${firstName} ${lastName}`,
        role: 'user'
      }])
      .select()
      .single();

    if (error) {
      console.error('Registration error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create user',
        error: error.message
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: newUser.id, role: newUser.role },
      jwtSecret,
      { expiresIn: '30d' }
    );

    console.log('User registered successfully:', { id: newUser.id, email: newUser.email });

    return res.status(201).json({
      success: true,
      id: newUser.id,
      firstName: newUser.first_name,
      lastName: newUser.last_name,
      email: newUser.email,
      role: newUser.role,
      token: token
    });

  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: error.message
    });
  }
}
