#!/usr/bin/env node

/**
 * Test script to verify the files parameter works in run_task
 */

import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testFilesParameter() {
    console.log('Testing files parameter in run_task...');
    
    // Start the MCP server
    const serverProcess = spawn('node', ['dist/serve.js'], {
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Create MCP client
    const transport = new StdioClientTransport({
        command: 'node',
        args: ['dist/serve.js'],
    });

    const client = new Client({
        name: 'test-client',
        version: '1.0.0',
    }, {
        capabilities: {}
    });

    try {
        await client.connect(transport);
        console.log('Connected to MCP server');

        // List available tools
        const tools = await client.listTools();
        console.log('Available tools:', tools.tools.map(t => t.name));

        // Test run_task with files parameter
        const result = await client.callTool('run_task', {
            task: 'Summarize the content of the provided files',
            files: ['test/test-file.txt'],
            model: 'mini'
        });

        console.log('Task created:', result);
        
        // Parse the response
        const response = JSON.parse(result.content[0].text);
        console.log('Task ID:', response.task_id);
        console.log('Status:', response.status);

        // Wait a bit and check status
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const statusResult = await client.callTool('check_task_status', {
            task_id: response.task_id
        });
        
        console.log('Task status:', statusResult);

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        serverProcess.kill();
        await client.close();
    }
}

testFilesParameter().catch(console.error);