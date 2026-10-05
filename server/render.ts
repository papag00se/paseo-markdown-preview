import type { Notebook } from 'crossnote';
import { crossnote, cheerio } from './dependencies';
import path from 'node:path';
import { confinedFile, readMarkdown } from './files';

export class Renderer {
  private notebook: Promise<Notebook>;
  constructor(private root: string) {
    const fs = crossnote.wrapNodeFSAsApi();
    const confined = async (filename: string) => confinedFile(root, path.relative(root, filename));
    const readonly = async () => { throw new Error('Rendering cannot modify workspace files.'); };
    this.notebook = crossnote.Notebook.init({ notebookPath: root, fs: {
      readFile: async (filename, encoding) => fs.readFile(await confined(filename), encoding),
      stat: async filename => fs.stat(await confined(filename)),
      readdir: async filename => fs.readdir(await confined(filename)),
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
    const doc = await readMarkdown(this.root, relative);
    const notebook = await this.notebook;
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
    $('[src], a[href]').each((_, element) => {
      const node = $(element);
      const attr = node.attr('src') === undefined ? 'href' : 'src';
      const value = node.attr(attr)!;
      if (/^(https?:|mailto:|data:|#)/i.test(value)) return;
      if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith('file:')) { node.removeAttr(attr); return; }
      const absolute = value.startsWith('file:') ? new URL(value).pathname : path.resolve(path.dirname(doc.filename), decodeURIComponent(value.split('#')[0]));
      const target = path.relative(this.root, absolute);
      node.attr(attr, `${sessionPath}/file?path=${encodeURIComponent(target)}`);
    });
    // No document-supplied executable markup reaches the browser. Mermaid is handled by our script.
    $('script, iframe, object, embed, form, base, meta, link').remove();
    $('*').each((_, element) => {
      for (const attr of Object.keys($(element).attr() ?? {})) if (/^on/i.test(attr)) $(element).removeAttr(attr);
    });
    return { html: $.html(), revision: doc.revision, file: relative };
  }
}
