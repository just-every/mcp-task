#!/usr/bin/env node

/**
 * Quick test with aggressive timeouts to verify safety mechanisms
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testQuickTimeout() {
    console.log('Testing task safety with aggressive timeouts...\n');

    return new Promise((resolve) => {
        const serverPath = path.join(__dirname, '..', 'dist', 'serve.js');
        const server = spawn('node', [serverPath], {
            env: { 
                ...process.env, 
                MCP_MODE: 'true',
                LOG_LEVEL: 'debug',
                TASK_TIMEOUT: '15000', // 15 seconds
                TASK_STUCK_THRESHOLD: '10000', // 10 seconds  
                TASK_HEALTH_CHECK_INTERVAL: '2000', // 2 seconds
            },
        });

        let taskId = null;
        let finalStatus = 'unknown';
        let safetyTriggered = false;

        server.stderr.on('data', (data) => {
            const text = data.toString();
            
            if (text.includes('stuck') || 
                text.includes('timeout') || 
                text.includes('timed out') ||
                text.includes('auto-failed') ||
                text.includes('force-fail') ||
                text.includes('exceeded')) {
                console.log('✓ Safety mechanism triggered:', text.split('\n')[0]);
                safetyTriggered = true;
            }
        });

        server.on('spawn', async () => {
            console.log('Server started with aggressive timeouts (15s task, 10s stuck)');
            console.log('Creating a task that will never complete...\n');

            // Create a task that will never complete
            const request = {
                jsonrpc: '2.0',
                method: 'tools/call',
                params: {
                    name: 'run_task',
                    arguments: {
                        task: 'Analyze this forever without completing: ' + 'x'.repeat(100),
                        model: 'standard',
                    },
                },
                id: 1,
            };

            server.stdin.write(JSON.stringify(request) + '\n');

            // Check status every 3 seconds
            let checkCount = 0;
            const startTime = Date.now();
            
            const checkInterval = setInterval(() => {
                if (taskId) {
                    checkCount++;
                    const elapsed = Math.round((Date.now() - startTime) / 1000);
                    console.log(`[${elapsed}s] Check #${checkCount}:`);
                    
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
                }
                
                // Stop after 25 seconds (should have timed out by then)
                if (Date.now() - startTime > 25000) {
                    clearInterval(checkInterval);
                    setTimeout(() => {
                        console.log('\n' + '='.repeat(60));
                        console.log('TEST RESULTS');
                        console.log('='.repeat(60));
                        console.log(`Final status: ${finalStatus}`);
                        console.log(`Safety triggered: ${safetyTriggered}`);
                        
                        const success = finalStatus === 'failed' || safetyTriggered;
                        console.log(`\n${success ? '✓ PASS' : '✗ FAIL'}: Task safety mechanisms ${success ? 'working correctly' : 'NOT working'}`);
                        
                        if (!success) {
                            console.log('\nExpected: Task should be marked as failed after timeout');
                            console.log(`Actual: Task status is ${finalStatus}`);
                        }
                        
                        server.kill();
                        resolve(success);
                    }, 1000);
                }
            }, 3000);
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
                                console.log(`  ⚠ ${status.warning}`);
                            }
                            
                            if (status.status === 'failed') {
                                console.log(`  ✓ Task failed: ${status.output}`);
                                safetyTriggered = true;
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
testQuickTimeout()
    .then(success => process.exit(success ? 0 : 1))
    .catch(err => {
        console.error('Test error:', err);
        process.exit(1);
    });