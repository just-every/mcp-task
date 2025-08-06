#!/usr/bin/env node

/**
 * MCP test - error handling scenarios
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { 
    ListToolsResultSchema,
    CallToolResultSchema 
} from '@modelcontextprotocol/sdk/types.js';

async function runTest() {
    console.log('=== MCP Error Handling Test ===\n');

    const transport = new StdioClientTransport({
        command: 'node',
        args: ['dist/serve.js'],
    });

    const client = new Client(
        {
            name: 'test-client-errors',
            version: '1.0.0',
        },
        {
            capabilities: {},
        }
    );

    try {
        await client.connect(transport);
        console.log('✅ Connected to MCP server\n');

        console.log('Testing various error scenarios:\n');

        // Test 1: Missing required parameter
        console.log('1️⃣ Test: Missing required task parameter');
        try {
            await client.request({
                method: 'tools/call',
                params: {
                    name: 'run_task',
                    arguments: {
                        model: 'mini',
                        // task is missing
                    }
                }
            }, CallToolResultSchema);
            console.log('  ❌ Should have failed but didn\'t');
        } catch (error) {
            console.log('  ✅ Correctly failed:', error.message);
        }

        // Test 2: Invalid task ID
        console.log('\n2️⃣ Test: Invalid task ID for status check');
        try {
            await client.request({
                method: 'tools/call',
                params: {
                    name: 'check_task_status',
                    arguments: {
                        task_id: 'invalid-task-id-12345',
                    }
                }
            }, CallToolResultSchema);
            console.log('  ❌ Should have failed but didn\'t');
        } catch (error) {
            console.log('  ✅ Correctly failed:', error.message);
        }

        // Test 3: Get result of non-existent task
        console.log('\n3️⃣ Test: Get result of non-existent task');
        try {
            await client.request({
                method: 'tools/call',
                params: {
                    name: 'get_task_result',
                    arguments: {
                        task_id: 'another-invalid-id',
                    }
                }
            }, CallToolResultSchema);
            console.log('  ❌ Should have failed but didn\'t');
        } catch (error) {
            console.log('  ✅ Correctly failed:', error.message);
        }

        // Test 4: Invalid files parameter
        console.log('\n4️⃣ Test: Non-existent file in files parameter');
        const createResult = await client.request({
            method: 'tools/call',
            params: {
                name: 'run_task',
                arguments: {
                    task: 'Analyze the file',
                    files: ['/non/existent/file.txt'],
                    model: 'mini',
                }
            }
        }, CallToolResultSchema);
        const response = JSON.parse(createResult.content[0].text);
        console.log('  Task created:', response.task_id);
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const statusResult = await client.request({
            method: 'tools/call',
            params: {
                name: 'check_task_status',
                arguments: {
                    task_id: response.task_id,
                }
            }
        }, CallToolResultSchema);
        const statusData = JSON.parse(statusResult.content[0].text);
        console.log('  Task status:', statusData.status);
        console.log('  Note: File error should be included in prompt');

        // Test 5: Get result of running task
        console.log('\n5️⃣ Test: Get result of still-running task');
        const longTask = await client.request({
            method: 'tools/call',
            params: {
                name: 'run_task',
                arguments: {
                    task: 'Write a very long story',
                    model: 'standard',
                }
            }
        }, CallToolResultSchema);
        const longTaskId = JSON.parse(longTask.content[0].text).task_id;
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        try {
            await client.request({
                method: 'tools/call',
                params: {
                    name: 'get_task_result',
                    arguments: {
                        task_id: longTaskId,
                    }
                }
            }, CallToolResultSchema);
            console.log('  ❌ Should have failed but didn\'t');
        } catch (error) {
            console.log('  ✅ Correctly failed:', error.message);
        }

        // Cancel the long task to clean up
        await client.request({
            method: 'tools/call',
            params: {
                name: 'cancel_task',
                arguments: { task_id: longTaskId }
            }
        }, CallToolResultSchema);

        // Test 6: Invalid model name (should still work with custom model)
        console.log('\n6️⃣ Test: Unknown model name (should work as custom)');
        const customModelResult = await client.request({
            method: 'tools/call',
            params: {
                name: 'run_task',
                arguments: {
                    task: 'Hello world',
                    model: 'my-custom-model-xyz',
                }
            }
        }, CallToolResultSchema);
        const customResponse = JSON.parse(customModelResult.content[0].text);
        console.log('  ✅ Task created with custom model:', customResponse.task_id);

        // Test 7: Empty task string
        console.log('\n7️⃣ Test: Empty task string');
        try {
            await client.request({
                method: 'tools/call',
                params: {
                    name: 'run_task',
                    arguments: {
                        task: '',
                        model: 'mini',
                    }
                }
            }, CallToolResultSchema);
            console.log('  ⚠️  Accepted empty task');
        } catch (error) {
            console.log('  ✅ Failed as expected:', error.message);
        }

        // Test 8: List tasks with invalid filter
        console.log('\n8️⃣ Test: List tasks with invalid status filter');
        try {
            await client.request({
                method: 'tools/call',
                params: {
                    name: 'list_tasks',
                    arguments: {
                        status_filter: 'invalid_status',
                    }
                }
            }, CallToolResultSchema);
            console.log('  ❌ Should have failed but didn\'t');
        } catch (error) {
            console.log('  ✅ Correctly failed with validation error');
        }

        // Final task list
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

    } catch (error) {
        console.error('❌ Test suite failed:', error);
    } finally {
        await client.close();
        console.log('\n👋 Connection closed');
    }
}

runTest().catch(console.error);