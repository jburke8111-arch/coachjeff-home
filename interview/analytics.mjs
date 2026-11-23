// Anonymous usage counts with GoatCounter (no cookies, no personal data).
// Loads only on the live site, so previews and local testing aren't counted.
const SITE = 'coachjeff.netlify.app';
const ENDPOINT = 'https://coachjeff-interview.goatcounter.com/count';
const live = location.hostname === SITE;
const queue = [];

if (live) {
  const s = document.createElement('script');
  s.async = true; s.src = 'https://gc.zgo.at/count.js'; s.dataset.goatcounter = ENDPOINT;
  s.onload = () => { while (queue.length) send(queue.shift()); };
  document.head.append(s);
}
function send(name) {
  try { window.goatcounter.count({path: name, title: name, event: true}); } catch { /* counting must never break the tool */ }
}
// Count an action, e.g. track('interview-started'). Only the action name is sent, never what the student typed.
export function track(name) {
  if (!live) return;
  if (window.goatcounter && window.goatcounter.count) send(name); else if (queue.length < 20) queue.push(name);
}
