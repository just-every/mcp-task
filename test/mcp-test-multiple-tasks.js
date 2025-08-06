#!/usr/bin/env node

/**
 * MCP test - multiple concurrent tasks
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { 
    ListToolsResultSchema,
    CallToolResultSchema 
} from '@modelcontextprotocol/sdk/types.js';

async function runTest() {
    console.log('=== MCP Multiple Tasks Test ===\n');

    const transport = new StdioClientTransport({
        command: 'node',
        args: ['dist/serve.js'],
    });

    const client = new Client(
        {
            name: 'test-client-multi',
            version: '1.0.0',
        },
        {
            capabilities: {},
        }
    );

    try {
        await client.connect(transport);
        console.log('✅ Connected to MCP server\n');

        // Create multiple tasks
        const tasks = [
            {
                task: 'Generate 5 creative product names for a smart water bottle',
                model: 'mini',
                output: 'List of 5 names with brief descriptions',
            },
            {
                task: 'Write a Python function to calculate fibonacci numbers',
                model: 'code',
                context: 'Use memoization for optimization',
            },
            {
                task: 'Explain quantum computing in simple terms',
                model: 'standard',
                output: 'A paragraph suitable for high school students',
            },
        ];

        console.log('🚀 Creating multiple tasks concurrently...\n');
        const taskIds = [];

        for (let i = 0; i < tasks.length; i++) {
            console.log(`Task ${i + 1}: ${tasks[i].task.substring(0, 50)}...`);
            const result = await client.request(
                {
                    method: 'tools/call',
                    params: {
                        name: 'run_task',
                        arguments: tasks[i]
                    }
                },
                CallToolResultSchema
            );
            const response = JSON.parse(result.content[0].text);
            taskIds.push(response.task_id);
            console.log(`  → Task ID: ${response.task_id}`);
        }

        // List all tasks
        console.log('\n📋 Listing all tasks...');
        const listResult = await client.request(
            {
                method: 'tools/call',
                params: {
                    name: 'list_tasks',
                    arguments: {}
                }
            },
            CallToolResultSchema
        );
        const listData = JSON.parse(listResult.content[0].text);
        console.log('Stats:', listData.stats);
        console.log('Active tasks:', listData.tasks.length);

        // Monitor all tasks
        console.log('\n⏳ Monitoring task progress...');
        const taskStatuses = new Map(taskIds.map(id => [id, 'pending']));
        let allComplete = false;
        let iteration = 0;

        while (!allComplete && iteration < 20) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            iteration++;

            console.log(`\n--- Check ${iteration} ---`);
            
            for (const taskId of taskIds) {
                if (taskStatuses.get(taskId) === 'completed' || taskStatuses.get(taskId) === 'failed') {
                    continue;
                }

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
                const statusData = JSON.parse(statusResult.content[0].text);
                
                taskStatuses.set(taskId, statusData.status);
                
                console.log(`Task ${taskId.substring(0, 8)}...`);
                console.log(`  Status: ${statusData.status}`);
                console.log(`  Progress: ${statusData.progress || 'N/A'}`);
                console.log(`  Messages: ${statusData.messageCount}`);
                if (statusData.check_after) {
                    console.log(`  Check after: ${statusData.check_after}s`);
                }
            }

            allComplete = Array.from(taskStatuses.values()).every(
                status => status === 'completed' || status === 'failed'
            );
        }

        // Get results for completed tasks
        console.log('\n📊 Final Results:\n');
        for (let i = 0; i < taskIds.length; i++) {
            const taskId = taskIds[i];
            const status = taskStatuses.get(taskId);
            
            console.log(`Task ${i + 1} (${taskId.substring(0, 8)}...):`);
            console.log(`  Request: ${tasks[i].task.substring(0, 50)}...`);
            console.log(`  Status: ${status}`);
            
            if (status === 'completed') {
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
                const output = resultResponse.content[0].text;
                console.log(`  Output: ${output.substring(0, 200)}${output.length > 200 ? '...' : ''}`);
            }
            console.log();
        }

        // Final stats
        console.log('📈 Final Statistics:');
        const finalListResult = await client.request(
            {
                method: 'tools/call',
                params: {
                    name: 'list_tasks',
                    arguments: {}
                }
            },
            CallToolResultSchema
        );
        const finalStats = JSON.parse(finalListResult.content[0].text);
        console.log(finalStats.stats);

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await client.close();
        console.log('\n👋 Connection closed');
    }
}

runTest().catch(console.error);