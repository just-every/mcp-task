# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
npm run dev fetch <URL>              # Fetch single page in dev mode
npm run dev fetch <URL> --depth 2    # Crawl with depth
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
npm run lint                         # Run ESLint (needs configuration)
npm run typecheck                    # TypeScript type checking
npm test                             # Run tests (Vitest - no tests implemented)
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

### Key Technical Details

- **Module System**: ES Modules with Node.js >=20.0.0
- **TypeScript**: Strict mode, targeting ES2022
- **No Tests**: Vitest configured but no tests implemented
- **No ESLint Config**: Dependency exists but needs configuration file

### MCP Server

When running as MCP server (`npm run serve`), provides:
- Tool: `read_website_fast` - Fetches and converts webpages
- Resources: 
  - `read-website-fast://status` - Cache statistics
  - `read-website-fast://clear-cache` - Clear cache