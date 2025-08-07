/**
 * Tool definitions for task execution
 * Provides file operations and replicas of Claude Code tools
 */

import { createToolFunction } from '@just-every/ensemble';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { glob } from 'glob';

const execAsync = promisify(exec);

// File Operations Tools

export const readFileTool = createToolFunction(
    async (filePath: string, encoding: BufferEncoding = 'utf8') => {
        try {
            const content = await fs.readFile(filePath, { encoding });
            return content;
        } catch (error: any) {
            return `Error reading file: ${error.message}`;
        }
    },
    'Read the contents of a file',
    {
        filePath: {
            type: 'string',
            description: 'Path to the file to read',
        },
        encoding: {
            type: 'string',
            description: 'File encoding (default: utf8)',
            default: 'utf8',
        },
    },
    'string',
    'read_file'
);

export const writeFileTool = createToolFunction(
    async (
        filePath: string,
        content: string,
        encoding: BufferEncoding = 'utf8'
    ) => {
        try {
            await fs.writeFile(filePath, content, { encoding });
            return `File written successfully: ${filePath}`;
        } catch (error: any) {
            return `Error writing file: ${error.message}`;
        }
    },
    'Write content to a file',
    {
        filePath: {
            type: 'string',
            description: 'Path to the file to write',
        },
        content: {
            type: 'string',
            description: 'Content to write to the file',
        },
        encoding: {
            type: 'string',
            description: 'File encoding (default: utf8)',
            default: 'utf8',
        },
    },
    'string',
    'write_file'
);

export const applyDiffTool = createToolFunction(
    async (filePath: string, diff: string) => {
        try {
            // Read the current file content
            const currentContent = await fs.readFile(filePath, 'utf8');
            const lines = currentContent.split('\n');
            const diffLines = diff.split('\n');

            let lineIndex = 0;
            let i = 0;

            while (i < diffLines.length) {
                const line = diffLines[i];

                if (line.startsWith('@@')) {
                    // Parse the line range
                    const match = line.match(
                        /@@ -(\d+),(\d+) \+(\d+),(\d+) @@/
                    );
                    if (match) {
                        lineIndex = parseInt(match[1]) - 1;
                    }
                } else if (line.startsWith('-')) {
                    // Remove line
                    if (lineIndex < lines.length) {
                        lines.splice(lineIndex, 1);
                    }
                } else if (line.startsWith('+')) {
                    // Add line
                    const newLine = line.substring(1);
                    lines.splice(lineIndex, 0, newLine);
                    lineIndex++;
                } else if (line.startsWith(' ')) {
                    // Context line - just move forward
                    lineIndex++;
                }

                i++;
            }

            const updatedContent = lines.join('\n');
            await fs.writeFile(filePath, updatedContent, 'utf8');

            return `Diff applied successfully to ${filePath}`;
        } catch (error: any) {
            return `Error applying diff: ${error.message}`;
        }
    },
    'Apply a unified diff to a file',
    {
        filePath: {
            type: 'string',
            description: 'Path to the file to apply diff to',
        },
        diff: {
            type: 'string',
            description: 'Unified diff format string to apply',
        },
    },
    'string',
    'apply_diff'
);

// Claude Code Tool Replicas

export const bashTool = createToolFunction(
    async (command: string, timeout: number = 120000) => {
        try {
            const { stdout, stderr } = await execAsync(command, {
                timeout,
                maxBuffer: 1024 * 1024 * 10, // 10MB buffer
            });
            return `Output:\n${stdout}${stderr ? `\nStderr:\n${stderr}` : ''}`;
        } catch (error: any) {
            if (error.killed) {
                return `Command timed out after ${timeout}ms`;
            }
            return `Command failed: ${error.message}\n${error.stdout || ''}\n${error.stderr || ''}`;
        }
    },
    'Execute a bash command',
    {
        command: {
            type: 'string',
            description: 'The bash command to execute',
        },
        timeout: {
            type: 'number',
            description: 'Timeout in milliseconds (default: 120000)',
            default: 120000,
        },
    },
    'string',
    'bash'
);

export const globTool = createToolFunction(
    async (pattern: string, searchPath: string = '.') => {
        try {
            const matches = await glob(pattern, {
                cwd: searchPath,
                absolute: false,
                dot: true,
            });
            return matches.join('\n');
        } catch (error: any) {
            return `Error searching files: ${error.message}`;
        }
    },
    'Search for files matching a glob pattern',
    {
        pattern: {
            type: 'string',
            description: 'Glob pattern to match files (e.g., "**/*.js")',
        },
        searchPath: {
            type: 'string',
            description: 'Directory to search in (default: current directory)',
            default: '.',
        },
    },
    'string',
    'glob'
);

export const grepTool = createToolFunction(
    async (
        pattern: string,
        searchPath: string = '.',
        options: {
            ignoreCase?: boolean;
            showLineNumbers?: boolean;
            filesOnly?: boolean;
            recursive?: boolean;
        } = {}
    ) => {
        try {
            const flags = [];
            if (options.ignoreCase) flags.push('-i');
            if (options.showLineNumbers) flags.push('-n');
            if (options.filesOnly) flags.push('-l');
            if (options.recursive !== false) flags.push('-r');

            const command = `grep ${flags.join(' ')} "${pattern}" ${searchPath}`;
            const { stdout } = await execAsync(command, {
                maxBuffer: 1024 * 1024 * 10,
            });

            return stdout || 'No matches found';
        } catch (error: any) {
            if (error.code === 1) {
                return 'No matches found';
            }
            return `Error searching: ${error.message}`;
        }
    },
    'Search for a pattern in files',
    {
        pattern: {
            type: 'string',
            description: 'Regular expression pattern to search for',
        },
        searchPath: {
            type: 'string',
            description: 'File or directory to search in',
            default: '.',
        },
        options: {
            type: 'object',
            description: 'Search options',
            properties: {
                ignoreCase: {
                    type: 'boolean',
                    description: 'Case insensitive search',
                },
                showLineNumbers: {
                    type: 'boolean',
                    description: 'Show line numbers',
                },
                filesOnly: {
                    type: 'boolean',
                    description: 'Show only file names',
                },
                recursive: {
                    type: 'boolean',
                    description: 'Search recursively',
                    default: true,
                },
            },
        },
    },
    'string',
    'grep'
);

export const lsTool = createToolFunction(
    async (dirPath: string = '.', showHidden: boolean = false) => {
        try {
            const files = await fs.readdir(dirPath, { withFileTypes: true });

            const result = [];
            for (const file of files) {
                if (!showHidden && file.name.startsWith('.')) {
                    continue;
                }

                const stats = await fs.stat(path.join(dirPath, file.name));
                const type = file.isDirectory()
                    ? 'd'
                    : file.isSymbolicLink()
                      ? 'l'
                      : file.isFile()
                        ? 'f'
                        : '?';

                result.push({
                    name: file.name,
                    type,
                    size: stats.size,
                    modified: stats.mtime.toISOString(),
                });
            }

            return JSON.stringify(result, null, 2);
        } catch (error: any) {
            return `Error listing directory: ${error.message}`;
        }
    },
    'List files and directories',
    {
        dirPath: {
            type: 'string',
            description: 'Directory path to list',
            default: '.',
        },
        showHidden: {
            type: 'boolean',
            description: 'Show hidden files',
            default: false,
        },
    },
    'string',
    'ls'
);

export const editTool = createToolFunction(
    async (
        filePath: string,
        oldString: string,
        newString: string,
        replaceAll: boolean = false
    ) => {
        try {
            const content = await fs.readFile(filePath, 'utf8');

            let updatedContent;
            if (replaceAll) {
                updatedContent = content.split(oldString).join(newString);
            } else {
                const index = content.indexOf(oldString);
                if (index === -1) {
                    return `String not found in file: ${oldString}`;
                }
                updatedContent =
                    content.substring(0, index) +
                    newString +
                    content.substring(index + oldString.length);
            }

            await fs.writeFile(filePath, updatedContent, 'utf8');
            return `File edited successfully: ${filePath}`;
        } catch (error: any) {
            return `Error editing file: ${error.message}`;
        }
    },
    'Replace text in a file',
    {
        filePath: {
            type: 'string',
            description: 'Path to the file to edit',
        },
        oldString: {
            type: 'string',
            description: 'Text to replace',
        },
        newString: {
            type: 'string',
            description: 'Replacement text',
        },
        replaceAll: {
            type: 'boolean',
            description: 'Replace all occurrences',
            default: false,
        },
    },
    'string',
    'edit'
);

export const multiEditTool = createToolFunction(
    async (
        filePath: string,
        edits: Array<{
            oldString: string;
            newString: string;
            replaceAll?: boolean;
        }>
    ) => {
        try {
            let content = await fs.readFile(filePath, 'utf8');

            for (const edit of edits) {
                if (edit.replaceAll) {
                    content = content
                        .split(edit.oldString)
                        .join(edit.newString);
                } else {
                    const index = content.indexOf(edit.oldString);
                    if (index === -1) {
                        return `String not found in file: ${edit.oldString}`;
                    }
                    content =
                        content.substring(0, index) +
                        edit.newString +
                        content.substring(index + edit.oldString.length);
                }
            }

            await fs.writeFile(filePath, content, 'utf8');
            return `File edited successfully with ${edits.length} changes: ${filePath}`;
        } catch (error: any) {
            return `Error editing file: ${error.message}`;
        }
    },
    'Apply multiple edits to a file',
    {
        filePath: {
            type: 'string',
            description: 'Path to the file to edit',
        },
        edits: {
            type: 'array',
            description: 'Array of edit operations',
            items: {
                type: 'object',
                properties: {
                    oldString: {
                        type: 'string',
                        description: 'Text to replace',
                    },
                    newString: {
                        type: 'string',
                        description: 'Replacement text',
                    },
                    replaceAll: {
                        type: 'boolean',
                        description: 'Replace all occurrences',
                        default: false,
                    },
                },
                required: ['oldString', 'newString'],
            },
        },
    },
    'string',
    'multi_edit'
);

export const webFetchTool = createToolFunction(
    async (
        url: string,
        method: string = 'GET',
        headersJson?: string,
        body?: string
    ) => {
        try {
            let headers: Record<string, string> | undefined;
            if (headersJson) {
                try {
                    headers = JSON.parse(headersJson);
                } catch {
                    return 'Error: Invalid headers JSON format';
                }
            }

            const response = await fetch(url, {
                method,
                headers,
                body: body ? body : undefined,
            });

            const text = await response.text();
            return `Status: ${response.status}\nResponse:\n${text}`;
        } catch (error: any) {
            return `Error fetching URL: ${error.message}`;
        }
    },
    'Fetch content from a URL',
    {
        url: {
            type: 'string',
            description: 'URL to fetch',
        },
        method: {
            type: 'string',
            description: 'HTTP method',
            default: 'GET',
        },
        headersJson: {
            type: 'string',
            description: 'Request headers as JSON string',
        },
        body: {
            type: 'string',
            description: 'Request body',
        },
    },
    'string',
    'web_fetch'
);

// Export all tools as an array
export const getAllTools = () => [
    // File operations
    readFileTool,
    writeFileTool,
    applyDiffTool,

    // Claude Code replicas
    bashTool,
    globTool,
    grepTool,
    lsTool,
    editTool,
    multiEditTool,
    webFetchTool,
];

// Export read-only tools (tools that don't modify state)
export const getReadOnlyTools = () => [
    // Read/search operations only
    readFileTool,
    globTool,
    grepTool,
    lsTool,
    webFetchTool,
];
