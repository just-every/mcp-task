#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);

if (args[0] === 'serve') {
  // Run the serve script using tsx
  const tsxPath = join(__dirname, '..', 'node_modules', '.bin', 'tsx');
  const servePath = join(__dirname, '..', 'src', 'serve.ts');
  
  const child = spawn(tsxPath, [servePath], {
    stdio: 'inherit',
    env: process.env
  });
  
  child.on('error', (err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
  
  child.on('exit', (code) => {
    process.exit(code || 0);
  });
} else {
  // Run the CLI
  const tsxPath = join(__dirname, '..', 'node_modules', '.bin', 'tsx');
  const cliPath = join(__dirname, '..', 'src', 'index.ts');
  
  const child = spawn(tsxPath, [cliPath, ...args], {
    stdio: 'inherit',
    env: process.env
  });
  
  child.on('error', (err) => {
    console.error('Failed to start CLI:', err);
    process.exit(1);
  });
  
  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}