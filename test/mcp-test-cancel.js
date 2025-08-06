#!/usr/bin/env node

/**
 * MCP test - task cancellation
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { 
    ListToolsResultSchema,
    CallToolResultSchema 
} from '@modelcontextprotocol/sdk/types.js';

async function runTest() {
    console.log('=== MCP Task Cancellation Test ===\n');

    const transport = new StdioClientTransport({
        command: 'node',
        args: ['dist/serve.js'],
    });

    const client = new Client(
        {
            name: 'test-client-cancel',
            version: '1.0.0',
        },
        {
            capabilities: {},
        }
    );

    try {
        await client.connect(transport);
        console.log('✅ Connected to MCP server\n');

        // Create a long-running task
        console.log('🚀 Creating a long-running task...');
        const request = {
            task: 'Write a comprehensive 10-page research paper on the history and future of artificial intelligence, including detailed timelines, key figures, breakthrough moments, current applications, and future predictions.',
            model: 'standard',
            context: 'This should be very detailed and comprehensive',
            output: 'A full research paper with citations',
        };

        console.log('Request:', {
            tool: 'run_task',
            task: request.task.substring(0, 80) + '...',
        });

        const createResult = await client.request({
            method: 'tools/call',
            params: {
                name: 'run_task',
                arguments: request
            }
        }, CallToolResultSchema);
        const response = JSON.parse(createResult.content[0].text);
        const taskId = response.task_id;

        console.log('Response:', response);

        // Check status after 2 seconds
        console.log('\n⏳ Waiting 2 seconds...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('📊 Checking initial status...');
        const status1 = await client.request({
            method: 'tools/call',
            params: {
                name: 'check_task_status',
                arguments: {
                    task_id: taskId,
                }
            }
        }, CallToolResultSchema);
        const statusData1 = JSON.parse(status1.content[0].text);
        console.log('Initial Status:', {
            status: statusData1.status,
            progress: statusData1.progress,
            messageCount: statusData1.messageCount,
            check_after: statusData1.check_after,
        });

        // Cancel the task
        console.log('\n🛑 Cancelling the task...');
        const cancelResult = await client.request({
            method: 'tools/call',
            params: {
                name: 'cancel_task',
                arguments: {
                    task_id: taskId,
                }
            }
        }, CallToolResultSchema);
        console.log('Cancel Response:', cancelResult.content[0].text);

        // Check status after cancellation
        console.log('\n📊 Checking status after cancellation...');
        const status2 = await client.request({
            method: 'tools/call',
            params: {
                name: 'check_task_status',
                arguments: {
                    task_id: taskId,
                }
            }
        }, CallToolResultSchema);
        const statusData2 = JSON.parse(status2.content[0].text);
        console.log('Status After Cancel:', {
            status: statusData2.status,
            output: statusData2.output,
        });

        // Try to cancel again (should fail gracefully)
        console.log('\n🔄 Attempting to cancel already cancelled task...');
        const cancelResult2 = await client.request({
            method: 'tools/call',
            params: {
                name: 'cancel_task',
                arguments: {
                    task_id: taskId,
                }
            }
        }, CallToolResultSchema);
        console.log('Second Cancel Response:', cancelResult2.content[0].text);

        // Create another task and let it complete
        console.log('\n🚀 Creating a quick task to complete normally...');
        const quickTask = await client.request({
            method: 'tools/call',
            params: {
                name: 'run_task',
                arguments: {
                    task: 'Count to 5',
                    model: 'mini',
                }
            }
        }, CallToolResultSchema);
        const quickTaskId = JSON.parse(quickTask.content[0].text).task_id;
        console.log('Quick task ID:', quickTaskId);

        // Wait for completion
        console.log('⏳ Waiting for quick task to complete...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Try to cancel completed task
        console.log('\n🔄 Attempting to cancel completed task...');
        const cancelCompleted = await client.request({
            method: 'tools/call',
            params: {
                name: 'cancel_task',
                arguments: {
                    task_id: quickTaskId,
                }
            }
        }, CallToolResultSchema);
        console.log('Cancel Completed Task Response:', cancelCompleted.content[0].text);

        // List all tasks to see final states
        console.log('\n📋 Final task list:');
        const listResult = await client.request({
            method: 'tools/call',
            params: {
                name: 'list_tasks',
                arguments: {}
            }
        }, CallToolResultSchema);
        const listData = JSON.parse(listResult.content[0].text);
        console.log('Stats:', listData.stats);
        console.log('\nTasks:');
        listData.tasks.forEach((task) => {
            console.log(`  - ${task.id.substring(0, 8)}... [${task.status}]: ${task.task.substring(0, 50)}...`);
        });

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await client.close();
        console.log('\n👋 Connection closed');
    }
}

runTest().catch(console.error);