import {mkdir, rm, cp} from 'node:fs/promises';
// Publish only browser assets. Server functions and owner instructions stay out of public/.
await rm('public', {recursive:true, force:true});
await mkdir('public', {recursive:true});
for (const file of ['index.html','sitemap.xml','robots.txt','preview.png','interview']) {
  try { await cp(file, `public/${file}`, {recursive:true}); }
  catch (error) { if (file !== 'preview.png' || error.code !== 'ENOENT') throw error; }
}
