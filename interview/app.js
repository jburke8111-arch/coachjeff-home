import {rounds, categories, emphasis, suggested, plan} from './focus.mjs';
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let messages = [], details = {}, demo = false, busy = false, report = '', stage = 'setup';
  const answered = () => messages.filter(m => m.role === 'user').length;
  const total = () => details.length;
  let samplePlan = [];
  function sampleQuestion(index) {
    const c = samplePlan[index];
    const prior = samplePlan.slice(0,index).filter(x=>x.id===c.id).length;
    const followups = ['What specific detail could you add to make your last answer clearer?', 'Which part of that answer best shows what you would bring to this role?', 'What assumption in your answer would you want to check with the interviewer?', 'How would you explain your main point in two or three sentences?', 'What might an interviewer ask you to clarify about that answer?', 'What additional example or explanation could support your answer?', 'What would you change about your answer after reflecting on it?'];
    return prior ? followups[(prior-1)%followups.length] : c.question;
  }
  function renderFocus(useSuggested = false) {
    const ids = useSuggested ? suggested($('round').value) : [...document.querySelectorAll('[name=focus]:checked')].map(el => el.value);
    $('focus-options').replaceChildren();
    for (const c of categories) {
      const label = document.createElement('label'); label.className = 'focus-option';
      const input = document.createElement('input'); input.type = 'checkbox'; input.name = 'focus'; input.value = c.id; input.checked = ids.includes(c.id); input.addEventListener('change', focusSummary);
      const name = document.createElement('span'); name.textContent = c.label;
      const weight = document.createElement('span'); weight.className = 'focus-weight'; const n = emphasis(c, $('round').value); weight.textContent = n ? '●'.repeat(n) : '—'; weight.setAttribute('aria-label', ['Outside usual mix','Light emphasis','Moderate emphasis','Heavy emphasis'][n]);
      label.append(input,name,weight); $('focus-options').append(label);
    }
    focusSummary();
  }
  function focusSummary() {
    const ids = [...document.querySelectorAll('[name=focus]:checked')].map(el => el.value);
    const n = Number($('length').value); const topics = plan($('round').value,ids,n);
    $('focus-summary').textContent = !ids.length ? 'Select at least one category.' : `${ids.length} categories selected · ${n} questions. ${ids.length > n ? 'This session will prioritize the strongest suggested topics; use fewer categories to target a particular topic. ' : ''}Planned topics: ${[...new Set(topics.map(c=>c.label))].join(', ')}.`;
  }
  function readDetails() {
    return {role:$('role').value.trim(), job:$('job').value.trim(), resume:$('resume').value.trim(), kind:'General screening', round:$('round').value, focusIds:[...document.querySelectorAll('[name=focus]:checked')].map(el=>el.value), length:Number($('length').value)};
  }
  $('round').addEventListener('change',()=>renderFocus(true)); $('length').addEventListener('change',focusSummary); $('reset-focus').addEventListener('click',()=>renderFocus(true)); renderFocus(true);
  function error(message = '') { $('error').textContent = message; $('error').classList.toggle('hidden', !message); }
  function working(value) {
    busy = value;
    document.querySelectorAll('button, #setup-form input, #setup-form textarea, #setup-form select, [name=focus], #answer').forEach(el => { el.disabled = value; });
    $('status').textContent = value ? 'Preparing your next step…' : '';
    $('start').textContent = value ? 'Connecting…' : 'Start AI interview →';
  }
  function show(next) {
    stage = next;
    ['setup', 'interview', 'review'].forEach(id => $(id).classList.toggle('hidden', id !== next));
    document.querySelectorAll('.step').forEach((el, i) => el.classList.toggle('active', i === ['setup', 'interview', 'review'].indexOf(next)));
    const heading = $(next).querySelector('h2'); heading.focus();
  }
  function renderTranscript() {
    $('mode').textContent = demo ? 'SAMPLE MODE' : 'AI INTERVIEW';
    $('interview-title').textContent = demo ? 'Practice your next conversation.' : details.role;
    $('count').textContent = `${answered()} of ${total()} answers completed${demo ? ' · Preset questions; no adaptive feedback' : ''}`;
    $('progress').style.width = `${answered() / total() * 100}%`;
    $('conversation').replaceChildren();
    for (const m of messages) {
      const div = document.createElement('div'); div.className = `message ${m.role}`;
      const label = document.createElement('span'); label.textContent = m.role === 'assistant' ? 'INTERVIEWER' : 'YOU';
      const p = document.createElement('p'); p.textContent = m.content;
      div.append(label, p); $('conversation').append(div);
    }
    $('answer-form').classList.toggle('hidden', answered() >= total());
    $('back-review').classList.toggle('hidden', answered() < total());
    $('send').textContent = answered() + 1 >= total() ? 'Finish & review →' : 'Send answer →';
    $('conversation').scrollTop = $('conversation').scrollHeight;
  }
  function review() {
    $('review-mode').textContent = demo ? 'SELF-REVIEW' : 'AI FEEDBACK';
    $('self-review').classList.toggle('hidden', !demo);
    $('feedback').textContent = report;
    $('feedback').classList.toggle('hidden', demo);
    $('ai-note').classList.toggle('hidden', demo);
    show('review');
  }
  async function ask(history, finish) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);
    try {
      const response = await fetch('/.netlify/functions/interview', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...details, messages:history, finish}), signal:controller.signal});
      if (response.status === 429) throw new Error('The practice limit has been reached. Please wait a few minutes and try again.');
      let result;
      try { result = await response.json(); } catch { throw new Error('The interview service is unavailable. Please try again later.'); }
      if (!response.ok) throw new Error(result.error || 'Unable to connect. Please try again.');
      if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('No response was returned. Please try again.');
      return result.text;
    } finally { clearTimeout(timer); }
  }
  $('setup-form').addEventListener('submit', async e => {
    e.preventDefault(); if (busy) return; error();
    details = readDetails();
    if (!details.focusIds.length) return error('Select at least one question category.');
    if (!details.role || !details.job) return error('Enter a job title and job description.');
    working(true);
    try { const text = await ask([], false); demo = false; report = ''; messages = [{role:'assistant', content:text}]; renderTranscript(); show('interview'); }
    catch (e) { error(e.name === 'AbortError' ? 'The connection timed out. Please try again.' : e.message); }
    finally { working(false); }
  });
  $('sample').addEventListener('click', () => { if (busy) return; details = readDetails(); if (!details.focusIds.length) return error('Select at least one question category.'); demo = true; report = ''; samplePlan = plan(details.round, details.focusIds, details.length); messages = [{role:'assistant', content:sampleQuestion(0)}]; $('answer').value = ''; error(); renderTranscript(); show('interview'); });
  $('answer-form').addEventListener('submit', async e => {
    e.preventDefault(); const answer = $('answer').value.trim(); if (busy || !answer || answered() >= total()) return;
    error(); working(true);
    const history = [...messages, {role:'user', content:answer}];
    const finish = answered() + 1 >= total();
    try {
      if (demo) { messages = history; if (!finish) messages.push({role:'assistant', content:sampleQuestion(answered())}); }
      else { const text = await ask(history, finish); messages = history; if (finish) report = text; else messages.push({role:'assistant', content:text}); }
      $('answer').value = ''; renderTranscript(); if (finish) review();
    } catch (e) { error((e.name === 'AbortError' ? 'The connection timed out.' : e.message) + ' Your answer has been kept so you can try again.'); }
    finally { working(false); }
  });
  function download() {
    const text = ['CareerLaunch Interview Practice', demo ? `SAMPLE SESSION — preset questions; no AI assessment\nRound: ${rounds.find(r=>r.id===details.round)?.label}\nSelected categories: ${details.focusIds.map(id=>categories.find(c=>c.id===id).label).join(', ')}` : `Role: ${details.role}\nRound: ${rounds.find(r=>r.id===details.round)?.label || details.kind}\nSelected categories: ${categories.filter(c=>details.focusIds.includes(c.id)).map(c=>c.label).join(", ")}`, ...messages.map(m => `${m.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${m.content}`), report || 'Self-review: Check each answer for a clear example, your own actions, and an outcome.'].join('\n\n');
    const url = URL.createObjectURL(new Blob([text], {type:'text/plain;charset=utf-8'}));
    const a = document.createElement('a'); a.href = url; a.download = 'coach-jeff-interview-practice.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  document.querySelectorAll('[data-download]').forEach(el => el.addEventListener('click', download));
  document.querySelectorAll('[data-reset]').forEach(el => el.addEventListener('click', () => {
    if (busy || !confirm('Start a new interview? Download your current session first if you want to keep it.')) return;
    messages = []; report = ''; demo = false; $('answer').value = ''; document.querySelectorAll('.check input').forEach(el => el.checked = false); error(); show('setup');
  }));
  $('view-transcript').addEventListener('click', () => { renderTranscript(); show('interview'); });
  $('back-review').addEventListener('click', review);
  window.addEventListener('beforeunload', e => { if (messages.length && stage === 'interview') { e.preventDefault(); e.returnValue = ''; } });
})();
