import { createHash } from 'node:crypto';
import { open, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export const markdownExtension = /\.(md|markdown|mdx|mkd|mdown)$/i;
export const revisionOf = (content: string) => createHash('sha256').update(content).digest('hex');
const ignored = new Set(['node_modules', '.git', '.cache', '.crossnote', 'vendor']);

export async function confinedFile(root: string, relative: string): Promise<string> {
  if (path.isAbsolute(relative) || relative.includes('\0')) throw new Error('Choose a file inside this workspace.');
  const resolved = await realpath(path.resolve(root, relative));
  const rel = path.relative(root, resolved);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('File is outside this workspace.');
  return resolved;
}

export async function readMarkdown(root: string, relative: string) {
  if (!markdownExtension.test(relative)) throw new Error('Choose a Markdown file.');
  const filename = await confinedFile(root, relative);
  const info = await stat(filename);
  if (!info.isFile() || info.size > 2 * 1024 * 1024) throw new Error('Preview supports regular Markdown files up to 2 MiB.');
  const handle = await open(filename, 'r');
  try {
    const bytes = await handle.readFile();
    const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    return { filename, source, revision: revisionOf(source) };
  } finally { await handle.close(); }
}

export async function listMarkdown(root: string) {
  const files: string[] = [];
  let visited = 0;
  let truncated = false;
  async function walk(relative: string, depth: number): Promise<void> {
    if (depth > 12) { truncated = true; return; }
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      if (++visited > 20000 || files.length >= 2000) { truncated = true; return; }
      if (ignored.has(entry.name) || entry.name.startsWith('.')) continue;
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) await walk(child, depth + 1);
      else if (entry.isFile() && markdownExtension.test(entry.name)) files.push(child);
    }
  }
  await walk('', 0);
  return { files: files.sort(), truncated };
}

// Change only the checkbox byte. A preview click never rewrites or truncates the document.
// Opening the source itself also preserves permissions, hard links, and inode-based watchers.
export async function setTask(root: string, relative: string, revision: string, line: number, checked: boolean) {
  const doc = await readMarkdown(root, relative);
  if (doc.revision !== revision) throw new Error('The file changed. Refresh the preview before editing a task.');
  const lines = doc.source.split('\n');
  const original = lines[line];
  const match = original?.match(/^\uFEFF?(?:\s*>\s*)*\s*(?:[-+*]|\d+[.)])\s+\[([ xX])\](?=\s|$)/);
  if (!match) throw new Error('This line is no longer a task checkbox.');
  const marker = match[0].lastIndexOf('[') + 1;
  const prefix = lines.slice(0, line).join('\n') + (line > 0 ? '\n' : '');
  const offset = Buffer.byteLength(prefix + original.slice(0, marker));
  const handle = await open(doc.filename, 'r+');
  try {
    const bytes = await handle.readFile();
    if (revisionOf(bytes.toString('utf8')) !== revision) throw new Error('The file changed. Refresh the preview before editing a task.');
    await handle.write(Buffer.from(checked ? 'x' : ' '), 0, 1, offset);
    await handle.sync();
  } finally { await handle.close(); }
}
