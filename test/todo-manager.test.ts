import { describe, it, expect, beforeEach } from 'vitest';
import { TodoManager } from '../src/todo-manager.js';

describe('TodoManager', () => {
    let todoManager: TodoManager;
    let tools: any;
    let todoAdd: any;
    let todoUpdate: any;
    let todoDelete: any;
    let todoClear: any;

    beforeEach(() => {
        // Create a new TodoManager instance for each test
        todoManager = new TodoManager();
        tools = todoManager.getTodoTools();
        
        // Extract the actual functions from tool objects
        todoAdd = tools[0].function;
        todoUpdate = tools[1].function;
        const todoComplete = tools[2].function;
        todoDelete = tools[3].function;
        todoClear = tools[4].function;
    });

    describe('todoAddTool', () => {
        it('should add a single todo', async () => {
            const result = await todoAdd(['First task']);
            expect(result).toContain('Added 1 todo');
            expect(result).toContain('[todo-1] First task');
            
            const todos = todoManager.getTodos();
            expect(todos).toHaveLength(1);
            expect(todos[0].content).toBe('First task');
            expect(todos[0].status).toBe('pending');
        });

        it('should add multiple todos at once', async () => {
            const result = await todoAdd(['Task 1', 'Task 2', 'Task 3']);
            expect(result).toContain('Added 3 todos');
            
            const todos = todoManager.getTodos();
            expect(todos).toHaveLength(3);
            expect(todos[0].content).toBe('Task 1');
            expect(todos[2].content).toBe('Task 3');
        });

        it('should generate sequential IDs', async () => {
            await todoAdd(['First']);
            await todoAdd(['Second', 'Third']);
            
            const todos = todoManager.getTodos();
            expect(todos[0].id).toBe('todo-1');
            expect(todos[1].id).toBe('todo-2');
            expect(todos[2].id).toBe('todo-3');
        });
    });

    describe('todoUpdateTool', () => {
        it('should update a single todo status', async () => {
            await todoAdd(['Task to complete']);
            
            const result = await todoUpdate('todo-1', { status: 'completed' });
            expect(result).toContain('Updated todo todo-1');
            
            const todos = todoManager.getTodos();
            expect(todos[0].status).toBe('completed');
        });

        it('should update multiple todos at once', async () => {
            await todoAdd(['Task 1', 'Task 2', 'Task 3']);
            
            // Update each todo separately as the tool doesn't support bulk updates
            await todoUpdate('todo-1', { status: 'in_progress' });
            const result = await todoUpdate('todo-3', { status: 'completed' });
            
            const todos = todoManager.getTodos();
            expect(todos[0].status).toBe('in_progress');
            expect(todos[1].status).toBe('pending');
            expect(todos[2].status).toBe('completed');
        });

        it('should update content and status', async () => {
            await todoAdd(['Original task']);
            
            const result = await todoUpdate('todo-1', { 
                content: 'Updated task', 
                status: 'in_progress' 
            });
            
            const todos = todoManager.getTodos();
            expect(todos[0].content).toBe('Updated task');
            expect(todos[0].status).toBe('in_progress');
        });

        it('should handle not found IDs gracefully', async () => {
            await todoAdd(['Task 1']);
            
            await todoUpdate('todo-1', { status: 'completed' });
            const result = await todoUpdate('todo-999', { status: 'completed' });
            expect(result).toContain('Todo with ID todo-999 not found');
        });
    });

    describe('todoDeleteTool', () => {
        it('should delete a single todo', async () => {
            await todoAdd(['Task 1', 'Task 2', 'Task 3']);
            
            const result = await todoDelete(['todo-2']);
            expect(result).toContain('Deleted 1 todo');
            expect(result).toContain('todo-2');
            
            const todos = todoManager.getTodos();
            expect(todos).toHaveLength(2);
            expect(todos[0].content).toBe('Task 1');
            expect(todos[1].content).toBe('Task 3');
        });

        it('should delete multiple todos at once', async () => {
            await todoAdd(['Task 1', 'Task 2', 'Task 3', 'Task 4']);
            
            const result = await todoDelete(['todo-1', 'todo-3']);
            expect(result).toContain('Deleted 2 todos');
            
            const todos = todoManager.getTodos();
            expect(todos).toHaveLength(2);
            expect(todos[0].content).toBe('Task 2');
            expect(todos[1].content).toBe('Task 4');
        });

        it('should handle not found IDs gracefully', async () => {
            await todoAdd(['Task 1']);
            
            const result = await todoDelete(['todo-1', 'todo-999']);
            expect(result).toContain('Deleted 1 todo');
            expect(result).toContain('Not found: todo-999');
            
            const todos = todoManager.getTodos();
            expect(todos).toHaveLength(0);
        });
    });

    describe('todoClearTool', () => {
        it('should clear all todos', async () => {
            await todoAdd(['Task 1', 'Task 2', 'Task 3']);
            
            const result = await todoClear();
            expect(result).toBe('Cleared 3 todos');
            
            const todos = todoManager.getTodos();
            expect(todos).toHaveLength(0);
        });

        it('should reset ID counter after clearing', async () => {
            await todoAdd(['First batch']);
            await todoClear();
            await todoAdd(['Second batch']);
            
            const todos = todoManager.getTodos();
            expect(todos[0].id).toBe('todo-1'); // ID counter reset
        });

        it('should handle clearing empty list', async () => {
            const result = await todoClear();
            expect(result).toBe('Todo list was already empty');
        });
    });

    describe('Multiple isolated instances', () => {
        it('should maintain separate todo lists for different agents', async () => {
            // Create two separate TodoManager instances
            const manager1 = new TodoManager();
            const manager2 = new TodoManager();
            
            const tools1 = manager1.getTodoTools();
            const tools2 = manager2.getTodoTools();
            
            const add1 = tools1[0].function;
            const add2 = tools2[0].function;
            
            // Add different todos to each manager
            await add1(['Manager 1 task']);
            await add2(['Manager 2 task 1', 'Manager 2 task 2']);
            
            // Verify each manager has its own isolated state
            expect(manager1.getTodos()).toHaveLength(1);
            expect(manager1.getTodos()[0].content).toBe('Manager 1 task');
            
            expect(manager2.getTodos()).toHaveLength(2);
            expect(manager2.getTodos()[0].content).toBe('Manager 2 task 1');
        });
    });

    describe('onRequest handler', () => {
        it('should inject todo status into messages', async () => {
            await todoAdd(['In progress task', 'Pending task']);
            await todoUpdate('todo-1', { status: 'in_progress' });

            const handler = todoManager.getOnRequestHandler();
            const agent = { name: 'TestAgent' };
            const messages: any[] = [];

            const [, updatedMessages] = await handler(agent as any, messages);

            expect(updatedMessages).toHaveLength(1);
            expect(updatedMessages[0].role).toBe('developer');
            expect(updatedMessages[0].content).toContain('Current Todo List');
            expect(updatedMessages[0].content).toContain('In Progress:');
            expect(updatedMessages[0].content).toContain('[todo-1] In progress task');
            expect(updatedMessages[0].content).toContain('Pending:');
            expect(updatedMessages[0].content).toContain('[todo-2] Pending task');
        });

        it('should not inject anything when no todos exist', async () => {
            const handler = todoManager.getOnRequestHandler();
            const agent = { name: 'TestAgent' };
            const messages: any[] = [];

            const [, updatedMessages] = await handler(agent as any, messages);

            expect(updatedMessages).toHaveLength(0);
        });

        it('should show completed todos', async () => {
            await todoAdd(['Task 1', 'Task 2']);
            await todoUpdate('todo-1', { status: 'completed' });
            await todoUpdate('todo-2', { status: 'in_progress' });

            const handler = todoManager.getOnRequestHandler();
            const messages: any[] = [];

            const [, updatedMessages] = await handler({ name: 'Test' } as any, messages);

            expect(updatedMessages[0].content).toContain('Completed:');
            expect(updatedMessages[0].content).toContain('[todo-1] ✓ Task 1');
        });
    });

    describe('Workflow examples', () => {
        it('should support typical task workflow', async () => {
            // Add initial tasks
            await todoAdd(['Research the problem', 'Design solution', 'Implement', 'Test']);
            
            // Start working on first task
            await todoUpdate('todo-1', { status: 'in_progress' });
            
            // Complete first task and start second
            await todoUpdate('todo-1', { status: 'completed' });
            await todoUpdate('todo-2', { status: 'in_progress' });
            
            // Add more detailed subtasks
            await todoAdd(['Design database schema', 'Design API endpoints']);
            
            // Complete design tasks
            await todoUpdate('todo-2', { status: 'completed' });
            await todoUpdate('todo-5', { status: 'completed' });
            await todoUpdate('todo-6', { status: 'completed' });
            
            // Remove completed design tasks to clean up
            await todoDelete(['todo-2', 'todo-5', 'todo-6']);
            
            const todos = todoManager.getTodos();
            expect(todos).toHaveLength(3);
            expect(todos.filter(t => t.status === 'completed')).toHaveLength(1);
        });
    });
});