import test from 'node:test';
import assert from 'node:assert/strict';
import voice, {config} from '../netlify/functions/voice.mjs';
import {analyze, fillerCounts, countWords, notes, formatTime, lengthZone, estimateSeconds} from '../interview/delivery.mjs';

const base = 'https://coachjeff.netlify.app/.netlify/functions/voice';
const speakReq = (body, origin = 'https://coachjeff.netlify.app') => new Request(`${base}?action=speak`, {method:'POST', headers:{origin, 'Content-Type':'application/json'}, body:JSON.stringify(body)});
const audioReq = (bytes, type = 'audio/webm;codecs=opus') => new Request(`${base}?action=transcribe`, {method:'POST', headers:{origin:'https://coachjeff.netlify.app', 'Content-Type':type}, body:new Uint8Array(bytes)});

test('voice function', async t => {
  const oldKey = process.env.OPENAI_API_KEY, oldEnabled = process.env.INTERVIEW_ENABLED, oldFetch = globalThis.fetch;
  try {
    delete process.env.OPENAI_API_KEY; delete process.env.INTERVIEW_ENABLED;
    await t.test('disabled until configured', async () => assert.equal((await voice(speakReq({text:'Hi'}))).status, 503));
    process.env.INTERVIEW_ENABLED = 'true'; process.env.OPENAI_API_KEY = 'test-only-key';
    await t.test('rejects other sites, bad actions and bad input without calling the API', async () => {
      let calls = 0; globalThis.fetch = async () => { calls++; throw new Error('must not call'); };
      assert.equal((await voice(speakReq({text:'Hi'}, 'https://elsewhere.example'))).status, 403);
      assert.equal((await voice(new Request(`${base}?action=other`, {method:'POST', headers:{origin:'https://coachjeff.netlify.app'}}))).status, 400);
      assert.equal((await voice(speakReq({text:''}))).status, 400);
      assert.equal((await voice(speakReq({text:'x'.repeat(1501)}))).status, 400);
      assert.equal((await voice(audioReq(new Array(2000).fill(1), 'video/mp4'))).status, 415);
      assert.equal((await voice(audioReq([1, 2, 3]))).status, 400);
      assert.equal(calls, 0);
    });
    await t.test('speaks a question as mp3', async () => {
      globalThis.fetch = async (url, options) => { assert.equal(url, 'https://api.openai.com/v1/audio/speech'); const p = JSON.parse(options.body); assert.equal(p.input, 'Tell me about yourself.'); assert.equal(p.response_format, 'mp3'); return new Response(new Uint8Array([9, 9, 9])); };
      const r = await voice(speakReq({text:'Tell me about yourself.'}));
      assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'audio/mpeg'); assert.equal((await r.arrayBuffer()).byteLength, 3);
    });
    await t.test('transcribes a recording and keeps filler-word prompt', async () => {
      globalThis.fetch = async (url, options) => { assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions'); assert.equal(options.body.get('language'), 'en'); assert.match(options.body.get('prompt'), /Umm/); assert.equal(options.body.get('file').name, 'answer.webm'); return Response.json({text:'Um, I led a class project.'}); };
      const r = await voice(audioReq(new Array(2000).fill(1)));
      assert.equal(r.status, 200); assert.equal((await r.json()).text, 'Um, I led a class project.');
    });
    await t.test('provider errors are recoverable and hide provider details', async () => {
      globalThis.fetch = async () => new Response('secret detail', {status:401});
      const r = await voice(speakReq({text:'Hi'})); assert.equal(r.status, 502); assert.doesNotMatch(await r.text(), /secret/);
      globalThis.fetch = async () => new Response('', {status:429}); assert.equal((await voice(speakReq({text:'Hi'}))).status, 429);
      globalThis.fetch = async () => { throw new Error('timeout'); }; assert.equal((await voice(audioReq(new Array(2000).fill(1)))).status, 504);
    });
    await t.test('rate limit declared', () => { assert.equal(config.rateLimit.aggregateBy, 'ip'); assert.equal(config.rateLimit.windowLimit, 40); });
  } finally {
    globalThis.fetch = oldFetch;
    for (const [k, v] of [['OPENAI_API_KEY', oldKey], ['INTERVIEW_ENABLED', oldEnabled]]) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

test('delivery stats', () => {
  assert.equal(countWords("I'm ready to start"), 4);
  assert.deepEqual(fillerCounts('Um, so, uh, I basically, like, built it. Umm yeah.'), {um:2, uh:1, like:1, basically:1});
  assert.deepEqual(fillerCounts('I like data and I would like this job. Do you know how to code?'), {});
  const s = analyze([{text:'one two three four five six seven eight nine ten', seconds:6}, {text:'um eleven', seconds:4}]);
  assert.equal(s.words, 12); assert.equal(s.seconds, 10); assert.equal(s.wpm, 72); assert.equal(s.fillerTotal, 1);
  assert.ok(notes(s).some(n => /A bit short/.test(n)));
  assert.ok(notes({seconds:200, words:500, wpm:150, fillerTotal:0}).some(n => /under 2 minutes/.test(n)));
  assert.deepEqual([59, 60, 90, 91, 120, 121].map(lengthZone), ['short', 'good', 'good', 'long', 'long', 'over']);
  assert.equal(estimateSeconds('word '.repeat(140)), 60);
  assert.deepEqual(notes({typed:true, seconds:75, words:175}), []);
  assert.equal(formatTime(75), '1:15');
});
