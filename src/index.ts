#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json for version
const packageJson = JSON.parse(
    readFileSync(join(__dirname, '../package.json'), 'utf-8')
);

const program = new Command();

program
    .name('mcp-task')
    .description('MCP Task Runner - Run long-running AI tasks')
    .version(packageJson.version);

program
    .command('serve')
    .description('Run as an MCP server')
    .action(async () => {
        // Import and run the serve module
        await import('./serve.js');
    });

program.parse();
