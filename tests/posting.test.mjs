import test from 'node:test';
import assert from 'node:assert/strict';
import posting, {extractPosting, htmlToText, isPrivateAddress} from '../netlify/functions/posting.mjs';
import {tidy} from '../interview/importers.mjs';

const req = (url, origin = 'https://coachjeff.netlify.app') => new Request('https://coachjeff.netlify.app/.netlify/functions/posting', {method:'POST', headers:{origin, 'Content-Type':'application/json'}, body:JSON.stringify({url})});
const long = 'Analyze data and build dashboards for stakeholders. '.repeat(10);

test('structured job posting data is preferred', () => {
  const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":"JobPosting","title":"GRC Specialist","hiringOrganization":{"name":"Selective"},"description":"&lt;p&gt;Own risk &amp;amp; compliance.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;SOX testing&lt;/li&gt;&lt;/ul&gt;"}]}</script></head><body>noise</body></html>`;
  const r = extractPosting(html);
  assert.equal(r.title, 'GRC Specialist'); assert.equal(r.company, 'Selective'); assert.equal(r.source, 'structured');
  assert.match(r.text, /Own risk & compliance\./); assert.match(r.text, /• SOX testing/);
});
test('falls back to the main page text without menus or scripts', () => {
  const r = extractPosting(`<html><title>Analyst | Acme</title><body><nav>Home Jobs</nav><main><h1>Data Analyst</h1><p>${long}</p><script>evil()</script></main><footer>©</footer></body></html>`);
  assert.equal(r.title, 'Data Analyst'); assert.doesNotMatch(r.text, /Home Jobs|evil|©/); assert.match(r.text, /dashboards/);
  assert.equal(htmlToText('a&nbsp;b &#39;c&#x27;'), "a b 'c'");
});
test('private and internal addresses are recognized', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', '::ffff:10.0.0.1']) assert.ok(isPrivateAddress(ip), ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '2606:4700::1111']) assert.ok(!isPrivateAddress(ip), ip);
});
test('function refuses other sites, bad links and internal addresses without fetching', async () => {
  const oldFetch = globalThis.fetch; let calls = 0; globalThis.fetch = async () => { calls++; throw new Error('no'); };
  try {
    assert.equal((await posting(req('https://example.com', 'https://evil.example'))).status, 403);
    assert.equal((await posting(req('not a link'))).status, 400);
    assert.equal((await posting(req('file:///etc/passwd'))).status, 400);
    assert.equal((await posting(req('http://169.254.169.254/latest/meta-data'))).status, 400);
    assert.equal((await posting(req('http://127.0.0.1:80/'))).status, 400);
    assert.equal((await posting(req('https://user:pw@example.com/'))).status, 400);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = oldFetch; }
});
test('reads a public posting, follows a safe redirect, and gives LinkedIn-specific help', async () => {
  const oldFetch = globalThis.fetch;
  try {
    let hops = 0;
    globalThis.fetch = async (url) => { hops++; if (hops === 1) return new Response(null, {status:301, headers:{location:'/jobs/1'}}); assert.equal(String(url), 'https://93.184.215.14/jobs/1'); return new Response(`<main><h1>Analyst</h1><p>${long}</p></main>`, {headers:{'content-type':'text/html'}}); };
    const r = await posting(req('https://93.184.215.14/start')); assert.equal(r.status, 200); const body = await r.json(); assert.equal(body.title, 'Analyst');
    globalThis.fetch = async () => new Response('', {status:999});
    const li = await posting(req('https://8.8.8.8/'.replace('8.8.8.8', '93.184.215.14')));
    assert.equal(li.status, 422);
    const blocked = await posting(req('https://www.linkedin.com/jobs/view/123'));
    assert.equal(blocked.status, 422); assert.match((await blocked.json()).error, /LinkedIn/);
    globalThis.fetch = async () => new Response(null, {status:302, headers:{location:'http://10.0.0.5/'}});
    assert.equal((await posting(req('https://93.184.215.14/'))).status, 400);
  } finally { globalThis.fetch = oldFetch; }
});
test('uploaded text is tidied', () => { assert.equal(tidy('a  b\r\n\n\n\nc '), 'a b\n\nc'); });
