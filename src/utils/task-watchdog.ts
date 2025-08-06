/**
 * Task Watchdog - Additional safety layer for task execution
 * Monitors tasks and ensures they don't get stuck
 */

import { logger } from './logger.js';
import type { TaskInfo } from './task-manager.js';

export interface WatchdogConfig {
    maxRuntime?: number; // Maximum runtime in ms (default: 10 minutes)
    maxInactivity?: number; // Maximum inactivity in ms (default: 2 minutes)
    maxErrors?: number; // Maximum consecutive errors (default: 3)
    checkInterval?: number; // Check interval in ms (default: 10 seconds)
}

export class TaskWatchdog {
    private config: Required<WatchdogConfig>;
    private watchedTasks: Map<string, WatchdogEntry> = new Map();
    private checkInterval: NodeJS.Timeout | null = null;

    constructor(config: WatchdogConfig = {}) {
        this.config = {
            maxRuntime: config.maxRuntime || 5 * 60 * 60 * 1000, // 5 hours
            maxInactivity: config.maxInactivity || 5 * 60 * 1000, // 5 minutes
            maxErrors: config.maxErrors || 3,
            checkInterval: config.checkInterval || 30 * 1000, // 30 seconds (reasonable for 5-min inactivity detection)
        };
    }

    /**
     * Start monitoring tasks
     */
    public start(): void {
        if (this.checkInterval) {
            return; // Already running
        }

        this.checkInterval = setInterval(() => {
            this.checkTasks();
        }, this.config.checkInterval);

        logger.info('Task watchdog started');
    }

    /**
     * Stop monitoring
     */
    public stop(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.watchedTasks.clear();
        logger.info('Task watchdog stopped');
    }

    /**
     * Register a task for monitoring
     */
    public watchTask(taskId: string, task: TaskInfo): void {
        this.watchedTasks.set(taskId, {
            taskId,
            startTime: Date.now(),
            lastActivity: Date.now(),
            errorCount: 0,
            task,
        });
        logger.debug(`Watchdog: Now monitoring task ${taskId}`);
    }

    /**
     * Update task activity
     */
    public updateActivity(taskId: string): void {
        const entry = this.watchedTasks.get(taskId);
        if (entry) {
            entry.lastActivity = Date.now();
            entry.errorCount = 0; // Reset error count on activity
        }
    }

    /**
     * Record task error
     */
    public recordError(taskId: string, error: string): void {
        const entry = this.watchedTasks.get(taskId);
        if (entry) {
            entry.errorCount++;
            entry.lastError = error;
            logger.warn(
                `Watchdog: Task ${taskId} error #${entry.errorCount}: ${error}`
            );
        }
    }

    /**
     * Remove task from monitoring
     */
    public unwatchTask(taskId: string): void {
        this.watchedTasks.delete(taskId);
        logger.debug(`Watchdog: Stopped monitoring task ${taskId}`);
    }

    /**
     * Check all monitored tasks
     */
    private checkTasks(): void {
        const now = Date.now();

        for (const [taskId, entry] of this.watchedTasks.entries()) {
            const taskViolations = this.checkTaskViolations(entry, now);

            if (taskViolations.length > 0) {
                logger.error(
                    `Watchdog: Task ${taskId} violations detected:`,
                    taskViolations
                );
                this.handleViolations(taskId, entry, taskViolations);
            }
        }
    }

    /**
     * Check for task violations
     */
    private checkTaskViolations(entry: WatchdogEntry, now: number): string[] {
        const violations: string[] = [];

        // Check runtime
        const runtime = now - entry.startTime;
        if (runtime > this.config.maxRuntime) {
            violations.push(
                `Runtime exceeded: ${Math.round(runtime / 1000)}s > ${this.config.maxRuntime / 1000}s`
            );
        }

        // Check inactivity
        const inactivity = now - entry.lastActivity;
        if (inactivity > this.config.maxInactivity) {
            violations.push(
                `Inactivity exceeded: ${Math.round(inactivity / 1000)}s > ${this.config.maxInactivity / 1000}s`
            );
        }

        // Check error count
        if (entry.errorCount >= this.config.maxErrors) {
            violations.push(
                `Error count exceeded: ${entry.errorCount} >= ${this.config.maxErrors}`
            );
        }

        return violations;
    }

    /**
     * Handle task violations
     */
    private handleViolations(
        taskId: string,
        entry: WatchdogEntry,
        violations: string[]
    ): void {
        // Log detailed violation info
        logger.error(
            `Watchdog: Force-failing task ${taskId} due to violations:`,
            {
                taskId,
                runtime:
                    Math.round((Date.now() - entry.startTime) / 1000) + 's',
                inactivity:
                    Math.round((Date.now() - entry.lastActivity) / 1000) + 's',
                errorCount: entry.errorCount,
                lastError: entry.lastError,
                violations,
            }
        );

        // Update task status if we have access
        if (entry.task) {
            entry.task.status = 'failed';
            entry.task.output = `ERROR: Task force-failed by watchdog. Violations: ${violations.join(', ')}`;
            entry.task.completedAt = new Date();

            // Abort the task if possible
            if (entry.task.abortController) {
                try {
                    entry.task.abortController.abort();
                } catch (e) {
                    logger.error(
                        `Watchdog: Failed to abort task ${taskId}:`,
                        e
                    );
                }
            }
        }

        // Remove from monitoring
        this.unwatchTask(taskId);
    }

    /**
     * Get watchdog statistics
     */
    public getStats(): {
        monitored: number;
        violations: number;
        averageRuntime: number;
    } {
        const now = Date.now();
        let totalRuntime = 0;
        let violationCount = 0;

        for (const entry of this.watchedTasks.values()) {
            totalRuntime += now - entry.startTime;
            if (this.checkTaskViolations(entry, now).length > 0) {
                violationCount++;
            }
        }

        return {
            monitored: this.watchedTasks.size,
            violations: violationCount,
            averageRuntime:
                this.watchedTasks.size > 0
                    ? Math.round(totalRuntime / this.watchedTasks.size / 1000)
                    : 0,
        };
    }
}

interface WatchdogEntry {
    taskId: string;
    startTime: number;
    lastActivity: number;
    errorCount: number;
    lastError?: string;
    task: TaskInfo;
}

// Singleton instance
let watchdogInstance: TaskWatchdog | null = null;

/**
 * Get or create the watchdog instance
 */
export function getWatchdog(config?: WatchdogConfig): TaskWatchdog {
    if (!watchdogInstance) {
        watchdogInstance = new TaskWatchdog(config);
        watchdogInstance.start();
    }
    return watchdogInstance;
}

/**
 * Stop and cleanup the watchdog
 */
export function stopWatchdog(): void {
    if (watchdogInstance) {
        watchdogInstance.stop();
        watchdogInstance = null;
    }
}
