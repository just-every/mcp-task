#!/usr/bin/env node

/**
 * Test to verify that multiple API requests get counted properly
 * This test creates a task that should make multiple requests and verifies counting
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testMultipleRequestCounting() {
    console.log('🧪 Testing multiple request counting...\n');

    // Start the MCP server
    const serverPath = join(__dirname, '..', 'bin', 'mcp-task.js');
    const server = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
            ...process.env,
            MCP_MODE: 'true',
            MCP_QUIET: 'true'
        }
    });

    let serverOutput = '';
    
    server.stdout.on('data', (data) => {
        serverOutput += data.toString();
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
        while (Date.now() - startTime < 30000) {
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

    try {
        await sleep(2000);

        // Initialize
        await sendMCPRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' }
        });

        // Start a complex task that will definitely make multiple requests
        const runTaskResponse = await sendMCPRequest('tools/call', {
            name: 'run_task',
            arguments: {
                model: 'standard',
                task: 'Write a simple Python program that calculates the factorial of a number. First plan the solution, then write the code, then explain how it works step by step.',
                output: 'Complete Python code with detailed explanation'
            }
        });
        
        const taskResult = JSON.parse(runTaskResponse.result.content[0].text);
        const taskId = taskResult.task_id;
        
        console.log(`Task started: ${taskId}`);

        // Monitor and track request count increases
        let requestCounts = [];
        let taskCompleted = false;
        const maxChecks = 60;
        
        for (let i = 0; i < maxChecks && !taskCompleted; i++) {
            await sleep(3000); // Wait 3 seconds between checks
            
            try {
                const statusResponse = await sendMCPRequest('tools/call', {
                    name: 'check_task_status',
                    arguments: { task_id: taskId }
                });
                
                const statusResult = JSON.parse(statusResponse.result.content[0].text);
                const currentRequests = statusResult.requestCount || 0;
                
                console.log(`Check ${i + 1}: Status=${statusResult.status}, Requests=${currentRequests}`);
                
                requestCounts.push(currentRequests);
                
                if (statusResult.status === 'completed' || statusResult.status === 'failed') {
                    taskCompleted = true;
                    console.log(`Task ${statusResult.status}`);
                    break;
                }
            } catch (error) {
                console.log(`Status check ${i + 1} failed: ${error.message}`);
            }
        }
        
        // Analyze request count progression
        const uniqueRequestCounts = [...new Set(requestCounts)].sort((a, b) => a - b);
        const maxRequests = Math.max(...requestCounts);
        
        console.log('\n' + '='.repeat(50));
        console.log('📊 Request Count Analysis:');
        console.log(`   Unique request counts seen: ${uniqueRequestCounts.join(', ')}`);
        console.log(`   Maximum requests: ${maxRequests}`);
        console.log(`   Request count progression: ${requestCounts.slice(0, 10).join(' → ')}${requestCounts.length > 10 ? '...' : ''}`);
        
        if (maxRequests > 1) {
            console.log('🎉 SUCCESS: Multiple requests were counted correctly!');
            console.log(`   The task made ${maxRequests} API requests to the LLM.`);
        } else if (maxRequests === 1) {
            console.log('⚠️  PARTIAL: Only 1 request counted. Task may have completed too quickly.');
        } else {
            console.log('❌ FAILURE: No requests counted. Request counting is broken.');
        }

    } catch (error) {
        console.error(`Test failed: ${error.message}`);
    } finally {
        server.kill();
        await sleep(1000);
    }
}

testMultipleRequestCounting();