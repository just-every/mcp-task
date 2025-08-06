/**
 * Example of using onRequest to add todo support to task execution
 *
 * This demonstrates how todos can be managed through the onRequest hook
 * similar to the pattern used in experience-agent.ts
 */

import type { AgentDefinition, ResponseInput } from '@just-every/ensemble';

interface Todo {
    id: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
}

/**
 * Example onRequest handler that adds todo context to agent messages
 * This would be used when creating an Agent instance
 */
export const todoOnRequest = (todos: Todo[]) => {
    return async (
        agent: AgentDefinition,
        messages: ResponseInput
    ): Promise<[AgentDefinition, ResponseInput]> => {
        // Add current todo status to messages
        if (todos.length > 0) {
            const todoStatus = formatTodoStatus(todos);
            messages.push({
                type: 'message',
                role: 'developer',
                content: todoStatus,
            });
        }

        return [agent, messages];
    };
};

/**
 * Format todos into a status message for the agent
 */
function formatTodoStatus(todos: Todo[]): string {
    const pending = todos.filter(t => t.status === 'pending');
    const inProgress = todos.filter(t => t.status === 'in_progress');
    const completed = todos.filter(t => t.status === 'completed');

    let status = '## Current Task Status\n\n';

    if (inProgress.length > 0) {
        status += '### In Progress:\n';
        inProgress.forEach(t => {
            status += `- ${t.content}\n`;
        });
        status += '\n';
    }

    if (pending.length > 0) {
        status += '### Pending:\n';
        pending.forEach(t => {
            status += `- ${t.content}\n`;
        });
        status += '\n';
    }

    if (completed.length > 0) {
        status += '### Completed:\n';
        completed.forEach(t => {
            status += `- ✓ ${t.content}\n`;
        });
    }

    return status;
}

/**
 * Example of how to use this with an Agent:
 *
 * ```typescript
 * import { Agent } from '@just-every/ensemble';
 * import { todoOnRequest } from './todo-support.js';
 *
 * const todos = [
 *     { id: '1', content: 'Implement feature X', status: 'pending' },
 *     { id: '2', content: 'Write tests', status: 'pending' },
 * ];
 *
 * const agent = new Agent({
 *     name: 'TaskAgent',
 *     modelClass: 'standard',
 *     instructions: 'Complete the tasks in the todo list',
 *     tools: [...],
 *     onRequest: todoOnRequest(todos),
 * });
 * ```
 */
