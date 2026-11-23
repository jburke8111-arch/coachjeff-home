// Voice support for the interview tool: speaks interviewer questions and transcribes spoken answers.
// No visitor login. The API key is read only by this server function. Audio is not stored.
export const config = {
  rateLimit: { action: 'rate_limit', aggregateBy: 'ip', windowLimit: 40, windowSize: 60 }
};
const MAX_SPEAK_CHARS = 1500;          // interviewer questions are under 100 words
const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // ~3 minutes of compressed speech is well under 1 MB
const AUDIO_TYPES = {'audio/webm':'webm','audio/ogg':'ogg','audio/mp4':'mp4','audio/mpeg':'mp3','audio/wav':'wav','audio/x-m4a':'m4a','audio/m4a':'m4a','audio/aac':'m4a'};
// Whisper tends to drop "um" and "uh" unless the prompt shows them; keeping them lets the review count filler words.
const FILLER_PROMPT = 'Umm, let me think, like, hmm... Okay, uh, so here is what I, you know, did.';

const reply = (body, status = 200, extra = {}) => Response.json(body, {
  status, headers: {'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...extra}
});

export default async function voice(request) {
  if (request.method !== 'POST') return reply({error:'Method not allowed'}, 405, {Allow:'POST'});
  const url = new URL(request.url);
  if (request.headers.get('origin') !== url.origin) return reply({error:'Open the interview page on this website to practice.'}, 403);
  const off = process.env.INTERVIEW_ENABLED !== 'true' ? 'interview-disabled' : process.env.VOICE_ENABLED === 'false' ? 'voice-disabled' : !process.env.OPENAI_API_KEY ? 'no-key' : '';
  if (off) return reply({error:'Voice practice is not available right now. You can still type your answers.', code:off}, 503);
  const action = url.searchParams.get('action');
  const type = (request.headers.get('content-type') || '').toLowerCase();
  const declared = Number(request.headers.get('content-length') || 0);
  try {
    if (action === 'speak') return await speak(request, type, declared);
    if (action === 'transcribe') return await transcribe(request, type, declared);
    return reply({error:'Invalid request'}, 400);
  } catch {
    return reply({error:'The voice service timed out or was interrupted. Please try again, or type your answer.'}, 504);
  }
}

async function speak(request, type, declared) {
  if (!type.startsWith('application/json')) return reply({error:'Expected JSON'}, 415);
  if (declared > 10000) return reply({error:'Question too long to read aloud.'}, 413);
  let data;
  try { const raw = await request.text(); if (Buffer.byteLength(raw) > 10000) return reply({error:'Question too long to read aloud.'}, 413); data = JSON.parse(raw); }
  catch { return reply({error:'Invalid request'}, 400); }
  const text = data && typeof data.text === 'string' ? data.text.trim() : '';
  if (!text || text.length > MAX_SPEAK_CHARS) return reply({error:'Invalid question text.'}, 400);
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method:'POST', headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type':'application/json'},
    body:JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
      voice: process.env.OPENAI_TTS_VOICE || 'coral',
      input: text,
      instructions: 'You are a warm, professional job interviewer speaking to a recent college graduate. Speak clearly at a natural, moderate pace.',
      response_format: 'mp3'
    }),
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) return providerError(response);
  const audio = await response.arrayBuffer();
  return new Response(audio, {status:200, headers:{'Content-Type':'audio/mpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}

async function transcribe(request, type, declared) {
  const base = type.split(';')[0].trim();
  const ext = AUDIO_TYPES[base];
  if (!ext) return reply({error:'Unsupported recording format. Please type your answer instead.'}, 415);
  if (declared > MAX_AUDIO_BYTES) return reply({error:'That recording is too long. Please keep answers under 3 minutes.'}, 413);
  const audio = await request.arrayBuffer();
  if (audio.byteLength > MAX_AUDIO_BYTES) return reply({error:'That recording is too long. Please keep answers under 3 minutes.'}, 413);
  if (audio.byteLength < 1000) return reply({error:'No speech was recorded. Check your microphone and try again.'}, 400);
  const form = new FormData();
  form.append('file', new Blob([audio], {type:base}), `answer.${ext}`);
  form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1');
  form.append('language', 'en');
  form.append('prompt', FILLER_PROMPT);
  form.append('response_format', 'json');
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method:'POST', headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`}, body:form,
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) return providerError(response);
  const result = await response.json();
  const text = typeof result.text === 'string' ? result.text.trim() : '';
  if (!text) return reply({error:'No speech was recognized. Please try again or type your answer.'}, 422);
  return reply({text});
}

async function providerError(response) {
  const status = response.status; let code = '';
  try { const e = (await response.json()).error || {}; code = String(e.code || e.type || '').slice(0, 60); console.error('OpenAI voice error', status, code, String(e.message || '').slice(0, 200)); } catch {}
  const tag = `openai-${status}${code ? '-' + code : ''}`;
  return status === 429
    ? reply({error:'The voice service is at its usage limit. Please try again later, or type your answer.', code:tag}, 429)
    : reply({error:'The voice service is unavailable. Please try again later, or type your answer.', code:tag}, 502);
}
