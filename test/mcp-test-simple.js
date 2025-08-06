#!/usr/bin/env node

/**
 * Simple MCP test - basic task execution
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { 
    ListToolsResultSchema,
    CallToolResultSchema 
} from '@modelcontextprotocol/sdk/types.js';

async function runTest() {
    console.log('=== Simple MCP Task Test ===\n');

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
            name: 'test-client-simple',
            version: '1.0.0',
        },
        {
            capabilities: {},
        }
    );

    try {
        // Connect to the server
        await client.connect(transport);
        console.log('✅ Connected to MCP server\n');

        // List available tools
        console.log('📋 Listing available tools:');
        const tools = await client.request(
            { method: 'tools/list' },
            ListToolsResultSchema
        );
        if (tools.tools) {
            tools.tools.forEach(tool => {
                console.log(`  - ${tool.name}: ${tool.description}`);
            });
        }
        console.log();

        // Create a simple task
        console.log('🚀 Creating a simple task...');
        const createResult = await client.request(
            {
                method: 'tools/call',
                params: {
                    name: 'run_task',
                    arguments: {
                        task: 'Write a haiku about coding',
                        model: 'mini',
                    }
                }
            },
            CallToolResultSchema
        );

        console.log('Request:', {
            tool: 'run_task',
            arguments: { task: 'Write a haiku about coding', model: 'mini' },
        });
        console.log('Response:', createResult.content ? JSON.parse(createResult.content[0].text) : createResult);

        const response = createResult.content ? JSON.parse(createResult.content[0].text) : createResult;
        const taskId = response.task_id;

        // Wait and check status
        console.log(`\n⏳ Waiting 3 seconds before checking status...`);
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log('📊 Checking task status...');
        const statusResult = await client.request(
            {
                method: 'tools/call',
                params: {
                    name: 'check_task_status',
                    arguments: {
                        task_id: taskId,
                    }
                }
            },
            CallToolResultSchema
        );

        const statusData = statusResult.content ? JSON.parse(statusResult.content[0].text) : statusResult;
        console.log('Status Response:', statusData);

        // If check_after is provided, show it
        if (statusData.check_after) {
            console.log(`\n💡 Recommended to check again after ${statusData.check_after} seconds`);
        }

        // Get final result if completed
        if (statusData.status === 'completed') {
            console.log('\n✅ Task completed! Getting result...');
            const resultResponse = await client.request(
                {
                    method: 'tools/call',
                    params: {
                        name: 'get_task_result',
                        arguments: {
                            task_id: taskId,
                        }
                    }
                },
                CallToolResultSchema
            );
            const finalOutput = resultResponse.content ? resultResponse.content[0].text : resultResponse.output;
            console.log('Final Output:', finalOutput);
        }
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await client.close();
        console.log('\n👋 Connection closed');
    }
}

runTest().catch(console.error);