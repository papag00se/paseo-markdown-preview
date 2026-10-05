import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { createPreviewService } from './service';

test('desktop/web journey: embedded preview, diagram, checkbox persistence, local link, source, and image viewer', {timeout:45000}, async t => {
  const root=await mkdtemp(path.join(tmpdir(),'paseo-md-browser-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(path.join(root,'docs'));
  await writeFile(path.join(root,'README.md'),'# Preview journey\n\n- [ ] Save this task\n\n| Name | Value |\n| --- | --- |\n| Sample | 42 |\n\n$x^2$\n\n```mermaid\ngraph TD\n A[Start]-->B[Finish]\n```\n\n[Guide](docs/guide.md)\n\n![Sample image](sample.svg)\n');
  await writeFile(path.join(root,'docs','guide.md'),'# Linked guide\n\nBack to the [README](../README.md).');
  await writeFile(path.join(root,'sample.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>');
  const service=await createPreviewService();t.after(()=>service.close());
  const url=await service.open(root);
  // Exercise the actual web bridge inside a React Native Web View, as Paseo does.
  const bundle=await build({stdin:{contents:`
    import React from 'react';import {createRoot} from 'react-dom/client';import {View} from 'react-native';
    import {mountPreview} from './client/web';
    function Host(){const ref=React.useRef(null);React.useEffect(()=>mountPreview(ref.current,${JSON.stringify(url)}),[]);return React.createElement(View,{ref,style:{height:'100vh',width:'100vw'}});}
    createRoot(document.getElementById('root')).render(React.createElement(Host));
  `,resolveDir:process.cwd(),loader:'tsx'},alias:{'react-native':'react-native-web'},bundle:true,format:'iife',platform:'browser',write:false,define:{'process.env.NODE_ENV':'"test"'},logLevel:'silent'});
  const harness=createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);}else{res.setHeader('Content-Type','text/html');res.end('<html><body style="margin:0"><div id="root"></div><script src="/app.js"></script></body></html>');}});
  await new Promise<void>(resolve=>harness.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise<void>(resolve=>{harness.closeAllConnections();harness.close(()=>resolve());}));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const address=harness.address();assert(address&&typeof address!=='string');
  await page.goto(`http://127.0.0.1:${address.port}`);
  const frame=page.frameLocator('iframe[title="Markdown Preview Enhanced"]');
  await frame.getByRole('heading',{name:'Preview journey'}).waitFor();
  await frame.getByRole('status').filter({hasText:'Live'}).waitFor();
  assert.equal(await frame.getByRole('table').getByText('42').isVisible(),true);
  await frame.getByRole('img',{name:'Mermaid diagram'}).waitFor();
  await frame.getByRole('checkbox').check();
  await frame.getByRole('checkbox').filter({visible:true}).waitFor();
  await frame.getByRole('status').filter({hasText:'Live'}).waitFor();
  // Reload through the visible Refresh control and verify persisted state in the preview.
  await frame.getByRole('button',{name:'Refresh',exact:true}).click();
  await frame.getByRole('checkbox').waitFor({state:'visible'});
  assert.equal(await frame.getByRole('checkbox').isChecked(),true);
  assert.match(await readFile(path.join(root,'README.md'),'utf8'),/- \[x\] Save this task/);
  await mkdir(path.join(process.cwd(),'test-results'),{recursive:true});
  await page.screenshot({path:'test-results/desktop-preview.png',fullPage:true});
  await frame.getByRole('link',{name:'Guide',exact:true}).click();
  await frame.getByRole('heading',{name:'Linked guide'}).waitFor();
  await frame.getByRole('button',{name:'Source',exact:true}).click();
  await frame.getByRole('main').getByText('# Linked guide',{exact:false}).waitFor();
  await frame.getByRole('button',{name:'Preview',exact:true}).click();
  await frame.getByRole('heading',{name:'Linked guide'}).waitFor();
  await frame.getByRole('link',{name:'README',exact:true}).click();
  await frame.getByRole('heading',{name:'Preview journey'}).waitFor();
  await frame.getByRole('img',{name:'Sample image',exact:true}).click();
  await frame.getByRole('dialog').waitFor();
  assert.equal(await frame.getByRole('dialog').getByRole('img').isVisible(),true);
  await frame.getByRole('button',{name:'Close image'}).click();
  await frame.getByRole('dialog').waitFor({state:'hidden'});
  await page.setViewportSize({width:390,height:844});
  await frame.getByRole('heading',{name:'Preview journey'}).waitFor();
  await page.screenshot({path:'test-results/compact-preview.png',fullPage:true});
  const darkTheme=page.waitForResponse(response=>response.url().endsWith('/preview_theme/github-dark.css')&&response.status()===200);
  await page.emulateMedia({colorScheme:'dark'});
  await darkTheme;
  await frame.getByRole('status').filter({hasText:'Live'}).waitFor();
  const background=await frame.locator('body').evaluate(element=>{
    const body=element as unknown as {ownerDocument:{defaultView:{getComputedStyle(node:unknown):{backgroundColor:string}}}};
    return body.ownerDocument.defaultView.getComputedStyle(element).backgroundColor;
  });
  assert.equal(background,'rgb(23, 26, 32)');
  await page.screenshot({path:'test-results/dark-preview.png',fullPage:true});
  assert.deepEqual(errors,[]);
});

test('file-tab preview opens the requested encoded path, hides the picker, and preserves theme', {timeout:30000}, async t => {
  const root=await mkdtemp(path.join(tmpdir(),'paseo-md-selected-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(path.join(root,'docs'));
  await writeFile(path.join(root,'README.md'),'# Wrong default document');
  await writeFile(path.join(root,'docs','Selected & notes.md'),'# Selected document\n\n- [ ] Selected task\n\n[README](../README.md)');
  const service=await createPreviewService();t.after(()=>service.close());
  const target=await service.open(root,{filePath:path.join(root,'docs','Selected & notes.md'),embedded:true});
  const url=new URL(target);url.searchParams.set('theme','dark');
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox']});t.after(()=>browser.close());
  const page=await browser.newPage();
  await page.goto(url.toString());
  await page.getByRole('heading',{name:'Selected document'}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Wrong default document'}).count(),0);
  assert.equal(await page.getByRole('combobox').isVisible(),false);
  assert.equal(await page.getByRole('button',{name:'Source',exact:true}).isVisible(),false);
  await page.getByRole('checkbox').check();
  await page.locator('#status').filter({hasText:'Live'}).waitFor({state:'attached'});
  assert.match(await readFile(path.join(root,'docs','Selected & notes.md'),'utf8'),/- \[x\] Selected task/);
  await assert.rejects(service.open(root,{filePath:'../outside.md',embedded:true}));
  await assert.rejects(service.open(root,{embedded:true}));
  service.release(target);
  assert.equal((await fetch(target)).status,404);
});

test('workspace panel close releases its real session and reopening creates a fresh usable preview', {timeout:30000}, async t => {
  const root=await mkdtemp(path.join(tmpdir(),'paseo-md-panel-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await writeFile(path.join(root,'README.md'),'# Panel lifecycle\n');
  const service=await createPreviewService();t.after(()=>service.close());
  const opened:string[]=[], released:string[]=[];
  const bundle=await build({stdin:{contents:`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {PreviewPanel} from './client/preview';
    function Host(){const [visible,setVisible]=React.useState(true);return <><button onClick={()=>setVisible(!visible)}>{visible?'Close panel':'Open panel'}</button>{visible?<PreviewPanel workspaceId="test" theme={{colors:{surface0:'#ffffff',foreground:'#000000',foregroundMuted:'#555555',statusDanger:'#cc0000',accent:'#0000ff'}}} layout={{platform:'web'}}/>:null}</>;}
    createRoot(document.getElementById('root')).render(<Host/>);
  `,resolveDir:process.cwd(),loader:'tsx'},plugins:[{name:'host-rpc',setup(build){build.onResolve({filter:/^@getpaseo\/plugin\/client$/},()=>({path:'host-rpc',namespace:'test'}));build.onLoad({filter:/.*/,namespace:'test'},()=>({resolveDir:process.cwd(),contents:`
    import {useCallback} from 'react';
    export function useRpc(contract){return useCallback(async input=>{const response=await fetch('/rpc/'+contract.name,{method:'POST',body:JSON.stringify(input)});if(!response.ok)throw new Error(await response.text());return response.json();},[contract.name]);}
  `}));}}],alias:{'react-native':'react-native-web'},bundle:true,format:'iife',platform:'browser',write:false,define:{'process.env.NODE_ENV':'"test"'},logLevel:'silent'});
  const harness=createServer(async(req,res)=>{
    try {
      if(req.url?.startsWith('/rpc/')){
        let body='';for await(const chunk of req)body+=chunk;
        const input=JSON.parse(body);res.setHeader('Content-Type','application/json');
        if(req.url==='/rpc/preview.open'){const url=await service.open(root);opened.push(url);res.end(JSON.stringify({url,hostname:'local'}));}
        else if(req.url==='/rpc/preview.close'){service.release(input.url);released.push(input.url);res.end('{}');}
        else {res.statusCode=404;res.end('{}');}
      }else if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);}
      else {res.setHeader('Content-Type','text/html');res.end('<html><body><div id="root" style="height:90vh;display:flex;flex-direction:column"></div><script src="/app.js"></script></body></html>');}
    } catch(error){res.statusCode=500;res.end(String(error));}
  });
  await new Promise<void>(resolve=>harness.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise<void>(resolve=>{harness.closeAllConnections();harness.close(()=>resolve());}));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox']});t.after(()=>browser.close());
  const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const address=harness.address();assert(address&&typeof address!=='string');await page.goto(`http://127.0.0.1:${address.port}`);
  const frame=page.frameLocator('iframe[title="Markdown Preview Enhanced"]');
  await frame.getByRole('heading',{name:'Panel lifecycle'}).waitFor();
  const first=opened[0];assert.ok(first);
  const closed=page.waitForResponse(r=>r.url().endsWith('/rpc/preview.close')&&r.status()===200);
  await page.getByRole('button',{name:'Close panel',exact:true}).click();await closed;
  assert.equal(await page.locator('iframe').count(),0);
  assert.equal((await fetch(first)).status,404);
  await page.getByRole('button',{name:'Open panel',exact:true}).click();
  await frame.getByRole('heading',{name:'Panel lifecycle'}).waitFor();
  assert.equal(opened.length,2);assert.notEqual(opened[1],first);
  const closedAgain=page.waitForResponse(r=>r.url().endsWith('/rpc/preview.close')&&r.status()===200);
  await page.getByRole('button',{name:'Close panel',exact:true}).click();await closedAgain;
  assert.deepEqual(released,opened);assert.equal((await fetch(opened[1])).status,404);assert.deepEqual(errors,[]);
});
