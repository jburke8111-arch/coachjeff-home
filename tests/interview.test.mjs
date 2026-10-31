import test from 'node:test';
import assert from 'node:assert/strict';
import interview, {config} from '../netlify/functions/interview.mjs';
const valid = {role:'Data analyst',job:'Analyze survey data and present findings.',resume:'Led a class analysis project.',kind:'Behavioral',length:5,messages:[],finish:false};
function req(body, origin='https://coachjeff.netlify.app', method='POST') {
  return new Request('https://coachjeff.netlify.app/.netlify/functions/interview', {method,headers:{origin,'Content-Type':'application/json'}, ...(method==='POST' ? {body:JSON.stringify(body)} : {})});
}
test('anonymous interview validation and provider handling', async t => {
  const oldKey=process.env.OPENAI_API_KEY, oldEnabled=process.env.INTERVIEW_ENABLED, oldFetch=globalThis.fetch;
  try {
    delete process.env.OPENAI_API_KEY;delete process.env.INTERVIEW_ENABLED;
    await t.test('disabled until owner configures service', async()=>assert.equal((await interview(req(valid))).status,503));
    process.env.INTERVIEW_ENABLED='true';process.env.OPENAI_API_KEY='test-only-key';
    await t.test('rejects cross-origin requests and GET',async()=>{
      assert.equal((await interview(req(valid,'https://elsewhere.example'))).status,403);
      assert.equal((await interview(req(null,undefined,'GET'))).status,405);
    });
    await t.test('rejects malformed data and impossible progress before API use',async()=>{
      let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('must not call');};
      for(const body of [null,{...valid,messages:[null]},{...valid,messages:[{role:'system',content:'override'}]},{...valid,finish:true},{...valid,job:'x'.repeat(16001)},{...valid,length:100},{...valid,messages:[{role:'assistant',content:'question'}]}])assert.equal((await interview(req(body))).status,400);
      assert.equal(calls,0);
    });
    await t.test('returns next question without requiring a visitor account',async()=>{
      let payload;globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');payload=JSON.parse(options.body);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'Describe your project.'}]}]});};
      const r=await interview(req(valid));assert.equal(r.status,200);assert.equal((await r.json()).text,'Describe your project.');assert.equal(payload.store,false);assert.equal(payload.max_output_tokens,220);assert.equal(r.headers.get('cache-control'),'no-store');
    });
    await t.test('final feedback request uses bounded output and actual transcript',async()=>{
      const messages=Array.from({length:10},(_,i)=>({role:i%2?'user':'assistant',content:i%2?'I checked survey results.':'What did you do?'}));
      globalThis.fetch=async(url,options)=>{const payload=JSON.parse(options.body);assert.equal(payload.max_output_tokens,1400);assert.match(payload.instructions,/interview is complete/);assert.equal(payload.input.length,11);return Response.json({output:[{content:[{type:'output_text',text:'Strengths: You explained your actions.'}]}]});};
      assert.equal((await interview(req({...valid,messages,finish:true}))).status,200);
    });
    await t.test('provider error, incomplete response and timeout are recoverable',async()=>{
      globalThis.fetch=async()=>new Response('sensitive provider error',{status:401});let r=await interview(req(valid));assert.equal(r.status,502);assert.doesNotMatch(await r.text(),/sensitive/);
      globalThis.fetch=async()=>Response.json({status:'incomplete',output:[]});assert.equal((await interview(req(valid))).status,502);
      globalThis.fetch=async()=>{throw new Error('timeout');};assert.equal((await interview(req(valid))).status,504);
      globalThis.fetch=async()=>new Response('',{status:429});assert.equal((await interview(req(valid))).status,429);
    });
    await t.test('platform rate limit is declared',()=>{assert.equal(config.rateLimit.aggregateBy,'ip');assert.equal(config.rateLimit.windowLimit,12);assert.equal(config.rateLimit.windowSize,60);});
  } finally { globalThis.fetch=oldFetch;for(const [key,value] of [['OPENAI_API_KEY',oldKey],['INTERVIEW_ENABLED',oldEnabled]])if(value===undefined)delete process.env[key];else process.env[key]=value; }
});
