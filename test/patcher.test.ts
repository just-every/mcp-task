import { describe, it, expect, beforeEach } from 'vitest';
import {
  ActionType,
  Commit,
  Patch,
  PatchAction,
  Chunk,
  DiffError,
  assemble_changes,
  text_to_patch,
  patch_to_commit,
  identify_files_needed,
  process_patch,
  load_files,
  apply_commit
} from '../src/utils/patcher.js';

describe('Patcher', () => {
  describe('assemble_changes', () => {
    it('should detect added files', () => {
      const orig = {};
      const dest = { 'new.txt': 'new content' };
      const commit = assemble_changes(orig, dest);
      
      expect(commit.changes['new.txt']).toBeDefined();
      expect(commit.changes['new.txt'].type).toBe(ActionType.ADD);
      expect(commit.changes['new.txt'].new_content).toBe('new content');
    });

    it('should detect deleted files', () => {
      const orig = { 'old.txt': 'old content' };
      const dest = {};
      const commit = assemble_changes(orig, dest);
      
      expect(commit.changes['old.txt']).toBeDefined();
      expect(commit.changes['old.txt'].type).toBe(ActionType.DELETE);
      expect(commit.changes['old.txt'].old_content).toBe('old content');
    });

    it('should detect updated files', () => {
      const orig = { 'file.txt': 'old content' };
      const dest = { 'file.txt': 'new content' };
      const commit = assemble_changes(orig, dest);
      
      expect(commit.changes['file.txt']).toBeDefined();
      expect(commit.changes['file.txt'].type).toBe(ActionType.UPDATE);
      expect(commit.changes['file.txt'].old_content).toBe('old content');
      expect(commit.changes['file.txt'].new_content).toBe('new content');
    });

    it('should handle multiple changes', () => {
      const orig = { 'a.txt': 'a', 'b.txt': 'b', 'c.txt': 'c' };
      const dest = { 'b.txt': 'b modified', 'c.txt': 'c', 'd.txt': 'd' };
      const commit = assemble_changes(orig, dest);
      
      expect(Object.keys(commit.changes).length).toBe(3);
      expect(commit.changes['a.txt'].type).toBe(ActionType.DELETE);
      expect(commit.changes['b.txt'].type).toBe(ActionType.UPDATE);
      expect(commit.changes['d.txt'].type).toBe(ActionType.ADD);
    });
  });

  describe('identify_files_needed', () => {
    it('should identify files from update directives', () => {
      const patch = `*** Begin Patch
*** Update File: src/file1.ts
some content
*** Update File: src/file2.ts
more content
*** End Patch`;
      
      const files = identify_files_needed(patch);
      expect(files).toContain('src/file1.ts');
      expect(files).toContain('src/file2.ts');
      expect(files.length).toBe(2);
    });

    it('should identify files from delete directives', () => {
      const patch = `*** Begin Patch
*** Delete File: old/file.ts
*** Delete File: another.txt
*** End Patch`;
      
      const files = identify_files_needed(patch);
      expect(files).toContain('old/file.ts');
      expect(files).toContain('another.txt');
      expect(files.length).toBe(2);
    });

    it('should handle mixed directives', () => {
      const patch = `*** Begin Patch
*** Update File: update.txt
*** Delete File: delete.txt
*** Add File: new.txt
*** End Patch`;
      
      const files = identify_files_needed(patch);
      expect(files).toContain('update.txt');
      expect(files).toContain('delete.txt');
      expect(files.length).toBe(2); // Add files don't need existing files
    });
  });

  describe('text_to_patch - ADD operations', () => {
    it('should parse simple add file', () => {
      const patch_text = `*** Begin Patch
*** Add File: new.txt
+line 1
+line 2
+line 3
*** End Patch`;
      
      const { patch } = text_to_patch(patch_text, {});
      
      expect(patch.actions['new.txt']).toBeDefined();
      expect(patch.actions['new.txt'].type).toBe(ActionType.ADD);
      expect(patch.actions['new.txt'].new_file).toBe('line 1\nline 2\nline 3');
    });

    it('should handle empty add file', () => {
      const patch_text = `*** Begin Patch
*** Add File: empty.txt
+
*** End Patch`;
      
      const { patch } = text_to_patch(patch_text, {});
      
      expect(patch.actions['empty.txt']).toBeDefined();
      expect(patch.actions['empty.txt'].type).toBe(ActionType.ADD);
      expect(patch.actions['empty.txt'].new_file).toBe('');
    });
  });

  describe('text_to_patch - DELETE operations', () => {
    it('should parse delete file', () => {
      const orig = { 'old.txt': 'content to delete' };
      const patch_text = `*** Begin Patch
*** Delete File: old.txt
*** End Patch`;
      
      const { patch } = text_to_patch(patch_text, orig);
      
      expect(patch.actions['old.txt']).toBeDefined();
      expect(patch.actions['old.txt'].type).toBe(ActionType.DELETE);
    });

    it('should error on deleting non-existent file', () => {
      const patch_text = `*** Begin Patch
*** Delete File: missing.txt
*** End Patch`;
      
      expect(() => text_to_patch(patch_text, {})).toThrow(DiffError);
    });
  });

  describe('text_to_patch - UPDATE operations', () => {
    it('should parse simple update with chunks', () => {
      const orig = {
        'file.txt': `line 1
line 2
line 3
line 4
line 5`
      };
      
      const patch_text = `*** Begin Patch
*** Update File: file.txt
 line 1
 line 2
-line 3
+line 3 modified
 line 4
 line 5
*** End Patch`;
      
      const { patch } = text_to_patch(patch_text, orig);
      
      expect(patch.actions['file.txt']).toBeDefined();
      expect(patch.actions['file.txt'].type).toBe(ActionType.UPDATE);
      expect(patch.actions['file.txt'].chunks.length).toBe(1);
      
      const chunk = patch.actions['file.txt'].chunks[0];
      expect(chunk.orig_index).toBe(2); // Line 3 is at index 2
      expect(chunk.del_lines).toEqual(['line 3']);
      expect(chunk.ins_lines).toEqual(['line 3 modified']);
    });

    it('should handle multiple chunks', () => {
      const orig = {
        'file.txt': `line 1
line 2
line 3
line 4
line 5
line 6`
      };
      
      const patch_text = `*** Begin Patch
*** Update File: file.txt
 line 1
-line 2
+line 2 modified
 line 3
 line 4
-line 5
+line 5 modified
 line 6
*** End Patch`;
      
      const { patch } = text_to_patch(patch_text, orig);
      
      expect(patch.actions['file.txt'].chunks.length).toBe(2);
      expect(patch.actions['file.txt'].chunks[0].orig_index).toBe(1);
      expect(patch.actions['file.txt'].chunks[1].orig_index).toBe(4);
    });

    it('should handle additions without deletions', () => {
      const orig = {
        'file.txt': `line 1
line 2
line 3`
      };
      
      const patch_text = `*** Begin Patch
*** Update File: file.txt
 line 1
 line 2
+line 2.5
 line 3
*** End Patch`;
      
      const { patch } = text_to_patch(patch_text, orig);
      const chunk = patch.actions['file.txt'].chunks[0];
      
      expect(chunk.orig_index).toBe(2);
      expect(chunk.del_lines).toEqual([]);
      expect(chunk.ins_lines).toEqual(['line 2.5']);
    });

    it('should handle deletions without additions', () => {
      const orig = {
        'file.txt': `line 1
line 2
line 3
line 4`
      };
      
      const patch_text = `*** Begin Patch
*** Update File: file.txt
 line 1
 line 2
-line 3
 line 4
*** End Patch`;
      
      const { patch } = text_to_patch(patch_text, orig);
      const chunk = patch.actions['file.txt'].chunks[0];
      
      expect(chunk.orig_index).toBe(2);
      expect(chunk.del_lines).toEqual(['line 3']);
      expect(chunk.ins_lines).toEqual([]);
    });
  });

  describe('text_to_patch - Move operations', () => {
    it('should parse file move', () => {
      const orig = {
        'old/path.txt': 'content'
      };
      
      const patch_text = `*** Begin Patch
*** Update File: old/path.txt
*** Move to: new/path.txt
 content
*** End Patch`;
      
      const { patch } = text_to_patch(patch_text, orig);
      
      expect(patch.actions['old/path.txt']).toBeDefined();
      expect(patch.actions['old/path.txt'].move_path).toBe('new/path.txt');
    });
  });

  describe('patch_to_commit', () => {
    it('should convert ADD patch to commit', () => {
      const patch = new Patch();
      const action = new PatchAction();
      action.type = ActionType.ADD;
      action.new_file = 'new content';
      patch.actions['new.txt'] = action;
      
      const commit = patch_to_commit(patch, {});
      
      expect(commit.changes['new.txt'].type).toBe(ActionType.ADD);
      expect(commit.changes['new.txt'].new_content).toBe('new content');
    });

    it('should convert DELETE patch to commit', () => {
      const orig = { 'old.txt': 'old content' };
      const patch = new Patch();
      const action = new PatchAction();
      action.type = ActionType.DELETE;
      patch.actions['old.txt'] = action;
      
      const commit = patch_to_commit(patch, orig);
      
      expect(commit.changes['old.txt'].type).toBe(ActionType.DELETE);
      expect(commit.changes['old.txt'].old_content).toBe('old content');
    });

    it('should convert UPDATE patch to commit', () => {
      const orig = {
        'file.txt': `line 1
line 2
line 3`
      };
      
      const patch = new Patch();
      const action = new PatchAction();
      action.type = ActionType.UPDATE;
      
      const chunk = new Chunk();
      chunk.orig_index = 1;
      chunk.del_lines = ['line 2'];
      chunk.ins_lines = ['line 2 modified'];
      action.chunks = [chunk];
      
      patch.actions['file.txt'] = action;
      
      const commit = patch_to_commit(patch, orig);
      
      expect(commit.changes['file.txt'].type).toBe(ActionType.UPDATE);
      expect(commit.changes['file.txt'].old_content).toBe(orig['file.txt']);
      expect(commit.changes['file.txt'].new_content).toBe(`line 1
line 2 modified
line 3`);
    });

    it('should handle move in UPDATE', () => {
      const orig = { 'old.txt': 'content' };
      const patch = new Patch();
      const action = new PatchAction();
      action.type = ActionType.UPDATE;
      action.move_path = 'new.txt';
      action.chunks = [];
      patch.actions['old.txt'] = action;
      
      const commit = patch_to_commit(patch, orig);
      
      expect(commit.changes['old.txt'].type).toBe(ActionType.UPDATE);
      expect(commit.changes['old.txt'].move_path).toBe('new.txt');
    });
  });

  describe('apply_commit', () => {
    it('should apply ADD changes', () => {
      const written: Record<string, string> = {};
      const removed: string[] = [];
      
      const commit = new Commit();
      commit.changes['new.txt'] = {
        type: ActionType.ADD,
        new_content: 'new file content'
      };
      
      apply_commit(
        commit,
        (p, c) => { written[p] = c; },
        (p) => { removed.push(p); }
      );
      
      expect(written['new.txt']).toBe('new file content');
      expect(removed.length).toBe(0);
    });

    it('should apply DELETE changes', () => {
      const written: Record<string, string> = {};
      const removed: string[] = [];
      
      const commit = new Commit();
      commit.changes['old.txt'] = {
        type: ActionType.DELETE,
        old_content: 'old content'
      };
      
      apply_commit(
        commit,
        (p, c) => { written[p] = c; },
        (p) => { removed.push(p); }
      );
      
      expect(Object.keys(written).length).toBe(0);
      expect(removed).toContain('old.txt');
    });

    it('should apply UPDATE changes', () => {
      const written: Record<string, string> = {};
      const removed: string[] = [];
      
      const commit = new Commit();
      commit.changes['file.txt'] = {
        type: ActionType.UPDATE,
        old_content: 'old',
        new_content: 'new'
      };
      
      apply_commit(
        commit,
        (p, c) => { written[p] = c; },
        (p) => { removed.push(p); }
      );
      
      expect(written['file.txt']).toBe('new');
      expect(removed.length).toBe(0);
    });

    it('should apply UPDATE with move', () => {
      const written: Record<string, string> = {};
      const removed: string[] = [];
      
      const commit = new Commit();
      commit.changes['old.txt'] = {
        type: ActionType.UPDATE,
        old_content: 'content',
        new_content: 'modified content',
        move_path: 'new.txt'
      };
      
      apply_commit(
        commit,
        (p, c) => { written[p] = c; },
        (p) => { removed.push(p); }
      );
      
      expect(written['new.txt']).toBe('modified content');
      expect(removed).toContain('old.txt');
    });
  });

  describe('process_patch - Integration', () => {
    it('should process complete patch with multiple operations', () => {
      const files: Record<string, string> = {
        'existing.txt': 'original content',
        'to_delete.txt': 'delete me',
        'to_update.txt': `line 1
line 2
line 3`
      };
      
      const written: Record<string, string> = {};
      const removed: string[] = [];
      
      const patch_text = `*** Begin Patch
*** Add File: new.txt
+brand new file
*** Delete File: to_delete.txt
*** Update File: to_update.txt
 line 1
-line 2
+line 2 modified
 line 3
*** Update File: existing.txt
*** Move to: moved.txt
 original content
*** End Patch`;
      
      process_patch(
        patch_text,
        (p) => files[p] || '',
        (p, c) => { written[p] = c; },
        (p) => { removed.push(p); }
      );
      
      expect(written['new.txt']).toBe('brand new file');
      expect(written['to_update.txt']).toBe(`line 1
line 2 modified
line 3`);
      expect(written['moved.txt']).toBe('original content');
      expect(removed).toContain('to_delete.txt');
      expect(removed).toContain('existing.txt');
    });

    it('should handle complex multi-chunk updates', () => {
      const files: Record<string, string> = {
        'code.ts': `function foo() {
  console.log('hello');
}

function bar() {
  console.log('world');
}

function baz() {
  return 42;
}`
      };
      
      const written: Record<string, string> = {};
      
      const patch_text = `*** Begin Patch
*** Update File: code.ts
 function foo() {
-  console.log('hello');
+  console.log('hello modified');
 }
 
 function bar() {
   console.log('world');
 }
 
 function baz() {
-  return 42;
+  return 43;
 }
*** End Patch`;
      
      process_patch(
        patch_text,
        (p) => files[p] || '',
        (p, c) => { written[p] = c; },
        () => {}
      );
      
      expect(written['code.ts']).toBe(`function foo() {
  console.log('hello modified');
}

function bar() {
  console.log('world');
}

function baz() {
  return 43;
}`);
    });
  });

  describe('Error handling', () => {
    it('should throw on invalid patch format', () => {
      expect(() => text_to_patch('invalid', {})).toThrow(DiffError);
    });

    it('should throw on missing Begin Patch', () => {
      const patch = `*** Update File: file.txt
*** End Patch`;
      expect(() => text_to_patch(patch, {})).toThrow(DiffError);
    });

    it('should throw on missing End Patch', () => {
      const patch = `*** Begin Patch
*** Add File: new.txt
+content`;
      expect(() => text_to_patch(patch, {})).toThrow(DiffError);
    });

    it('should throw on duplicate file paths', () => {
      const patch = `*** Begin Patch
*** Add File: file.txt
+content
*** Add File: file.txt
+other content
*** End Patch`;
      expect(() => text_to_patch(patch, {})).toThrow(DiffError);
    });

    it('should throw on updating non-existent file', () => {
      const patch = `*** Begin Patch
*** Update File: missing.txt
 some content
*** End Patch`;
      expect(() => text_to_patch(patch, {})).toThrow(DiffError);
    });

    it('should throw on invalid context in update', () => {
      const files = {
        'file.txt': `line 1
line 2
line 3`
      };
      
      const patch = `*** Begin Patch
*** Update File: file.txt
 wrong line 1
 wrong line 2
-line 3
+line 3 modified
*** End Patch`;
      
      expect(() => text_to_patch(patch, files)).toThrow(DiffError);
    });
  });

  describe('Fuzzy matching', () => {
    it('should handle trailing whitespace differences', () => {
      const files = {
        'file.txt': `line 1  
line 2
line 3`  // Note: trailing spaces on line 1
      };
      
      const patch_text = `*** Begin Patch
*** Update File: file.txt
 line 1
-line 2
+line 2 modified
 line 3
*** End Patch`;
      
      const { patch, fuzz } = text_to_patch(patch_text, files);
      
      expect(patch.actions['file.txt']).toBeDefined();
      expect(fuzz).toBeGreaterThan(0); // Should have some fuzz due to whitespace
    });

    it('should handle completely trimmed context lines', () => {
      const files = {
        'file.txt': `  line 1  
  line 2  
  line 3  `
      };
      
      const patch_text = `*** Begin Patch
*** Update File: file.txt
 line 1
-line 2
+line 2 modified
 line 3
*** End Patch`;
      
      const { patch, fuzz } = text_to_patch(patch_text, files);
      
      expect(patch.actions['file.txt']).toBeDefined();
      expect(fuzz).toBeGreaterThan(1); // Higher fuzz for full trim
    });
  });

  describe('End of File handling', () => {
    it('should handle EOF marker correctly', () => {
      const files = {
        'file.txt': `line 1
line 2
line 3`
      };
      
      const patch_text = `*** Begin Patch
*** Update File: file.txt
 line 1
 line 2
-line 3
+line 3 modified
*** End of File
*** End Patch`;
      
      const { patch } = text_to_patch(patch_text, files);
      
      expect(patch.actions['file.txt']).toBeDefined();
      const commit = patch_to_commit(patch, files);
      expect(commit.changes['file.txt'].new_content).toBe(`line 1
line 2
line 3 modified`);
    });

    it('should search from end when EOF is specified', () => {
      const files = {
        'file.txt': `duplicate
content
duplicate
content
unique end`
      };
      
      const patch_text = `*** Begin Patch
*** Update File: file.txt
 duplicate
 content
-unique end
+modified end
*** End of File
*** End Patch`;
      
      const { patch } = text_to_patch(patch_text, files);
      const commit = patch_to_commit(patch, files);
      
      expect(commit.changes['file.txt'].new_content).toBe(`duplicate
content
duplicate
content
modified end`);
    });
  });
});