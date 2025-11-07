import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, 'public');
const distDir = path.join(__dirname, 'dist');

function copyRecursive(src, dest, excludeFiles = []) {
  if (!fs.existsSync(src)) {
    console.log(`Source directory does not exist: ${src}`);
    return;
  }

  // Create destination directory if it doesn't exist
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Skip excluded files
    if (excludeFiles.includes(entry.name)) {
      console.log(`Skipping: ${entry.name}`);
      continue;
    }

    if (entry.isDirectory()) {
      // Recursively copy subdirectories
      copyRecursive(srcPath, destPath, excludeFiles);
    } else {
      // Copy file
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied: ${entry.name}`);
    }
  }
}

console.log('Copying public assets to dist (excluding index.html)...');
copyRecursive(publicDir, distDir, ['index.html']);
console.log('✅ Public assets copied successfully!');
