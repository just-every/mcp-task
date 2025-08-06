#!/usr/bin/env node

/**
 * MCP test - check_after timing logic
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { 
    ListToolsResultSchema,
    CallToolResultSchema 
} from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'child_process';

async function runTest() {
    console.log('=== MCP check_after Timing Test ===\n');
    console.log('This test demonstrates the progressive backoff logic:\n');
    console.log('  0-5s:    check every 5s');
    console.log('  5-10s:   check every 10s');
    console.log('  10-30s:  check every 15s');
    console.log('  30-60s:  check every 30s');
    console.log('  60-120s: check every 60s');
    console.log('  >120s:   check every 120s\n');

    // Don't spawn a server here, use the transport to connect
    const transport = new StdioClientTransport({
        command: 'node',
        args: ['dist/serve.js'],
    });

    const client = new Client(
        {
            name: 'test-client-timing',
            version: '1.0.0',
        },
        {
            capabilities: {},
        }
    );

    try {
        await client.connect(transport);
        console.log('✅ Connected to MCP server\n');

        // Create a moderately complex task
        console.log('🚀 Creating a task that should take some time...');
        const request = {
            task: `Create a detailed implementation plan for a web application with the following features:
                   1. User authentication system
                   2. Real-time chat functionality
                   3. File upload and storage
                   4. REST API design
                   5. Database schema
                   Please provide specific technical details for each component.`,
            model: 'standard',
            output: 'Detailed technical implementation plan',
        };

        const createResult = await client.request({
            method: 'tools/call',
            params: {
                name: 'run_task',
                arguments: request
            }
        }, CallToolResultSchema);
        const response = JSON.parse(createResult.content[0].text);
        const taskId = response.task_id;

        console.log('Task ID:', taskId);
        console.log('Initial status:', response.status);
        console.log('\n📊 Monitoring task with smart check_after timing:\n');

        let taskComplete = false;
        let checkCount = 0;
        let totalWaitTime = 0;
        let lastCheckAfter = 0;
        const startTime = Date.now();

        while (!taskComplete && checkCount < 30) {
            // Wait based on previous check_after recommendation
            const waitTime = lastCheckAfter || 2;
            console.log(`⏳ Waiting ${waitTime} seconds...`);
            await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
            totalWaitTime += waitTime;

            checkCount++;
            const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
            
            console.log(`\n--- Check #${checkCount} (${elapsedSeconds}s elapsed) ---`);
            
            const statusResult = await client.request({
                method: 'tools/call',
                params: {
                    name: 'check_task_status',
                    arguments: {
                        task_id: taskId,
                    }
                }
            }, CallToolResultSchema);
            const statusData = JSON.parse(statusResult.content[0].text);

            console.log(`Status: ${statusData.status}`);
            if (statusData.progress) {
                console.log(`Progress: ${statusData.progress}`);
            }
            console.log(`Messages: ${statusData.messageCount}, Requests: ${statusData.requestCount}`);
            
            if (statusData.check_after) {
                console.log(`✨ Recommended check_after: ${statusData.check_after} seconds`);
                lastCheckAfter = statusData.check_after;
                
                // Verify the timing logic
                const runtimeMs = new Date(statusData.startedAt).getTime() ? 
                    Date.now() - new Date(statusData.startedAt).getTime() : 0;
                const runtimeSeconds = Math.floor(runtimeMs / 1000);
                
                let expectedCheckAfter;
                if (runtimeSeconds <= 5) expectedCheckAfter = 5;
                else if (runtimeSeconds <= 10) expectedCheckAfter = 10;
                else if (runtimeSeconds <= 30) expectedCheckAfter = 15;
                else if (runtimeSeconds <= 60) expectedCheckAfter = 30;
                else if (runtimeSeconds <= 120) expectedCheckAfter = 60;
                else expectedCheckAfter = 120;
                
                if (statusData.check_after === expectedCheckAfter) {
                    console.log(`✅ Timing logic correct for ${runtimeSeconds}s runtime`);
                } else {
                    console.log(`⚠️  Expected ${expectedCheckAfter}s but got ${statusData.check_after}s`);
                }
            }

            if (statusData.recentEvents && statusData.recentEvents.length > 0) {
                console.log('Recent events:', statusData.recentEvents.slice(-2));
            }

            if (statusData.status === 'completed' || statusData.status === 'failed') {
                taskComplete = true;
                console.log(`\n🎉 Task ${statusData.status} after ${elapsedSeconds} seconds!`);
                
                if (statusData.output) {
                    console.log('\n📄 Output preview:');
                    console.log(statusData.output.substring(0, 500) + '...');
                }
            }
        }

        // Summary
        console.log('\n📈 Timing Summary:');
        console.log(`  Total checks: ${checkCount}`);
        console.log(`  Total wait time: ${totalWaitTime} seconds`);
        console.log(`  Average wait between checks: ${(totalWaitTime / checkCount).toFixed(1)} seconds`);
        console.log(`  Total elapsed time: ${Math.floor((Date.now() - startTime) / 1000)} seconds`);

        // Test completed task (should have null check_after)
        console.log('\n🔍 Checking completed task (should have no check_after):');
        const finalCheck = await client.request({
            method: 'tools/call',
            params: {
                name: 'check_task_status',
                arguments: {
                    task_id: taskId,
                }
            }
        }, CallToolResultSchema);
        const finalData = JSON.parse(finalCheck.content[0].text);
        console.log(`Status: ${finalData.status}`);
        console.log(`check_after: ${finalData.check_after === null ? 'null (correct!)' : finalData.check_after + ' (should be null!)'}`);

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await client.close();
        console.log('\n👋 Connection closed');
    }
}

runTest().catch(console.error);