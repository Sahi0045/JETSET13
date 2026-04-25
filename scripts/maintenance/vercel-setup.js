#!/usr/bin/env node

/**
 * Vercel setup script
 * This script runs after vite build to prepare the deployment
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'fs';
import { join } from 'path';

const publicDir = 'public';
const distDir = 'dist';

try {
  // Check if public directory exists
  if (!existsSync(publicDir)) {
    console.log('ℹ️  No public directory found, skipping asset copy');
    process.exit(0);
  }

  // Ensure dist directory exists
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }

  // Copy files recursively
  function copyRecursive(src, dest) {
    const entries = readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);
      
      if (entry.isDirectory()) {
        if (!existsSync(destPath)) {
          mkdirSync(destPath, { recursive: true });
        }
        copyRecursive(srcPath, destPath);
      } else {
        copyFileSync(srcPath, destPath);
      }
    }
  }

  // Copy public assets to dist
  copyRecursive(publicDir, distDir);
  console.log('✅ Vercel setup completed - Public assets copied to dist folder');
  
} catch (error) {
  // Don't fail the build if copy fails
  console.warn('⚠️  Warning: Could not copy public assets:', error.message);
  process.exit(0);
}

