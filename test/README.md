# MCP Task Server Test Scripts

## Overview

These test scripts demonstrate various features of the MCP Task Server. Due to the asynchronous nature of the MCP protocol and the current SDK implementation, there are some known issues with the test client connecting to the server.

## Test Scripts

### 1. mcp-test-simple.js
Basic task execution test that demonstrates:
- Connecting to the MCP server
- Listing available tools
- Creating a simple task
- Checking task status
- Getting task results

### 2. mcp-test-with-files.js
Tests the files parameter feature:
- Creating test files
- Including file contents in task context
- Monitoring task progress with smart check_after timing

### 3. mcp-test-multiple-tasks.js
Concurrent task management:
- Creating multiple tasks simultaneously
- Monitoring all tasks in parallel
- Using different model classes

### 4. mcp-test-cancel.js
Task cancellation scenarios:
- Cancelling running tasks
- Attempting to cancel completed tasks
- Proper cleanup

### 5. mcp-test-errors.js
Error handling edge cases:
- Missing required parameters
- Invalid task IDs
- Non-existent files
- Invalid status filters

### 6. mcp-test-check-after.js
Progressive backoff timing demonstration:
- Shows how check_after changes based on task runtime
- Verifies timing logic correctness

## Known Issues

The test scripts may encounter protocol communication errors due to SDK version compatibility. This is a known issue with the MCP SDK client/server communication.

## Alternative Testing Methods

### Using Claude Desktop

The most reliable way to test the MCP server is through Claude Desktop:

1. Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "task-runner": {
      "command": "node",
      "args": ["/path/to/mcp-task/dist/serve.js"]
    }
  }
}
```

2. Restart Claude Desktop
3. Use the tools through Claude's interface

### Manual Testing with curl

You can also test the server directly using JSON-RPC:

```bash
# Start the server
node dist/serve.js

# In another terminal, send requests
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | nc localhost PORT
```

### Using the Task CLI

The package also includes a CLI for direct testing:

```bash
# Run a task directly
npm run dev -- --task "Write a haiku" --model mini
```

## check_after Timing Logic

The `check_task_status` tool returns a `check_after` field with smart timing:

| Task Runtime | check_after (seconds) |
|--------------|----------------------|
| 0-5s         | 5                    |
| 5-10s        | 10                   |
| 10-30s       | 15                   |
| 30-60s       | 30                   |
| 60-120s      | 60                   |
| >120s        | 120 (max)            |

This progressive backoff reduces unnecessary polling while ensuring timely updates.

## Files Parameter

The `run_task` tool accepts an optional `files` parameter:

```javascript
{
  task: "Analyze these files",
  files: ["/path/to/file1.txt", "/path/to/file2.json"],
  model: "standard"
}
```

File contents are automatically included in the task context with clear boundaries.