import {rounds, categories, emphasis, suggested, plan} from './focus.mjs';
import {analyze, notes, formatTime} from './delivery.mjs';
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let messages = [], details = {}, demo = false, busy = false, report = '', stage = 'setup';
  // Voice state: takes = recordings for the answer in progress; delivery[i] = stats for answer i (null if typed).
  let takes = [], delivery = [], recorder = null, recordStart = 0, recordTimer = null, transcribing = false;
  const audioCache = new Map(); const player = new Audio();
  // Practice-again state: previous = attempt being built on; redoQuestions = fixed questions for a redo;
  // asked = questions already practiced (so new sessions avoid repeats); lastSession = the session just finished.
  let previous = null, redoQuestions = null, asked = [], lastSession = null;
  const STORE = 'coachjeff-interview-v1';
  const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
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
    return {role:$('role').value.trim(), job:$('job').value.trim(), resume:$('resume').value.trim(), kind:'General screening', style:$('style').value, round:$('round').value, focusIds:[...document.querySelectorAll('[name=focus]:checked')].map(el=>el.value), length:Number($('length').value)};
  }
  $('round').addEventListener('change',()=>renderFocus(true)); $('length').addEventListener('change',focusSummary); $('reset-focus').addEventListener('click',()=>renderFocus(true)); renderFocus(true);
  function error(message = '') { $('error').textContent = message; $('error').classList.toggle('hidden', !message); }
  function working(value) {
    busy = value;
    document.querySelectorAll('button, #setup-form input, #setup-form textarea, #setup-form select, [name=focus], #answer').forEach(el => { el.disabled = value; });
    $('status').textContent = value ? 'Preparing your next step…' : '';
    $('start').textContent = value ? 'Connecting…' : 'Start AI interview →';
    if (!value) voiceButtons();
  }
  function show(next) {
    stage = next;
    ['setup', 'interview', 'review'].forEach(id => $(id).classList.toggle('hidden', id !== next));
    document.querySelectorAll('.step').forEach((el, i) => el.classList.toggle('active', i === ['setup', 'interview', 'review'].indexOf(next)));
    const heading = $(next).querySelector('h2'); heading.focus();
  }
  function renderTranscript() {
    $('mode').textContent = (demo ? 'SAMPLE MODE' : 'AI INTERVIEW') + (previous?.mode === 'redo' ? ' · REDO' : previous?.mode === 'focus' ? ' · WEAK SPOTS' : '');
    $('interview-title').textContent = demo ? 'Practice your next conversation.' : details.role;
    $('count').textContent = `${answered()} of ${total()} answers completed${demo ? ' · Preset questions; no adaptive feedback' : ''}`;
    $('progress').style.width = `${answered() / total() * 100}%`;
    $('conversation').replaceChildren();
    for (const m of messages) {
      const div = document.createElement('div'); div.className = `message ${m.role}`;
      const label = document.createElement('span'); label.textContent = m.role === 'assistant' ? 'INTERVIEWER' : 'YOU';
      const p = document.createElement('p'); p.textContent = m.content;
      div.append(label, p);
      if (m.role === 'assistant') { const play = document.createElement('button'); play.type = 'button'; play.className = 'play'; play.textContent = '▶ Play'; play.setAttribute('aria-label', 'Play this question aloud'); play.addEventListener('click', () => speak(m.content)); div.append(play); }
      $('conversation').append(div);
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
    renderDelivery();
    lastSession = {demo, details:{...details}, questions:messages.filter(m=>m.role==='assistant').map(m=>m.content), answers:messages.filter(m=>m.role==='user').map(m=>m.content), report, samplePlan:[...samplePlan]};
    if (!demo) { for (const q of lastSession.questions) if (!asked.includes(q)) asked.push(q); asked = asked.slice(-40); }
    $('weak').classList.toggle('hidden', demo);
    save();
    show('review');
  }
  async function ask(history, finish) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);
    try {
      const response = await fetch('/.netlify/functions/interview', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...details, messages:history, finish, avoid: previous?.mode === 'redo' ? [] : asked.slice(-40), ...(previous ? {previous:{mode:previous.mode, feedback:previous.feedback.slice(0,8000), answers:previous.answers.map(a=>a.slice(0,5000))}} : {})}), signal:controller.signal});
      if (response.status === 429) throw new Error('The practice limit has been reached. Please wait a few minutes and try again.');
      let result;
      try { result = await response.json(); } catch { throw new Error('The interview service is unavailable. Please try again later.'); }
      if (!response.ok) throw new Error((result.error || 'Unable to connect. Please try again.') + (result.code ? ` (code: ${result.code})` : ''));
      if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('No response was returned. Please try again.');
      return result.text;
    } finally { clearTimeout(timer); }
  }
  $('setup-form').addEventListener('submit', async e => {
    e.preventDefault(); if (busy) return; error();
    details = readDetails();
    if (!details.focusIds.length) return error('Select at least one question category.');
    if (!details.role || !details.job) return error('Enter a job title and job description.');
    previous = null; redoQuestions = null; save();
    await startAI();
  });
  async function startAI() {
    working(true);
    try {
      const text = redoQuestions ? redoQuestions[0] : await ask([], false);
      demo = false; report = ''; delivery = []; takes = []; messages = [{role:'assistant', content:text}]; $('answer').value = ''; renderTranscript(); show('interview'); speakLatest();
    }
    catch (e) { error(e.name === 'AbortError' ? 'The connection timed out. Please try again.' : e.message); }
    finally { working(false); }
  }
  function startSample() { demo = true; report = ''; delivery = []; takes = []; messages = [{role:'assistant', content:sampleQuestion(0)}]; $('answer').value = ''; error(); renderTranscript(); show('interview'); speakLatest(); }
  // Practice again, building on a finished session (this visit, or saved on this device).
  function redo(session) {
    if (busy || !session) return; error(); details = {...session.details};
    if (session.demo) { previous = null; redoQuestions = null; samplePlan = session.samplePlan.length ? [...session.samplePlan] : plan(details.round, details.focusIds, details.length); return startSample(); }
    previous = {mode:'redo', feedback:session.report, answers:session.answers}; redoQuestions = [...session.questions]; details.length = redoQuestions.length;
    startAI();
  }
  function weakSpots(session) {
    if (busy || !session || session.demo) return; error(); details = {...session.details};
    previous = {mode:'focus', feedback:session.report, answers:session.answers}; redoQuestions = null;
    startAI();
  }
  $('redo').addEventListener('click', () => redo(lastSession));
  $('weak').addEventListener('click', () => weakSpots(lastSession));
  $('saved-redo').addEventListener('click', () => redo(lastSession));
  $('saved-weak').addEventListener('click', () => weakSpots(lastSession));
  $('sample').addEventListener('click', () => { if (busy) return; details = readDetails(); if (!details.focusIds.length) return error('Select at least one question category.'); previous = null; redoQuestions = null; samplePlan = plan(details.round, details.focusIds, details.length); save(); startSample(); });
  $('answer-form').addEventListener('submit', async e => {
    e.preventDefault(); const answer = $('answer').value.trim(); if (busy || transcribing || recorder || !answer || answered() >= total()) return;
    error(); working(true);
    const history = [...messages, {role:'user', content:answer}];
    const finish = answered() + 1 >= total();
    try {
      if (demo) { messages = history; if (!finish) messages.push({role:'assistant', content:sampleQuestion(answered())}); }
      else if (redoQuestions && !finish) { messages = history; messages.push({role:'assistant', content:redoQuestions[answered()]}); }
      else { const text = await ask(history, finish); messages = history; if (finish) report = text; else messages.push({role:'assistant', content:text}); }
      delivery[answered() - 1] = takes.length ? analyze(takes) : null; takes = [];
      $('answer').value = ''; renderTranscript(); if (finish) review(); else speakLatest();
    } catch (e) { error((e.name === 'AbortError' ? 'The connection timed out.' : e.message) + ' Your answer has been kept so you can try again.'); }
    finally { working(false); }
  });
  function download() {
    const text = ['CareerLaunch Interview Practice', demo ? `SAMPLE SESSION — preset questions; no AI assessment\nRound: ${rounds.find(r=>r.id===details.round)?.label}\nSelected categories: ${details.focusIds.map(id=>categories.find(c=>c.id===id).label).join(', ')}` : `Role: ${details.role}\nRound: ${rounds.find(r=>r.id===details.round)?.label || details.kind}\nSelected categories: ${categories.filter(c=>details.focusIds.includes(c.id)).map(c=>c.label).join(", ")}`, ...messages.map(m => `${m.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${m.content}`), deliveryText(), report || 'Self-review: For behavioral answers, use STAR+: Situation, Task, Action, Result, and + Connect to the job posting. Explain how your example demonstrates a specific requirement. If no posting was provided in sample mode, choose one and check the connection. Use an appropriate format for other questions.'].filter(Boolean).join('\n\n');
    const url = URL.createObjectURL(new Blob([text], {type:'text/plain;charset=utf-8'}));
    const a = document.createElement('a'); a.href = url; a.download = 'coach-jeff-interview-practice.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  document.querySelectorAll('[data-download]').forEach(el => el.addEventListener('click', download));
  document.querySelectorAll('[data-reset]').forEach(el => el.addEventListener('click', () => {
    if (busy || !confirm('Start a new interview? Download your current session first if you want to keep it.')) return;
    stopAudio(); previous = null; redoQuestions = null; renderSaved(); messages = []; report = ''; demo = false; delivery = []; takes = []; $('answer').value = ''; document.querySelectorAll('.check input').forEach(el => el.checked = false); error(); show('setup');
  }));
  $('view-transcript').addEventListener('click', () => { renderTranscript(); show('interview'); });
  $('back-review').addEventListener('click', review);
  // ---------- Voice: read questions aloud ----------
  function stopAudio() { player.pause(); }
  function speakLatest() {
    const last = messages[messages.length - 1];
    if (last && last.role === 'assistant' && $('read-aloud').checked) speak(last.content, true);
  }
  async function speak(text, automatic = false) {
    if (recorder) return;
    try {
      let url = audioCache.get(text);
      if (!url) {
        $('voice-status').textContent = 'Loading audio…';
        const response = await fetch('/.netlify/functions/voice?action=speak', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text})});
        if (!response.ok) { let msg = 'Audio is unavailable right now.'; try { const j = await response.json(); msg = (j.error || msg) + (j.code ? ` (code: ${j.code})` : ''); } catch {} throw new Error(msg); }
        url = URL.createObjectURL(await response.blob()); audioCache.set(text, url);
      }
      player.pause(); player.src = url; player.currentTime = 0;
      $('voice-status').textContent = '';
      await player.play();
    } catch (e) {
      // Browsers can block automatic playback; the Play button always works after a tap.
      $('voice-status').textContent = e.name === 'NotAllowedError' ? 'Tap ▶ Play to hear the question.' : (automatic ? e.message + ' You can read the question above.' : e.message);
    }
  }
  // ---------- Voice: record and transcribe answers ----------
  function pickType() {
    for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
    return '';
  }
  function voiceButtons() {
    const btn = $('record');
    if (!canRecord) { btn.classList.add('hidden'); $('voice-status').textContent = $('voice-status').textContent || 'Voice answers are not supported in this browser. Please type your answer.'; return; }
    btn.disabled = busy || transcribing;
    btn.classList.toggle('recording', !!recorder);
    btn.textContent = recorder ? `■ Stop recording (${formatTime((Date.now() - recordStart) / 1000)})` : (transcribing ? 'Transcribing…' : ($('answer').value.trim() ? '🎤 Record more' : '🎤 Answer out loud'));
    $('send').disabled = busy || transcribing || !!recorder;
  }
  async function startRecording() {
    error(); stopAudio();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({audio:true}); }
    catch { return error('Microphone access was blocked. Allow the microphone for this site in your browser settings, or type your answer.'); }
    const type = pickType(); const chunks = [];
    recorder = type ? new MediaRecorder(stream, {mimeType:type}) : new MediaRecorder(stream);
    recorder.addEventListener('dataavailable', e => { if (e.data.size) chunks.push(e.data); });
    recorder.addEventListener('stop', () => {
      stream.getTracks().forEach(t => t.stop());
      const seconds = (Date.now() - recordStart) / 1000;
      const blob = new Blob(chunks, {type: recorder.mimeType || type || 'audio/webm'});
      recorder = null; clearInterval(recordTimer); transcribe(blob, seconds);
    });
    recordStart = Date.now(); recorder.start();
    recordTimer = setInterval(() => { voiceButtons(); if (Date.now() - recordStart >= 180000) { recorder.stop(); $('voice-status').textContent = 'Recording stopped at 3 minutes.'; } }, 500);
    $('voice-status').textContent = 'Recording… speak your answer, then tap Stop.';
    voiceButtons();
  }
  async function transcribe(blob, seconds) {
    transcribing = true; voiceButtons(); $('voice-status').textContent = 'Turning your speech into text…';
    try {
      const response = await fetch('/.netlify/functions/voice?action=transcribe', {method:'POST', headers:{'Content-Type':blob.type}, body:blob});
      let result; try { result = await response.json(); } catch { throw new Error('The voice service is unavailable. Please type your answer.'); }
      if (!response.ok || typeof result.text !== 'string') throw new Error((result.error || 'Transcription failed. Please try again or type your answer.') + (result.code ? ` (code: ${result.code})` : ''));
      takes.push({text:result.text, seconds});
      const box = $('answer'); box.value = (box.value.trim() ? box.value.trim() + ' ' : '') + result.text; box.focus();
      $('voice-status').textContent = 'Check the text, fix any mistakes, then send your answer.';
    } catch (e) { error(e.message); $('voice-status').textContent = ''; }
    finally { transcribing = false; voiceButtons(); }
  }
  $('record').addEventListener('click', () => { if (recorder) recorder.stop(); else if (!busy && !transcribing) startRecording(); });
  $('answer').addEventListener('input', voiceButtons);
  $('read-aloud').addEventListener('change', () => { if (!$('read-aloud').checked) stopAudio(); });
  // ---------- Delivery stats on the review page ----------
  function deliveryRows() {
    return delivery.map((d, i) => d && {n:i + 1, ...d, tips:notes(d)}).filter(Boolean);
  }
  function renderDelivery() {
    const rows = deliveryRows(); const box = $('delivery');
    box.classList.toggle('hidden', !rows.length); $('delivery-list').replaceChildren();
    for (const r of rows) {
      const li = document.createElement('li');
      const head = document.createElement('strong'); head.textContent = `Q${r.n}`;
      const fill = Object.entries(r.fillers).map(([k, v]) => `${k} ×${v}`).join(', ');
      const body = document.createElement('span'); body.textContent = ` ${formatTime(r.seconds)} spoken · ${r.wpm ?? '—'} words/min · ${r.fillerTotal ? `filler words: ${fill}` : 'no filler words detected'}`;
      li.append(head, body);
      if (r.tips.length) { const tip = document.createElement('em'); tip.textContent = r.tips.join(' '); li.append(tip); }
      $('delivery-list').append(li);
    }
  }
  function deliveryText() {
    const rows = deliveryRows(); if (!rows.length) return '';
    return ['Speaking stats (approximate, spoken answers only)', ...rows.map(r => `Q${r.n}: ${formatTime(r.seconds)} · ${r.wpm ?? '—'} words/min · filler words: ${r.fillerTotal ? Object.entries(r.fillers).map(([k, v]) => `${k} ×${v}`).join(', ') : 'none detected'}${r.tips.length ? ' · ' + r.tips.join(' ') : ''}`)].join('\n');
  }
  // ---------- Remember details on this device (opt-in; browser storage only, never sent to a server) ----------
  function save() {
    try {
      if (!$('remember').checked) { localStorage.removeItem(STORE); return; }
      const d = readDetails();
      localStorage.setItem(STORE, JSON.stringify({role:d.role, job:d.job, resume:d.resume, round:d.round, focusIds:d.focusIds, length:d.length, style:d.style, asked, lastSession, savedAt:Date.now()}));
    } catch { /* storage full or blocked: the tool still works without it */ }
  }
  function load() {
    let data; try { data = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { data = null; }
    if (!data) return;
    $('remember').checked = true;
    for (const id of ['role','job','resume']) if (typeof data[id] === 'string') $(id).value = data[id];
    if (rounds.some(r => r.id === data.round)) $('round').value = data.round;
    if ([5,8,10].includes(data.length)) $('length').value = String(data.length);
    if (['likely','mixed','curveball'].includes(data.style)) $('style').value = data.style;
    if (Array.isArray(data.focusIds) && data.focusIds.length) { renderFocus(true); document.querySelectorAll('[name=focus]').forEach(el => { el.checked = data.focusIds.includes(el.value); }); focusSummary(); }
    if (Array.isArray(data.asked)) asked = data.asked.filter(q => typeof q === 'string').slice(-40);
    if (data.lastSession && Array.isArray(data.lastSession.questions) && Array.isArray(data.lastSession.answers) && data.lastSession.details) lastSession = data.lastSession;
  }
  function renderSaved() {
    const show = !!(lastSession && $('remember').checked);
    $('saved-session').classList.toggle('hidden', !show);
    if (show) { $('saved-weak').classList.toggle('hidden', !!lastSession.demo); $('saved-summary').textContent = `Last time: ${lastSession.demo ? 'sample practice' : lastSession.details.role} · ${lastSession.questions.length} questions.`; }
  }
  $('remember').addEventListener('change', () => { save(); renderSaved(); });
  $('forget').addEventListener('click', () => { try { localStorage.removeItem(STORE); } catch {} $('remember').checked = false; asked = []; lastSession = null; for (const id of ['role','job','resume']) $(id).value = ''; renderSaved(); $('status').textContent = 'Saved details removed from this device.'; });
  load(); renderSaved();
  voiceButtons();
  window.addEventListener('beforeunload', e => { if (messages.length && stage === 'interview') { e.preventDefault(); e.returnValue = ''; } });
})();
