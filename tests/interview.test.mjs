import test from 'node:test';
import assert from 'node:assert/strict';
import interview, {config, numbered} from '../netlify/functions/interview.mjs';
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
      globalThis.fetch=async(url,options)=>{const payload=JSON.parse(options.body);assert.equal(payload.max_output_tokens,2200);assert.match(payload.instructions,/Answer-by-answer/);assert.match(payload.instructions,/Do not skip any answer/);assert.match(payload.instructions,/interview is complete/);assert.match(payload.instructions,/evaluate STAR\+ separately/);for(const element of ['Situation (context)','Task (responsibility)','Action (what the candidate personally did)','Result (outcome or lesson)','connection to a specific skill or requirement in the supplied job posting'])assert.ok(payload.instructions.includes(element));assert.match(payload.instructions,/distinguish a potential connection you inferred from one they stated/);assert.match(payload.instructions,/Do not penalize those answers for lacking STAR\+/);assert.match(payload.instructions,/If no behavioral answers were practiced/);assert.equal(payload.input.length,11);return Response.json({output:[{content:[{type:'output_text',text:'Strengths: You explained your actions.'}]}]});};
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

test('question style, repeat avoidance and practice-again modes reach the prompt', async () => {
  const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY,oldEnabled=process.env.INTERVIEW_ENABLED;
  const base={role:'Analyst',job:'Analyze data',resume:'',kind:'General screening',length:5,messages:[],finish:false,round:'recruiter',focusIds:['behavioral']};
  const req=d=>new Request('https://x.netlify.app/.netlify/functions/interview',{method:'POST',headers:{Origin:'https://x.netlify.app','Content-Type':'application/json'},body:JSON.stringify(d)});
  try{
    process.env.INTERVIEW_ENABLED='true';process.env.OPENAI_API_KEY='test-only';let seen;
    globalThis.fetch=async(url,o)=>{seen=JSON.parse(o.body);return Response.json({output:[{content:[{type:'output_text',text:'Q'}]}]});};
    for(const bad of [{style:'tricky'},{avoid:'x'},{avoid:Array(41).fill('q')},{previous:{mode:'other',feedback:'f',answers:[]}},{previous:{mode:'redo',feedback:'',answers:[]}}])assert.equal((await interview(req({...base,...bad}))).status,400);
    assert.equal((await interview(req(base))).status,200);assert.match(seen.instructions,/most likely questions/);
    assert.equal((await interview(req({...base,style:'curveball',avoid:['Tell me about yourself.']}))).status,200);
    assert.match(seen.instructions,/curveball challenge/);assert.match(seen.instructions,/do not repeat or closely paraphrase/);assert.deepEqual(JSON.parse(seen.input[0].content).previouslyAsked,['Tell me about yourself.']);
    assert.equal((await interview(req({...base,previous:{mode:'focus',feedback:'Improvements: add results.',answers:['a']}}))).status,200);
    assert.match(seen.instructions,/aim this question at one of those weak spots/);assert.equal(JSON.parse(seen.input[0].content).previousAttempt.feedback,'Improvements: add results.');
    const done=Array.from({length:10},(_,i)=>({role:i%2?'user':'assistant',content:i%2?'answer':'question'}));
    assert.equal((await interview(req({...base,messages:done,finish:true,previous:{mode:'redo',feedback:'old feedback',answers:['old']}}))).status,200);
    assert.match(seen.instructions,/Next, a heading Compared with last time/);assert.doesNotMatch(seen.instructions,/\$\{compareSection\}/);
    assert.equal((await interview(req({...base,messages:done,finish:true,previous:{mode:'focus',feedback:'old feedback',answers:['old']}}))).status,200);assert.match(seen.instructions,/Next, a heading Progress on weak spots/);
  }finally{globalThis.fetch=oldFetch;for(const [k,v] of [['OPENAI_API_KEY',oldKey],['INTERVIEW_ENABLED',oldEnabled]])if(v===undefined)delete process.env[k];else process.env[k]=v;}
});

test('final review transcript is labeled so feedback matches each question', () => {
  assert.deepEqual(numbered([{role:'assistant',content:'Why us?'},{role:'user',content:'Mission.'},{role:'assistant',content:'A time you led?'},{role:'user',content:'Club.'}]).map(m=>m.content), ['Q1: Why us?','Answer to Q1: Mission.','Q2: A time you led?','Answer to Q2: Club.']);
});
