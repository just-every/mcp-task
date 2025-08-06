# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An MCP server for running long-running AI tasks using the @just-every/task package. It provides a flexible interface for executing complex AI workflows with configurable models, context, and integrated search/command tools.

## Core Modules & Files

- `src/serve.ts`: MCP server implementation with task execution logic
- `src/index.ts`: CLI entry point for standalone usage
- `src/utils/logger.ts`: Logging utilities for debugging
- `bin/mcp-task.js`: Executable entry point for npm package

## Commands

### Development
```bash
npm run serve:dev              # Run MCP server in development mode
npm run dev                    # Run CLI in development mode
```

### Build & Production
```bash
npm run build                  # Compile TypeScript to JavaScript
npm run start                  # Run compiled CLI
npm run serve                  # Run compiled MCP server
```

### Code Quality
```bash
npm run lint                   # Run ESLint
npm run typecheck             # TypeScript type checking
npm test                      # Run tests with Vitest
```

## Architecture

This is a TypeScript-based MCP server that integrates with the @just-every/task package to run long-running AI tasks with various models and tools.

### Core Components

1. **MCP Server** (`src/serve.ts`):
   - Uses `@modelcontextprotocol/sdk` for MCP protocol
   - Implements `run_task` tool for task execution
   - Handles model selection and configuration
   - Integrates search tools and command execution

2. **Task Execution**:
   - Uses `@just-every/task` for AI task management
   - Supports model classes (reasoning, standard, vision, fast)
   - Supports specific model names (gpt-4.1, claude-3.5, etc.)
   - Custom model registration for unknown models

3. **Tool Integration**:
   - Search tools from `@just-every/search`
   - Command line execution via child_process
   - Extensible tool system

### Key Patterns

- Event-driven task execution with completion/error handling
- Lazy loading for optimal startup performance
- Flexible model configuration system
- Timeout management for long-running tasks
- Stream-based output collection

## Pre-Commit Requirements

**IMPORTANT**: Always run these commands before committing:

```bash
npm test          # Ensure tests pass
npm run lint      # Check linting
npm run build     # Ensure TypeScript compiles
```

Only commit if all commands succeed without errors.

## TypeScript Configuration

- ES Modules with Node.js >=20.0.0
- Strict mode enabled, targeting ES2022
- Source maps enabled for debugging
- Declaration files generated for consumers

## Code Style Guidelines

- Use async/await over promises
- Implement proper error handling with try/catch
- Keep functions small and focused
- Use descriptive variable names
- Handle task events properly (task_complete, task_fatal_error)

## Testing Instructions

- Run tests with `npm test`
- Add tests for new features in `test/` directory
- Mock external dependencies (AI models, network)
- Test both success and error cases

## Repository Etiquette

- Branch names: `feature/description`, `fix/issue-number`
- Conventional commits (`feat:`, `fix:`, `chore:`)
- Update README.md for user-facing changes
- Add tests for new functionality

## Developer Environment Setup

1. Clone repository
2. Install Node.js 20.x or higher
3. Run `npm install`
4. Configure AI model API keys if needed
5. Run `npm run serve:dev` for development

## Package Management

- Use exact versions in package.json
- Keep dependencies minimal
- Document why each dependency is needed
- Run `npm audit` before adding new dependencies

## Project-Specific Warnings

- **Task Timeout**: Default is 5 minutes, adjust carefully
- **Model Configuration**: Ensure API keys are set for custom models
- **Memory Usage**: Large tasks can consume significant memory
- **Error Handling**: Always handle task_fatal_error events
- **Tool Security**: Be cautious with command execution permissions

## Key APIs & Events

### Task Configuration
- `model`: Model class or specific model name
- `context`: Background information
- `task`: The main task prompt
- `output`: Desired output format

### Task Events
- `message`: Receives task output
- `task_complete`: Task finished successfully
- `task_fatal_error`: Task failed with error

### Model Classes
- `reasoning`: Complex analysis
- `standard`: General tasks
- `vision`: Visual processing
- `fast`: Quick responses

## MCP Server Integration

When running as MCP server (`npm run serve`):

**Tools:**
- `run_task` - Main task execution tool

**Parameters:**
- `task` (required): Task prompt
- `model` (optional): Model selection
- `context` (optional): Background context
- `output` (optional): Output requirements

## Troubleshooting

### Common Issues

- **Task timeout**: Increase timeout or break into smaller tasks
- **Model errors**: Check API keys and model availability
- **Memory issues**: Monitor task size and complexity
- **Tool failures**: Verify permissions and network access

### Debug Mode

Enable debug logging:
```bash
LOG_LEVEL=debug npm run serve:dev
```