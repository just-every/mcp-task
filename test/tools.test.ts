import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    readFileTool,
    writeFileTool,
    applyPatchTool,
    bashTool,
    globTool,
    grepTool,
    lsTool,
} from '../src/tools.js';

// Extract the actual functions from tool objects
const readFile = readFileTool.function;
const writeFile = writeFileTool.function;
const applyPatch = applyPatchTool.function;
const bash = bashTool.function;
const glob = globTool.function;
const grep = grepTool.function;
const ls = lsTool.function;

describe('File Operation Tools', () => {
    let tempDir: string;
    let testFile: string;

    beforeEach(async () => {
        // Create a temporary directory for tests
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-task-test-'));
        testFile = path.join(tempDir, 'test.txt');
    });

    afterEach(async () => {
        // Clean up temporary directory
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('readFileTool', () => {
        it('should read file content successfully', async () => {
            const content = 'Hello, World!';
            await fs.writeFile(testFile, content);

            const result = await readFile(testFile);
            expect(result).toBe(content);
        });

        it('should handle read errors gracefully', async () => {
            const result = await readFile('/non/existent/file.txt');
            expect(result).toContain('Error reading file');
        });

        it('should support different encodings', async () => {
            const content = 'Hello, World!';
            await fs.writeFile(testFile, content);

            const result = await readFile(testFile, 'utf8');
            expect(result).toBe(content);
        });

        it('should read specific line range', async () => {
            const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
            await fs.writeFile(testFile, content);

            const result = await readFile(testFile, 'utf8', 2, 4);
            expect(result).toBe('Line 2\nLine 3\nLine 4');
        });

        it('should handle start line only', async () => {
            const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
            await fs.writeFile(testFile, content);

            const result = await readFile(testFile, 'utf8', 3);
            expect(result).toBe('Line 3\nLine 4\nLine 5');
        });

        it('should handle end line only', async () => {
            const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
            await fs.writeFile(testFile, content);

            const result = await readFile(testFile, 'utf8', undefined, 3);
            expect(result).toBe('Line 1\nLine 2\nLine 3');
        });

        it('should truncate content at 50000 characters', async () => {
            // Create content larger than 50000 characters
            const longContent = 'a'.repeat(60000);
            await fs.writeFile(testFile, longContent);

            const result = await readFile(testFile);
            expect(result.length).toBeLessThanOrEqual(50100); // Allow for truncation message
            expect(result).toContain('[Content truncated at 50000 characters]');
        });
    });

    describe('writeFileTool', () => {
        it('should write file content successfully', async () => {
            const content = 'Test content';
            const result = await writeFile(testFile, content);
            
            expect(result).toContain('File written successfully');
            const readContent = await fs.readFile(testFile, 'utf8');
            expect(readContent).toBe(content);
        });

        it('should handle write errors gracefully', async () => {
            const result = await writeFile('/invalid/path/file.txt', 'content');
            expect(result).toContain('Error writing file');
        });

        it('should overwrite existing files', async () => {
            await fs.writeFile(testFile, 'old content');
            const newContent = 'new content';
            
            await writeFile(testFile, newContent);
            const readContent = await fs.readFile(testFile, 'utf8');
            expect(readContent).toBe(newContent);
        });
    });

    describe('applyPatchTool', () => {
        it('should apply a simple patch', async () => {
            const originalContent = 'line1\nline2\nline3';
            await fs.writeFile(testFile, originalContent);

            const patch = `apply_patch <<"EOF"
*** Begin Patch
*** Update File: ${testFile}
 line1
-line2
+modified line2
 line3
*** End Patch
EOF`;

            const result = await applyPatch(patch);
            expect(result).toContain('Patch applied successfully');

            const newContent = await fs.readFile(testFile, 'utf8');
            expect(newContent).toContain('modified line2');
        });

        it('should handle patch errors gracefully', async () => {
            const result = await applyPatch('invalid patch');
            expect(result).toContain('Error');
        });
    });


    describe('lsTool', () => {
        it('should list directory contents', async () => {
            // Create test files
            await fs.writeFile(path.join(tempDir, 'file1.txt'), 'content1');
            await fs.writeFile(path.join(tempDir, 'file2.txt'), 'content2');
            await fs.mkdir(path.join(tempDir, 'subdir'));

            const result = await ls(tempDir, false);
            const parsed = JSON.parse(result);

            expect(parsed).toHaveLength(3);
            expect(parsed.some((f: any) => f.name === 'file1.txt')).toBe(true);
            expect(parsed.some((f: any) => f.name === 'file2.txt')).toBe(true);
            expect(parsed.some((f: any) => f.name === 'subdir' && f.type === 'd')).toBe(true);
        });

        it('should show hidden files when requested', async () => {
            await fs.writeFile(path.join(tempDir, '.hidden'), 'secret');
            await fs.writeFile(path.join(tempDir, 'visible.txt'), 'public');

            const resultWithoutHidden = await ls(tempDir, false);
            const parsedWithoutHidden = JSON.parse(resultWithoutHidden);
            expect(parsedWithoutHidden.some((f: any) => f.name === '.hidden')).toBe(false);

            const resultWithHidden = await ls(tempDir, true);
            const parsedWithHidden = JSON.parse(resultWithHidden);
            expect(parsedWithHidden.some((f: any) => f.name === '.hidden')).toBe(true);
        });

        it('should handle directory read errors', async () => {
            const result = await ls('/non/existent/directory', false);
            expect(result).toContain('Error listing directory');
        });
    });

    describe('globTool', () => {
        it('should find files matching pattern', async () => {
            await fs.writeFile(path.join(tempDir, 'test1.js'), '');
            await fs.writeFile(path.join(tempDir, 'test2.js'), '');
            await fs.writeFile(path.join(tempDir, 'test.txt'), '');
            await fs.mkdir(path.join(tempDir, 'subdir'));
            await fs.writeFile(path.join(tempDir, 'subdir', 'test3.js'), '');

            const result = await glob('**/*.js', tempDir);
            const files = result.split('\n').filter(f => f);

            expect(files).toContain('test1.js');
            expect(files).toContain('test2.js');
            expect(files).toContain('subdir/test3.js');
            expect(files).not.toContain('test.txt');
        });

        it('should handle glob errors gracefully', async () => {
            const result = await glob('**/*.js', '/non/existent/path');
            // Glob typically returns empty results for non-existent paths
            expect(result).toBeDefined();
        });
    });
});

describe('Command Execution Tools', () => {
    describe('bashTool', () => {
        it('should execute simple commands', async () => {
            const result = await bash('echo "Hello World"');
            expect(result).toContain('Hello World');
        });

        it('should handle command errors', async () => {
            const result = await bash('exit 1');
            expect(result).toContain('Command failed');
        });

        it('should respect timeout', async () => {
            const result = await bash('sleep 10', 100);
            expect(result).toContain('Command timed out');
        }, 10000);

        it('should capture stderr', async () => {
            const result = await bash('echo "error" >&2');
            expect(result).toContain('Stderr');
            expect(result).toContain('error');
        });
    });

    describe('grepTool', () => {
        let tempDir: string;

        beforeEach(async () => {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'grep-test-'));
            await fs.writeFile(path.join(tempDir, 'test.txt'), 'Hello World\nHello Universe\nGoodbye World');
        });

        afterEach(async () => {
            await fs.rm(tempDir, { recursive: true, force: true });
        });

        it('should find pattern in files', async () => {
            const result = await grep('Hello', path.join(tempDir, 'test.txt'));
            expect(result).toContain('Hello World');
            expect(result).toContain('Hello Universe');
            expect(result).not.toContain('Goodbye');
        });

        it('should support case insensitive search', async () => {
            const result = await grep('hello', path.join(tempDir, 'test.txt'), {
                ignoreCase: true,
            });
            expect(result).toContain('Hello World');
        });

        it('should show line numbers when requested', async () => {
            const result = await grep('Hello', path.join(tempDir, 'test.txt'), {
                showLineNumbers: true,
            });
            expect(result).toMatch(/1:.*Hello World/);
            expect(result).toMatch(/2:.*Hello Universe/);
        });

        it('should return "No matches found" when pattern not found', async () => {
            const result = await grep('NotFound', path.join(tempDir, 'test.txt'));
            expect(result).toBe('No matches found');
        });
    });
});

// webFetchTool tests removed - using getCrawlTools from @just-every/crawl instead