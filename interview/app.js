'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const questions = [
    'Tell me about yourself and what interests you in this opportunity.',
    'Tell me about a class project, internship, or job where you solved a difficult problem. What did you personally do?',
    'Describe a time you worked with someone whose approach differed from yours. How did you handle it?',
    'Tell me about a time you had to learn something quickly. How did you know you had learned it well enough?',
    'What questions would you ask the interviewer about this role or team?'
  ];
  let messages = [], details = {}, demo = false, busy = false, report = '', stage = 'setup';
  const answered = () => messages.filter(m => m.role === 'user').length;
  const total = () => demo ? 5 : details.length;
  function error(message = '') { $('error').textContent = message; $('error').classList.toggle('hidden', !message); }
  function working(value) {
    busy = value;
    document.querySelectorAll('button, #setup-form input, #setup-form textarea, #setup-form select, #answer').forEach(el => { el.disabled = value; });
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
    details = {role:$('role').value.trim(), job:$('job').value.trim(), resume:$('resume').value.trim(), kind:$('kind').value, length:Number($('length').value)};
    if (!details.role || !details.job) return error('Enter a job title and job description.');
    working(true);
    try { const text = await ask([], false); demo = false; report = ''; messages = [{role:'assistant', content:text}]; renderTranscript(); show('interview'); }
    catch (e) { error(e.name === 'AbortError' ? 'The connection timed out. Please try again.' : e.message); }
    finally { working(false); }
  });
  $('sample').addEventListener('click', () => { if (busy) return; demo = true; report = ''; messages = [{role:'assistant', content:questions[0]}]; $('answer').value = ''; error(); renderTranscript(); show('interview'); });
  $('answer-form').addEventListener('submit', async e => {
    e.preventDefault(); const answer = $('answer').value.trim(); if (busy || !answer || answered() >= total()) return;
    error(); working(true);
    const history = [...messages, {role:'user', content:answer}];
    const finish = answered() + 1 >= total();
    try {
      if (demo) { messages = history; if (!finish) messages.push({role:'assistant', content:questions[answered()]}); }
      else { const text = await ask(history, finish); messages = history; if (finish) report = text; else messages.push({role:'assistant', content:text}); }
      $('answer').value = ''; renderTranscript(); if (finish) review();
    } catch (e) { error((e.name === 'AbortError' ? 'The connection timed out.' : e.message) + ' Your answer has been kept so you can try again.'); }
    finally { working(false); }
  });
  function download() {
    const text = ['CareerLaunch Interview Practice', demo ? 'SAMPLE SESSION — preset questions; no AI assessment' : `Role: ${details.role}\nFocus: ${details.kind}`, ...messages.map(m => `${m.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${m.content}`), report || 'Self-review: Check each answer for a clear example, your own actions, and an outcome.'].join('\n\n');
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
