import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { process_patch } from '../src/utils/patcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Patcher Integration Tests', () => {
  const testDir = path.join(__dirname, 'patcher-test-files');
  
  beforeEach(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should handle a real-world TypeScript file update', () => {
    // Create initial file
    const filePath = path.join(testDir, 'example.ts');
    const initialContent = `export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }

  multiply(a: number, b: number): number {
    return a * b;
  }
}`;
    fs.writeFileSync(filePath, initialContent);

    // Create patch
    const patch = `*** Begin Patch
*** Update File: ${filePath}
 export class Calculator {
   add(a: number, b: number): number {
     return a + b;
   }
 
   subtract(a: number, b: number): number {
     return a - b;
   }
 
   multiply(a: number, b: number): number {
     return a * b;
   }
+
+  divide(a: number, b: number): number {
+    if (b === 0) {
+      throw new Error('Division by zero');
+    }
+    return a / b;
+  }
 }
*** End Patch`;

    // Apply patch
    process_patch(
      patch,
      (p) => fs.readFileSync(p, 'utf8'),
      (p, content) => fs.writeFileSync(p, content, 'utf8'),
      (p) => fs.unlinkSync(p)
    );

    // Verify result
    const result = fs.readFileSync(filePath, 'utf8');
    expect(result).toContain('divide(a: number, b: number): number');
    expect(result).toContain('Division by zero');
  });

  it('should handle file moves and content updates', () => {
    // Create initial file
    const oldPath = path.join(testDir, 'old-location.js');
    const newPath = path.join(testDir, 'new-location.js');
    const content = `const message = 'Hello World';
console.log(message);`;
    fs.writeFileSync(oldPath, content);

    // Create patch with move and update
    const patch = `*** Begin Patch
*** Update File: ${oldPath}
*** Move to: ${newPath}
-const message = 'Hello World';
+const message = 'Hello Updated World';
 console.log(message);
*** End Patch`;

    // Apply patch
    process_patch(
      patch,
      (p) => fs.readFileSync(p, 'utf8'),
      (p, content) => fs.writeFileSync(p, content, 'utf8'),
      (p) => fs.unlinkSync(p)
    );

    // Verify old file is gone and new file exists with updated content
    expect(fs.existsSync(oldPath)).toBe(false);
    expect(fs.existsSync(newPath)).toBe(true);
    const result = fs.readFileSync(newPath, 'utf8');
    expect(result).toContain('Hello Updated World');
  });

  it('should handle multiple file operations in one patch', () => {
    // Create initial files
    const file1 = path.join(testDir, 'file1.txt');
    const file2 = path.join(testDir, 'file2.txt');
    const file3 = path.join(testDir, 'file3.txt');
    
    fs.writeFileSync(file1, 'File 1 content');
    fs.writeFileSync(file2, 'File 2 content\nLine 2\nLine 3');

    // Create comprehensive patch
    const patch = `*** Begin Patch
*** Delete File: ${file1}
*** Update File: ${file2}
 File 2 content
-Line 2
+Line 2 modified
 Line 3
+Line 4 added
*** Add File: ${file3}
+New file 3 content
+With multiple lines
+And more content
*** End Patch`;

    // Apply patch
    process_patch(
      patch,
      (p) => fs.readFileSync(p, 'utf8'),
      (p, content) => fs.writeFileSync(p, content, 'utf8'),
      (p) => fs.unlinkSync(p)
    );

    // Verify all operations
    expect(fs.existsSync(file1)).toBe(false); // Deleted
    expect(fs.existsSync(file2)).toBe(true);  // Updated
    expect(fs.existsSync(file3)).toBe(true);  // Added

    const file2Content = fs.readFileSync(file2, 'utf8');
    expect(file2Content).toBe('File 2 content\nLine 2 modified\nLine 3\nLine 4 added');

    const file3Content = fs.readFileSync(file3, 'utf8');
    expect(file3Content).toBe('New file 3 content\nWith multiple lines\nAnd more content');
  });

  it('should handle complex code refactoring', () => {
    // Create a more complex file
    const filePath = path.join(testDir, 'service.ts');
    const initialContent = `import { Database } from './database';

export class UserService {
  private db: Database;

  constructor(database: Database) {
    this.db = database;
  }

  async getUser(id: string) {
    return this.db.findOne('users', { id });
  }

  async createUser(data: any) {
    return this.db.insert('users', data);
  }

  async updateUser(id: string, data: any) {
    return this.db.update('users', { id }, data);
  }
}`;
    fs.writeFileSync(filePath, initialContent);

    // Create patch with multiple changes
    const patch = `*** Begin Patch
*** Update File: ${filePath}
 import { Database } from './database';
+import { User, CreateUserDto, UpdateUserDto } from './types';
 
 export class UserService {
   private db: Database;
 
   constructor(database: Database) {
     this.db = database;
   }
 
-  async getUser(id: string) {
+  async getUser(id: string): Promise<User | null> {
     return this.db.findOne('users', { id });
   }
 
-  async createUser(data: any) {
+  async createUser(data: CreateUserDto): Promise<User> {
+    const validatedData = this.validateCreateData(data);
-    return this.db.insert('users', data);
+    return this.db.insert('users', validatedData);
   }
 
-  async updateUser(id: string, data: any) {
+  async updateUser(id: string, data: UpdateUserDto): Promise<User> {
+    const validatedData = this.validateUpdateData(data);
-    return this.db.update('users', { id }, data);
+    return this.db.update('users', { id }, validatedData);
+  }
+
+  private validateCreateData(data: CreateUserDto): CreateUserDto {
+    // Validation logic here
+    return data;
+  }
+
+  private validateUpdateData(data: UpdateUserDto): UpdateUserDto {
+    // Validation logic here
+    return data;
   }
 }
*** End Patch`;

    // Apply patch
    process_patch(
      patch,
      (p) => fs.readFileSync(p, 'utf8'),
      (p, content) => fs.writeFileSync(p, content, 'utf8'),
      (p) => fs.unlinkSync(p)
    );

    // Verify result
    const result = fs.readFileSync(filePath, 'utf8');
    expect(result).toContain("import { User, CreateUserDto, UpdateUserDto } from './types'");
    expect(result).toContain('Promise<User | null>');
    expect(result).toContain('validateCreateData');
    expect(result).toContain('validateUpdateData');
    expect(result).toContain('private validateCreateData(data: CreateUserDto)');
    expect(result).toContain('private validateUpdateData(data: UpdateUserDto)');
  });
});