#!/usr/bin/env node

/**
 * MCP test with files parameter
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { 
    ListToolsResultSchema,
    CallToolResultSchema 
} from '@modelcontextprotocol/sdk/types.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

async function runTest() {
    console.log('=== MCP Task Test with Files ===\n');

    // Create test files
    const testFile1 = join(process.cwd(), 'test-data1.txt');
    const testFile2 = join(process.cwd(), 'test-data2.json');

    writeFileSync(
        testFile1,
        `Product Requirements Document
=============================

1. User Authentication
   - Support OAuth 2.0
   - Multi-factor authentication
   - Session management

2. Dashboard Features
   - Real-time analytics
   - Customizable widgets
   - Export capabilities`
    );

    writeFileSync(
        testFile2,
        JSON.stringify(
            {
                project: 'Analytics Dashboard',
                version: '2.0.0',
                features: ['charts', 'reports', 'alerts'],
                priority: 'high',
            },
            null,
            2
        )
    );

    console.log('📁 Created test files:', [testFile1, testFile2]);

    const transport = new StdioClientTransport({
        command: 'node',
        args: ['dist/serve.js'],
    });

    const client = new Client(
        {
            name: 'test-client-files',
            version: '1.0.0',
        },
        {
            capabilities: {},
        }
    );

    try {
        await client.connect(transport);
        console.log('✅ Connected to MCP server\n');

        // Create task with files
        console.log('🚀 Creating task with file context...');
        const request = {
            task: 'Analyze these files and create a brief technical summary. Focus on the key features and technical requirements.',
            files: [testFile1, testFile2],
            model: 'standard',
            output: 'A concise technical summary in bullet points',
        };

        console.log('Request:', { tool: 'run_task', arguments: request });

        const createResult = await client.request({
            method: 'tools/call',
            params: {
                name: 'run_task',
                arguments: request
            }
        }, CallToolResultSchema);
        const response = JSON.parse(createResult.content[0].text);

        console.log('Response:', response);
        const taskId = response.task_id;

        // Monitor task progress
        let attempts = 0;
        let checkAfter = 5;
        let taskComplete = false;

        while (!taskComplete && attempts < 10) {
            console.log(`\n⏳ Waiting ${checkAfter} seconds...`);
            await new Promise(resolve => setTimeout(resolve, checkAfter * 1000));

            console.log(`📊 Status check #${attempts + 1}...`);
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
            console.log('Status:', {
                status: statusData.status,
                progress: statusData.progress,
                messageCount: statusData.messageCount,
                requestCount: statusData.requestCount,
                check_after: statusData.check_after,
            });

            if (statusData.status === 'completed' || statusData.status === 'failed') {
                taskComplete = true;
                console.log(`\n✅ Task ${statusData.status}!`);

                if (statusData.output) {
                    console.log('\n📄 Final Output:');
                    console.log('─'.repeat(50));
                    console.log(statusData.output);
                    console.log('─'.repeat(50));
                }
            } else if (statusData.check_after) {
                checkAfter = statusData.check_after;
                console.log(`💡 Next check recommended after ${checkAfter} seconds`);
            }

            attempts++;
        }

        // Clean up test files
        const { unlinkSync } = await import('fs');
        unlinkSync(testFile1);
        unlinkSync(testFile2);
        console.log('\n🧹 Cleaned up test files');
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await client.close();
        console.log('\n👋 Connection closed');
    }
}

runTest().catch(console.error);