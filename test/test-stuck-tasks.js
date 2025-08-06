#!/usr/bin/env node

/**
 * Test file to reproduce stuck task scenarios
 * Tests various failure modes that could leave tasks in "running" state
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configurations for different failure scenarios
const testScenarios = [
    {
        name: 'Task with uncaught exception',
        task: 'Throw an uncaught exception: throw new Error("Uncaught test error")',
        expectedFailure: true,
    },
    {
        name: 'Task that never completes',
        task: 'Just analyze this text forever without calling task_complete: ' + 'x'.repeat(1000),
        expectedFailure: true,
        timeout: 10000, // 10 seconds
    },
    {
        name: 'Task with network timeout',
        task: 'Simulate a network timeout by waiting indefinitely',
        model: 'test-timeout-model',
        expectedFailure: true,
    },
    {
        name: 'Task with memory leak simulation',
        task: 'Create a massive array: ' + JSON.stringify(new Array(10000).fill('memory test')),
        expectedFailure: false, // Should handle this
    },
    {
        name: 'Task with promise rejection',
        task: 'Execute this JavaScript: Promise.reject(new Error("Unhandled rejection"))',
        expectedFailure: true,
    },
    {
        name: 'Task with infinite loop in tool',
        task: 'Run this command: while true; do echo "loop"; done',
        expectedFailure: true,
        timeout: 5000,
    },
    {
        name: 'Task interrupted by process kill',
        task: 'Normal task that will be killed: analyze the number 42',
        killAfter: 2000, // Kill process after 2 seconds
        expectedFailure: true,
    },
    {
        name: 'Task with invalid model',
        task: 'Test with invalid model',
        model: 'non-existent-model-12345',
        expectedFailure: true,
    },
];

async function runTest(scenario) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${scenario.name}`);
    console.log('='.repeat(60));

    return new Promise((resolve) => {
        const serverPath = path.join(__dirname, '..', 'dist', 'serve.js');
        const server = spawn('node', [serverPath], {
            env: { ...process.env, MCP_MODE: 'true', LOG_LEVEL: 'debug' },
        });

        let taskId = null;
        let taskStatus = 'unknown';
        let output = '';
        let checkInterval = null;
        let timeoutHandle = null;
        let killHandle = null;

        server.stdout.on('data', (data) => {
            output += data.toString();
        });

        server.stderr.on('data', (data) => {
            const text = data.toString();
            console.error('[STDERR]:', text);
            
            // Look for error patterns
            if (text.includes('Task') && text.includes('failed')) {
                taskStatus = 'failed';
            }
            if (text.includes('stuck') || text.includes('timeout')) {
                console.log('✓ Detected stuck/timeout condition');
            }
        });

        server.on('spawn', async () => {
            console.log('Server started, sending test request...');

            // Send run_task request
            const request = {
                jsonrpc: '2.0',
                method: 'tools/call',
                params: {
                    name: 'run_task',
                    arguments: {
                        task: scenario.task,
                        ...(scenario.model && { model: scenario.model }),
                    },
                },
                id: 1,
            };

            server.stdin.write(JSON.stringify(request) + '\n');

            // Set up task status checking
            checkInterval = setInterval(() => {
                if (taskId) {
                    const statusRequest = {
                        jsonrpc: '2.0',
                        method: 'tools/call',
                        params: {
                            name: 'check_task_status',
                            arguments: { task_id: taskId },
                        },
                        id: 2,
                    };
                    server.stdin.write(JSON.stringify(statusRequest) + '\n');
                }
            }, 2000);

            // Set up timeout
            const timeout = scenario.timeout || 30000;
            timeoutHandle = setTimeout(() => {
                console.log(`\nTest timeout after ${timeout}ms`);
                console.log(`Final task status: ${taskStatus}`);
                cleanup();
                resolve({
                    scenario: scenario.name,
                    success: taskStatus === 'failed' && scenario.expectedFailure,
                    status: taskStatus,
                    timedOut: true,
                });
            }, timeout);

            // Set up kill handler if needed
            if (scenario.killAfter) {
                killHandle = setTimeout(() => {
                    console.log(`\nKilling process after ${scenario.killAfter}ms`);
                    server.kill('SIGKILL');
                }, scenario.killAfter);
            }
        });

        server.stdout.on('data', (data) => {
            const text = data.toString();
            
            // Try to parse JSON responses
            const lines = text.split('\n').filter(line => line.trim());
            for (const line of lines) {
                try {
                    const response = JSON.parse(line);
                    
                    if (response.id === 1 && response.result) {
                        // Extract task_id from run_task response
                        const content = response.result.content?.[0]?.text;
                        if (content) {
                            const parsed = JSON.parse(content);
                            if (parsed.task_id) {
                                taskId = parsed.task_id;
                                console.log(`Task created: ${taskId}`);
                            }
                        }
                    }
                    
                    if (response.id === 2 && response.result) {
                        // Parse check_task_status response
                        const content = response.result.content?.[0]?.text;
                        if (content) {
                            const status = JSON.parse(content);
                            taskStatus = status.status;
                            console.log(`Task status: ${taskStatus}`);
                            
                            if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
                                console.log(`Task finished with status: ${status.status}`);
                                cleanup();
                                resolve({
                                    scenario: scenario.name,
                                    success: status.status === 'failed' ? scenario.expectedFailure : !scenario.expectedFailure,
                                    status: status.status,
                                    output: status.output,
                                });
                            }
                        }
                    }
                } catch (e) {
                    // Not JSON, ignore
                }
            }
        });

        function cleanup() {
            if (checkInterval) clearInterval(checkInterval);
            if (timeoutHandle) clearTimeout(timeoutHandle);
            if (killHandle) clearTimeout(killHandle);
            server.kill();
        }

        server.on('error', (err) => {
            console.error('Server error:', err);
            cleanup();
            resolve({
                scenario: scenario.name,
                success: scenario.expectedFailure,
                error: err.message,
            });
        });

        server.on('exit', (code, signal) => {
            console.log(`Server exited with code ${code}, signal ${signal}`);
            cleanup();
            resolve({
                scenario: scenario.name,
                success: scenario.expectedFailure,
                exitCode: code,
                signal: signal,
            });
        });
    });
}

async function runAllTests() {
    console.log('Starting stuck task tests...\n');
    const results = [];

    for (const scenario of testScenarios) {
        const result = await runTest(scenario);
        results.push(result);
        
        // Wait a bit between tests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS SUMMARY');
    console.log('='.repeat(60));

    let passed = 0;
    let failed = 0;

    for (const result of results) {
        const status = result.success ? '✓ PASS' : '✗ FAIL';
        console.log(`${status}: ${result.scenario}`);
        if (result.success) passed++;
        else failed++;
    }

    console.log(`\nTotal: ${passed} passed, ${failed} failed`);
    
    process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(console.error);