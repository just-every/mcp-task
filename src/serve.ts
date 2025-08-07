#!/usr/bin/env node

import { config } from 'dotenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListPromptsRequestSchema,
    GetPromptRequestSchema,
    type Tool,
    type Prompt,
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
            prompts: {},
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
                oneOf: [
                    {
                        type: 'string',
                        description: `Model class OR specific model name. Classes: ${MODEL_CLASSES.join(', ')}. Popular models: ${POPULAR_MODELS.join(', ')}.`,
                        enum: [...MODEL_CLASSES, ...POPULAR_MODELS],
                    },
                    {
                        type: 'array',
                        description: `Array of model classes or specific model names for batch execution`,
                        items: {
                            type: 'string',
                            enum: [...MODEL_CLASSES, ...POPULAR_MODELS],
                        },
                    },
                ],
                description: `Optional: Single model OR array of models for batch execution. Defaults to 'standard' if not specified.`,
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
                    'Optional: When true, excludes tools that can modify files, execute commands, or make changes. Only allows read/search/analysis tools.',
                default: false,
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
    description: 'Cancel a pending or running task, or all tasks in a batch.',
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
                description:
                    'The task ID to cancel (required if batch_id not provided)',
            },
            batch_id: {
                type: 'string',
                description:
                    'Cancel all tasks with this batch ID (required if task_id not provided)',
            },
        },
        required: [], // At least one must be provided, validated in handler
    },
};

const WAIT_FOR_TASK_TOOL: Tool = {
    name: 'wait_for_task',
    description:
        'Wait for a task or any task in a batch to complete, fail, or be cancelled.',
    annotations: {
        title: 'Wait For Task Completion',
        readOnlyHint: true, // Only reads task status
        destructiveHint: false, // Doesn't modify or destroy data
        idempotentHint: true, // Waiting multiple times is safe
        openWorldHint: false, // Only queries local task state
    },
    inputSchema: {
        type: 'object',
        properties: {
            task_id: {
                type: 'string',
                description:
                    'Wait for this specific task to complete (required if batch_id not provided)',
            },
            batch_id: {
                type: 'string',
                description:
                    'Wait for any task in this batch to complete (required if task_id not provided)',
            },
            timeout_seconds: {
                type: 'number',
                description:
                    'Maximum seconds to wait before timing out (default: 300, max: 600)',
                default: 300,
                maximum: 600,
            },
            return_all: {
                type: 'boolean',
                description:
                    'For batch_id: return all completed tasks instead of just the first one (default: false)',
                default: false,
            },
        },
        required: [], // At least one must be provided, validated in handler
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
            batch_id: {
                type: 'string',
                description:
                    'Optional: Filter tasks by batch ID to only show tasks from a specific batch',
            },
            recent_only: {
                type: 'boolean',
                description:
                    'Optional: Only show tasks from the last 2 hours (default: false)',
                default: false,
            },
        },
        required: [], // All parameters are optional
    },
};

// Prompt definitions
const SOLVE_PROMPT: Prompt = {
    name: 'solve',
    description:
        'Solve a complicated problem with multiple state-of-the-art LLMs',
    arguments: [
        {
            name: 'problem',
            description: 'The problem to solve',
            required: true,
        },
    ],
};

// Handle prompt listing
server.setRequestHandler(ListPromptsRequestSchema, async () => {
    if (process.env.MCP_MODE !== 'true') {
        logger.debug('Received ListPrompts request');
    }
    return {
        prompts: [SOLVE_PROMPT],
    };
});

// Handle prompt retrieval
server.setRequestHandler(GetPromptRequestSchema, async request => {
    if (process.env.MCP_MODE !== 'true') {
        logger.debug('Received GetPrompt request:', request.params.name);
    }

    const { name, arguments: args } = request.params;

    if (name === 'solve') {
        const problem =
            args?.problem ||
            'Figure out what problem needs solving from the recent conversation';

        return {
            description: 'Multi-model problem solving strategy',
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `Solve a complicated problem by starting multiple tasks with state of the art LLMs.

Use the task MCP to start a batch of tasks using run_task with an array of models:
- models: ['gpt-5', 'gemini-2.5-pro', 'grok-4', 'reasoning']
- read_only: true (so tasks don't edit files but can read them)

This will start all tasks at once and return a batch_id.

To monitor progress, you have two options:
1. Use wait_for_task with the batch_id to block until the first task completes (efficient)
2. Use list_tasks with the batch_id to poll and check status manually

As soon as one completes you can try implementing the solution it proposes. If it works, use cancel_task with the batch_id to cancel all remaining tasks. If it fails, start a new task with the same model/class and explain the problem, its suggested solution and why it didn't work. Check for any other completed tasks and if they have a different solution try that. Try to keep multiple tasks running in the background until the problem is resolved.

Problem to solve:
${problem}`,
                    },
                },
            ],
        };
    }

    throw new Error(`Unknown prompt: ${name}`);
});

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
            WAIT_FOR_TASK_TOOL,
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
                                            ? `Please wait ${recommendedCheckAfter} seconds before checking this task again`
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
                // Validate that at least one parameter is provided
                if (!args.task_id && !args.batch_id) {
                    throw new Error('Either task_id or batch_id is required');
                }

                if (args.task_id && args.batch_id) {
                    throw new Error(
                        'Provide either task_id or batch_id, not both'
                    );
                }

                // Handle single task cancellation
                if (args.task_id) {
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

                // Handle batch cancellation
                if (args.batch_id) {
                    const allTasks = taskManager.getAllTasks();
                    const batchTasks = allTasks.filter(
                        t => t.batchId === args.batch_id
                    );

                    if (batchTasks.length === 0) {
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: `No tasks found with batch_id: ${args.batch_id}`,
                                },
                            ],
                        };
                    }

                    let cancelledCount = 0;
                    let alreadyCompleteCount = 0;

                    for (const task of batchTasks) {
                        if (taskManager.cancelTask(task.id)) {
                            cancelledCount++;
                        } else if (
                            task.status === 'completed' ||
                            task.status === 'failed' ||
                            task.status === 'cancelled'
                        ) {
                            alreadyCompleteCount++;
                        }
                    }

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        batch_id: args.batch_id,
                                        total_tasks: batchTasks.length,
                                        cancelled: cancelledCount,
                                        already_complete: alreadyCompleteCount,
                                        message: `Cancelled ${cancelledCount} tasks from batch ${args.batch_id}`,
                                    },
                                    null,
                                    2
                                ),
                            },
                        ],
                    };
                }

                // Should never reach here due to validation above
                throw new Error('Invalid cancel_task parameters');
            }

            case 'wait_for_task': {
                // Validate that at least one parameter is provided
                if (!args.task_id && !args.batch_id) {
                    throw new Error('Either task_id or batch_id is required');
                }

                if (args.task_id && args.batch_id) {
                    throw new Error(
                        'Provide either task_id or batch_id, not both'
                    );
                }

                const timeoutSeconds = Math.min(
                    args.timeout_seconds || 300,
                    600
                );
                const returnAll = args.return_all || false;
                const startTime = Date.now();
                const timeoutMs = timeoutSeconds * 1000;
                const pollIntervalMs = 1000; // Poll every second

                // Helper function to check if a task is complete
                const isTaskComplete = (task: any) => {
                    return (
                        task.status === 'completed' ||
                        task.status === 'failed' ||
                        task.status === 'cancelled'
                    );
                };

                // Wait for single task
                if (args.task_id) {
                    while (Date.now() - startTime < timeoutMs) {
                        const task = taskManager.getTask(args.task_id);

                        if (!task) {
                            throw new Error(`Task ${args.task_id} not found`);
                        }

                        if (isTaskComplete(task)) {
                            return {
                                content: [
                                    {
                                        type: 'text',
                                        text: JSON.stringify(
                                            {
                                                task_id: task.id,
                                                status: task.status,
                                                output: task.output,
                                                completed_at: task.completedAt,
                                                wait_time_seconds: Math.round(
                                                    (Date.now() - startTime) /
                                                        1000
                                                ),
                                            },
                                            null,
                                            2
                                        ),
                                    },
                                ],
                            };
                        }

                        // Wait before next check
                        await new Promise(resolve =>
                            setTimeout(resolve, pollIntervalMs)
                        );
                    }

                    // Timeout reached
                    const task = taskManager.getTask(args.task_id);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        task_id: args.task_id,
                                        status: task?.status || 'unknown',
                                        timeout: true,
                                        message: `Timeout after ${timeoutSeconds} seconds waiting for task ${args.task_id}`,
                                    },
                                    null,
                                    2
                                ),
                            },
                        ],
                    };
                }

                // Wait for batch tasks
                if (args.batch_id) {
                    const completedTasks: any[] = [];

                    while (Date.now() - startTime < timeoutMs) {
                        const allTasks = taskManager.getAllTasks();
                        const batchTasks = allTasks.filter(
                            t => t.batchId === args.batch_id
                        );

                        if (batchTasks.length === 0) {
                            throw new Error(
                                `No tasks found with batch_id: ${args.batch_id}`
                            );
                        }

                        // Check for completed tasks
                        const newlyCompleted = batchTasks.filter(
                            t =>
                                isTaskComplete(t) &&
                                !completedTasks.find(ct => ct.id === t.id)
                        );

                        completedTasks.push(...newlyCompleted);

                        // If we want all tasks, check if all are complete
                        if (returnAll) {
                            const allComplete =
                                batchTasks.every(isTaskComplete);
                            if (allComplete) {
                                return {
                                    content: [
                                        {
                                            type: 'text',
                                            text: JSON.stringify(
                                                {
                                                    batch_id: args.batch_id,
                                                    all_complete: true,
                                                    tasks: batchTasks.map(
                                                        t => ({
                                                            id: t.id,
                                                            status: t.status,
                                                            output: t.output,
                                                            completed_at:
                                                                t.completedAt,
                                                        })
                                                    ),
                                                    wait_time_seconds:
                                                        Math.round(
                                                            (Date.now() -
                                                                startTime) /
                                                                1000
                                                        ),
                                                },
                                                null,
                                                2
                                            ),
                                        },
                                    ],
                                };
                            }
                        } else {
                            // Return first completed task
                            if (completedTasks.length > 0) {
                                const firstCompleted = completedTasks[0];
                                return {
                                    content: [
                                        {
                                            type: 'text',
                                            text: JSON.stringify(
                                                {
                                                    batch_id: args.batch_id,
                                                    first_completed: true,
                                                    task_id: firstCompleted.id,
                                                    status: firstCompleted.status,
                                                    output: firstCompleted.output,
                                                    completed_at:
                                                        firstCompleted.completedAt,
                                                    remaining_tasks:
                                                        batchTasks.filter(
                                                            t =>
                                                                !isTaskComplete(
                                                                    t
                                                                )
                                                        ).length,
                                                    wait_time_seconds:
                                                        Math.round(
                                                            (Date.now() -
                                                                startTime) /
                                                                1000
                                                        ),
                                                },
                                                null,
                                                2
                                            ),
                                        },
                                    ],
                                };
                            }
                        }

                        // Wait before next check
                        await new Promise(resolve =>
                            setTimeout(resolve, pollIntervalMs)
                        );
                    }

                    // Timeout reached
                    const allTasks = taskManager.getAllTasks();
                    const batchTasks = allTasks.filter(
                        t => t.batchId === args.batch_id
                    );
                    const runningCount = batchTasks.filter(
                        t => t.status === 'running'
                    ).length;
                    const pendingCount = batchTasks.filter(
                        t => t.status === 'pending'
                    ).length;

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        batch_id: args.batch_id,
                                        timeout: true,
                                        message: `Timeout after ${timeoutSeconds} seconds`,
                                        completed_tasks: completedTasks.length,
                                        running_tasks: runningCount,
                                        pending_tasks: pendingCount,
                                        total_tasks: batchTasks.length,
                                    },
                                    null,
                                    2
                                ),
                            },
                        ],
                    };
                }

                // Should never reach here
                throw new Error('Invalid wait_for_task parameters');
            }

            case 'list_tasks': {
                let allTasks = taskManager.getAllTasks();

                // Apply recent_only filter (last 2 hours)
                if (args.recent_only) {
                    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
                    allTasks = allTasks.filter(
                        t => t.createdAt.getTime() > twoHoursAgo
                    );
                }

                // Apply batch_id filter
                if (args.batch_id) {
                    allTasks = allTasks.filter(
                        t => t.batchId === args.batch_id
                    );
                }

                // Apply status filter
                const filteredTasks = args.status_filter
                    ? allTasks.filter(t => t.status === args.status_filter)
                    : allTasks;

                const taskSummaries = filteredTasks.map(t => ({
                    id: t.id,
                    status: t.status,
                    task: t.task.substring(0, 100),
                    model: t.model || t.modelClass,
                    batchId: t.batchId,
                    readOnly: t.readOnly,
                    createdAt: t.createdAt,
                    completedAt: t.completedAt,
                }));

                // Calculate stats for filtered tasks
                const stats = {
                    total: filteredTasks.length,
                    pending: filteredTasks.filter(t => t.status === 'pending')
                        .length,
                    running: filteredTasks.filter(t => t.status === 'running')
                        .length,
                    completed: filteredTasks.filter(
                        t => t.status === 'completed'
                    ).length,
                    failed: filteredTasks.filter(t => t.status === 'failed')
                        .length,
                    cancelled: filteredTasks.filter(
                        t => t.status === 'cancelled'
                    ).length,
                };

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                {
                                    stats,
                                    tasks: taskSummaries,
                                    filters_applied: {
                                        batch_id: args.batch_id || null,
                                        status: args.status_filter || null,
                                        recent_only: args.recent_only || false,
                                    },
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

        // Check if batch execution (array of models)
        const isBatch = Array.isArray(args.model);
        const models = isBatch ? args.model : [args.model || 'standard'];

        // Generate batch ID for grouped tasks
        const batchId = isBatch
            ? `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            : undefined;

        if (process.env.MCP_MODE !== 'true') {
            logger.info(
                `Processing ${isBatch ? 'batch' : 'single'} task request`
            );
            logger.debug('Task parameters:', {
                models: models,
                batchId: batchId,
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

        // Get current working directory and file list
        const cwd = process.cwd();
        const { readdirSync, statSync } = await import('fs');
        const { join } = await import('path');
        const files = readdirSync(cwd);
        const fileList = files
            .map(f => {
                const isDirectory = statSync(join(cwd, f)).isDirectory();
                return `\t${f}${isDirectory ? '/' : ''}`;
            })
            .join('\n');

        // Create and execute tasks for each model
        const taskIds: string[] = [];

        for (const model of models) {
            // Determine model configuration for this specific model
            let modelClass: string | undefined;
            let modelName: string | undefined;

            if (model) {
                // Check if it's a model class
                if (MODEL_CLASSES.includes(model.toLowerCase())) {
                    modelClass = model.toLowerCase();
                } else {
                    // It's a specific model name
                    modelName = model;
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

            // Create task with custom ID and batch ID
            taskManager.createTask({
                id: taskId,
                model: modelName,
                modelClass: modelClass,
                batchId: batchId,
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
                instructions: `You are a helpful AI assistant that can complete complex tasks.

You are working in the ${cwd} directory.

The current directory contains:
${fileList}

You have a range of tools available to you to explore your environment and solve problems.

${args.read_only ? 'You are in READ ONLY mode. You can read files, search the web, and analyze data, but you cannot modify any files or execute commands that change the system state.' : 'You can read files, search the web, and analyze data, and you can also modify files or execute commands that change the system state.'}`,
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

            taskIds.push(taskId);

            if (process.env.MCP_MODE !== 'true') {
                logger.info(`Task ${taskId} queued for execution`);
            }
        }

        // Return appropriate response based on single vs batch
        if (isBatch) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                batch_id: batchId,
                                task_ids: taskIds,
                                status: 'pending',
                                message: `${taskIds.length} tasks queued for execution. Use list_tasks with batch_id to monitor progress.`,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } else {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                task_id: taskIds[0],
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
        }
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
