# @just-every/mcp-task

[![npm version](https://badge.fury.io/js/%40just-every%2Fmcp-task.svg)](https://www.npmjs.com/package/@just-every/mcp-task)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Async MCP server for running long-running AI tasks with real-time progress monitoring using [@just-every/task](https://github.com/just-every/task).

## Quick Start

### 1. Create or use an environment file

Option A: Create a new `.llm.env` file in your home directory:
```bash
# Download example env file
curl -o ~/.llm.env https://raw.githubusercontent.com/just-every/mcp-task/main/.env.example

# Edit with your API keys
nano ~/.llm.env
```

Option B: Use an existing `.env` file (must use absolute path):
```bash
# Example: /Users/yourname/projects/myproject/.env
# Example: /home/yourname/workspace/.env
```

### 2. Install

#### Claude Code
```bash
# Using ~/.llm.env
claude mcp add task -s user -e ENV_FILE=$HOME/.llm.env -- npx -y @just-every/mcp-task

# Using existing .env file (absolute path required)
claude mcp add task -s user -e ENV_FILE=/absolute/path/to/your/.env -- npx -y @just-every/mcp-task

# For debugging, check if ENV_FILE is being passed correctly:
claude mcp list
```

#### Other MCP Clients
Add to your MCP configuration:
```json
{
  "mcpServers": {
    "task": {
      "command": "npx",
      "args": ["-y", "@just-every/mcp-task"],
      "env": {
        "ENV_FILE": "/path/to/.llm.env"
      }
    }
  }
}
```

## Available Tools

### `run_task`

Start a long-running AI task asynchronously. Returns a task ID immediately.

**Parameters:**
- `task` (required): The task prompt - what to perform
- `model` (optional): Model class or specific model name, or array of models for batch execution
- `context` (optional): Background context for the task
- `output` (optional): The desired output/success state
- `files` (optional): Array of file paths to include in the task context
- `read_only` (optional): When true, task runs in read-only mode (default: false)

**Returns:** 
- Single task: `{ task_id, status, message }`
- Batch execution: `{ batch_id, task_ids[], status, message }`

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

Cancel a pending or running task, or all tasks in a batch.

**Parameters:**
- `task_id` (optional): The task ID to cancel
- `batch_id` (optional): Cancel all tasks with this batch ID

**Returns:** Cancellation status and count of cancelled tasks

### `wait_for_task`

Wait for a task or any task in a batch to complete, fail, or be cancelled.

**Parameters:**
- `task_id` (optional): Wait for this specific task to complete
- `batch_id` (optional): Wait for any task in this batch to complete
- `timeout_seconds` (optional): Maximum seconds to wait (default: 300, max: 600)
- `return_all` (optional): For batch_id, return all completed tasks instead of just the first (default: false)

**Returns:** Task completion details with wait time, or timeout status

### `list_tasks`

List all tasks with their current status.

**Parameters:**
- `status_filter` (optional): Filter by status (pending, running, completed, failed, cancelled)
- `batch_id` (optional): Filter tasks by batch ID
- `recent_only` (optional): Only show tasks from the last 2 hours (default: false)

**Returns:** Task statistics and summaries with applied filters

## MCP Prompts

The server provides MCP prompts that can be used to execute complex problem-solving strategies:

### `/solve` Prompt

Solves complicated problems by running multiple state-of-the-art LLMs in parallel and implementing their solutions.

**Arguments:**
- `problem` (required): The problem to solve
- `context` (optional): Additional context about the problem  
- `files` (optional): Comma-separated list of file paths relevant to the problem

**Strategy:**
1. Starts tasks with multiple models (grok-4, gemini-2.5-pro, o3, reasoning class)
2. All tasks run in parallel to diagnose and propose solutions
3. Tasks can create test files but cannot edit existing files
4. First successful solution is implemented
5. If a solution fails, retry with feedback to the same model
6. Continues until problem is resolved

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

Task agents have access to a lightweight version of the tools available to Claude, optimized for autonomous task execution:

- **Web Search**: Search the web for information using `@just-every/search`
- **File Operations**: Read and write files, with optional read-only mode
- **Command Execution**: Run shell commands (disabled in read-only mode)
- **Code Analysis**: Search and analyze codebases

### Read-Only Mode

When `read_only: true` is specified:
- Tasks can read files, search the web, and analyze data
- Tasks cannot modify files or execute commands that change system state
- Ideal for diagnostic tasks, code review, and solution planning

## API Keys

The task runner requires API keys for the AI models you want to use. Add them to your `.llm.env` file:

```bash
# Core AI Models
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key  
XAI_API_KEY=your-xai-key           # For Grok models
GOOGLE_API_KEY=your-google-key     # For Gemini models

# Search Providers (optional, for web_search tool)
BRAVE_API_KEY=your-brave-key
PERPLEXITY_API_KEY=your-perplexity-key
OPENROUTER_API_KEY=your-openrouter-key
```

### Getting API Keys

- **Anthropic**: [console.anthropic.com](https://console.anthropic.com/)
- **OpenAI**: [platform.openai.com](https://platform.openai.com/)
- **xAI (Grok)**: [x.ai](https://x.ai/)
- **Google (Gemini)**: [makersuite.google.com](https://makersuite.google.com/)
- **Brave Search**: [brave.com/search/api](https://brave.com/search/api/)
- **Perplexity**: [perplexity.ai](https://perplexity.ai/)
- **OpenRouter**: [openrouter.ai](https://openrouter.ai/)

## Task Lifecycle

1. **Pending**: Task created and queued
2. **Running**: Task is being executed with live progress via `taskStatus()`
3. **Completed**: Task finished successfully
4. **Failed**: Task encountered an error
5. **Cancelled**: Task was cancelled by user

Tasks are automatically cleaned up after 24 hours.

## CLI Usage

The task runner can also be used directly from the command line:

```bash
# Run as MCP server (for debugging)
ENV_FILE=~/.llm.env npx @just-every/mcp-task

# Or if installed globally
npm install -g @just-every/mcp-task
ENV_FILE=~/.llm.env mcp-task serve
```

## Configuration

### Task Timeout Settings

The server includes robust safety mechanisms to prevent tasks from getting stuck. All timeouts are configurable via environment variables:

```bash
# Default production settings (optimized for long-running tasks)
TASK_TIMEOUT=18000000             # 5 hours max runtime (default)
TASK_STUCK_THRESHOLD=300000       # 5 minutes inactivity = stuck (default)
TASK_HEALTH_CHECK_INTERVAL=60000  # Check every 1 minute (default)

# For shorter tasks, you might prefer:
TASK_TIMEOUT=300000               # 5 minutes max runtime
TASK_STUCK_THRESHOLD=60000        # 1 minute inactivity
TASK_HEALTH_CHECK_INTERVAL=15000  # Check every 15 seconds

# Add to your .llm.env or pass as environment variables
```

**Safety Features:**
- **Automatic timeout**: Tasks exceeding `TASK_TIMEOUT` are automatically failed
- **Inactivity detection**: Tasks with no activity for `TASK_STUCK_THRESHOLD` are marked as stuck
- **Health monitoring**: Regular checks every `TASK_HEALTH_CHECK_INTERVAL` ensure tasks are progressing
- **Error recovery**: Uncaught exceptions and promise rejections are handled gracefully

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/just-every/mcp-task.git
cd mcp-task

# Install dependencies
npm install

# Build for production
npm run build
```

### Development Mode

```bash
# Run in development mode with your env file
ENV_FILE=~/.llm.env npm run serve:dev
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

### MCP Server Shows "Failed" in Claude

If you see "task ✘ failed" in Claude, check these common issues:

1. **Missing API Keys**: The most common issue is missing API keys. Check that your ENV_FILE is properly configured:
   ```bash
   # Test if ENV_FILE is working
   ENV_FILE=/path/to/your/.llm.env npx @just-every/mcp-task
   ```

2. **Incorrect Installation Command**: Make sure you're using `-e` for environment variables:
   ```bash
   # Correct - environment variable passed with -e flag before --
   claude mcp add task -s user -e ENV_FILE=$HOME/.llm.env -- npx -y @just-every/mcp-task
   
   # Incorrect - trying to pass as argument
   claude mcp add task -s user -- npx -y @just-every/mcp-task --env ENV_FILE=$HOME/.llm.env
   ```

3. **Path Issues**: ENV_FILE must use absolute paths:
   ```bash
   # Good
   ENV_FILE=/Users/yourname/.llm.env
   ENV_FILE=$HOME/.llm.env
   
   # Bad
   ENV_FILE=.env
   ENV_FILE=~/.llm.env  # ~ not expanded in some contexts
   ```

4. **Verify Installation**: Check your MCP configuration:
   ```bash
   claude mcp list
   ```

5. **Debug Mode**: For detailed error messages, run manually:
   ```bash
   ENV_FILE=/path/to/.llm.env npx @just-every/mcp-task
   ```

### Task Not Progressing
- Check task status with `check_task_status` to see live progress
- Look for error messages prefixed with "ERROR:" in the output
- Verify API keys are properly configured

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

## Author

Created by Just Every - Building powerful AI tools for developers.