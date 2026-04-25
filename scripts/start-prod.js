import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';

// Load production environment
process.env.NODE_ENV = 'production';
dotenv.config({ path: '.env.production' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Starting JetSetters production environment...');

// Ensure production environment variables are set
if (!fs.existsSync(path.join(__dirname, '.env.production'))) {
  console.log('📝 Creating .env.production file...');
  try {
    if (fs.existsSync(path.join(__dirname, '.env'))) {
      const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
      // Replace any development values with production ones
      const prodEnv = envContent
        .replace(/NODE_ENV=development/g, 'NODE_ENV=production')
        .replace(/VITE_API_URL=http:\/\/localhost:[0-9]+\/api/g, 'VITE_API_URL=/api');
      
      fs.writeFileSync(path.join(__dirname, '.env.production'), prodEnv);
      console.log('✅ .env.production file created successfully');
    } else {
      console.error('❌ No .env file found to create .env.production');
    }
  } catch (error) {
    console.error('❌ Error creating .env.production file:', error.message);
  }
}

// Verify Supabase tables
console.log('🔍 Verifying Supabase database tables...');
exec('node setup-supabase-tables.js', (error, stdout, stderr) => {
  console.log(stdout);
  if (error) {
    console.error('❌ Error setting up Supabase tables:', error.message);
    console.log('⚠️ Proceeding with production startup, but database operations may fail');
  } else {
    console.log('✅ Supabase tables verified successfully');
  }
  
  // Build the frontend
  console.log('🏗️ Building frontend assets...');
  exec('npm run build', (buildError, buildStdout, buildStderr) => {
    if (buildError) {
      console.error('❌ Frontend build failed:', buildError.message);
      console.log(buildStderr);
      process.exit(1);
    }
    
    console.log(buildStdout);
    console.log('✅ Frontend build completed successfully');
    
    // Start the production server
    console.log('🚀 Starting production server...');
    const server = exec('node server.js', { env: { ...process.env, NODE_ENV: 'production' } });
    
    server.stdout.on('data', (data) => {
      console.log(data.toString().trim());
    });
    
    server.stderr.on('data', (data) => {
      console.error(data.toString().trim());
    });
    
    server.on('exit', (code) => {
      console.log(`⚠️ Server process exited with code ${code}`);
      process.exit(code);
    });
    
    // Handle termination
    process.on('SIGINT', () => {
      console.log('👋 Shutting down production server...');
      server.kill('SIGINT');
      process.exit(0);
    });
  });
});

console.log('ℹ️ Press Ctrl+C to stop the server'); 