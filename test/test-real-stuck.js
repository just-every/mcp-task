#!/usr/bin/env node

/**
 * Test with a task that actually gets stuck (simulated network failure)
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testRealStuck() {
    console.log('Testing with a task that simulates network failure...\n');

    return new Promise((resolve) => {
        const serverPath = path.join(__dirname, '..', 'dist', 'serve.js');
        const server = spawn('node', [serverPath], {
            env: { 
                ...process.env, 
                MCP_MODE: 'true',
                LOG_LEVEL: 'info',
                TASK_TIMEOUT: '20000', // 20 seconds
                TASK_STUCK_THRESHOLD: '10000', // 10 seconds  
                TASK_HEALTH_CHECK_INTERVAL: '3000', // 3 seconds
            },
        });

        let taskId = null;
        let finalStatus = 'unknown';
        let safetyTriggered = false;
        const detectedMessages = [];

        server.stderr.on('data', (data) => {
            const text = data.toString();
            
            // Look for safety mechanism messages
            const lines = text.split('\n');
            for (const line of lines) {
                if (line.includes('stuck') || 
                    line.includes('timeout') || 
                    line.includes('timed out') ||
                    line.includes('auto-failed') ||
                    line.includes('force-fail') ||
                    line.includes('exceeded') ||
                    line.includes('no activity')) {
                    
                    const cleanLine = line.replace(/\[.*?\]/g, '').trim();
                    if (cleanLine && !detectedMessages.includes(cleanLine)) {
                        detectedMessages.push(cleanLine);
                        console.log('✓ Safety:', cleanLine.substring(0, 80));
                        safetyTriggered = true;
                    }
                }
            }
        });

        server.on('spawn', async () => {
            console.log('Server started with 20s timeout, 10s stuck detection');
            console.log('Creating a task with invalid model (will cause network issues)...\n');

            // Use an invalid model that will cause the task to get stuck
            const request = {
                jsonrpc: '2.0',
                method: 'tools/call',
                params: {
                    name: 'run_task',
                    arguments: {
                        task: 'Simple test task',
                        model: 'invalid-model-that-does-not-exist-12345',
                    },
                },
                id: 1,
            };

            server.stdin.write(JSON.stringify(request) + '\n');

            // Check status periodically
            let checkCount = 0;
            const startTime = Date.now();
            
            const checkInterval = setInterval(() => {
                const elapsed = Math.round((Date.now() - startTime) / 1000);
                
                if (taskId) {
                    checkCount++;
                    console.log(`\n[${elapsed}s] Status check #${checkCount}:`);
                    
                    const statusRequest = {
                        jsonrpc: '2.0',
                        method: 'tools/call',
                        params: {
                            name: 'check_task_status',
                            arguments: { task_id: taskId },
                        },
                        id: checkCount + 1,
                    };
                    server.stdin.write(JSON.stringify(statusRequest) + '\n');
                } else if (elapsed > 5) {
                    console.log(`[${elapsed}s] Waiting for task creation...`);
                }
                
                // Stop after 30 seconds
                if (elapsed > 30) {
                    clearInterval(checkInterval);
                    setTimeout(() => {
                        console.log('\n' + '='.repeat(60));
                        console.log('TEST RESULTS');
                        console.log('='.repeat(60));
                        console.log(`Final status: ${finalStatus}`);
                        console.log(`Safety triggered: ${safetyTriggered}`);
                        console.log(`Detected ${detectedMessages.length} safety messages`);
                        
                        const success = finalStatus === 'failed' || safetyTriggered;
                        console.log(`\n${success ? '✓ PASS' : '✗ FAIL'}: Stuck task detection ${success ? 'working' : 'NOT working'}`);
                        
                        if (!success) {
                            console.log('\nPROBLEM: Task got stuck and was not properly handled!');
                            console.log('This is the critical issue that needs to be fixed.');
                        }
                        
                        server.kill();
                        resolve(success);
                    }, 1000);
                }
            }, 4000);
        });

        server.stdout.on('data', (data) => {
            const text = data.toString();
            const lines = text.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                try {
                    const response = JSON.parse(line);
                    
                    if (response.id === 1 && response.result) {
                        const content = response.result.content?.[0]?.text;
                        if (content) {
                            const parsed = JSON.parse(content);
                            if (parsed.task_id) {
                                taskId = parsed.task_id;
                                console.log(`Task created: ${taskId}`);
                            }
                        }
                    }
                    
                    if (response.result && response.id > 1) {
                        const content = response.result.content?.[0]?.text;
                        if (content) {
                            const status = JSON.parse(content);
                            finalStatus = status.status;
                            console.log(`  Status: ${status.status}`);
                            
                            if (status.warning) {
                                console.log(`  ⚠ Warning: ${status.warning}`);
                            }
                            
                            if (status.errorCount > 0) {
                                console.log(`  Errors: ${status.errorCount}`);
                            }
                            
                            if (status.status === 'failed') {
                                console.log(`  ✓ Task properly failed`);
                                if (status.output) {
                                    console.log(`  Reason: ${status.output.substring(0, 100)}`);
                                }
                            }
                        }
                    }
                } catch (e) {
                    // Not JSON
                }
            }
        });

        server.on('error', (err) => {
            console.error('Server error:', err);
            server.kill();
            resolve(false);
        });
    });
}

// Run test
testRealStuck()
    .then(success => process.exit(success ? 0 : 1))
    .catch(err => {
        console.error('Test error:', err);
        process.exit(1);
    });