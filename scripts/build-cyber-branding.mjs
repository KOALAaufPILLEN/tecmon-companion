// Own vector graphics; sharp is a build dependency only. No renderer dependency at runtime.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(process.argv[2]||path.join(root,'dist'));
const source=path.join(root,'tools/cs2-companion/branding');
const hash=b=>createHash('sha256').update(b).digest('hex');
const old=await readFile(path.join(source,'TecMon-Branding-v1.json'));
if(hash(old)!=='aebe71cd08594e66cd2b6afea6da70859857f2ce83201295f152bcaf8c9ab155')throw Error('Original logo/font pack checksum mismatch');
const files=JSON.parse(old).files;
for(const name of ['cyber-hud','cyber-stinger']){
 const bytes=await sharp(await readFile(path.join(source,'source',name+'.svg'))).png({compressionLevel:9,adaptiveFiltering:false,palette:false}).toBuffer();
 files[name+'.png']=bytes.toString('base64');
}
const bytes=Buffer.from(JSON.stringify({format:'tecmon-branding',version:3,files}));
await mkdir(output,{recursive:true});
await writeFile(path.join(output,'TecMon-Branding-v3.json'),bytes);
const metadata={size:bytes.length,sha256:hash(bytes),files:Object.fromEntries(Object.entries(files).map(([name,data])=>[name,hash(Buffer.from(data,'base64'))]))};
await writeFile(path.join(output,'cyber-branding-metadata.json'),JSON.stringify(metadata,null,2));
console.log(JSON.stringify(metadata,null,2));
