import {readFile, writeFile, mkdir, rename, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';

const root=fileURLToPath(new URL('../dist/vendor/',import.meta.url));
const manifest=JSON.parse(await readFile(new URL('./vendor-assets.json',import.meta.url),'utf8'));
const digest=buffer=>createHash('sha256').update(buffer).digest('hex');
let archive;
async function download(url){
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(url,{signal:AbortSignal.timeout(120000)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    }catch(error){if(attempt===2)throw error;}
  }
}
async function packageMember(name){
  if(!archive){
    const compressed=await download(manifest.archive.url);
    if(createHash('sha512').update(compressed).digest('base64')!==manifest.archive.sha512Base64)throw new Error('npm archive integrity mismatch');
    archive=gunzipSync(compressed);
  }
  // Read only explicitly requested regular files; never extract archive paths.
  for(let offset=0;offset+512<=archive.length;){
    const header=archive.subarray(offset,offset+512);
    const field=(start,end)=>header.subarray(start,end).toString('utf8').replace(/\0.*$/s,'');
    const member=[field(345,500),field(0,100)].filter(Boolean).join('/');
    const size=parseInt(field(124,136).trim()||'0',8);
    if(!Number.isSafeInteger(size)||size<0||offset+512+size>archive.length)throw new Error('Invalid npm archive');
    if(member==='package/'+name&&[0,48].includes(header[156]))return archive.subarray(offset+512,offset+512+size);
    offset+=512+Math.ceil(size/512)*512;
  }
  throw new Error(`Missing runtime file: ${name}`);
}
for(const asset of manifest.assets){
  const destination=path.join(root,asset.path);
  const existing=await readFile(destination).catch(()=>null);
  if(existing&&digest(existing)===asset.sha256){console.log(`Verified ${asset.path}`);continue;}
  const data=asset.url?await download(asset.url):await packageMember(asset.path);
  if(digest(data)!==asset.sha256)throw new Error(`SHA-256 mismatch: ${asset.path}`);
  await mkdir(path.dirname(destination),{recursive:true});
  const temporary=destination+'.download';
  try{await writeFile(temporary,data);await rename(temporary,destination);}
  finally{await rm(temporary,{force:true});}
  console.log(`Installed ${asset.path}`);
}
console.log(`MediaPipe ${manifest.version} ready. All assets stay on your own server at runtime.`);
