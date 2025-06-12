#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
    type Tool,
    type Resource,
} from '@modelcontextprotocol/sdk/types.js';

// Lazy load heavy dependencies
let fetchMarkdownModule: any;
let fsPromises: any;
let pathModule: any;

const server = new Server(
    {
        name: 'read-website-fast',
        version: '0.1.0',
    },
    {
        capabilities: {
            tools: {},
            resources: {},
        },
    }
);

// Tool definition
const READ_WEBSITE_TOOL: Tool = {
    name: 'read_website_fast',
    description:
        'Quickly reads webpages and converts to markdown for fast, token efficient web scraping',
    inputSchema: {
        type: 'object',
        properties: {
            url: {
                type: 'string',
                description: 'HTTP/HTTPS URL to fetch and convert to markdown',
            },
            depth: {
                type: 'number',
                description: 'Crawl depth (0 = single page)',
                default: 0,
            },
            respectRobots: {
                type: 'boolean',
                description: 'Whether to respect robots.txt',
                default: true,
            },
        },
        required: ['url'],
    },
};

// Resources definitions
const RESOURCES: Resource[] = [
    {
        uri: 'read-website-fast://status',
        name: 'Cache Status',
        mimeType: 'application/json',
        description: 'Get cache status information',
    },
    {
        uri: 'read-website-fast://clear-cache',
        name: 'Clear Cache',
        mimeType: 'application/json',
        description: 'Clear the cache directory',
    },
];

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [READ_WEBSITE_TOOL],
}));

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async request => {
    if (request.params.name !== 'read_website_fast') {
        throw new Error(`Unknown tool: ${request.params.name}`);
    }

    try {
        // Lazy load the module on first use
        if (!fetchMarkdownModule) {
            fetchMarkdownModule = await import('./internal/fetchMarkdown.js');
        }

        const args = request.params.arguments as any;

        // Validate URL
        if (!args.url || typeof args.url !== 'string') {
            throw new Error('URL parameter is required and must be a string');
        }

        const result = await fetchMarkdownModule.fetchMarkdown(args.url, {
            depth: args.depth ?? 0,
            respectRobots: args.respectRobots ?? true,
        });

        // If there's an error but we still have some content, return it with a note
        if (result.error && result.markdown) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `${result.markdown}\n\n---\n*Note: ${result.error}*`,
                    },
                ],
            };
        }

        // If there's an error and no content, throw it
        if (result.error && !result.markdown) {
            throw new Error(result.error);
        }

        return {
            content: [{ type: 'text', text: result.markdown }],
        };
    } catch (error) {
        // Log the error for debugging
        console.error('Tool execution error:', error);

        // Re-throw with more context
        throw new Error(
            `Failed to fetch content: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
});

// Handle resource listing
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: RESOURCES,
}));

// Handle resource reading
server.setRequestHandler(ReadResourceRequestSchema, async request => {
    const uri = request.params.uri;

    // Lazy load fs and path modules
    if (!fsPromises) {
        fsPromises = await import('fs/promises');
    }
    if (!pathModule) {
        pathModule = await import('path');
    }

    if (uri === 'read-website-fast://status') {
        try {
            const cacheDir = '.cache';
            const files = await fsPromises.readdir(cacheDir).catch(() => []);

            let totalSize = 0;
            for (const file of files) {
                const stats = await fsPromises
                    .stat(pathModule.join(cacheDir, file))
                    .catch(() => null);
                if (stats) {
                    totalSize += stats.size;
                }
            }

            return {
                contents: [
                    {
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(
                            {
                                cacheSize: totalSize,
                                cacheFiles: files.length,
                                cacheSizeFormatted: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error) {
            return {
                contents: [
                    {
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(
                            {
                                error: 'Failed to get cache status',
                                message:
                                    error instanceof Error
                                        ? error.message
                                        : 'Unknown error',
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        }
    }

    if (uri === 'read-website-fast://clear-cache') {
        try {
            await fsPromises.rm('.cache', { recursive: true, force: true });

            return {
                contents: [
                    {
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(
                            {
                                status: 'success',
                                message: 'Cache cleared successfully',
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error) {
            return {
                contents: [
                    {
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(
                            {
                                status: 'error',
                                message:
                                    error instanceof Error
                                        ? error.message
                                        : 'Failed to clear cache',
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        }
    }

    throw new Error(`Unknown resource: ${uri}`);
});

// Start the server
async function runServer() {
    const transport = new StdioServerTransport();

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.error('Received SIGINT, shutting down gracefully...');
        await server.close();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.error('Received SIGTERM, shutting down gracefully...');
        await server.close();
        process.exit(0);
    });

    // Handle unexpected errors
    process.on('uncaughtException', error => {
        console.error('Uncaught exception:', error);
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled rejection at:', promise, 'reason:', reason);
        process.exit(1);
    });

    try {
        await server.connect(transport);
        console.error('read-website-fast MCP server running');

        // Keep the process alive
        process.stdin.resume();
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

runServer().catch(error => {
    console.error('Server initialization error:', error);
    process.exit(1);
});
