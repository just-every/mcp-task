#!/usr/bin/env node

import { config } from 'dotenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from './utils/logger.js';
import { TaskManager } from './utils/task-manager.js';
import type { Agent } from '@just-every/ensemble';
// createToolFunction no longer needed - using bash tool from tools.ts instead
import { getSearchTools } from '@just-every/search';
// exec and promisify no longer needed - using bash tool from tools.ts instead
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getAllTools, getReadOnlyTools } from './tools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from ENV_FILE or .env
const envFile = process.env.ENV_FILE || join(__dirname, '..', '.env');

// Temporarily capture console output to prevent dotenv from polluting stdout
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
if (process.env.MCP_MODE === 'true' || process.env.MCP_QUIET === 'true') {
    console.log = () => {};
    console.info = () => {};
}

config({ path: envFile });

// Restore console methods
if (process.env.MCP_MODE === 'true' || process.env.MCP_QUIET === 'true') {
    console.log = originalConsoleLog;
    console.info = originalConsoleInfo;
}

// Dynamic import for Agent to avoid TypeScript issues
let AgentClass: typeof Agent;

// Only log if not in MCP mode (MCP requires clean stdout)
if (process.env.MCP_MODE !== 'true') {
    logger.info('MCP Task Server starting up...');
    logger.debug('Node version:', process.version);
    logger.debug('Working directory:', process.cwd());
}

// Ensure the process doesn't exit on stdio errors
process.stdin.on('error', () => {});
process.stdout.on('error', () => {});
process.stderr.on('error', () => {});

// Model class options - these are supported by @just-every/ensemble
const MODEL_CLASSES = [
    'reasoning', // Complex reasoning and analysis
    'vision', // Image and visual processing
    'standard', // General purpose tasks
    'mini', // Lightweight, fast responses
    'reasoning_mini', // Lightweight reasoning
    'code', // Code generation and analysis
    'writing', // Creative and professional writing
    'summary', // Text summarization
    'vision_mini', // Lightweight vision processing
    'long', // Long-form content generation
];

// Popular model name examples
const POPULAR_MODELS = [
    'grok-4',
    'gemini-2.5-pro',
    'o3',
    'o3-pro',
    'claude-opus-4',
];

if (process.env.MCP_MODE !== 'true') {
    logger.debug('Creating MCP server instance...');
}
const server = new Server(
    {
        name: 'task-runner',
        version: '0.1.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);
if (process.env.MCP_MODE !== 'true') {
    logger.info('MCP server instance created successfully');
}

// Add error handling for the server instance
server.onerror = error => {
    logger.error('MCP Server Error:', error);
};

// Initialize TaskManager
const taskManager = TaskManager.getInstance();

// Tool definitions
const RUN_TASK_TOOL: Tool = {
    name: 'run_task',
    description:
        'Start a complex AI task. Perform advanced reasoning and analysis with state of the art LLMs. Returns a task ID immediately to check status and retrieve results.',
    annotations: {
        title: 'Run AI Task',
        readOnlyHint: false, // Creates and executes a new task
        destructiveHint: false, // Doesn't destroy existing data
        idempotentHint: false, // Each call creates a new task
        openWorldHint: true, // Task may interact with external services/APIs
    },
    inputSchema: {
        type: 'object',
        properties: {
            model: {
                type: 'string',
                description: `Optional: Model class OR specific model name. Classes: ${MODEL_CLASSES.join(', ')}. Popular models: ${POPULAR_MODELS.join(', ')}. Defaults to 'standard' if not specified.`,
                enum: [...MODEL_CLASSES, ...POPULAR_MODELS],
            },
            task: {
                type: 'string',
                description: 'The task prompt - what to perform (required)',
            },
            context: {
                type: 'string',
                description: 'Optional: Background context for the task',
            },
            output: {
                type: 'string',
                description: 'Optional: The desired output/success state',
            },
            files: {
                type: 'array',
                description:
                    'Optional: Array of file paths to include in the task context',
                items: {
                    type: 'string',
                },
            },
            read_only: {
                type: 'boolean',
                description:
                    'Optional: When true, excludes tools that can modify files, execute commands, or make changes. Only allows read/search/analysis tools. Defaults to false.',
            },
        },
        required: ['task'],
    },
};

const CHECK_TASK_STATUS_TOOL: Tool = {
    name: 'check_task_status',
    description:
        'Check the status of a running task. Returns current status, progress, and partial results if available.',
    annotations: {
        title: 'Check Task Status',
        readOnlyHint: true, // Only reads task status
        destructiveHint: false, // Doesn't modify or destroy data
        idempotentHint: false, // task_id returns status each time
        openWorldHint: false, // Only queries local task state
    },
    inputSchema: {
        type: 'object',
        properties: {
            task_id: {
                type: 'string',
                description: 'The task ID returned from run_task',
            },
        },
        required: ['task_id'],
    },
};

const GET_TASK_RESULT_TOOL: Tool = {
    name: 'get_task_result',
    description: 'Get the final result of a completed task.',
    annotations: {
        title: 'Get Task Result',
        readOnlyHint: true, // Only reads completed task result
        destructiveHint: false, // Doesn't modify or destroy data
        idempotentHint: false, // task_id returns result each time
        openWorldHint: false, // Only queries local task state
    },
    inputSchema: {
        type: 'object',
        properties: {
            task_id: {
                type: 'string',
                description: 'The task ID returned from run_task',
            },
        },
        required: ['task_id'],
    },
};

const CANCEL_TASK_TOOL: Tool = {
    name: 'cancel_task',
    description: 'Cancel a pending or running task.',
    annotations: {
        title: 'Cancel Task',
        readOnlyHint: false, // Modifies task state
        destructiveHint: true, // Cancels/stops a running task
        idempotentHint: true, // Cancelling an already cancelled task is safe
        openWorldHint: false, // Only affects local task state
    },
    inputSchema: {
        type: 'object',
        properties: {
            task_id: {
                type: 'string',
                description: 'The task ID to cancel',
            },
        },
        required: ['task_id'],
    },
};

const LIST_TASKS_TOOL: Tool = {
    name: 'list_tasks',
    description: 'List all tasks with their current status.',
    annotations: {
        title: 'List All Tasks',
        readOnlyHint: true, // Only reads task list
        destructiveHint: false, // Doesn't modify or destroy data
        idempotentHint: false, // Task list may change between calls
        openWorldHint: false, // Only queries local task state
    },
    inputSchema: {
        type: 'object',
        properties: {
            status_filter: {
                type: 'string',
                description: 'Optional: Filter tasks by status',
                enum: [
                    'pending',
                    'running',
                    'completed',
                    'failed',
                    'cancelled',
                ],
            },
        },
        required: [], // All parameters are optional
    },
};

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
    if (process.env.MCP_MODE !== 'true') {
        logger.debug('Received ListTools request');
    }
    const response = {
        tools: [
            RUN_TASK_TOOL,
            CHECK_TASK_STATUS_TOOL,
            GET_TASK_RESULT_TOOL,
            CANCEL_TASK_TOOL,
            LIST_TASKS_TOOL,
        ],
    };
    if (process.env.MCP_MODE !== 'true') {
        logger.debug(
            'Returning tools:',
            response.tools.map(t => t.name)
        );
    }
    return response;
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async request => {
    if (process.env.MCP_MODE !== 'true') {
        logger.info('Received CallTool request:', request.params.name);
        logger.debug(
            'Request params:',
            JSON.stringify(request.params, null, 2)
        );
    }

    const toolName = request.params.name;

    try {
        const args = request.params.arguments as any;

        // Handle async task management tools
        switch (toolName) {
            case 'check_task_status': {
                if (!args.task_id) {
                    throw new Error('task_id is required');
                }

                const task = taskManager.getTask(args.task_id);
                if (!task) {
                    throw new Error(`Task ${args.task_id} not found`);
                }

                // Check for stuck task indicators
                let warningMessage = null;
                if (task.status === 'running') {
                    const now = Date.now();

                    // Check last activity time
                    if (task.lastActivityTime) {
                        const inactiveTime =
                            now - task.lastActivityTime.getTime();
                        if (inactiveTime > 60000) {
                            // 1 minute
                            warningMessage = `Warning: No activity for ${Math.round(inactiveTime / 1000)} seconds`;
                        }
                    }

                    // Check runtime
                    if (task.startedAt) {
                        const runtime = now - task.startedAt.getTime();
                        if (runtime > 5 * 60 * 1000) {
                            // 5 minutes
                            warningMessage = `Warning: Task running for ${Math.round(runtime / 60000)} minutes`;
                        }
                    }

                    // Check error count
                    if (task.errorCount && task.errorCount > 2) {
                        warningMessage = `Warning: ${task.errorCount} errors encountered`;
                    }
                }

                // Calculate recommended check_after based on task runtime
                let recommendedCheckAfter = 120; // Default max of 2 minutes
                if (task.status === 'running' && task.startedAt) {
                    const runtimeMs = Date.now() - task.startedAt.getTime();
                    const runtimeSeconds = Math.floor(runtimeMs / 1000);

                    // Progressive backoff: 5s for first 5s, 10s for first 10s, then scale up
                    if (runtimeSeconds <= 5) {
                        recommendedCheckAfter = 5;
                    } else if (runtimeSeconds <= 10) {
                        recommendedCheckAfter = 10;
                    } else if (runtimeSeconds <= 30) {
                        recommendedCheckAfter = 15;
                    } else if (runtimeSeconds <= 60) {
                        recommendedCheckAfter = 30;
                    } else if (runtimeSeconds <= 120) {
                        recommendedCheckAfter = 60;
                    } else {
                        recommendedCheckAfter = 120; // Max 2 minutes for long-running tasks
                    }
                }

                // Get live progress for running tasks using taskStatus()
                let currentProgress = null;
                if (task.status === 'running') {
                    currentProgress = await taskManager.getTaskProgress(
                        args.task_id
                    );
                }

                const activity = taskManager.getTaskActivity(args.task_id);

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                {
                                    id: task.id,
                                    status: task.status,
                                    model: task.model || task.modelClass,
                                    readOnly: task.readOnly,
                                    createdAt: task.createdAt,
                                    startedAt: task.startedAt,
                                    completedAt: task.completedAt,
                                    output: task.output, // Shows result if complete, error if failed
                                    progress: currentProgress || task.progress, // Live status from taskStatus() or cached
                                    messageCount: task.messages.length,
                                    requestCount: task.requestCount || 0,
                                    recentEvents: activity.recentEvents,
                                    toolCalls: activity.toolCalls,
                                    lastActivity: activity.lastActivity,
                                    check_after:
                                        task.status === 'running'
                                            ? recommendedCheckAfter
                                            : null,
                                    warning: warningMessage,
                                    errorCount: task.errorCount,
                                    lastError: task.lastError,
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            }

            case 'get_task_result': {
                if (!args.task_id) {
                    throw new Error('task_id is required');
                }

                const task = taskManager.getTask(args.task_id);
                if (!task) {
                    throw new Error(`Task ${args.task_id} not found`);
                }

                if (
                    task.status !== 'completed' &&
                    task.status !== 'failed' &&
                    task.status !== 'cancelled'
                ) {
                    throw new Error(
                        `Task ${args.task_id} is not complete. Status: ${task.status}`
                    );
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: task.output || 'No output available',
                        },
                    ],
                };
            }

            case 'cancel_task': {
                if (!args.task_id) {
                    throw new Error('task_id is required');
                }

                const cancelled = taskManager.cancelTask(args.task_id);

                return {
                    content: [
                        {
                            type: 'text',
                            text: cancelled
                                ? `Task ${args.task_id} cancelled successfully`
                                : `Could not cancel task ${args.task_id} (may be already completed)`,
                        },
                    ],
                };
            }

            case 'list_tasks': {
                const allTasks = taskManager.getAllTasks();
                const filteredTasks = args.status_filter
                    ? allTasks.filter(t => t.status === args.status_filter)
                    : allTasks;

                const taskSummaries = filteredTasks.map(t => ({
                    id: t.id,
                    status: t.status,
                    task: t.task.substring(0, 100),
                    model: t.model || t.modelClass,
                    readOnly: t.readOnly,
                    createdAt: t.createdAt,
                    completedAt: t.completedAt,
                }));

                const stats = taskManager.getStats();

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                {
                                    stats,
                                    tasks: taskSummaries,
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            }

            case 'run_task': {
                // This is the main run_task handler - now async
                break; // Fall through to the original implementation
            }

            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }

        // run_task implementation (now async)
        // Lazy load Agent class and createToolFunction
        if (!AgentClass) {
            const ensembleModule = await import('@just-every/ensemble');
            AgentClass = ensembleModule.Agent;
        }

        // Validate task parameter
        if (!args.task || typeof args.task !== 'string') {
            throw new Error('Task parameter is required and must be a string');
        }

        if (process.env.MCP_MODE !== 'true') {
            logger.info(`Processing task request`);
            logger.debug('Task parameters:', {
                model: args.model,
                context: args.context,
                task: args.task,
                output: args.output,
            });
        }

        // Build the task prompt
        let fullPrompt = '';
        if (args.context) {
            fullPrompt += `Context:\n${args.context}\n\n`;
        }

        // Include file contents if provided
        if (args.files && Array.isArray(args.files) && args.files.length > 0) {
            fullPrompt += 'Files provided:\n';
            for (const filePath of args.files) {
                try {
                    const { readFile } = await import('fs/promises');
                    const content = await readFile(filePath, 'utf8');
                    fullPrompt += `\n=== ${filePath} ===\n${content}\n=== End of ${filePath} ===\n\n`;
                } catch (error: any) {
                    fullPrompt += `\n=== ${filePath} ===\nError reading file: ${error.message}\n=== End of ${filePath} ===\n\n`;
                }
            }
        }

        fullPrompt += `Task:\n${args.task}`;
        if (args.output) {
            fullPrompt += `\n\nDesired Output:\n${args.output}`;
        }

        // Create task with tools - filter based on read_only flag
        const searchTools = await getSearchTools();
        const customTools = args.read_only ? getReadOnlyTools() : getAllTools();

        // Combine search tools and custom tools
        // Note: Search tools are generally read-only (search, fetch, etc.)
        const allTools = [...searchTools, ...customTools];

        // Determine model configuration
        let modelClass: string | undefined;
        let modelName: string | undefined;

        if (args.model) {
            // Check if it's a model class
            if (MODEL_CLASSES.includes(args.model.toLowerCase())) {
                modelClass = args.model.toLowerCase();
            } else {
                // It's a specific model name
                modelName = args.model;
            }
        } else {
            // Default to standard class if no model specified
            modelClass = 'standard';
        }

        // Generate task ID from model and task words
        const modelPart = (modelName || modelClass || 'standard')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
        const taskWords = args.task
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter((word: string) => word.length > 2)
            .slice(0, 3)
            .join('-');

        const baseTaskId = `${modelPart}-${taskWords}`;

        // Ensure uniqueness by adding a suffix if needed
        let taskId = baseTaskId;
        let suffix = 1;
        while (taskManager.getTask(taskId)) {
            taskId = `${baseTaskId}-${suffix}`;
            suffix++;
        }

        // Create task with custom ID
        taskManager.createTask({
            id: taskId,
            model: modelName,
            modelClass: modelClass,
            context: args.context,
            task: args.task,
            output: args.output,
            files: args.files,
            readOnly: args.read_only,
        });

        // Create agent with tools
        const agent = new AgentClass({
            name: 'TaskRunner',
            modelClass: modelClass as any,
            model: modelName,
            instructions:
                'You are a helpful AI assistant that can complete complex tasks.',
            tools: allTools,
        });

        // Start task execution in background (non-blocking)
        taskManager.executeTask(taskId, agent, fullPrompt).catch(error => {
            logger.error(`Background task ${taskId} failed:`, error);

            // Ensure task is marked as failed
            const task = taskManager.getTask(taskId);
            if (task && task.status === 'running') {
                logger.error(
                    `Marking stuck task ${taskId} as failed after error`
                );
                task.status = 'failed';
                task.output = `ERROR: Task execution failed: ${error.message}`;
                task.completedAt = new Date();
            }
        });

        if (process.env.MCP_MODE !== 'true') {
            logger.info(`Task ${taskId} queued for execution`);
        }

        // Return task ID immediately
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(
                        {
                            task_id: taskId,
                            status: 'pending',
                            message:
                                'Task queued for execution. Use check_task_status to monitor progress.',
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    } catch (error: any) {
        logger.error('Error executing task:', error.message);
        logger.debug('Error stack:', error.stack);

        throw new Error(
            `Failed to execute task: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
});

// Start the server
async function runServer() {
    try {
        if (process.env.MCP_MODE !== 'true') {
            logger.info('Starting MCP server...');
            logger.debug('Creating StdioServerTransport...');
        }

        const transport = new StdioServerTransport();

        if (process.env.MCP_MODE !== 'true') {
            logger.debug('Transport created, connecting to server...');
        }

        // Add transport error handling
        transport.onerror = error => {
            logger.error('Transport Error:', error);
            if (error?.message?.includes('Connection closed')) {
                logger.info('Connection closed by client');
                process.exit(0);
            }
        };

        // Handle graceful shutdown
        const cleanup = async (signal: string) => {
            logger.info(`Received ${signal}, shutting down gracefully...`);
            try {
                // Stop task manager first
                taskManager.stopCleanup();
                logger.info('Task manager stopped');

                // Then close server
                await server.close();
                logger.info('Server closed successfully');
                process.exit(0);
            } catch (error) {
                logger.error('Error during cleanup:', error);
                process.exit(1);
            }
        };

        process.on('SIGINT', () => cleanup('SIGINT'));
        process.on('SIGTERM', () => cleanup('SIGTERM'));

        // Handle unexpected errors
        process.on('uncaughtException', error => {
            logger.error('Uncaught exception:', error.message);
            logger.error('Stack trace:', error.stack);

            // Try to gracefully handle task-related errors
            if (
                error.message &&
                (error.message.includes('Task') ||
                    error.message.includes('task'))
            ) {
                logger.error(
                    'Task-related uncaught exception, attempting recovery'
                );
                // Don't exit, let TaskManager handle cleanup
                return;
            }

            if (error && error.message && error.message.includes('EPIPE')) {
                logger.warn('Pipe error detected, keeping server alive');
                return;
            }

            // For other critical errors, exit
            logger.error('Critical error, shutting down');
            taskManager.stopCleanup(); // Clean up tasks before exit
            process.exit(1);
        });

        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection at:', promise);
            logger.error('Rejection reason:', reason);

            // Check if it's task-related
            const reasonStr = String(reason);
            if (reasonStr.includes('Task') || reasonStr.includes('task')) {
                logger.error(
                    'Task-related unhandled rejection, attempting recovery'
                );
                // Don't crash, let tasks fail gracefully
            }
        });

        // Log process events
        process.on('exit', code => {
            logger.info(`Process exiting with code: ${code}`);
        });

        process.on('warning', warning => {
            logger.warn('Process warning:', warning.message);
            logger.debug('Warning details:', warning);
        });

        // Handle stdin closure
        process.stdin.on('end', () => {
            logger.info('Stdin closed, shutting down...');
            setTimeout(() => process.exit(0), 100);
        });

        process.stdin.on('error', error => {
            logger.warn('Stdin error:', error);
        });

        await server.connect(transport);

        if (process.env.MCP_MODE !== 'true') {
            logger.info('MCP server connected and running successfully!');
            logger.info('Ready to receive requests');
            logger.debug('Server details:', {
                name: 'task-runner',
                version: '0.1.0',
                pid: process.pid,
            });
        }

        // Log heartbeat every 30 seconds
        setInterval(() => {
            logger.debug('Server heartbeat - still running...');
        }, 30000);

        // Keep the process alive
        process.stdin.resume();
    } catch (error: any) {
        logger.error('Failed to start server:', error.message);
        logger.debug('Startup error details:', error);
        throw error;
    }
}

// Start the server
if (process.env.MCP_MODE !== 'true') {
    logger.info('Initializing MCP server...');
}
runServer().catch(error => {
    logger.error('Fatal server error:', error.message);
    logger.error('Stack trace:', error.stack);
    logger.debug('Full error:', error);
    process.exit(1);
});
