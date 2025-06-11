#!/usr/bin/env node
import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { fetchMarkdown } from './internal/fetchMarkdown.js';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';

const server = new FastMCP({
  name: 'read-website-fast',
  version: '0.1.0',
  capabilities: {
    tools: {},
    resources: {}
  }
});

// Tool: read_website_fast
server.addTool({
  name: 'read_website_fast',
  description: 'Quickly reads webpages and converts to markdown for fast, token efficient web scraping',
  parameters: z.object({
    url: z.string().describe('HTTP/HTTPS URL to fetch and convert to markdown'),
    depth: z.number().optional().default(0).describe('Crawl depth (0 = single page)'),
    respectRobots: z.boolean().optional().default(true).describe('Whether to respect robots.txt')
  }),
  execute: async (args) => {
    const { url, depth, respectRobots } = args;
    const result = await fetchMarkdown(url, { depth, respectRobots });
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    return result.markdown;
  },
});

// Resource: cache status
server.addResource({
  uri: 'read-website-fast://status',
  name: 'Cache Status',
  mimeType: 'application/json',
  async load() {
    try {
      const cacheDir = '.cache';
      const files = await readdir(cacheDir).catch(() => []);
      
      let totalSize = 0;
      for (const file of files) {
        const stats = await stat(join(cacheDir, file)).catch(() => null);
        if (stats) {
          totalSize += stats.size;
        }
      }
      
      return {
        text: JSON.stringify({
          cacheSize: totalSize,
          cacheFiles: files.length,
          cacheSizeFormatted: `${(totalSize / 1024 / 1024).toFixed(2)} MB`
        }, null, 2)
      };
    } catch (error) {
      return {
        text: JSON.stringify({
          error: 'Failed to get cache status',
          message: error instanceof Error ? error.message : 'Unknown error'
        }, null, 2)
      };
    }
  }
});

// Resource: clear cache
server.addResource({
  uri: 'read-website-fast://clear-cache',
  name: 'Clear Cache',
  mimeType: 'application/json',
  async load() {
    try {
      const { rm } = await import('fs/promises');
      await rm('.cache', { recursive: true, force: true });
      
      return {
        text: JSON.stringify({
          status: 'success',
          message: 'Cache cleared successfully'
        }, null, 2)
      };
    } catch (error) {
      return {
        text: JSON.stringify({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to clear cache'
        }, null, 2)
      };
    }
  }
});

// Run the MCP server (stdio by default)
server.start({ 
  transportType: 'stdio',
  stdio: {
    stderr: process.stderr
  }
}).catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});