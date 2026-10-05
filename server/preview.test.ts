import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { createPreviewService } from './service';
import { readMarkdown, setTask, confinedFile } from './files';

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(path.join(tmpdir(), 'paseo-md-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('checkbox writes preserve UTF-8, CRLF, and every other byte; stale previews cannot overwrite edits', async t => {
  const root=await fixture(t);
  const source='# 日本語\r\n\r\n- [ ] first\r\n> 1. [X] second\r\n';
  await writeFile(path.join(root,'README.md'),source);
  let doc=await readMarkdown(root,'README.md');
  await setTask(root,'README.md',doc.revision,2,true);
  assert.equal(await readFile(doc.filename,'utf8'),source.replace('[ ]','[x]'));
  await assert.rejects(setTask(root,'README.md',doc.revision,3,false),/file changed/);
  doc=await readMarkdown(root,'README.md');
  await setTask(root,'README.md',doc.revision,3,false);
  assert.equal(await readFile(doc.filename,'utf8'),source.replace('[ ]','[x]').replace('[X]','[ ]'));
  await assert.rejects(setTask(root,'README.md',(await readMarkdown(root,'README.md')).revision,0,true),/no longer a task/);
});

test('workspace confinement rejects traversal and symlinks to outside files', async t => {
  const root=await fixture(t);
  const outside=await fixture(t);
  await writeFile(path.join(outside,'secret.md'),'secret');
  await symlink(path.join(outside,'secret.md'),path.join(root,'link.md'));
  await assert.rejects(confinedFile(root,'link.md'),/outside/);
  await assert.rejects(confinedFile(root,path.relative(root,path.join(outside,'secret.md'))),/outside/);
});

test('checkbox edits preserve a UTF-8 BOM, including a task on the first line', async t => {
  const root=await fixture(t);
  const source='\uFEFF- [ ] 日本語\r\n';
  await writeFile(path.join(root,'README.md'),source);
  const doc=await readMarkdown(root,'README.md');
  await setTask(root,'README.md',doc.revision,0,true);
  assert.deepEqual(await readFile(doc.filename),Buffer.from(source.replace('[ ]','[x]')));
});

test('real Crossnote renders tasks, tables, math and Mermaid with local assets; edit origin and revision are enforced',async t=>{
  const root=await fixture(t);
  await mkdir(path.join(root,'.crossnote'));
  await writeFile(path.join(root,'.crossnote','parser.js'),'throw new Error("repository parser must not execute");');
  await writeFile(path.join(root,'README.md'),'# Preview\n\n- [ ] Task\n\n| Name | Value |\n| --- | --- |\n| Demo | 42 |\n\n$x^2$\n\n```mermaid\ngraph TD\n A-->B\n```\n\n<script>alert(1)</script>');
  const service=await createPreviewService();t.after(()=>service.close());
  const url=await service.open(root);
  const origin=new URL(url).origin;
  const get=async(route:string)=>{const response=await fetch(url+route);assert.equal(response.status,200,await response.clone().text());return response.json();};
  assert.deepEqual(z.object({files:z.array(z.string())}).parse(await get('/files')).files,['README.md']);
  const rendered=z.object({html:z.string(),revision:z.string()}).parse(await get('/render?path=README.md'));
  assert.match(rendered.html,/<table/);assert.match(rendered.html,/class="katex"/);assert.match(rendered.html,/class="mermaid"/);assert.match(rendered.html,/data-task-line="2"/);assert.doesNotMatch(rendered.html,/<script/);
  assert.deepEqual(await get('/render?path=README.md&revision='+rendered.revision),{unchanged:true});
  const css=await fetch(url+'/assets/dependencies/katex/katex.min.css');assert.equal(css.status,200);
  const mermaid=await fetch(url+'/assets/dependencies/mermaid/mermaid.min.js');assert.equal(mermaid.status,200);
  const edit={file:'README.md',revision:rendered.revision,line:2,checked:true};
  let response=await fetch(url+'/task',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(edit)});assert.equal(response.status,403);
  response=await fetch(url+'/task',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(edit)});assert.equal(response.status,200,await response.text());
  assert.match(await readFile(path.join(root,'README.md'),'utf8'),/- \[x\] Task/);
  response=await fetch(url+'/task',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(edit)});assert.equal(response.status,400);
  assert.equal((await fetch(origin+'/preview/unknown/files')).status,404);
});
