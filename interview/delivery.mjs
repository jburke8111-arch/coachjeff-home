// Delivery stats for spoken answers. Counted from the transcript of what the student said,
// before any edits they make in the answer box. Transcription is imperfect, so treat counts as approximate.
const FILLERS = [
  ['um', /\b(?:um+|umm+|erm+)\b/gi],
  ['uh', /\b(?:uh+|er+|ah+)\b/gi],
  ['hmm', /\bhm+\b/gi],
  ['like', /(?:^|[,.;!?]\s*|\b(?:and|but|so|was|is|it's|just)\s+)like\s*,/gi],
  ['you know', /\byou know\b(?!\s+(?:how|what|that|when|where|why|if|the|a|an|about))/gi],
  ['I mean', /\bI mean\b(?!\s+(?:that|it|to)\b)/gi],
  ['kind of / sort of', /\b(?:kind|sort) of\b/gi],
  ['basically', /\bbasically\b/gi],
  ['literally', /\bliterally\b/gi]
];

export function countWords(text) {
  return (String(text).match(/[A-Za-z0-9']+/g) || []).length;
}

export function fillerCounts(text) {
  const out = {};
  for (const [label, re] of FILLERS) {
    const n = (String(text).match(re) || []).length;
    if (n) out[label] = n;
  }
  return out;
}

// takes: [{text, seconds}] for each recording the student made for one answer
export function analyze(takes) {
  const text = takes.map(t => t.text).join(' ');
  const seconds = takes.reduce((sum, t) => sum + t.seconds, 0);
  const words = countWords(text);
  const fillers = fillerCounts(text);
  const fillerTotal = Object.values(fillers).reduce((a, b) => a + b, 0);
  const wpm = seconds >= 5 ? Math.round(words / (seconds / 60)) : null;
  return {seconds: Math.round(seconds), words, wpm, fillers, fillerTotal};
}

// Coach Jeff's guide: most answers should run 60–90 seconds and stay under 2 minutes.
export const TARGET = {min: 60, max: 90, limit: 120};
// Typed answers: estimate speaking time at a typical conversational pace of about 140 words per minute (rule of thumb).
export function estimateSeconds(text) { return Math.round(countWords(text) / 140 * 60); }
export function lengthZone(seconds) {
  return seconds < TARGET.min ? 'short' : seconds <= TARGET.max ? 'good' : seconds <= TARGET.limit ? 'long' : 'over';
}
export function notes(stats) {
  const tips = [];
  const zone = lengthZone(stats.seconds);
  if (zone === 'short') tips.push('A bit short: aim for 60–90 seconds by adding a specific example or result.');
  else if (zone === 'long') tips.push('A little long: aim for 60–90 seconds.');
  else if (zone === 'over') tips.push('Too long: keep answers under 2 minutes.');
  if (stats.typed) return tips;
  if (stats.wpm !== null && stats.wpm > 175) tips.push('Fast pace: slow down and pause between points.');
  else if (stats.wpm !== null && stats.wpm < 100) tips.push('Slow pace: try a little more energy.');
  if (stats.words && stats.fillerTotal / stats.words > 0.04) tips.push('Many filler words: try a short pause instead.');
  return tips;
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
