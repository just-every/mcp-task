#!/usr/bin/env node

/**
 * Test to verify that request counting works properly
 * This test creates a task and verifies that the requestCount increments correctly
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const TEST_TIMEOUT = 30000; // 30 seconds

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testRequestCounting() {
    console.log('🧪 Testing request counting functionality...\n');

    // Start the MCP server
    const serverPath = join(__dirname, '..', 'bin', 'mcp-task.js');
    const server = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
            ...process.env,
            MCP_MODE: 'true',
            MCP_QUIET: 'true',
            LOG_LEVEL: 'debug'
        }
    });

    let serverOutput = '';
    let serverError = '';
    
    server.stdout.on('data', (data) => {
        serverOutput += data.toString();
    });
    
    server.stderr.on('data', (data) => {
        serverError += data.toString();
    });

    // Helper function to send MCP request
    async function sendMCPRequest(method, params = {}) {
        const request = {
            jsonrpc: '2.0',
            id: Date.now(),
            method: method,
            params: params
        };
        
        const message = JSON.stringify(request) + '\n';
        server.stdin.write(message);
        
        // Wait for response
        const startTime = Date.now();
        while (Date.now() - startTime < TEST_TIMEOUT) {
            const lines = serverOutput.split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const response = JSON.parse(line);
                    if (response.id === request.id) {
                        return response;
                    }
                } catch (e) {
                    // Not JSON, continue
                }
            }
            await sleep(100);
        }
        throw new Error('Request timeout');
    }

    let testsPassed = 0;
    let totalTests = 0;

    try {
        // Wait for server to initialize
        await sleep(2000);

        console.log('1. Initializing MCP connection...');
        totalTests++;
        
        // Initialize
        const initResponse = await sendMCPRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
                name: 'test-client',
                version: '1.0.0'
            }
        });
        
        if (initResponse.error) {
            throw new Error(`Initialize failed: ${initResponse.error.message}`);
        }
        
        console.log('   ✅ MCP connection initialized');
        testsPassed++;

        // List tools to verify server is working
        console.log('\n2. Listing available tools...');
        totalTests++;
        
        const toolsResponse = await sendMCPRequest('tools/list');
        if (toolsResponse.error) {
            throw new Error(`Tools list failed: ${toolsResponse.error.message}`);
        }
        
        const tools = toolsResponse.result?.tools || [];
        const hasRunTask = tools.some(t => t.name === 'run_task');
        const hasCheckStatus = tools.some(t => t.name === 'check_task_status');
        
        if (!hasRunTask || !hasCheckStatus) {
            throw new Error('Required tools not found');
        }
        
        console.log('   ✅ Found required tools: run_task, check_task_status');
        testsPassed++;

        // Start a simple task that will make multiple requests
        console.log('\n3. Starting a task that should make multiple requests...');
        totalTests++;
        
        const runTaskResponse = await sendMCPRequest('tools/call', {
            name: 'run_task',
            arguments: {
                model: 'fast',
                task: 'Count from 1 to 5, explaining each number briefly. Think step by step and provide detailed reasoning for each number.',
                output: 'A numbered list with explanations'
            }
        });
        
        if (runTaskResponse.error) {
            throw new Error(`Run task failed: ${runTaskResponse.error.message}`);
        }
        
        // Extract task ID
        const taskResult = JSON.parse(runTaskResponse.result.content[0].text);
        const taskId = taskResult.task_id;
        
        console.log(`   ✅ Task started with ID: ${taskId}`);
        testsPassed++;

        // Monitor the task and check request counting
        console.log('\n4. Monitoring task progress and request counting...');
        totalTests++;
        
        let maxRequests = 0;
        let taskCompleted = false;
        const maxChecks = 60; // Maximum number of status checks (60 * 2s = 2 minutes)
        
        for (let i = 0; i < maxChecks && !taskCompleted; i++) {
            await sleep(2000); // Wait 2 seconds between checks
            
            const statusResponse = await sendMCPRequest('tools/call', {
                name: 'check_task_status',
                arguments: { task_id: taskId }
            });
            
            if (statusResponse.error) {
                console.log(`   ⚠️  Status check failed: ${statusResponse.error.message}`);
                continue;
            }
            
            const statusResult = JSON.parse(statusResponse.result.content[0].text);
            const currentRequests = statusResult.requestCount || 0;
            
            console.log(`   📊 Check ${i + 1}: Status=${statusResult.status}, Requests=${currentRequests}, Messages=${statusResult.messageCount}`);
            
            if (currentRequests > maxRequests) {
                maxRequests = currentRequests;
                console.log(`   🔄 Request count increased to: ${maxRequests}`);
            }
            
            if (statusResult.status === 'completed' || statusResult.status === 'failed') {
                taskCompleted = true;
                console.log(`   🏁 Task ${statusResult.status}: ${statusResult.output?.substring(0, 100) || 'No output'}...`);
                break;
            }
        }
        
        if (!taskCompleted) {
            throw new Error('Task did not complete within timeout');
        }
        
        if (maxRequests === 0) {
            throw new Error('Request count never incremented - this indicates the bug is not fixed');
        }
        
        if (maxRequests > 0) {
            console.log(`   ✅ Request counting works! Maximum requests seen: ${maxRequests}`);
            testsPassed++;
        }

        // Verify final status
        console.log('\n5. Verifying final task status...');
        totalTests++;
        
        const finalStatusResponse = await sendMCPRequest('tools/call', {
            name: 'check_task_status',
            arguments: { task_id: taskId }
        });
        
        if (finalStatusResponse.error) {
            throw new Error(`Final status check failed: ${finalStatusResponse.error.message}`);
        }
        
        const finalStatus = JSON.parse(finalStatusResponse.result.content[0].text);
        const finalRequests = finalStatus.requestCount || 0;
        
        console.log(`   📋 Final status: ${finalStatus.status}`);
        console.log(`   📊 Final request count: ${finalRequests}`);
        console.log(`   💬 Final message count: ${finalStatus.messageCount}`);
        
        if (finalRequests > 0) {
            console.log(`   ✅ Request counting verification passed`);
            testsPassed++;
        } else {
            throw new Error('Final request count is 0 - request counting is broken');
        }

    } catch (error) {
        console.error(`\n❌ Test failed: ${error.message}`);
        if (serverError) {
            console.error('\nServer errors:');
            console.error(serverError);
        }
    } finally {
        // Clean up
        server.kill();
        await sleep(1000); // Give server time to shut down
    }

    // Results
    console.log('\n' + '='.repeat(50));
    console.log(`📊 Test Results: ${testsPassed}/${totalTests} tests passed`);
    
    if (testsPassed === totalTests) {
        console.log('🎉 All tests passed! Request counting is working correctly.');
        process.exit(0);
    } else {
        console.log('❌ Some tests failed. Request counting may still be broken.');
        process.exit(1);
    }
}

// Run the test
testRequestCounting().catch(error => {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
});