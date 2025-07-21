# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A fast, token-efficient web content extractor that converts web pages to clean Markdown. Designed for LLM/RAG pipelines, it provides both CLI and MCP server interfaces with smart caching, polite crawling, and minimal dependencies.

## Core Modules & Files

- `src/crawler/`: URL fetching, robots.txt respect, queue management
- `src/parser/`: Readability extraction, HTML to Markdown conversion
- `src/cache/`: SHA-256 based file caching system
- `src/internal/fetchMarkdown.ts`: Core API shared by CLI and MCP
- `src/index.ts`: CLI interface using Commander
- `src/serve.ts`: MCP server using fastmcp
- `src/utils/`: Logger and chunking utilities

## Commands

### Development
```bash
npm run dev fetch <URL>              # Fetch single page in dev mode
npm run dev fetch <URL> --pages 3    # Crawl up to 3 pages
npm run dev clear-cache              # Clear the cache
npm run serve:dev                    # Run MCP server in dev mode
```

### Build & Production
```bash
npm run build                        # Compile TypeScript to JavaScript
npm run start                        # Run compiled CLI
npm run serve                        # Run compiled MCP server
```

### Code Quality
```bash
npm run lint                         # Run ESLint
npm run typecheck                    # TypeScript type checking
npm test                             # Run tests with Vitest
```

## Architecture

This is a TypeScript-based web content extractor that converts web pages to clean Markdown, designed for LLM/RAG pipelines. It provides both CLI and MCP server interfaces.

### Core Components

1. **Fetching & Crawling** (`src/crawler/`):
   - Uses `undici` for HTTP requests
   - Respects robots.txt via `robots-parser`
   - Manages crawl queue with configurable concurrency using `p-limit`

2. **Content Extraction** (`src/parser/`):
   - `@mozilla/readability` for article extraction (Firefox Reader View engine)
   - `jsdom` for DOM parsing
   - `turndown` for HTML→Markdown conversion
   - Converts relative URLs to absolute in markdown output

3. **Caching** (`src/cache/`):
   - File-based cache using SHA-256 hashes
   - Stores both metadata and content

4. **Entry Points**:
   - `src/index.ts`: CLI interface using Commander
   - `src/serve.ts`: MCP server using fastmcp
   - `src/internal/fetchMarkdown.ts`: Core API used by both interfaces

### Key Patterns

- Stream-first design for memory efficiency
- Lazy loading in MCP server for fast startup
- URL normalization for consistent caching
- Configurable concurrency with p-limit
- Automatic relative to absolute URL conversion

## Pre-Commit Requirements

**IMPORTANT**: Always run these commands before committing:

```bash
npm test          # Ensure tests pass
npm run lint      # Check linting
npm run build     # Ensure TypeScript compiles
```

Only commit if all commands succeed without errors.

## TypeScript Configuration

- ES Modules with Node.js >=20.0.0
- Strict mode enabled, targeting ES2022
- Source maps enabled for debugging
- Declaration files generated for consumers

## Code Style Guidelines

- Use async/await over promises
- Implement proper error handling with try/catch
- Follow functional programming patterns where appropriate
- Keep functions small and focused
- Use descriptive variable names

## Testing Instructions

- Run tests with `npm test`
- Add tests for new features in `test/` directory
- Mock external dependencies (network, filesystem)
- Test both success and error cases

## Repository Etiquette

- Branch names: `feature/description`, `fix/issue-number`
- Conventional commits (`feat:`, `fix:`, `chore:`)
- Update README.md for user-facing changes
- Add tests for new functionality

## Developer Environment Setup

1. Clone repository
2. Install Node.js 20.x or higher
3. Run `npm install`
4. Copy `.env.example` to `.env` (if needed)
5. Run `npm run dev` for development

## Package Management

- Use exact versions in package.json
- Run `npm audit` before adding new dependencies
- Keep dependencies minimal for fast installs
- Document why each dependency is needed

## Project-Specific Warnings

- **Cache Size**: Monitor cache directory size in production
- **Rate Limiting**: Respect robots.txt and implement delays
- **Memory Usage**: Large pages can consume significant memory
- **URL Validation**: Always validate and sanitize URLs
- **Concurrent Requests**: Default limit is 3, adjust carefully

## Key Utility Functions & APIs

- `fetchMarkdown()`: Core extraction function
- `CacheManager`: Handles content caching
- `RobotsChecker`: Validates crawler permissions
- `MarkdownConverter`: HTML to Markdown conversion
- `URLNormalizer`: Consistent URL handling

## MCP Server Integration

When running as MCP server (`npm run serve`):

**Tools:**
- `read_website_fast` - Main content extraction tool

**Resources:**
- `read-website-fast://status` - Cache statistics
- `read-website-fast://clear-cache` - Clear cache

## Troubleshooting

### Common Issues

- **Timeout errors**: Increase timeout with `--timeout` flag
- **Memory issues**: Process pages individually, not in bulk
- **Cache misses**: Check URL normalization
- **Extraction failures**: Some sites block automated access

### Debug Mode

Enable debug logging:
```bash
DEBUG=read-website-fast:* npm run dev fetch <URL>
```