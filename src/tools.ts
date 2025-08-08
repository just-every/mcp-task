/**
 * Tool definitions for task execution
 * Provides file operations and replicas of Claude Code tools
 */

import { createToolFunction } from '@just-every/ensemble';
import { promises as fs } from 'fs';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { glob } from 'glob';
import { process_patch, identify_files_needed } from './utils/patcher.js';

const execAsync = promisify(exec);

// File Operations Tools

export const readFileTool = createToolFunction(
    async (
        filePath: string,
        encoding: BufferEncoding = 'utf8',
        startLine?: number,
        endLine?: number
    ) => {
        try {
            const content = await fs.readFile(filePath, { encoding });

            // If line range is specified, extract only those lines
            let result = content;
            if (startLine !== undefined || endLine !== undefined) {
                const lines = content.split('\n');
                const start = (startLine || 1) - 1; // Convert to 0-based index
                const end = endLine || lines.length;
                result = lines.slice(start, end).join('\n');
            }

            // Truncate to 50000 characters to avoid overwhelming the LLM
            if (result.length > 50000) {
                result =
                    result.substring(0, 50000) +
                    '\n\n[Content truncated at 50000 characters]';
            }

            return result;
        } catch (error: any) {
            return `Error reading file: ${error.message}`;
        }
    },
    'Read the contents of a file with optional line range and automatic truncation',
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
        startLine: {
            type: 'number',
            description: 'Starting line number (1-based, inclusive)',
        },
        endLine: {
            type: 'number',
            description: 'Ending line number (1-based, inclusive)',
        },
    },
    'string',
    'read_file',
    false
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
    'write_file',
    false
);

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
    'glob',
    false
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
    'grep',
    false
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
    'ls',
    false
);

const APPLY_PATCH_TOOL_DESC = `This is a custom utility that makes it more convenient to add, remove, move, or edit code files. \`apply_patch\` effectively allows you to execute a diff/patch against a file, but the format of the diff specification is unique to this task, so pay careful attention to these instructions. To use the \`apply_patch\` command, you should pass a message of the following structure as "input":

\`\`\`bash
apply_patch <<"EOF"
*** Begin Patch
[YOUR_PATCH]
*** End Patch
EOF
\`\`\`

Where [YOUR_PATCH] is the actual content of your patch, specified in the following V4A diff format.

*** [ACTION] File: [path/to/file] -> ACTION can be one of Add, Update, or Delete.
For each snippet of code that needs to be changed, repeat the following:
[context_before] -> See below for further instructions on context.
- [old_code] -> Precede the old code with a minus sign.
+ [new_code] -> Precede the new, replacement code with a plus sign.
[context_after] -> See below for further instructions on context.

For instructions on [context_before] and [context_after]:
- By default, show 3 lines of code immediately above and 3 lines immediately below each change. If a change is within 3 lines of a previous change, do NOT duplicate the first change's [context_after] lines in the second change's [context_before] lines.
- If 3 lines of context is insufficient to uniquely identify the snippet of code within the file, use the @@ operator to indicate the class or function to which the snippet belongs. For instance, we might have:
@@ class BaseClass
[3 lines of pre-context]
- [old_code]
+ [new_code]
[3 lines of post-context]

- If a code block is repeated so many times in a class or function such that even a single @@ statement and 3 lines of context cannot uniquely identify the snippet of code, you can use multiple \`@@\` statements to jump to the right context. For instance:

@@ class BaseClass
@@     def method():
[3 lines of pre-context]
- [old_code]
+ [new_code]
[3 lines of post-context]

Note, then, that we do not use line numbers in this diff format, as the context is enough to uniquely identify code. An example of a message that you might pass as "input" to this function, in order to apply a patch, is shown below.

\`\`\`bash
apply_patch <<"EOF"
*** Begin Patch
*** Update File: pygorithm/searching/binary_search.py
@@ class BaseClass
@@     def search():
-          pass
+          raise NotImplementedError()

@@ class Subclass
@@     def search():
-          pass
+          raise NotImplementedError()

*** End Patch
EOF
\`\`\``;

export const applyPatchTool = createToolFunction(
    async (input: string) => {
        try {
            // Extract the patch text from the input
            // Handle both direct patch text and the bash heredoc format
            let patchText = input.trim();

            // If it looks like a bash command with heredoc, extract the patch
            if (patchText.includes('apply_patch') && patchText.includes('<<')) {
                const startMarker = '*** Begin Patch';
                const endMarker = '*** End Patch';
                const startIdx = patchText.indexOf(startMarker);
                const endIdx = patchText.lastIndexOf(endMarker);

                if (startIdx !== -1 && endIdx !== -1) {
                    patchText = patchText.substring(
                        startIdx,
                        endIdx + endMarker.length
                    );
                }
            }

            // The patcher expects a specific format starting with *** Begin Patch
            if (!patchText.startsWith('*** Begin Patch')) {
                return 'Error: Invalid patch format. Patch must start with "*** Begin Patch"';
            }

            // Identify files that will be affected
            const filesNeeded = identify_files_needed(patchText);

            // Use the robust patcher implementation with sync operations
            process_patch(
                patchText,
                // Read function (sync)
                (p: string) => {
                    try {
                        return readFileSync(p, 'utf8');
                    } catch (error: any) {
                        if (error.code === 'ENOENT') {
                            // File doesn't exist, return empty string for creation
                            return '';
                        }
                        throw error;
                    }
                },
                // Write function (sync)
                (p: string, content: string) => {
                    // Create directory if needed
                    const dir = path.dirname(p);
                    if (dir && dir !== '.') {
                        fs.mkdir(dir, { recursive: true }).catch(() => {});
                    }
                    writeFileSync(p, content, 'utf8');
                },
                // Remove function (sync)
                (p: string) => {
                    unlinkSync(p);
                }
            );

            return `Patch applied successfully. Files affected: ${filesNeeded.join(', ')}`;
        } catch (error: any) {
            return `Error applying patch: ${error.message}`;
        }
    },
    APPLY_PATCH_TOOL_DESC,
    {
        input: {
            type: 'string',
            description: 'The apply_patch command that you wish to execute.',
        },
    },
    'string',
    'apply_patch',
    false
);

// Export all tools as an array
export const getAllTools = () => [
    // File operations
    readFileTool,
    writeFileTool,
    applyPatchTool,

    // Claude Code replicas
    bashTool,
    globTool,
    grepTool,
    lsTool,
    // Note: Todo tools are now created per-agent instance via TodoManager
];

// Export read-only tools (tools that don't modify file system)
export const getReadOnlyTools = () => [
    // Read/search operations only
    readFileTool,
    globTool,
    grepTool,
    lsTool,
    // Note: Todo tools are now created per-agent instance via TodoManager
];
