# @just-every/mcp-task

MCP server for running long-running AI tasks with configurable models and integrated tools.

[![npm version](https://badge.fury.io/js/@just-every%2Fmcp-task.svg)](https://www.npmjs.com/package/@just-every/mcp-task)

## Overview

This MCP (Model Context Protocol) server enables execution of complex AI tasks using the `@just-every/task` package. It provides a flexible interface for running tasks with different AI models, contexts, and integrated search/command tools.

## Features

- **Flexible Model Support**: Use model classes (reasoning, standard, vision, fast) or specific model names
- **Context-Aware Execution**: Provide background context for better task results
- **Integrated Tools**: Built-in search capabilities and command line access
- **Extensible Model Registry**: Register custom models on the fly
- **Robust Error Handling**: Automatic timeout and error management

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

Execute a long-running AI task with specified parameters.

**Parameters:**
- `task` (required): The task prompt - what to perform
- `model` (optional): Model class or specific model name
- `context` (optional): Background context for the task
- `output` (optional): The desired output/success state

**Example Usage:**

```javascript
// Simple task
{
  "task": "Research the latest trends in AI development"
}

// Task with model and context
{
  "model": "reasoning",
  "context": "We are building a new AI product for healthcare",
  "task": "Create a comprehensive market analysis",
  "output": "A detailed report with competitor analysis and recommendations"
}

// Using a specific model
{
  "model": "gpt-4.1",
  "task": "Generate unit tests for the authentication module",
  "context": "Using Jest framework in a TypeScript project"
}
```

## Supported Models

### Model Classes
- `reasoning`: Complex reasoning and analysis tasks
- `standard`: General purpose tasks
- `vision`: Image and visual processing tasks
- `fast`: Quick responses for simple tasks

### Pre-configured Models
- `gpt-4.1`, `gpt-4`, `gpt-3.5`: OpenAI models
- `claude-3`, `claude-3.5`: Anthropic models
- `grok4`: xAI Grok model

Custom model names are automatically registered and can be used directly.

## Integrated Tools

Tasks have access to:
- **Search Tools**: Web search, document search, and more from `@just-every/search`
- **Command Execution**: Run shell commands via the `run_command` tool

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
│   ├── serve.ts        # MCP server implementation
│   ├── index.ts        # CLI entry point
│   └── utils/          # Logger utilities
├── bin/
│   └── mcp-task.js     # Executable entry
└── package.json
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## Troubleshooting

### Task Timeout
- Default timeout is 5 minutes
- For longer tasks, consider breaking them into smaller subtasks

### Model Not Found
- Check if the model name is correctly spelled
- Custom models are automatically registered but may need provider configuration

### Tool Errors
- Ensure proper permissions for command execution
- Check network connectivity for search tools

## License

MIT