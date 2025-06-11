#!/usr/bin/env node

import { Command } from 'commander';
import { CrawlQueue } from './crawler/queue.js';
import { CrawlOptions } from './types.js';
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
  .name('mcp')
  .description('Markdown Content Preprocessor - Extract and convert web content to clean Markdown')
  .version(packageJson.version);

program
  .command('fetch <url>')
  .description('Fetch a URL and convert to Markdown')
  .option('-d, --depth <number>', 'Crawl depth (0 = single page)', '0')
  .option('-c, --concurrency <number>', 'Max concurrent requests', '3')
  .option('--no-robots', 'Ignore robots.txt')
  .option('--all-origins', 'Allow cross-origin crawling')
  .option('-u, --user-agent <string>', 'Custom user agent')
  .option('--cache-dir <path>', 'Cache directory', '.cache')
  .option('-t, --timeout <ms>', 'Request timeout in milliseconds', '30000')
  .option('-o, --output <format>', 'Output format: json, markdown, or both', 'markdown')
  .action(async (url: string, options) => {
    try {
      const crawlOptions: CrawlOptions = {
        depth: parseInt(options.depth, 10),
        maxConcurrency: parseInt(options.concurrency, 10),
        respectRobots: options.robots,
        sameOriginOnly: !options.allOrigins,
        userAgent: options.userAgent,
        cacheDir: options.cacheDir,
        timeout: parseInt(options.timeout, 10)
      };

      const queue = new CrawlQueue(crawlOptions);
      await queue.init();

      console.error(`Fetching ${url}...`);
      const results = await queue.crawl(url);

      if (options.output === 'json') {
        console.log(JSON.stringify(results, null, 2));
      } else if (options.output === 'markdown') {
        results.forEach(result => {
          if (result.error) {
            console.error(`Error for ${result.url}: ${result.error}`);
          } else if (result.markdown) {
            console.log(result.markdown);
            if (results.length > 1) {
              console.log('\n---\n'); // Separator between multiple pages
            }
          }
        });
      } else if (options.output === 'both') {
        results.forEach(result => {
          console.log(`\n## URL: ${result.url}\n`);
          if (result.error) {
            console.error(`Error: ${result.error}`);
          } else {
            console.log(result.markdown);
          }
        });
      }

      // Exit with error if any fetch failed
      const hasErrors = results.some(r => r.error);
      if (hasErrors) {
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('clear-cache')
  .description('Clear the cache directory')
  .option('--cache-dir <path>', 'Cache directory', '.cache')
  .action(async (options) => {
    try {
      const { rm } = await import('fs/promises');
      await rm(options.cacheDir, { recursive: true, force: true });
      console.log(`Cache cleared: ${options.cacheDir}`);
    } catch (error) {
      console.error('Error clearing cache:', error);
      process.exit(1);
    }
  });

program.parse();