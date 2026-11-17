import http from 'node:http';
import {readFile, realpath, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=await realpath(fileURLToPath(new URL('../dist/',import.meta.url)));
const port=Number(process.env.PORT||4173);
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.wasm':'application/wasm','.json':'application/json','.txt':'text/plain; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    // Also support a project subpath when verifying GitHub Pages-style hosting.
    const prefix=process.env.BASE_PATH||'';
    if(prefix){if(!pathname.startsWith(prefix+'/')){res.writeHead(404);res.end();return;}pathname=pathname.slice(prefix.length);}
    if(pathname.endsWith('/'))pathname+='index.html';
    const target=await realpath(path.resolve(root,'.'+pathname));
    if(!target.startsWith(root+path.sep)||!(await stat(target)).isFile()){res.writeHead(404);res.end();return;}
    const data=await readFile(target);
    res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(self), microphone=()'});
    res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Open http://127.0.0.1:${port}${process.env.BASE_PATH||''}/`));
