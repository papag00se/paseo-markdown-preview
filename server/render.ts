import type { Notebook } from 'crossnote';
import { crossnote, cheerio } from './dependencies';
import path from 'node:path';
import { confinedFile, imageTypes, readMarkdown } from './files';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export class Renderer {
  private notebook: Promise<Notebook>;
  constructor(private root: string, private document?: string) {
    const fs = crossnote.wrapNodeFSAsApi();
    const confined = async (filename: string) => {
      const resolved = await confinedFile(root, path.relative(root, filename));
      if (document && resolved !== document && resolved !== root) {
        const info = await stat(resolved);
        if (!imageTypes[path.extname(resolved).toLowerCase()] || !info.isFile() || info.size > 10 * 1024 * 1024)
          throw new Error('This preview can access only the opened Markdown file and local images.');
      }
      return resolved;
    };
    const readonly = async () => { throw new Error('Rendering cannot modify workspace files.'); };
    this.notebook = crossnote.Notebook.init({ notebookPath: root, fs: {
      readFile: async (filename, encoding) => fs.readFile(await confined(filename), encoding),
      stat: async filename => fs.stat(await confined(filename)),
      readdir: async filename => document ? [] : fs.readdir(await confined(filename)),
      exists: async filename => {
        // Previewing a document must not load or execute a repository's JS parser/config hooks.
        if (path.relative(root, filename).split(path.sep).includes('.crossnote')) return false;
        try { return await fs.exists(await confined(filename)); } catch { return false; }
      },
      writeFile: readonly, mkdir: readonly, unlink: readonly,
    }, config: {
      enableScriptExecution: false, mathRenderingOption: 'KaTeX',
      previewTheme: 'github-light.css', codeBlockTheme: 'github.css',
    } });
  }

  async render(relative: string, sessionPath: string) {
    const doc = await readMarkdown(this.root, relative, this.document);
    const notebook = await this.notebook;
    if (this.document) {
      // Crossnote's PDF converter does not use the supplied filesystem adapter.
      // It cannot participate in a single-document grant. Keep code examples literal.
      const literalLines = new Set<number>();
      for (const token of notebook.md.parse(doc.source, {})) {
        if (token.type === 'fence' && token.markup.startsWith('`') && token.map)
          for (let line = token.map[0]; line < token.map[1]; line++) literalLines.add(line);
      }
      for (const [line, text] of doc.source.split('\n').entries()) {
        if (literalLines.has(line) || !/^\s*(?:@import\s+"|!\[[^\]]*\]\(|!\[\[)/.test(text)) continue;
        let decoded = text;
        try { decoded = decodeURIComponent(text); } catch { /* Crossnote also keeps malformed escapes literal. */ }
        if (/\.pdf(?:$|[#\s"'|)\]])/i.test(decoded)) throw new Error('PDF imports require a workspace preview.');
      }
    }
    const result = await notebook.getNoteMarkdownEngine(doc.filename).parseMD(doc.source || '\n', {
      isForPreview: true, useRelativeFilePath: true, hideFrontMatter: true, runAllCodeChunks: false,
    });
    const $ = cheerio.load(result.html, null, false);
    // Keep renderer source mapping, but only permit edits to tasks in the actual file.
    $('input[type=checkbox]').each((_, element) => {
      const checkbox = $(element);
      checkbox.attr('aria-label', checkbox.parent().text().trim() || 'Task checkbox');
      checkbox.closest('li').addClass('task-list-item');
      const line = Number(checkbox.attr('data-source-line')) - 1;
      if (!Number.isInteger(line) || line < 0 || line >= doc.source.split('\n').length) checkbox.attr('disabled', '');
      else checkbox.attr('data-task-line', String(line));
    });
    // Navigation destinations come from resolved links, never document-supplied metadata.
    $('[data-paseo-path]').removeAttr('data-paseo-path');
    $('[src], a[href]').each((_, element) => {
      const node = $(element);
      const attr = node.attr('src') === undefined ? 'href' : 'src';
      const value = node.attr(attr)!;
      if (/^(https?:|mailto:|data:|#)/i.test(value)) return;
      if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith('file:')) { node.removeAttr(attr); return; }
      const absolute = value.startsWith('file:') ? fileURLToPath(new URL(value)) : path.resolve(path.dirname(doc.filename), decodeURIComponent(value.split('#')[0]));
      const target = path.relative(this.root, absolute);
      node.attr(attr, `${sessionPath}/file?path=${encodeURIComponent(target)}`);
      if (attr === 'href') node.attr('data-paseo-path', absolute);
    });
    // No document-supplied executable markup reaches the browser. Mermaid is handled by our script.
    $('script, iframe, object, embed, form, base, meta, link').remove();
    $('*').each((_, element) => {
      for (const attr of Object.keys($(element).attr() ?? {})) if (/^on/i.test(attr)) $(element).removeAttr(attr);
    });
    return { html: $.html(), revision: doc.revision, file: relative };
  }
}
