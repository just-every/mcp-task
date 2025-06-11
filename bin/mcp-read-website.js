#!/usr/bin/env node

// Use tsx to register TypeScript support
import 'tsx/esm';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const args = process.argv.slice(2);

async function main() {
  if (args[0] === 'serve') {
    // Dynamically import and run the serve module
    const servePath = join(__dirname, '..', 'src', 'serve.ts');
    await import(servePath);
  } else {
    // Dynamically import and run the CLI module
    const cliPath = join(__dirname, '..', 'src', 'index.ts');
    await import(cliPath);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});