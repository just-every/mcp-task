# @just-every/mcp-task

Async MCP server for running long-running AI tasks with real-time progress monitoring.

[![npm version](https://badge.fury.io/js/@just-every%2Fmcp-task.svg)](https://www.npmjs.com/package/@just-every/mcp-task)

## Overview

This MCP (Model Context Protocol) server enables asynchronous execution of complex AI tasks using the `@just-every/task` package. It provides a non-blocking interface for running tasks with different AI models, returning task IDs immediately and allowing clients to monitor progress in real-time.

## Features

- **Async Task Execution**: Non-blocking task execution with immediate task ID return
- **Real-time Progress Monitoring**: Live status updates using `taskStatus()` function
- **Flexible Model Support**: Use model classes or specific models (claude-opus-4, grok-4, o3, etc.)
- **Task Management**: Complete lifecycle management with status checking, cancellation, and result retrieval
- **Integrated Tools**: Built-in web search and command execution capabilities
- **Robust Error Handling**: Proper event handling for task completion and failures

## Installation

### Claude Code

```bash
claude mcp add task-runner -s user -- npx -y @just-every/mcp-task
```

### VS Code

```bash
code --add-mcp '{"name":"task-runner","command":"npx","args":["-y","@just-every/mcp-task"]}'
```

### Raw JSON (works in any MCP client)

```json
{
  "mcpServers": {
    "task-runner": {
      "command": "npx",
      "args": ["-y", "@just-every/mcp-task"]
    }
  }
}
```

## Available Tools

### `run_task`

Start a long-running AI task asynchronously. Returns a task ID immediately.

**Parameters:**
- `task` (required): The task prompt - what to perform
- `model` (optional): Model class or specific model name
- `context` (optional): Background context for the task
- `output` (optional): The desired output/success state

**Returns:** Task ID for monitoring progress

### `check_task_status`

Check the status of a running task with real-time progress updates.

**Parameters:**
- `task_id` (required): The task ID returned from run_task

**Returns:** Current status, progress summary, recent events, and tool calls

### `get_task_result`

Get the final result of a completed task.

**Parameters:**
- `task_id` (required): The task ID returned from run_task

**Returns:** The complete output from the task

### `cancel_task`

Cancel a pending or running task.

**Parameters:**
- `task_id` (required): The task ID to cancel

**Returns:** Cancellation status

### `list_tasks`

List all tasks with their current status.

**Parameters:**
- `status_filter` (optional): Filter by status (pending, running, completed, failed, cancelled)

**Returns:** Task statistics and summaries

## Example Workflow

```javascript
// 1. Start a task
const startResponse = await callTool('run_task', {
  "model": "standard",
  "task": "Search for the latest AI news and summarize",
  "output": "A bullet-point summary of 5 recent AI developments"
});
// Returns: { "task_id": "abc-123", "status": "pending", ... }

// 2. Check progress
const statusResponse = await callTool('check_task_status', {
  "task_id": "abc-123"
});
// Returns: { "status": "running", "progress": "Searching for AI news...", ... }

// 3. Get result when complete
const resultResponse = await callTool('get_task_result', {
  "task_id": "abc-123"
});
// Returns: The complete summary
```

## Supported Models

### Model Classes
- `reasoning`: Complex reasoning and analysis
- `vision`: Image and visual processing
- `standard`: General purpose tasks
- `mini`: Lightweight, fast responses
- `reasoning_mini`: Lightweight reasoning
- `code`: Code generation and analysis
- `writing`: Creative and professional writing
- `summary`: Text summarization
- `vision_mini`: Lightweight vision processing
- `long`: Long-form content generation

### Popular Models
- `claude-opus-4`: Anthropic's most powerful model
- `grok-4`: xAI's latest Grok model
- `gemini-2.5-pro`: Google's Gemini Pro
- `o3`, `o3-pro`: OpenAI's o3 models
- And any other model name supported by @just-every/ensemble

## Integrated Tools

Tasks have access to:
- **Web Search**: Search the web for information using `@just-every/search`
- **Command Execution**: Run shell commands via the `run_command` tool

## Environment Variables

Create a `.env` file with your API keys:

```bash
# Required for AI models
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key  
GROK_API_KEY=your-grok-key

# Optional for search functionality
SERPER_API_KEY=your-serper-key
PERPLEXITY_API_KEY=your-perplexity-key
```

## Task Lifecycle

1. **Pending**: Task created and queued
2. **Running**: Task is being executed with live progress via `taskStatus()`
3. **Completed**: Task finished successfully
4. **Failed**: Task encountered an error
5. **Cancelled**: Task was cancelled by user

Tasks are automatically cleaned up after 24 hours.

## Development

### Setup

```bash
# Install dependencies
npm install

# Build for production
npm run build
```

### Development Mode

```bash
# Run in development mode
npm run serve:dev
```

### Testing

```bash
# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
```

## Architecture

```
mcp-task/
├── src/
│   ├── serve.ts            # MCP server implementation
│   ├── index.ts            # CLI entry point
│   └── utils/
│       ├── task-manager.ts # Async task lifecycle management
│       └── logger.ts       # Logging utilities
├── bin/
│   └── mcp-task.js         # Executable entry
└── package.json
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## Troubleshooting

### Task Not Progressing
- Check task status with `check_task_status` to see live progress
- Look for error messages prefixed with "ERROR:" in the output
- Verify API keys are properly configured in `.env`

### Model Not Found
- Ensure model name is correctly spelled
- Check that required API keys are set for the model provider
- Popular models: claude-opus-4, grok-4, gemini-2.5-pro, o3

### Task Cleanup
- Completed tasks are automatically cleaned up after 24 hours
- Use `list_tasks` to see all active and recent tasks
- Cancel stuck tasks with `cancel_task`

## License

MIT