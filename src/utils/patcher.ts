// patcher.ts
// A TypeScript port of your Python implementation.
// Target: Node.js (fs/path), ES2020+
// Compile: tsc patcher.ts && node patcher.js < patch.txt

import * as fs from 'fs';
import * as path from 'path';

// ---------- Types & Models ----------

export enum ActionType {
    ADD = 'add',
    DELETE = 'delete',
    UPDATE = 'update',
}

export interface FileChange {
    type: ActionType;
    old_content?: string;
    new_content?: string;
    move_path?: string;
}

export class Commit {
    changes: Record<string, FileChange> = {};
}

export class Chunk {
    orig_index: number = -1; // line index of the first line in the original file
    del_lines: string[] = [];
    ins_lines: string[] = [];
}

export class PatchAction {
    type: ActionType = ActionType.UPDATE;
    new_file?: string;
    chunks: Chunk[] = [];
    move_path?: string;
}

export class Patch {
    actions: Record<string, PatchAction> = {};
}

export class DiffError extends Error {}

// ---------- Utility Helpers ----------

function arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function rstrip(s: string): string {
    return s.replace(/\s+$/, '');
}

// ---------- assemble_changes ----------

export function assemble_changes(
    orig: Record<string, string | null | undefined>,
    dest: Record<string, string | null | undefined>
): Commit {
    const commit = new Commit();
    const keys = new Set<string>([...Object.keys(orig), ...Object.keys(dest)]);
    const sorted = [...keys].sort();

    for (const p of sorted) {
        const old_content = orig[p] ?? undefined;
        const new_content = dest[p] ?? undefined;
        if (old_content !== new_content) {
            if (old_content !== undefined && new_content !== undefined) {
                commit.changes[p] = {
                    type: ActionType.UPDATE,
                    old_content,
                    new_content,
                };
            } else if (new_content) {
                commit.changes[p] = {
                    type: ActionType.ADD,
                    new_content,
                };
            } else if (old_content) {
                commit.changes[p] = {
                    type: ActionType.DELETE,
                    old_content,
                };
            } else {
                // Mirrors the Python "assert False"
                throw new DiffError(
                    'assemble_changes: unreachable state for path ' + p
                );
            }
        }
    }
    return commit;
}

// ---------- Parser & Parsing ----------

class Parser {
    current_files: Record<string, string> = {};
    lines: string[] = [];
    index: number = 0;
    patch: Patch = new Patch();
    fuzz: number = 0;

    constructor(init?: Partial<Parser>) {
        Object.assign(this, init);
    }

    is_done(prefixes?: string[]): boolean {
        if (this.index >= this.lines.length) return true;
        if (
            prefixes &&
            prefixes.some(pre => this.lines[this.index].startsWith(pre))
        ) {
            return true;
        }
        return false;
    }

    startswith(prefix: string | string[]): boolean {
        if (this.index >= this.lines.length) {
            throw new DiffError(`Index: ${this.index} >= ${this.lines.length}`);
        }
        const s = this.lines[this.index];
        if (Array.isArray(prefix)) return prefix.some(p => s.startsWith(p));
        return s.startsWith(prefix);
    }

    read_str(prefix: string = '', return_everything: boolean = false): string {
        if (this.index >= this.lines.length) {
            throw new DiffError(`Index: ${this.index} >= ${this.lines.length}`);
        }
        const s = this.lines[this.index];
        if (s.startsWith(prefix)) {
            const text = return_everything ? s : s.slice(prefix.length);
            this.index += 1;
            return text;
        }
        return '';
    }

    parse(): void {
        while (!this.is_done(['*** End Patch'])) {
            let pathStr = this.read_str('*** Update File: ');
            if (pathStr) {
                if (this.patch.actions[pathStr]) {
                    throw new DiffError(
                        `Update File Error: Duplicate Path: ${pathStr}`
                    );
                }
                const move_to = this.read_str('*** Move to: ');
                if (!(pathStr in this.current_files)) {
                    throw new DiffError(
                        `Update File Error: Missing File: ${pathStr}`
                    );
                }
                const text = this.current_files[pathStr];
                const action = this.parse_update_file(text);
                action.move_path = move_to || undefined; // TODO: optional validation
                this.patch.actions[pathStr] = action;
                continue;
            }

            pathStr = this.read_str('*** Delete File: ');
            if (pathStr) {
                if (this.patch.actions[pathStr]) {
                    throw new DiffError(
                        `Delete File Error: Duplicate Path: ${pathStr}`
                    );
                }
                if (!(pathStr in this.current_files)) {
                    throw new DiffError(
                        `Delete File Error: Missing File: ${pathStr}`
                    );
                }
                const act = new PatchAction();
                act.type = ActionType.DELETE;
                this.patch.actions[pathStr] = act;
                continue;
            }

            pathStr = this.read_str('*** Add File: ');
            if (pathStr) {
                if (this.patch.actions[pathStr]) {
                    throw new DiffError(
                        `Add File Error: Duplicate Path: ${pathStr}`
                    );
                }
                this.patch.actions[pathStr] = this.parse_add_file();
                continue;
            }

            throw new DiffError(`Unknown Line: ${this.lines[this.index]}`);
        }
        if (!this.startswith('*** End Patch')) {
            throw new DiffError('Missing End Patch');
        }
        this.index += 1;
    }

    parse_update_file(text: string): PatchAction {
        const action = new PatchAction();
        action.type = ActionType.UPDATE;

        const lines = text.split('\n');
        let index = 0;

        while (
            !this.is_done([
                '*** End Patch',
                '*** Update File:',
                '*** Delete File:',
                '*** Add File:',
                '*** End of File',
            ])
        ) {
            const defStr = this.read_str('@@ ');
            let sectionStr = '';
            if (!defStr) {
                if (this.lines[this.index] === '@@') {
                    sectionStr = this.lines[this.index];
                    this.index += 1;
                }
            }
            if (!defStr && !sectionStr && index !== 0) {
                throw new DiffError(`Invalid Line:\n${this.lines[this.index]}`);
            }
            if (defStr.trim()) {
                let found = false;
                if (!lines.slice(0, index).some(s => s === defStr)) {
                    for (let i = index; i < lines.length; i++) {
                        const s = lines[i];
                        if (s === defStr) {
                            index = i + 1;
                            found = true;
                            break;
                        }
                    }
                }
                if (
                    !found &&
                    !lines.slice(0, index).some(s => s.trim() === defStr.trim())
                ) {
                    for (let i = index; i < lines.length; i++) {
                        const s = lines[i];
                        if (s.trim() === defStr.trim()) {
                            index = i + 1;
                            this.fuzz += 1;
                            found = true;
                            break;
                        }
                    }
                }
            }

            const [next_chunk_context, chunks, end_patch_index, eof] =
                peek_next_section(this.lines, this.index);
            const next_chunk_text = next_chunk_context.join('\n');
            const { new_index, fuzz } = find_context(
                lines,
                next_chunk_context,
                index,
                eof
            );
            if (new_index === -1) {
                if (eof) {
                    throw new DiffError(
                        `Invalid EOF Context ${index}:\n${next_chunk_text}`
                    );
                } else {
                    throw new DiffError(
                        `Invalid Context ${index}:\n${next_chunk_text}`
                    );
                }
            }
            this.fuzz += fuzz;

            for (const ch of chunks) {
                ch.orig_index += new_index;
                action.chunks.push(ch);
            }
            index = new_index + next_chunk_context.length;
            this.index = end_patch_index;
            continue;
        }

        return action;
    }

    parse_add_file(): PatchAction {
        const lines: string[] = [];
        while (
            !this.is_done([
                '*** End Patch',
                '*** Update File:',
                '*** Delete File:',
                '*** Add File:',
            ])
        ) {
            let s = this.read_str();
            if (!s.startsWith('+')) {
                throw new DiffError(`Invalid Add File Line: ${s}`);
            }
            s = s.slice(1);
            lines.push(s);
        }
        const act = new PatchAction();
        act.type = ActionType.ADD;
        act.new_file = lines.join('\n');
        return act;
    }
}

// ---------- Context Finding ----------

function find_context_core(
    lines: string[],
    context: string[],
    start: number
): { new_index: number; fuzz: number } {
    if (!context || context.length === 0) {
        // console.log("context is empty");
        return { new_index: start, fuzz: 0 };
    }

    // Prefer identical
    for (let i = start; i < lines.length; i++) {
        const slice = lines.slice(i, i + context.length);
        if (arraysEqual(slice, context)) {
            return { new_index: i, fuzz: 0 };
        }
    }

    // RStrip is ok
    for (let i = start; i < lines.length; i++) {
        const slice = lines.slice(i, i + context.length).map(s => rstrip(s));
        const ctx = context.map(s => rstrip(s));
        if (arraysEqual(slice, ctx)) {
            return { new_index: i, fuzz: 1 };
        }
    }

    // Fine, Strip is ok too
    for (let i = start; i < lines.length; i++) {
        const slice = lines.slice(i, i + context.length).map(s => s.trim());
        const ctx = context.map(s => s.trim());
        if (arraysEqual(slice, ctx)) {
            return { new_index: i, fuzz: 100 };
        }
    }

    return { new_index: -1, fuzz: 0 };
}

function find_context(
    lines: string[],
    context: string[],
    start: number,
    eof: boolean
): { new_index: number; fuzz: number } {
    if (eof) {
        let { new_index, fuzz } = find_context_core(
            lines,
            context,
            lines.length - context.length
        );
        if (new_index !== -1) {
            return { new_index, fuzz };
        }
        ({ new_index, fuzz } = find_context_core(lines, context, start));
        return { new_index, fuzz: fuzz + 10000 };
    }
    return find_context_core(lines, context, start);
}

function peek_next_section(
    lines: string[],
    index: number
): [string[], Chunk[], number, boolean] {
    const old: string[] = [];
    let del_lines: string[] = [];
    let ins_lines: string[] = [];
    const chunks: Chunk[] = [];
    let mode: 'keep' | 'add' | 'delete' = 'keep';
    const orig_index = index;

    function startsWithAny(s: string, prefixes: string[]): boolean {
        return prefixes.some(p => s.startsWith(p));
    }

    while (index < lines.length) {
        let s = lines[index];

        if (
            startsWithAny(s, [
                '@@',
                '*** End Patch',
                '*** Update File:',
                '*** Delete File:',
                '*** Add File:',
                '*** End of File',
            ])
        ) {
            break;
        }
        if (s === '***') {
            break;
        } else if (s.startsWith('***')) {
            throw new DiffError(`Invalid Line: ${s}`);
        }

        index += 1;
        const last_mode: 'keep' | 'add' | 'delete' = mode;

        if (s === '') s = ' ';
        const first = s[0];
        if (first === '+') mode = 'add';
        else if (first === '-') mode = 'delete';
        else if (first === ' ') mode = 'keep';
        else throw new DiffError(`Invalid Line: ${s}`);

        s = s.slice(1);

        if (mode === 'keep' && last_mode !== mode) {
            if (ins_lines.length || del_lines.length) {
                const ch = new Chunk();
                ch.orig_index = old.length - del_lines.length;
                ch.del_lines = del_lines;
                ch.ins_lines = ins_lines;
                chunks.push(ch);
            }
            del_lines = [];
            ins_lines = [];
        }

        if (mode === 'delete') {
            del_lines.push(s);
            old.push(s);
        } else if (mode === 'add') {
            ins_lines.push(s);
        } else if (mode === 'keep') {
            old.push(s);
        }
    }

    if (ins_lines.length || del_lines.length) {
        const ch = new Chunk();
        ch.orig_index = old.length - del_lines.length;
        ch.del_lines = del_lines;
        ch.ins_lines = ins_lines;
        chunks.push(ch);
        del_lines = [];
        ins_lines = [];
    }

    if (index < lines.length && lines[index] === '*** End of File') {
        index += 1;
        return [old, chunks, index, true];
    }
    if (index === orig_index) {
        throw new DiffError(
            `Nothing in this section - index=${index} ${lines[index]}`
        );
    }
    return [old, chunks, index, false];
}

// ---------- Text <-> Patch ----------

export function text_to_patch(
    text: string,
    orig: Record<string, string>
): { patch: Patch; fuzz: number } {
    const lines = text.trim().split('\n');
    if (
        lines.length < 2 ||
        !lines[0].startsWith('*** Begin Patch') ||
        lines[lines.length - 1] !== '*** End Patch'
    ) {
        throw new DiffError('Invalid patch text');
    }

    const parser = new Parser({
        current_files: orig,
        lines,
        index: 1,
    });

    parser.parse();
    return { patch: parser.patch, fuzz: parser.fuzz };
}

export function identify_files_needed(text: string): string[] {
    const lines = text.trim().split('\n');
    const result = new Set<string>();
    for (const line of lines) {
        if (line.startsWith('*** Update File: ')) {
            result.add(line.slice('*** Update File: '.length));
        }
        if (line.startsWith('*** Delete File: ')) {
            result.add(line.slice('*** Delete File: '.length));
        }
    }
    return Array.from(result);
}

// ---------- Patch -> Commit ----------

function get_updated_file(
    text: string,
    action: PatchAction,
    p: string
): string {
    if (action.type !== ActionType.UPDATE) {
        throw new DiffError('get_updated_file called with non-UPDATE action');
    }
    const orig_lines = text.split('\n');
    const dest_lines: string[] = [];
    let orig_index = 0;
    let dest_index = 0;

    for (const chunk of action.chunks) {
        if (chunk.orig_index > orig_lines.length) {
            const msg = `_get_updated_file: ${p}: chunk.orig_index ${chunk.orig_index} > len(lines) ${orig_lines.length}`;
            console.log(msg);
            throw new DiffError(msg);
        }
        if (orig_index > chunk.orig_index) {
            throw new DiffError(
                `_get_updated_file: ${p}: orig_index ${orig_index} > chunk.orig_index ${chunk.orig_index}`
            );
        }

        dest_lines.push(...orig_lines.slice(orig_index, chunk.orig_index));
        const delta = chunk.orig_index - orig_index;
        orig_index += delta;
        dest_index += delta;

        if (chunk.ins_lines && chunk.ins_lines.length) {
            for (let i = 0; i < chunk.ins_lines.length; i++) {
                dest_lines.push(chunk.ins_lines[i]);
            }
            dest_index += chunk.ins_lines.length;
        }

        orig_index += chunk.del_lines.length;
    }

    dest_lines.push(...orig_lines.slice(orig_index));
    const delta = orig_lines.length - orig_index;
    orig_index += delta;
    dest_index += delta;

    if (orig_index !== orig_lines.length || dest_index !== dest_lines.length) {
        throw new DiffError('_get_updated_file: index mismatch');
    }

    return dest_lines.join('\n');
}

export function patch_to_commit(
    patch: Patch,
    orig: Record<string, string>
): Commit {
    const commit = new Commit();
    for (const [p, action] of Object.entries(patch.actions)) {
        if (action.type === ActionType.DELETE) {
            commit.changes[p] = {
                type: ActionType.DELETE,
                old_content: orig[p],
            };
        } else if (action.type === ActionType.ADD) {
            commit.changes[p] = {
                type: ActionType.ADD,
                new_content: action.new_file,
            };
        } else if (action.type === ActionType.UPDATE) {
            const new_content = get_updated_file(orig[p], action, p);
            commit.changes[p] = {
                type: ActionType.UPDATE,
                old_content: orig[p],
                new_content,
                move_path: action.move_path,
            };
        }
    }
    return commit;
}

// ---------- IO + Orchestration ----------

export function load_files(
    paths: string[],
    open_fn: (p: string) => string
): Record<string, string> {
    const orig: Record<string, string> = {};
    for (const p of paths) {
        orig[p] = open_fn(p);
    }
    return orig;
}

export function apply_commit(
    commit: Commit,
    write_fn: (p: string, content: string) => void,
    remove_fn: (p: string) => void
): void {
    for (const [p, change] of Object.entries(commit.changes)) {
        if (change.type === ActionType.DELETE) {
            remove_fn(p);
        } else if (change.type === ActionType.ADD) {
            write_fn(p, change.new_content ?? '');
        } else if (change.type === ActionType.UPDATE) {
            if (change.move_path) {
                write_fn(change.move_path, change.new_content ?? '');
                remove_fn(p);
            } else {
                write_fn(p, change.new_content ?? '');
            }
        }
    }
}

export function process_patch(
    text: string,
    open_fn: (p: string) => string,
    write_fn: (p: string, content: string) => void,
    remove_fn: (p: string) => void
): string {
    if (!text.startsWith('*** Begin Patch')) {
        throw new DiffError('Invalid patch text');
    }
    const paths = identify_files_needed(text);
    const orig = load_files(paths, open_fn);
    const { patch } = text_to_patch(text, orig);
    const commit = patch_to_commit(patch, orig);
    apply_commit(commit, write_fn, remove_fn);
    return 'Done!';
}

// ---------- Default Node FS Hooks ----------

export function open_file(p: string): string {
    return fs.readFileSync(p, 'utf8');
}

export function write_file(p: string, content: string): void {
    if (p.startsWith('/')) {
        console.log('We do not support absolute paths.');
        return;
    }
    const dir = path.dirname(p);
    if (dir && dir !== '.') {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(p, content, 'utf8');
}

export function remove_file(p: string): void {
    fs.unlinkSync(p);
}

// ---------- CLI ----------

export function main(): void {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (c: Buffer) => chunks.push(c));
    process.stdin.on('end', () => {
        const patch_text = Buffer.concat(chunks).toString('utf8');
        if (!patch_text) {
            console.log('Please pass patch text through stdin');
            return;
        }
        try {
            const result = process_patch(
                patch_text,
                open_file,
                write_file,
                remove_file
            );
            console.log(result);
        } catch (e: unknown) {
            if (e instanceof DiffError) {
                console.log(String(e.message));
                return;
            }
            throw e;
        }
    });
}

// Run if invoked directly
if (require.main === module) {
    main();
}
