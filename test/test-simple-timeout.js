#!/usr/bin/env node

/**
 * Simple test to verify timeout and stuck task detection
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testSimpleTimeout() {
    console.log('Testing task timeout detection...\n');

    return new Promise((resolve) => {
        const serverPath = path.join(__dirname, '..', 'dist', 'serve.js');
        const server = spawn('node', [serverPath], {
            env: { ...process.env, MCP_MODE: 'true', LOG_LEVEL: 'debug' },
        });

        let taskId = null;
        let finalStatus = 'unknown';
        let stuckDetected = false;
        let timeoutDetected = false;

        server.stderr.on('data', (data) => {
            const text = data.toString();
            
            if (text.includes('stuck')) {
                console.log('✓ Stuck task detection working');
                stuckDetected = true;
            }
            if (text.includes('timeout') || text.includes('timed out')) {
                console.log('✓ Timeout detection working');
                timeoutDetected = true;
            }
            if (text.includes('auto-failed') || text.includes('force-fail')) {
                console.log('✓ Auto-failure mechanism working');
            }
        });

        server.on('spawn', async () => {
            console.log('Server started, creating a task that will hang...\n');

            // Create a task that will hang
            const request = {
                jsonrpc: '2.0',
                method: 'tools/call',
                params: {
                    name: 'run_task',
                    arguments: {
                        task: 'while true; do sleep 1; done',
                        model: 'standard',
                    },
                },
                id: 1,
            };

            server.stdin.write(JSON.stringify(request) + '\n');

            // Check status periodically
            let checkCount = 0;
            const checkInterval = setInterval(() => {
                if (taskId) {
                    checkCount++;
                    console.log(`Check #${checkCount}: Checking task status...`);
                    
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
                
                // Stop after 15 seconds
                if (checkCount >= 5) {
                    clearInterval(checkInterval);
                    setTimeout(() => {
                        console.log('\nTest completed.');
                        console.log('Results:');
                        console.log(`- Final status: ${finalStatus}`);
                        console.log(`- Stuck detected: ${stuckDetected}`);
                        console.log(`- Timeout detected: ${timeoutDetected}`);
                        
                        server.kill();
                        
                        const success = (finalStatus === 'failed' || stuckDetected || timeoutDetected);
                        console.log(`\nTest ${success ? 'PASSED' : 'FAILED'}: Task safety mechanisms are ${success ? 'working' : 'not working properly'}`);
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
                                console.log(`Task created: ${taskId}\n`);
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
testSimpleTimeout()
    .then(success => process.exit(success ? 0 : 1))
    .catch(err => {
        console.error('Test error:', err);
        process.exit(1);
    });