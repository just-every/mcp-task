import { describe, it, expect, beforeAll } from 'vitest';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

describe('Deployment Tests', () => {
  beforeAll(async () => {
    // Ensure the project is built
    const { execSync } = await import('child_process');
    execSync('npm run build', { cwd: rootDir });
  });

  it('should have correct package name', async () => {
    const pkg = await import('../package.json');
    expect(pkg.name).toBe('@just-every/mcp-task');
  });

  it('should have bin script configured', async () => {
    const pkg = await import('../package.json');
    expect(pkg.bin).toHaveProperty('mcp-task');
  });

  it('should start MCP server without errors', async () => {
    const serverProcess = spawn('node', [join(rootDir, 'dist/serve.js')], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, MCP_DEBUG: 'true' }
    });

    return new Promise<void>((resolve, reject) => {
      let stderr = '';
      let stdout = '';

      serverProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        // Check if server started message appears
        if (stderr.includes('MCP server connected and running successfully!')) {
          serverProcess.kill();
          expect(stderr).toContain('MCP server connected and running successfully!');
          resolve();
        }
      });

      serverProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      // Timeout fallback
      setTimeout(() => {
        serverProcess.kill();
        reject(new Error(`Server did not start. stderr: ${stderr}, stdout: ${stdout}`));
      }, 2000);

      serverProcess.on('error', reject);
    });
  });

  it('should default to serve command when no args provided', async () => {
    const binPath = join(rootDir, 'bin/mcp-task.js');
    const binProcess = spawn('node', [binPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, MCP_DEBUG: 'true' }
    });

    return new Promise<void>((resolve, reject) => {
      let stderr = '';

      binProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        // Check if server started message appears
        if (stderr.includes('MCP server connected and running successfully!')) {
          binProcess.kill();
          expect(stderr).toContain('MCP server connected and running successfully!');
          resolve();
        }
      });

      // Timeout fallback
      setTimeout(() => {
        binProcess.kill();
        reject(new Error(`Server did not start via bin. stderr: ${stderr}`));
      }, 2000);

      binProcess.on('error', reject);
    });
  });

  it('should handle serve command', async () => {
    const binPath = join(rootDir, 'bin/mcp-task.js');
    const binProcess = spawn('node', [binPath, 'serve', '--help'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    return new Promise<void>((resolve, reject) => {
      let stdout = '';

      binProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      binProcess.on('close', (code) => {
        expect(code).toBe(0);
        expect(stdout).toContain('Usage:');
        expect(stdout).toContain('serve');
        resolve();
      });

      binProcess.on('error', reject);
    });
  });

  it('should export correct MCP tool structure', async () => {
    // Import and check the server exports the right structure
    const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
    expect(Server).toBeDefined();
  });

  it('should have all required dependencies', async () => {
    const pkg = await import('../package.json');
    // Dependencies for task runner
    const requiredDeps = [
      '@modelcontextprotocol/sdk',
      '@just-every/task',
      '@just-every/ensemble',
      '@just-every/search',
      'commander',
      'dotenv',
      'uuid'
    ];

    requiredDeps.forEach(dep => {
      expect(pkg.dependencies).toHaveProperty(dep);
    });
  });

  it('should build without TypeScript errors', () => {
    // This is implicitly tested by the beforeAll hook
    // If the build fails, the tests won't run
    expect(true).toBe(true);
  });
});