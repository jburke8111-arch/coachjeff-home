// Reads an uploaded resume or job posting into plain text, entirely in the student's browser.
// PDF uses Mozilla pdf.js and Word uses mammoth, both bundled in /interview/vendor and loaded only when needed.
const MAX_FILE = 10 * 1024 * 1024;
let pdfjs = null, mammothReady = null;

async function loadPdf() {
  if (!pdfjs) { pdfjs = await import('./vendor/pdf.min.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href; }
  return pdfjs;
}
function loadMammoth() {
  if (window.mammoth) return Promise.resolve(window.mammoth);
  mammothReady ||= new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = new URL('./vendor/mammoth.browser.min.js', import.meta.url).href;
    s.onload = () => resolve(window.mammoth); s.onerror = () => { mammothReady = null; reject(new Error('load')); };
    document.head.append(s);
  });
  return mammothReady;
}

export function tidy(text) {
  return String(text).replace(/\r/g, '').replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function readFileText(file) {
  if (file.size > MAX_FILE) throw new Error('That file is larger than 10 MB. Try a smaller file, or paste the text.');
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const lib = await loadPdf();
    const doc = await lib.getDocument({data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false}).promise;
    const pages = [];
    for (let i = 1; i <= Math.min(doc.numPages, 15); i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      let line = '', out = [], lastY = null;
      for (const item of content.items) {
        const y = item.transform ? Math.round(item.transform[5]) : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) { out.push(line); line = ''; }
        line += item.str + (item.hasEOL ? '\n' : ''); lastY = y;
      }
      out.push(line); pages.push(out.join('\n'));
    }
    const text = tidy(pages.join('\n\n'));
    if (text.length < 40) throw new Error('This PDF looks like a scanned image, so its text can’t be read. Please paste the text instead.');
    return text;
  }
  if (name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await loadMammoth();
    const result = await mammoth.extractRawText({arrayBuffer: await file.arrayBuffer()});
    return tidy(result.value);
  }
  if (name.endsWith('.doc')) throw new Error('Older .doc files can’t be read. Save it as .docx or PDF, or paste the text.');
  if (name.endsWith('.txt') || name.endsWith('.md') || file.type.startsWith('text/')) return tidy(await file.text());
  throw new Error('Please upload a PDF, Word (.docx) or text file.');
}
