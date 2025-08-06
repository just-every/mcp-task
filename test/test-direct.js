import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/serve.js'],
    env: { ...process.env, MCP_MODE: 'true' }
});

const client = new Client(
    { name: 'test', version: '1.0.0' },
    { capabilities: {} }
);

try {
    await client.connect(transport);
    console.log('Connected');
    
    // Try different ways to call
    console.log('Method 1: Just method');
    try {
        const r1 = await client.request({ method: 'tools/list' });
        console.log('Success:', r1);
    } catch (e) {
        console.log('Failed:', e.message);
    }
    
    await client.close();
} catch (error) {
    console.error('Error:', error.message);
}
