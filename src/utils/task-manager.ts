/**
 * Task Manager for handling async long-running tasks
 */

import { v4 as uuid } from 'uuid';
import { runTask, taskStatus } from '@just-every/task';
import type { Agent } from '@just-every/ensemble';
import { logger } from './logger.js';

export interface TaskInfo {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    model?: string;
    modelClass?: string;
    context?: string;
    task: string;
    output?: string; // Final output from task_complete or error from task_fatal_error
    createdAt: Date;
    startedAt?: Date;
    completedAt?: Date;
    messages: Array<{
        type: string;
        content?: any;
        timestamp: string;
    }>;
    progress?: string; // Summary from taskStatus() when available
    finalState?: any;
    abortController?: AbortController;
    taskGenerator?: any; // Store the generator for taskStatus() calls
    taskAgent?: Agent; // Store the agent for taskStatus() calls
    lastStatusUpdate?: Date; // Track when we last called taskStatus()
}

export class TaskManager {
    private static instance: TaskManager;
    private tasks: Map<string, TaskInfo> = new Map();
    private cleanupInterval: NodeJS.Timeout | null = null;
    private readonly MAX_TASK_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
    private readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

    private constructor() {
        // Start cleanup interval
        this.startCleanupInterval();
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
        model?: string;
        modelClass?: string;
        context?: string;
        task: string;
        output?: string;
    }): string {
        const taskId = uuid();
        const taskInfo: TaskInfo = {
            id: taskId,
            status: 'pending',
            model: params.model,
            modelClass: params.modelClass,
            context: params.context,
            task: params.task,
            output: params.output,
            createdAt: new Date(),
            messages: [],
            abortController: new AbortController(),
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
        task.taskAgent = agent; // Store agent for taskStatus() calls
        logger.info(`Starting execution of task ${taskId}`);

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

                // Store all events in messages for full history
                task.messages.push({
                    type: event.type,
                    content: event,
                    timestamp: new Date().toISOString(),
                });

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
                        errorEvent.error?.message || 'Unknown error';
                    task.output = `ERROR: ${errorMessage}`;
                    task.status = 'failed';
                    task.completedAt = new Date();
                    logger.error(`Task ${taskId} failed: ${errorMessage}`);
                    break;
                } else if (event.type === 'message_complete') {
                    // Most LLMs use message_complete, not message_delta
                    const messageEvent = event as any;
                    logger.debug(
                        `Message complete: ${messageEvent.content?.substring(0, 100)}`
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
            }
        } catch (error: any) {
            task.status = 'failed';
            task.output = `ERROR: ${error.message}`;
            task.completedAt = new Date();
            task.taskGenerator = undefined;
            task.taskAgent = undefined;
            logger.error(`Task ${taskId} execution error:`, error);
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
     * Stop cleanup interval (for shutdown)
     */
    public stopCleanup(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
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
