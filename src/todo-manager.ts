/**
 * TodoManager - Creates isolated todo management for each agent instance
 * Each agent gets its own TodoManager with private todo state
 */

import { createToolFunction } from '@just-every/ensemble';
import type { AgentDefinition, ResponseInput } from '@just-every/ensemble';

interface Todo {
    id: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
}

export class TodoManager {
    // Private todo list for this specific agent instance
    private todos: Todo[] = [];
    private nextId: number = 1;

    /**
     * Generate a unique ID for a new todo
     */
    private generateId(): string {
        return `todo-${this.nextId++}`;
    }

    /**
     * Create todo tools bound to this instance's todo list
     */
    getTodoTools() {
        // todo_add - Add one or more new todos
        const todoAddTool = createToolFunction(
            async (items: string[]) => {
                try {
                    const newTodos: Todo[] = [];

                    for (const content of items) {
                        const todo: Todo = {
                            id: this.generateId(),
                            content: content.trim(),
                            status: 'pending',
                        };
                        this.todos.push(todo);
                        newTodos.push(todo);
                    }

                    return `Added ${newTodos.length} todo${newTodos.length === 1 ? '' : 's'}: ${newTodos.map(t => `[${t.id}] ${t.content}`).join(', ')}`;
                } catch (error: any) {
                    return `Error adding todos: ${error.message}`;
                }
            },
            'Add one or more new todos to the list',
            {
                items: {
                    type: 'array',
                    description: 'Todo items to add',
                    items: {
                        type: 'string',
                    },
                },
            },
            'string',
            'todo_add',
            false
        );

        // todo_update - Update status or content of a specific todo
        const todoUpdateTool = createToolFunction(
            async (
                id: string,
                updates: {
                    content?: string;
                    status?: 'pending' | 'in_progress' | 'completed';
                }
            ) => {
                try {
                    const todoIndex = this.todos.findIndex(t => t.id === id);

                    if (todoIndex === -1) {
                        return `Todo with ID ${id} not found`;
                    }

                    // Update the todo
                    if (updates.content !== undefined) {
                        this.todos[todoIndex].content = updates.content;
                    }
                    if (updates.status !== undefined) {
                        this.todos[todoIndex].status = updates.status;
                    }

                    return `Updated todo ${id}`;
                } catch (error: any) {
                    return `Error updating todo: ${error.message}`;
                }
            },
            'Update the status or content of a todo',
            {
                id: {
                    type: 'string',
                    description: 'Todo ID to update',
                },
                updates: {
                    type: 'object',
                    description: 'Updates to apply',
                    properties: {
                        content: {
                            type: 'string',
                            description: 'New content (optional)',
                        },
                        status: {
                            type: 'string',
                            enum: ['pending', 'in_progress', 'completed'],
                            description: 'New status (optional)',
                        },
                    },
                },
            },
            'string',
            'todo_update',
            false
        );

        // todo_complete - Mark todos as completed (convenience function)
        const todoCompleteTool = createToolFunction(
            async (ids: string[]) => {
                try {
                    const completedIds: string[] = [];
                    const notFoundIds: string[] = [];

                    for (const id of ids) {
                        const todoIndex = this.todos.findIndex(
                            t => t.id === id
                        );

                        if (todoIndex === -1) {
                            notFoundIds.push(id);
                            continue;
                        }

                        this.todos[todoIndex].status = 'completed';
                        completedIds.push(id);
                    }

                    let result = '';
                    if (completedIds.length > 0) {
                        result += `Marked ${completedIds.length} todo${completedIds.length === 1 ? '' : 's'} as completed: ${completedIds.join(', ')}`;
                    }
                    if (notFoundIds.length > 0) {
                        if (result) result += '. ';
                        result += `Not found: ${notFoundIds.join(', ')}`;
                    }
                    return result || 'No todos marked as completed';
                } catch (error: any) {
                    return `Error completing todos: ${error.message}`;
                }
            },
            'Mark one or more todos as completed',
            {
                ids: {
                    type: 'array',
                    description: 'Todo IDs to mark as completed',
                    items: {
                        type: 'string',
                    },
                },
            },
            'string',
            'todo_complete',
            false
        );

        // todo_delete - Remove specific todos
        const todoDeleteTool = createToolFunction(
            async (ids: string[]) => {
                try {
                    const deletedIds: string[] = [];
                    const notFoundIds: string[] = [];

                    for (const id of ids) {
                        const todoIndex = this.todos.findIndex(
                            t => t.id === id
                        );

                        if (todoIndex === -1) {
                            notFoundIds.push(id);
                            continue;
                        }

                        this.todos.splice(todoIndex, 1);
                        deletedIds.push(id);
                    }

                    let result = '';
                    if (deletedIds.length > 0) {
                        result += `Deleted ${deletedIds.length} todo${deletedIds.length === 1 ? '' : 's'}: ${deletedIds.join(', ')}`;
                    }
                    if (notFoundIds.length > 0) {
                        if (result) result += '. ';
                        result += `Not found: ${notFoundIds.join(', ')}`;
                    }
                    return result || 'No todos deleted';
                } catch (error: any) {
                    return `Error deleting todos: ${error.message}`;
                }
            },
            'Delete one or more todos by ID',
            {
                ids: {
                    type: 'array',
                    description: 'Todo IDs to delete',
                    items: {
                        type: 'string',
                    },
                },
            },
            'string',
            'todo_delete',
            false
        );

        // todo_clear - Clear all todos
        const todoClearTool = createToolFunction(
            async () => {
                try {
                    const count = this.todos.length;
                    this.todos = [];
                    this.nextId = 1; // Reset ID counter
                    return count > 0
                        ? `Cleared ${count} todo${count === 1 ? '' : 's'}`
                        : 'Todo list was already empty';
                } catch (error: any) {
                    return `Error clearing todos: ${error.message}`;
                }
            },
            'Clear all todos from the list',
            {},
            'string',
            'todo_clear',
            false
        );

        return [
            todoAddTool,
            todoUpdateTool,
            todoCompleteTool,
            todoDeleteTool,
            todoClearTool,
        ];
    }

    /**
     * Create onRequest handler that injects current todo state
     */
    getOnRequestHandler() {
        return async (
            agent: AgentDefinition,
            messages: ResponseInput
        ): Promise<[AgentDefinition, ResponseInput]> => {
            // Add current todo status to messages if there are todos
            if (this.todos.length > 0) {
                const todoStatus = this.formatTodoStatus();
                messages.push({
                    type: 'message',
                    role: 'developer',
                    content: todoStatus,
                });
            }

            return [agent, messages];
        };
    }

    /**
     * Format todos into a status message
     */
    private formatTodoStatus(): string {
        const pending = this.todos.filter(t => t.status === 'pending');
        const inProgress = this.todos.filter(t => t.status === 'in_progress');
        const completed = this.todos.filter(t => t.status === 'completed');

        let status = '## Current Todo List\n\n';

        if (inProgress.length > 0) {
            status += '### In Progress:\n';
            inProgress.forEach(t => {
                status += `- [${t.id}] ${t.content}\n`;
            });
            status += '\n';
        }

        if (pending.length > 0) {
            status += '### Pending:\n';
            pending.forEach(t => {
                status += `- [${t.id}] ${t.content}\n`;
            });
            status += '\n';
        }

        if (completed.length > 0) {
            status += '### Completed:\n';
            completed.forEach(t => {
                status += `- [${t.id}] ✓ ${t.content}\n`;
            });
        }

        return status;
    }

    /**
     * Get current todos (for debugging/monitoring)
     */
    getTodos(): Todo[] {
        return [...this.todos];
    }
}

/**
 * Usage Example:
 * ```typescript
 * const todoManager = new TodoManager();
 * const agent = new Agent({
 *     name: 'TaskRunner',
 *     modelClass: 'standard',
 *     instructions: '...',
 *     tools: [...otherTools, ...todoManager.getTodoTools()],
 *     onRequest: todoManager.getOnRequestHandler(),
 * });
 *
 * // Agent can use:
 * // - todo_add(["Implement feature X"]) or todo_add(["Task 1", "Task 2"])
 * // - todo_update("todo-1", {status: "completed"})
 * // - todo_complete(["todo-1"]) or todo_complete(["todo-1", "todo-2"])
 * // - todo_delete(["todo-1"]) or todo_delete(["todo-1", "todo-2"])
 * // - todo_clear()
 * ```
 */
