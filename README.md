# MCP Read Website

A Markdown Content Preprocessor that fetches web pages, strips noise, and converts content to clean Markdown while preserving links. Designed for RAG/LLM pipelines with minimal token footprint.

## MCP Server Configuration

This tool can be used as an MCP (Model Context Protocol) server with Claude Desktop, Cursor, VS Code, and other compatible clients.

### Quick Setup

Add to your MCP client configuration file:

```json
{
  "mcpServers": {
    "read-website-fast": {
      "command": "npx",
      "args": [
        "-y",
        "github:just-every/mcp-read-website-fast",
        "serve"
      ]
    }
  }
}
```

### Configuration Locations

- **Claude Desktop**: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows)
- **VS Code**: `.vscode/mcp.json` in your workspace
- **Cursor**: Similar to VS Code configuration

### Available Tools

- `read_website_fast` - Fetches a webpage and converts it to clean markdown
  - Parameters:
    - `url` (required): The HTTP/HTTPS URL to fetch
    - `depth` (optional): Crawl depth (0 = single page)
    - `respectRobots` (optional): Whether to respect robots.txt

### Available Resources

- `read-website-fast://status` - Get cache statistics
- `read-website-fast://clear-cache` - Clear the cache directory

## Features

- **Content extraction** using Mozilla Readability (same as Firefox Reader View)
- **HTML to Markdown** conversion with Turndown + GFM support
- **Smart caching** with SHA-256 hashed URLs
- **Polite crawling** with robots.txt support and rate limiting
- **Concurrent fetching** with configurable depth crawling
- **Stream-first design** for low memory usage
- **Link preservation** for knowledge graphs
- **Optional chunking** for downstream processing

## Installation

```bash
npm install
npm run build
```

## Usage

### Single page fetch
```bash
npm run dev fetch https://example.com/article
```

### Crawl with depth
```bash
npm run dev fetch https://example.com --depth 2 --concurrency 5
```

### Output formats
```bash
# Markdown only (default)
npm run dev fetch https://example.com

# JSON output with metadata
npm run dev fetch https://example.com --output json

# Both URL and markdown
npm run dev fetch https://example.com --output both
```

### CLI Options

- `-d, --depth <number>` - Crawl depth (0 = single page, default: 0)
- `-c, --concurrency <number>` - Max concurrent requests (default: 3)
- `--no-robots` - Ignore robots.txt
- `--all-origins` - Allow cross-origin crawling
- `-u, --user-agent <string>` - Custom user agent
- `--cache-dir <path>` - Cache directory (default: .cache)
- `-t, --timeout <ms>` - Request timeout in milliseconds (default: 30000)
- `-o, --output <format>` - Output format: json, markdown, or both (default: markdown)

### Clear cache
```bash
npm run dev clear-cache
```

## Architecture

```
mcp/
├── src/
│   ├── crawler/        # URL fetching, queue management, robots.txt
│   ├── parser/         # DOM parsing, Readability, Turndown conversion
│   ├── cache/          # Disk-based caching with SHA-256 keys
│   ├── utils/          # Logger, chunker utilities
│   └── index.ts        # CLI entry point
```

## Development

```bash
# Run in development mode
npm run dev fetch https://example.com

# Build for production
npm run build

# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
```

## License

MIT