/**
 * Task Manager for handling async long-running tasks
 */

import { v4 as uuid } from 'uuid';
import { runTask, taskStatus } from '@just-every/task';
import type { Agent } from '@just-every/ensemble';
import { logger } from './logger.js';
import { getWatchdog, stopWatchdog } from './task-watchdog.js';

export interface TaskInfo {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    model?: string;
    modelClass?: string;
    batchId?: string; // ID for grouping related tasks
    context?: string;
    task: string;
    output?: string; // Final output from task_complete or error from task_fatal_error
    files?: string[]; // File paths included in the task
    readOnly?: boolean; // Whether the task is running in read-only mode
    createdAt: Date;
    startedAt?: Date;
    completedAt?: Date;
    messages: Array<{
        type: string;
        content?: any;
        timestamp: string;
    }>;
    requestCount: number; // Count of message_complete events (model requests)
    progress?: string; // Summary from taskStatus() when available
    finalState?: any;
    abortController?: AbortController;
    taskGenerator?: any; // Store the generator for taskStatus() calls
    taskAgent?: Agent; // Store the agent for taskStatus() calls
    lastStatusUpdate?: Date; // Track when we last called taskStatus()
    lastActivityTime?: Date; // Track last activity for timeout detection
    timeoutHandle?: NodeJS.Timeout; // Handle for task timeout
    healthCheckInterval?: NodeJS.Timeout; // Handle for health check
    errorCount?: number; // Track consecutive errors
    lastError?: string; // Track last error message
}

export class TaskManager {
    private static instance: TaskManager;
    private tasks: Map<string, TaskInfo> = new Map();
    private cleanupInterval: NodeJS.Timeout | null = null;
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private readonly MAX_TASK_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
    private readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
    private readonly HEALTH_CHECK_INTERVAL_MS = parseInt(
        process.env.TASK_HEALTH_CHECK_INTERVAL || '60000'
    ); // 1 minute default (suitable for long-running tasks)
    private readonly TASK_TIMEOUT_MS = parseInt(
        process.env.TASK_TIMEOUT || String(5 * 60 * 60 * 1000)
    ); // 5 hours default
    private readonly STUCK_TASK_THRESHOLD_MS = parseInt(
        process.env.TASK_STUCK_THRESHOLD || String(5 * 60 * 1000)
    ); // 5 minutes default

    private constructor() {
        // Start cleanup interval
        this.startCleanupInterval();
        // Start health check interval
        this.startHealthCheckInterval();
        // Set up global error handlers
        this.setupGlobalErrorHandlers();
    }

    public static getInstance(): TaskManager {
        if (!TaskManager.instance) {
            TaskManager.instance = new TaskManager();
        }
        return TaskManager.instance;
    }

    /**
     * Create a new task and return its ID
     */
    public createTask(params: {
        id?: string;
        model?: string;
        modelClass?: string;
        batchId?: string;
        context?: string;
        task: string;
        output?: string;
        files?: string[];
        readOnly?: boolean;
    }): string {
        const taskId = params.id || uuid();
        const taskInfo: TaskInfo = {
            id: taskId,
            status: 'pending',
            model: params.model,
            modelClass: params.modelClass,
            batchId: params.batchId,
            context: params.context,
            task: params.task,
            output: params.output,
            files: params.files,
            readOnly: params.readOnly,
            createdAt: new Date(),
            messages: [],
            requestCount: 0,
            abortController: new AbortController(),
            lastActivityTime: new Date(),
            errorCount: 0,
        };

        this.tasks.set(taskId, taskInfo);
        logger.info(`Created task ${taskId}`);
        return taskId;
    }

    /**
     * Execute a task in the background
     */
    public async executeTask(
        taskId: string,
        agent: Agent,
        prompt: string
    ): Promise<void> {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }

        // Update status to running
        task.status = 'running';
        task.startedAt = new Date();
        task.lastActivityTime = new Date();
        task.taskAgent = agent; // Store agent for taskStatus() calls
        logger.info(`Starting execution of task ${taskId}`);

        // Set up task timeout
        this.setupTaskTimeout(taskId);

        // Set up task health monitoring
        this.setupTaskHealthCheck(taskId);

        // Register with watchdog
        const watchdog = getWatchdog();
        watchdog.watchTask(taskId, task);

        try {
            // Run the task and store generator for potential taskStatus() calls
            const stream = runTask(agent, prompt);
            task.taskGenerator = stream;

            // Process events
            for await (const event of stream) {
                // Check if task was cancelled
                if (task.abortController?.signal.aborted) {
                    task.status = 'cancelled';
                    task.completedAt = new Date();
                    task.output = 'Task was cancelled';
                    logger.info(`Task ${taskId} was cancelled`);
                    break;
                }

                logger.debug(`Task ${taskId} event: ${event.type}`);

                // Update last activity time
                task.lastActivityTime = new Date();

                // Update watchdog
                const watchdog = getWatchdog();
                watchdog.updateActivity(taskId);

                // Store all events in messages for full history
                task.messages.push({
                    type: event.type,
                    content: event,
                    timestamp: new Date().toISOString(),
                });

                // Handle errors
                if (
                    event.type === 'error' ||
                    event.type === 'task_fatal_error'
                ) {
                    const errorMessage =
                        (event as any).error?.message ||
                        (event as any).result ||
                        'Unknown error';
                    task.errorCount = (task.errorCount || 0) + 1;
                    task.lastError = errorMessage;
                    watchdog.recordError(taskId, errorMessage);
                } else {
                    // Reset error count on successful activity
                    task.errorCount = 0;
                    task.lastError = undefined;
                }

                if (event.type === 'task_complete') {
                    const completeEvent = event as any;
                    task.output =
                        completeEvent.result || 'Task completed without output';
                    task.finalState = completeEvent.finalState || null;
                    task.status = 'completed';
                    task.completedAt = new Date();
                    logger.info(`Task ${taskId} completed successfully`);
                    logger.debug(`Output: ${task.output}`);
                    break;
                } else if (event.type === 'task_fatal_error') {
                    const errorEvent = event as any;
                    const errorMessage =
                        errorEvent.error?.message ||
                        errorEvent.result ||
                        'Unknown error';
                    task.output = `ERROR: ${errorMessage}`;
                    task.status = 'failed';
                    task.completedAt = new Date();
                    this.cleanupTaskResources(taskId);
                    logger.error(`Task ${taskId} failed: ${errorMessage}`);
                    break;
                } else if (event.type === 'response_output') {
                    // response_output events indicate completed LLM requests
                    const responseEvent = event as any;
                    task.requestCount = (task.requestCount || 0) + 1;
                    logger.debug(
                        `Response output (request ${task.requestCount}): ${responseEvent.message?.content?.substring(0, 100) || 'No content'}`
                    );
                }
            }

            // Clean up generator and agent references
            task.taskGenerator = undefined;
            task.taskAgent = undefined;

            // If we exit the loop without setting a final status, mark as completed
            if (task.status === 'running') {
                task.status = 'completed';
                task.completedAt = new Date();
                task.output =
                    task.output || 'Task ended without explicit completion';
                this.cleanupTaskResources(taskId);
            }
        } catch (error: any) {
            task.status = 'failed';
            task.output = `ERROR: ${error.message}`;
            task.completedAt = new Date();
            task.taskGenerator = undefined;
            task.taskAgent = undefined;
            this.cleanupTaskResources(taskId);
            logger.error(`Task ${taskId} execution error:`, error);

            // Track error for monitoring
            task.errorCount = (task.errorCount || 0) + 1;
            task.lastError = error.message;
        } finally {
            // Always ensure cleanup
            this.cleanupTaskResources(taskId);
        }
    }

    /**
     * Get task status and info
     */
    public getTask(taskId: string): TaskInfo | undefined {
        return this.tasks.get(taskId);
    }

    /**
     * Get current task progress using taskStatus()
     * Only works for running tasks with an active generator
     */
    public async getTaskProgress(taskId: string): Promise<string | null> {
        const task = this.tasks.get(taskId);
        if (!task) {
            return null;
        }

        // Can't call taskStatus on completed/failed/cancelled tasks
        if (
            task.status !== 'running' ||
            !task.taskGenerator ||
            !task.taskAgent
        ) {
            return task.progress || null;
        }

        // Rate limit status updates (max once per second)
        const now = new Date();
        if (task.lastStatusUpdate) {
            const timeSinceLastUpdate =
                now.getTime() - task.lastStatusUpdate.getTime();
            if (timeSinceLastUpdate < 1000) {
                return task.progress || null;
            }
        }

        try {
            const statusEvent = await taskStatus(
                task.taskGenerator,
                task.taskAgent
            );
            task.progress = statusEvent.summary;
            task.lastStatusUpdate = now;
            logger.debug(
                `Updated status for task ${taskId}: ${statusEvent.summary}`
            );
            return statusEvent.summary;
        } catch (error: any) {
            logger.debug(
                `Could not get task status for ${taskId}: ${error.message}`
            );
            return task.progress || null;
        }
    }

    /**
     * Get all tasks
     */
    public getAllTasks(): TaskInfo[] {
        return Array.from(this.tasks.values());
    }

    /**
     * Cancel a running task
     */
    public cancelTask(taskId: string): boolean {
        const task = this.tasks.get(taskId);
        if (!task) {
            return false;
        }

        if (task.status === 'running' || task.status === 'pending') {
            task.abortController?.abort();
            task.status = 'cancelled';
            task.completedAt = new Date();
            logger.info(`Cancelled task ${taskId}`);
            return true;
        }

        return false;
    }

    /**
     * Delete a task
     */
    public deleteTask(taskId: string): boolean {
        const task = this.tasks.get(taskId);
        if (!task) {
            return false;
        }

        // Cancel if running
        if (task.status === 'running') {
            this.cancelTask(taskId);
        }

        return this.tasks.delete(taskId);
    }

    /**
     * Get a summary of recent task activity
     */
    public getTaskActivity(taskId: string): {
        recentEvents: string[];
        toolCalls: string[];
        lastActivity?: string;
    } {
        const task = this.tasks.get(taskId);
        if (!task) {
            return { recentEvents: [], toolCalls: [] };
        }

        // Get last 5 events
        const recentEvents = task.messages
            .slice(-5)
            .map(m => `${m.type} at ${m.timestamp}`);

        // Get all tool calls
        const toolCalls = task.messages
            .filter(
                m =>
                    m.type === 'tool_call' ||
                    (m.content?.tool && m.type === 'message_complete')
            )
            .map(m => {
                const tool = m.content?.tool || m.content?.content?.tool;
                return tool ? `Called: ${tool}` : 'Tool call';
            });

        // Get last significant activity
        const lastMessage = task.messages[task.messages.length - 1];
        const lastActivity = lastMessage
            ? `Last event: ${lastMessage.type} at ${lastMessage.timestamp}`
            : undefined;

        return {
            recentEvents,
            toolCalls,
            lastActivity,
        };
    }

    /**
     * Clean up old completed tasks
     */
    private cleanupOldTasks(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [taskId, task] of this.tasks.entries()) {
            if (task.completedAt) {
                const age = now - task.completedAt.getTime();
                if (age > this.MAX_TASK_AGE_MS) {
                    this.tasks.delete(taskId);
                    cleaned++;
                }
            }
        }

        if (cleaned > 0) {
            logger.info(`Cleaned up ${cleaned} old tasks`);
        }
    }

    /**
     * Start periodic cleanup
     */
    private startCleanupInterval(): void {
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldTasks();
        }, this.CLEANUP_INTERVAL_MS);
    }

    /**
     * Setup task timeout to prevent indefinite running
     */
    private setupTaskTimeout(taskId: string): void {
        const task = this.tasks.get(taskId);
        if (!task) return;

        // Clear existing timeout if any
        if (task.timeoutHandle) {
            clearTimeout(task.timeoutHandle);
        }

        // Set new timeout
        task.timeoutHandle = setTimeout(() => {
            const currentTask = this.tasks.get(taskId);
            if (currentTask && currentTask.status === 'running') {
                logger.error(
                    `Task ${taskId} timed out after ${this.TASK_TIMEOUT_MS}ms`
                );
                currentTask.status = 'failed';
                currentTask.output = `ERROR: Task timed out after ${Math.round(this.TASK_TIMEOUT_MS / 1000)} seconds`;
                currentTask.completedAt = new Date();
                this.cleanupTaskResources(taskId);

                // Abort the task
                if (currentTask.abortController) {
                    currentTask.abortController.abort();
                }
            }
        }, this.TASK_TIMEOUT_MS);
    }

    /**
     * Setup health check for a specific task
     */
    private setupTaskHealthCheck(taskId: string): void {
        const task = this.tasks.get(taskId);
        if (!task) return;

        // Clear existing health check if any
        if (task.healthCheckInterval) {
            clearInterval(task.healthCheckInterval);
        }

        // Set up health check interval
        task.healthCheckInterval = setInterval(() => {
            const currentTask = this.tasks.get(taskId);
            if (!currentTask || currentTask.status !== 'running') {
                // Task no longer running, clear interval
                if (task.healthCheckInterval) {
                    clearInterval(task.healthCheckInterval);
                }
                return;
            }

            // Check for stuck task
            if (currentTask.lastActivityTime) {
                const timeSinceActivity =
                    Date.now() - currentTask.lastActivityTime.getTime();
                if (timeSinceActivity > this.STUCK_TASK_THRESHOLD_MS) {
                    logger.warn(
                        `Task ${taskId} appears stuck (no activity for ${Math.round(timeSinceActivity / 1000)}s)`
                    );

                    // Check if we have too many consecutive errors
                    if ((currentTask.errorCount || 0) > 3) {
                        logger.error(
                            `Task ${taskId} has too many errors, marking as failed`
                        );
                        currentTask.status = 'failed';
                        currentTask.output = `ERROR: Task failed due to repeated errors: ${currentTask.lastError || 'Unknown'}`;
                        currentTask.completedAt = new Date();
                        this.cleanupTaskResources(taskId);
                    }
                }
            }
        }, 10000); // Check every 10 seconds
    }

    /**
     * Clean up all resources associated with a task
     */
    private cleanupTaskResources(taskId: string): void {
        const task = this.tasks.get(taskId);
        if (!task) return;

        // Clear timeout if exists
        if (task.timeoutHandle) {
            clearTimeout(task.timeoutHandle);
            task.timeoutHandle = undefined;
        }

        // Clear health check interval if exists
        if (task.healthCheckInterval) {
            clearInterval(task.healthCheckInterval);
            task.healthCheckInterval = undefined;
        }

        // Clear generator and agent references
        task.taskGenerator = undefined;
        task.taskAgent = undefined;

        // Remove from watchdog
        const watchdog = getWatchdog();
        watchdog.unwatchTask(taskId);

        logger.debug(`Cleaned up resources for task ${taskId}`);
    }

    /**
     * Start health check interval for all tasks
     */
    private startHealthCheckInterval(): void {
        this.healthCheckInterval = setInterval(() => {
            this.checkAllTasksHealth();
        }, this.HEALTH_CHECK_INTERVAL_MS);
    }

    /**
     * Check health of all running tasks
     */
    private checkAllTasksHealth(): void {
        const now = Date.now();
        let stuckCount = 0;
        let runningCount = 0;

        for (const [taskId, task] of this.tasks.entries()) {
            if (task.status === 'running') {
                runningCount++;

                // Check if task is stuck
                if (task.lastActivityTime) {
                    const timeSinceActivity =
                        now - task.lastActivityTime.getTime();
                    if (timeSinceActivity > this.STUCK_TASK_THRESHOLD_MS) {
                        stuckCount++;
                        logger.warn(
                            `Task ${taskId} may be stuck (inactive for ${Math.round(timeSinceActivity / 1000)}s)`
                        );

                        // Auto-fail tasks that are stuck for too long
                        if (timeSinceActivity > this.TASK_TIMEOUT_MS) {
                            logger.error(
                                `Task ${taskId} auto-failed due to inactivity`
                            );
                            task.status = 'failed';
                            task.output = `ERROR: Task auto-failed after ${Math.round(timeSinceActivity / 1000)} seconds of inactivity`;
                            task.completedAt = new Date();
                            this.cleanupTaskResources(taskId);
                        }
                    }
                }

                // Check if task has been running too long overall
                if (task.startedAt) {
                    const runtime = now - task.startedAt.getTime();
                    const maxRuntime = 10 * 60 * 1000; // 10 minutes max
                    if (runtime > maxRuntime) {
                        logger.error(
                            `Task ${taskId} exceeded maximum runtime of ${maxRuntime / 1000} seconds`
                        );
                        task.status = 'failed';
                        task.output = `ERROR: Task exceeded maximum runtime of ${maxRuntime / 1000} seconds`;
                        task.completedAt = new Date();
                        this.cleanupTaskResources(taskId);

                        // Abort the task
                        if (task.abortController) {
                            task.abortController.abort();
                        }
                    }
                }
            }
        }

        if (runningCount > 0) {
            logger.debug(
                `Health check: ${runningCount} running tasks, ${stuckCount} potentially stuck`
            );
        }
    }

    /**
     * Setup global error handlers
     */
    private setupGlobalErrorHandlers(): void {
        // Handle uncaught exceptions in tasks
        process.on('uncaughtException', error => {
            logger.error('Uncaught exception in task manager:', error);
            // Mark all running tasks as failed
            this.failAllRunningTasks('Uncaught exception: ' + error.message);
        });

        process.on('unhandledRejection', reason => {
            logger.error('Unhandled rejection in task manager:', reason);
            // Log but don't fail all tasks for rejections
        });
    }

    /**
     * Fail all running tasks (used in catastrophic scenarios)
     */
    private failAllRunningTasks(reason: string): void {
        for (const [taskId, task] of this.tasks.entries()) {
            if (task.status === 'running') {
                logger.error(`Force-failing task ${taskId}: ${reason}`);
                task.status = 'failed';
                task.output = `ERROR: ${reason}`;
                task.completedAt = new Date();
                this.cleanupTaskResources(taskId);

                // Abort the task
                if (task.abortController) {
                    task.abortController.abort();
                }
            }
        }
    }

    /**
     * Stop cleanup interval (for shutdown)
     */
    public stopCleanup(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        // Stop watchdog
        stopWatchdog();

        // Clean up all running tasks on shutdown
        this.failAllRunningTasks('Server shutting down');
    }

    /**
     * Get statistics
     */
    public getStats(): {
        total: number;
        pending: number;
        running: number;
        completed: number;
        failed: number;
        cancelled: number;
    } {
        const stats = {
            total: this.tasks.size,
            pending: 0,
            running: 0,
            completed: 0,
            failed: 0,
            cancelled: 0,
        };

        for (const task of this.tasks.values()) {
            stats[task.status]++;
        }

        return stats;
    }
}
