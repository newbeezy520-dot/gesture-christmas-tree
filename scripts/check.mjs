import {readdir,readFile,lstat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const media=/\.(?:jpe?g|png|webp|gif|heic|heif|avif|bmp|tiff?|mp[34]|mov|m4a|wav|pdf|pptx|docx|zip|tgz|tar|gz)$/i;
const forbidden=/data:image\/(?:jpeg|png|webp|gif|avif|heic)|data:application\/octet-stream;base64|\/Users\/|xwechat_files|wxid_|appgprj_|leapingvole/i;
const git=spawnSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'});
let files;
if(git.status===0&&git.stdout){files=git.stdout.split('\0').filter(Boolean);}
else{
  files=[];
  async function walk(relative=''){
    for(const entry of await readdir(path.join(root,relative),{withFileTypes:true})){
      const name=path.posix.join(relative,entry.name);
      if(['.git','node_modules','test-results','playwright-report','private-photos'].includes(entry.name))continue;
      if(name.startsWith('dist/vendor/')&&name!=='dist/vendor/LICENSE-MEDIAPIPE.txt')continue;
      if(entry.isDirectory())await walk(name);else files.push(name);
    }
  }
  await walk();
}
for(const name of files){
  const file=path.join(root,name),info=await lstat(file);
  if(info.isSymbolicLink()||media.test(name)||name.includes('private-photos/'))throw new Error(`Private/binary media or symlink: ${name}`);
  const bytes=await readFile(file),text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(bytes.includes(0))throw new Error(`Binary payload: ${name}`);
  if(name!=='scripts/check.mjs'&&forbidden.test(text))throw new Error(`Private reference or embedded media: ${name}`);
  if(/\.(?:m?js)$/.test(name)){
    const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
    if(result.status!==0)throw new Error(result.stderr);
  }
}
console.log(`Checked ${files.length} source files: valid JavaScript, no raster media, embedded photos, private references or symlinks.`);
