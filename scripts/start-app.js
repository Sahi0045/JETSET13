import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './backend/routes/auth.routes.js';
import userRoutes from './backend/routes/user.routes.js';
import supabase from './backend/config/supabase.js';

// Initialize environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Get directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(express.json());

// Test Supabase connection
const testSupabaseConnection = async () => {
  try {
    console.log('Testing Supabase connection...');
    const { data, error } = await supabase.from('users').select('count').single();
    
    if (error) {
      console.error('❌ Supabase connection error:', error.message);
      console.log('You may need to create the users table in your Supabase project.');
      console.log('Use the SQL script in supabase-setup.sql to set up your database.');
      return false;
    }
    
    console.log('✅ Supabase connection established successfully!');
    return true;
  } catch (error) {
    console.error('❌ Unable to connect to Supabase:', error.message);
    return false;
  }
};

// Initialize Supabase connection on startup
testSupabaseConnection();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
}); 