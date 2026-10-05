import { randomBytes } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';
import { crossnote } from './dependencies';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { confinedFile, listMarkdown, readMarkdown, setTask } from './files';
import { Renderer } from './render';
import { previewPage } from './page';

const taskSchema = z.object({ file: z.string(), revision: z.string().length(64), line: z.number().int().nonnegative(), checked: z.boolean() });
const types: Record<string,string> = { '.css':'text/css', '.js':'text/javascript', '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.svg':'image/svg+xml', '.webp':'image/webp' };
type Session = { root: string; renderer: Renderer; expires: number; queue: Promise<unknown> };

export async function createPreviewService() {
  const sessions = new Map<string,Session>();
  const assetRoot = await realpath(crossnote.utility.getCrossnoteBuildDirectory());
  let port = 0;
  const respond = (res:ServerResponse, status:number, value:unknown) => { res.writeHead(status, {'Content-Type':'application/json', 'Cache-Control':'no-store'}); res.end(JSON.stringify(value)); };
  const server = createServer(async (req,res) => {
    try {
      if(req.headers.host !== `127.0.0.1:${port}`) { respond(res,403,{error:'Invalid preview host.'}); return; }
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      const [,, token, ...parts] = url.pathname.split('/');
      const session = sessions.get(token);
      if (!session || session.expires < Date.now()) { sessions.delete(token); respond(res,404,{error:'Preview expired. Reopen the workspace preview.'}); return; }
      const route = parts.join('/');
      const base = `/preview/${token}`;
      res.setHeader('Referrer-Policy','no-referrer');
      res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Cache-Control','no-store');
      if(req.method==='POST' && (req.headers.origin !== `http://127.0.0.1:${port}` || req.headers['content-type'] !== 'application/json')) { respond(res,403,{error:'Invalid preview edit origin.'});return; }
      if(req.method!=='GET' && !(req.method==='POST' && route==='task')) { respond(res,405,{error:'Unsupported preview action.'}); return; }
      if(route==='') {
        const nonce=randomBytes(16).toString('base64');
        res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http:; font-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'`);
        const theme=url.searchParams.get('theme');
        res.writeHead(200,{'Content-Type':'text/html'});res.end(previewPage(base,nonce,theme==='dark'||theme==='light'?theme:'auto'));return;
      }
      if(route.startsWith('assets/')) {
        const relative=decodeURIComponent(route.slice(7));
        if(!/^(styles|dependencies\/(katex|mermaid))\//.test(relative)) throw new Error('Unknown rendering asset.');
        const file=await confinedFile(assetRoot,relative);res.writeHead(200,{'Content-Type':types[path.extname(file)] ?? 'application/octet-stream'});res.end(await readFile(file));return;
      }
      if(route==='files') { respond(res,200,await listMarkdown(session.root));return; }
      if(route==='source') { respond(res,200,await readMarkdown(session.root,url.searchParams.get('path') ?? ''));return; }
      if(route==='file') {
        const file=await confinedFile(session.root,url.searchParams.get('path') ?? '');
        const info=await stat(file);
        const type=types[path.extname(file).toLowerCase()];
        if(!info.isFile() || info.size>10*1024*1024 || !type?.startsWith('image/')) throw new Error('Only workspace images can be loaded here.');
        res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
        res.writeHead(200,{'Content-Type':type});res.end(await readFile(file));return;
      }
      // Crossnote engines and edits are serialized across every preview session for this root.
      const peers=[...sessions.values()].filter(s=>s.root===session.root);
      const work=Promise.all(peers.map(s=>s.queue)).then(async()=>{
        if(route==='render') {
          const file=url.searchParams.get('path') ?? '';
          const doc=await readMarkdown(session.root,file);
          if(doc.revision===url.searchParams.get('revision')) return {unchanged:true};
          return session.renderer.render(file,base);
        }
        if(route==='task') {
          let body='';for await(const chunk of req) {body+=chunk;if(body.length>8192)throw new Error('Preview edit is too large.');}
          const edit=taskSchema.parse(JSON.parse(body));
          await setTask(session.root,edit.file,edit.revision,edit.line,edit.checked);return {saved:true};
        }
        throw new Error('Unknown preview action.');
      });
      session.queue=work.catch(()=>undefined);
      respond(res,200,await work);
    }catch(error){respond(res,400,{error:error instanceof Error ? error.message : 'Preview failed.'});}
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);const address=server.address();if(!address||typeof address==='string')return reject(new Error('Preview listener unavailable.'));port=address.port;resolve();});});
  return {
    async open(directory:string, options: { filePath?: string; embedded?: boolean } = {}) {
      for(const [token,session] of sessions)if(session.expires<Date.now())sessions.delete(token);
      if(sessions.size>=128)throw new Error('Close and reload the preview plugin to clear old preview sessions.');
      const root=await realpath(directory);
      const selected = options.filePath ? (path.isAbsolute(options.filePath) ? path.relative(root, options.filePath) : options.filePath) : undefined;
      if (selected) await readMarkdown(root, selected);
      if (options.embedded && !selected) throw new Error('Choose a Markdown file for the file tab.');
      const token=randomBytes(24).toString('hex');
      sessions.set(token,{root,renderer:new Renderer(root),expires:Date.now()+8*60*60*1000,queue:Promise.resolve()});
      const url = new URL(`http://127.0.0.1:${port}/preview/${token}`);
      if (selected) url.searchParams.set('file', selected);
      if (options.embedded) url.searchParams.set('embedded', '1');
      return url.toString();
    },
    release(address: string) {
      const url = new URL(address);
      if (url.origin !== `http://127.0.0.1:${port}`) throw new Error('Invalid preview address.');
      const token = url.pathname.match(/^\/preview\/([a-f0-9]{48})$/)?.[1];
      if (!token) throw new Error('Invalid preview session.');
      sessions.delete(token);
    },
    async close(){sessions.clear();server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));},
  };
}
