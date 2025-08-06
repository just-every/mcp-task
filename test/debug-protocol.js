/**
 * Debug test - minimal MCP connection
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function runTest() {
    console.log('=== Debug MCP Protocol Test ===\n');

    const transport = new StdioClientTransport({
        command: 'node',
        args: ['dist/serve.js'],
        env: {
            ...process.env,
            MCP_MODE: 'true',
            MCP_QUIET: 'true',
        },
    });

    const client = new Client(
        {
            name: 'debug-client',
            version: '1.0.0',
        },
        {
            capabilities: {},
        }
    );

    // Add error handling
    client.onerror = (error) => {
        console.error('Client error:', error);
    };

    transport.onerror = (error) => {
        console.error('Transport error:', error);
    };

    try {
        // Connect to the server
        console.log('Connecting to server...');
        await client.connect(transport);
        console.log('✅ Connected successfully\n');

        // Try to list tools
        console.log('Attempting to list tools...');
        const response = await client.request({ 
            method: 'tools/list',
            params: {}
        });
        console.log('Response:', JSON.stringify(response, null, 2));

    } catch (error) {
        console.error('❌ Error:', error);
        console.error('Stack:', error.stack);
    } finally {
        console.log('\nClosing connection...');
        await client.close();
        console.log('Connection closed');
    }
}

runTest().catch(console.error);
