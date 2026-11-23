// Reads a public job posting from a link so students don't have to copy and paste it.
// Only public web pages are read; private/internal addresses are refused. Nothing is stored.
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';

export const config = {
  rateLimit: { action: 'rate_limit', aggregateBy: 'ip', windowLimit: 10, windowSize: 60 }
};
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_TEXT = 16000;
const LOGIN_SITES = [
  [/(^|\.)linkedin\.com$/i, 'LinkedIn'], [/(^|\.)indeed\.com$/i, 'Indeed'], [/(^|\.)glassdoor\.com$/i, 'Glassdoor'],
  [/(^|\.)joinhandshake\.com$/i, 'Handshake'], [/(^|\.)ziprecruiter\.com$/i, 'ZipRecruiter']
];
const reply = (body, status = 200) => Response.json(body, {status, headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});

export default async function posting(request) {
  if (request.method !== 'POST') return reply({error:'Method not allowed'}, 405);
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({error:'Open the interview page on this website to practice.'}, 403);
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return reply({error:'Expected JSON'}, 415);
  let link;
  try { const data = JSON.parse(await request.text()); link = new URL(String(data.url || '').trim()); }
  catch { return reply({error:'That doesn’t look like a web link. Copy the full address from your browser, starting with https://'}, 400); }
  const site = LOGIN_SITES.find(([re]) => re.test(link.hostname));
  const pasteHint = site
    ? `${site[1]} doesn’t let other websites read its job postings. Open the posting, select the description, copy it, and paste it into the Job posting box.`
    : 'We couldn’t read that page automatically. Open the posting, select the description, copy it, and paste it into the Job posting box.';
  try {
    const html = await fetchPublic(link);
    const result = extractPosting(html);
    if (!result || result.text.length < 300) return reply({error:pasteHint}, 422);
    return reply(result);
  } catch (e) {
    if (e && e.userMessage) return reply({error:e.userMessage}, 400);
    return reply({error:pasteHint}, 422);
  }
}

function refuse(message) { const e = new Error(message); e.userMessage = message; return e; }

export function isPrivateAddress(ip) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function checkHost(url) {
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw refuse('Please use a regular web link that starts with https://');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{address:host}] : await lookup(host, {all:true});
  if (!addresses.length || addresses.some(a => isPrivateAddress(a.address))) throw refuse('That link isn’t a public web page.');
}

async function fetchPublic(start) {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    await checkHost(url);
    const response = await fetch(url, {redirect:'manual', signal:AbortSignal.timeout(8000), headers:{'User-Agent':'Mozilla/5.0 (compatible; CoachJeffInterviewPractice/1.0; job posting reader)', 'Accept':'text/html,application/xhtml+xml'}});
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) { url = new URL(response.headers.get('location'), url); continue; }
    if (!response.ok) throw new Error(`status ${response.status}`);
    if (!/html|xml/i.test(response.headers.get('content-type') || '')) throw new Error('not html');
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    for (;;) { const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > MAX_BYTES) { reader.cancel(); break; } chunks.push(value); }
    return new TextDecoder().decode(Buffer.concat(chunks));
  }
  throw new Error('too many redirects');
}

const ENTITIES = {amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ', rsquo:'’', lsquo:'‘', rdquo:'”', ldquo:'“', ndash:'–', mdash:'—', bull:'•', hellip:'…'};
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m));
}
export function htmlToText(html) {
  return decode(String(html)
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/ul|\/ol|\/tr|\/section|\/article)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function findJobPosting(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const n of node) { const f = findJobPosting(n); if (f) return f; } return null; }
  const type = node['@type']; if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) return node;
  return findJobPosting(node['@graph']);
}
export function extractPosting(html) {
  // Many hiring systems publish the posting as structured data (schema.org JobPosting); use it when present.
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let job; try { job = findJobPosting(JSON.parse(m[1].trim())); } catch { continue; }
    if (job && job.description) {
      const org = job.hiringOrganization; const company = typeof org === 'string' ? org : org?.name || '';
      const title = decode(String(job.title || '')).trim();
      const text = [title, company, htmlToText(decode(String(job.description)))].filter(Boolean).join('\n\n').slice(0, MAX_TEXT);
      return {title, company: decode(String(company)).trim(), text, source:'structured'};
    }
  }
  const body = (html.match(/<main[\s\S]*?<\/main>/i) || html.match(/<article[\s\S]*?<\/article>/i) || html.match(/<body[\s\S]*<\/body>/i) || [html])[0]
    .replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, ' ');
  const title = htmlToText((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || ['', ''])[1]).slice(0, 120);
  return {title, company:'', text:htmlToText(body).slice(0, MAX_TEXT), source:'page'};
}
