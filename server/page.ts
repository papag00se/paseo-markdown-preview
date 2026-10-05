export function previewPage(base: string, nonce: string, theme: 'auto' | 'light' | 'dark' = 'auto'): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Markdown Preview</title>
<link id="previewTheme" rel="stylesheet" href="${base}/assets/styles/preview_theme/github-light.css">
<link id="codeTheme" rel="stylesheet" href="${base}/assets/styles/prism_theme/github.css">
<link rel="stylesheet" href="${base}/assets/dependencies/katex/katex.min.css">
<style>
:root{color-scheme:${theme === 'auto' ? 'light dark' : theme}}*{box-sizing:border-box}html body{margin:0;background:light-dark(#fff,#171a20);color:light-dark(#24292f,#e6edf3);font:16px/1.6 system-ui,sans-serif}
header[hidden]{display:none}header{position:sticky;top:0;z-index:10;background:light-dark(#f6f8fa,#21262d);padding:10px 16px;border-bottom:1px solid #8885;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
input,select,button{font:inherit;padding:5px 8px;background:light-dark(#fff,#171a20);color:inherit;border:1px solid #8888;border-radius:5px}select{max-width:65vw;flex:1}#status{font-size:12px}#error{color:light-dark(#b42318,#ff9b91);padding:0 16px;white-space:pre-wrap}main{max-width:1000px;margin:auto;padding:20px 28px;overflow-wrap:anywhere}
#preview.markdown-preview{background:transparent;color:inherit}main img,main svg{max-width:100%;height:auto}main pre{overflow:auto;padding:12px;background:#8881}main table{display:block;overflow:auto}main input[type=checkbox]{cursor:pointer;margin-right:6px}main li.task-list-item{list-style:none}main a{color:light-dark(#0969da,#79c0ff)}#filter{width:160px}#source{white-space:pre-wrap}dialog{max-width:95vw;max-height:90vh;overflow:auto;background:light-dark(#fff,#171a20);color:inherit;border:1px solid #8888}dialog img{max-width:85vw;max-height:80vh}button{cursor:pointer}@media(max-width:600px){main{padding:16px}#filter{width:120px}}
</style></head><body>
<header><label for="files">File</label><input id="filter" placeholder="Filter Markdown files" aria-label="Filter Markdown files"><select id="files" aria-label="Markdown file"></select><button id="refresh">Refresh</button><button id="sourceToggle">Source</button><span id="status" role="status">Loading files…</span></header>
<p id="error" role="alert"></p><main id="preview" class="markdown-preview"></main><dialog id="lightbox" aria-label="Image preview"><button id="closeLightbox">Close image</button><img id="largeImage" alt=""></dialog>
<script nonce="${nonce}" src="${base}/assets/dependencies/mermaid/mermaid.min.js"></script>
<script nonce="${nonce}">${browserScript(base, theme)}</script></body></html>`;
}

function browserScript(base: string, theme: 'auto' | 'light' | 'dark') {
  return String.raw`
const base=${JSON.stringify(base)};
const query=new URL(location.href).searchParams;
const selectedPath=query.get('file');
const embedded=query.get('embedded')==='1';
if(embedded)document.querySelector('header').hidden=true;
const forcedTheme=${JSON.stringify(theme)};
const files=document.getElementById('files'), preview=document.getElementById('preview'), status=document.getElementById('status'), error=document.getElementById('error');
let allFiles=[],file='',revision='',busy=false,showSource=false,lastHtml='';
const themeMedia=matchMedia('(prefers-color-scheme:dark)');
const darkTheme=()=>forcedTheme==='dark'||(forcedTheme==='auto'&&themeMedia.matches);
function updateTheme(){document.getElementById('previewTheme').href=base+'/assets/styles/preview_theme/'+(darkTheme()?'github-dark.css':'github-light.css');document.getElementById('codeTheme').href=base+'/assets/styles/prism_theme/'+(darkTheme()?'github-dark.css':'github.css');if(file){status.textContent='Updating theme…';refresh(true);}}
themeMedia.addEventListener('change',updateTheme);updateTheme();
async function request(route,options){const response=await fetch(base+route,options);if(!response.ok){const value=await response.json();throw new Error(value.error||'Preview request failed');}return response.json();}
function report(err){error.textContent=err.message||String(err);status.textContent='Preview needs attention';}
async function refresh(force=false){
 if(busy||!file)return;busy=true;const requestedFile=file;
 try{
  if(showSource){const data=await request('/source?path='+encodeURIComponent(requestedFile));if(file!==requestedFile)return;preview.textContent=data.source;preview.style.whiteSpace='pre-wrap';status.textContent='Source';return;}
  const data=await request('/render?path='+encodeURIComponent(requestedFile)+'&revision='+encodeURIComponent(force?'':revision));
  if(file!==requestedFile)return;
  if(data.unchanged)return;
  const scroll=window.scrollY;lastHtml=data.html;preview.innerHTML=lastHtml;preview.style.whiteSpace='';revision=data.revision;
  preview.querySelectorAll('input[type=checkbox]').forEach(box=>{box.disabled=!box.hasAttribute('data-task-line');});
  if(window.mermaid){mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:darkTheme()?'dark':'default'});try{await mermaid.run({nodes:preview.querySelectorAll('.mermaid'),suppressErrors:false});preview.querySelectorAll('.mermaid svg').forEach(svg=>{svg.setAttribute('role','img');svg.setAttribute('aria-label','Mermaid diagram');});}catch(err){report(new Error('Diagram: '+err.message));}}
  window.scrollTo(0,scroll);status.textContent='Live · saved to file';
 }catch(err){if(file===requestedFile)report(err);}finally{busy=false;if(file!==requestedFile)refresh(true);}
}
function selectFile(value){file=value;revision='';error.textContent='';preview.textContent='';status.textContent='Loading preview…';window.scrollTo(0,0);refresh(true);}
function populate(){const filter=document.getElementById('filter').value.toLowerCase();files.replaceChildren();for(const value of allFiles.filter(x=>x.toLowerCase().includes(filter))){const option=document.createElement('option');option.value=value;option.textContent=value;files.append(option);}if(allFiles.includes(file))files.value=file;}
files.addEventListener('change',()=>selectFile(files.value));document.getElementById('filter').addEventListener('input',populate);
document.getElementById('refresh').addEventListener('click',()=>{error.textContent='';refresh(true);});
document.getElementById('sourceToggle').addEventListener('click',()=>{if(busy)return;showSource=!showSource;document.getElementById('sourceToggle').textContent=showSource?'Preview':'Source';refresh(true);});
preview.addEventListener('change',async event=>{
 const box=event.target;if(!box.matches('input[data-task-line]'))return;
 if(busy){box.checked=!box.checked;return;}busy=true;status.textContent='Saving task…';preview.querySelectorAll('input[type=checkbox]').forEach(x=>x.disabled=true);
 try{await request('/task',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file,revision,line:Number(box.dataset.taskLine),checked:box.checked})});error.textContent='';}
 catch(err){box.checked=!box.checked;report(err);}
 finally{busy=false;await refresh(true);}
});
preview.addEventListener('click',event=>{
 const image=event.target.closest('img');if(image){document.getElementById('largeImage').src=image.src;document.getElementById('largeImage').alt=image.alt;document.getElementById('lightbox').showModal();return;}
 const link=event.target.closest('a');if(!link)return;
 const url=new URL(link.href);if(url.origin===location.origin&&url.pathname===base+'/file'){
  const target=url.searchParams.get('path');if(/\.(md|markdown|mdx|mkd|mdown)$/i.test(target)){event.preventDefault();if(embedded){parent.postMessage({type:'paseo.markdown.open',path:target},'*');return;}showSource=false;document.getElementById('sourceToggle').textContent='Source';if(!allFiles.includes(target))allFiles.push(target);populate();files.value=target;selectFile(target);}
 }else if(/^https?:/.test(url.protocol)){link.target='_blank';link.rel='noopener noreferrer';}
});
document.getElementById('closeLightbox').addEventListener('click',()=>document.getElementById('lightbox').close());
if(embedded&&selectedPath){allFiles=[selectedPath];populate();files.value=selectedPath;selectFile(selectedPath);}else request('/files').then(data=>{allFiles=data.files;populate();const initial=selectedPath||allFiles.find(x=>/^readme\.md$/i.test(x))||allFiles[0];if(initial){files.value=initial;selectFile(initial);}else status.textContent='No Markdown files found';if(data.truncated)error.textContent='File listing reached its limit; use a smaller workspace.';}).catch(report);
setInterval(()=>{if(!showSource)refresh();},1500);
`;
}
