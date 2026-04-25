import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Function to run a command
const runCommand = (command, args, options = {}) => {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: true,
    ...options
  });

  child.on('error', (error) => {
    console.error(`Error running ${command}:`, error);
  });

  return child;
};

console.log('🚀 Starting development servers...');
console.log('📡 Backend API: http://localhost:5004');
console.log('🌐 Frontend: http://localhost:5173');

// Start backend server with nodemon and fixed port 5004
const backend = runCommand('nodemon', ['backend/server.js'], {
  env: { ...process.env, NODE_ENV: 'development', PORT: '5004' }
});

// Start frontend dev server
const frontend = runCommand('npm', ['run', 'client']);

// Handle process termination
const cleanup = () => {
  console.log('\n🛑 Shutting down development servers...');
  backend.kill();
  frontend.kill();
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup); 