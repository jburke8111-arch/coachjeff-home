import test from 'node:test';
import assert from 'node:assert/strict';
import {rounds,categories,suggested,plan,emphasis} from '../interview/focus.mjs';
import interview from '../netlify/functions/interview.mjs';
test('all six rounds have a valid suggested mix matching the supplied weights',()=>{
  assert.equal(rounds.length,6);assert.equal(categories.length,10);
  for(const round of rounds){const ids=suggested(round.id);assert.ok(ids.length);assert.ok(ids.every(id=>emphasis(categories.find(c=>c.id===id),round.id)>0));for(const length of [5,8]){const schedule=plan(round.id,ids,length);assert.equal(schedule.length,length);assert.ok(schedule.every(c=>ids.includes(c.id)));}}
  assert.deepEqual(categories.find(c=>c.id==='behavioral').weights,[2,1,3,1,3,2]);
});
test('custom focus is honored, including categories outside the usual mix',()=>{
  assert.ok(plan('technical-case',['values'],8).every(c=>c.id==='values'));
  assert.deepEqual(plan('recruiter',[],5),[]);
  const mixed=plan('panel',['behavioral','candidate'],5);assert.equal(mixed.at(-1).id,'candidate');
});
test('server validates filters and applies chosen category to the actual prompt',async()=>{
  const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY,oldEnabled=process.env.INTERVIEW_ENABLED;
  const body={role:'Analyst',job:'Analyze data',resume:'Class project',kind:'General screening',length:5,messages:[],finish:false,round:'technical-case',focusIds:['technical']};
  const req=data=>new Request('https://example.netlify.app/.netlify/functions/interview',{method:'POST',headers:{Origin:'https://example.netlify.app','Content-Type':'application/json'},body:JSON.stringify(data)});
  try{
    process.env.INTERVIEW_ENABLED='true';process.env.OPENAI_API_KEY='test-only';let calls=0;
    globalThis.fetch=async(url,options)=>{calls++;const data=JSON.parse(options.body);assert.match(data.instructions,/Practice round: Technical \/ case/);assert.match(data.instructions,/MUST focus on Technical \/ skills/);return Response.json({output:[{content:[{type:'output_text',text:'Explain a data validation technique.'}]}]});};
    for(const change of [{round:'unknown'},{focusIds:[]},{focusIds:['unknown']},{focusIds:['technical','technical']},{round:null}])assert.equal((await interview(req({...body,...change}))).status,400);
    assert.equal(calls,0);assert.equal((await interview(req(body))).status,200);assert.equal(calls,1);
  }finally{globalThis.fetch=oldFetch;for(const [key,value] of [['OPENAI_API_KEY',oldKey],['INTERVIEW_ENABLED',oldEnabled]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
