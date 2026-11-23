# Typed interview: Netlify setup

The tool is served at `/interview/` on the existing site. Students need no ChatGPT account. Nothing in this repository contains an API key.

## Deployment

1. Merge the interview branch into the branch Netlify deploys. The checked-in `netlify.toml` builds a `public/` directory from the homepage assets and interview files and packages `netlify/functions/interview.mjs` separately. Check Netlify's existing base directory settings: this config expects repository root.
2. In this site's Netlify environment variable settings, add `OPENAI_API_KEY` as a secret with Functions scope. Enter it directly in Netlify, not in GitHub, a browser field, or a chat.
3. Set `INTERVIEW_ENABLED=true` with Functions scope. Optional: set `OPENAI_MODEL` to a model available to your API project; the code defaults to `gpt-4.1-mini`.
4. Deploy again so the function receives the new settings. Open `/interview/`, run a real five-question session, check feedback and download, and repeat on a phone before announcing it.

API use needs an API project with billing/credits. A ChatGPT subscription does not provision the server key. Use a dedicated project/key, set the provider usage notifications and available limits, and monitor early usage. A budget notification alone should not be treated as a guaranteed hard spending cap.

## Cost controls and access

- Netlify function configuration requests 12 calls per minute per IP. Verify this limit is active on the site's Netlify plan/deployment; test excess requests returning 429. It may also limit people sharing a campus network.
- A session has 5 or 8 turns; input and output sizes are bounded server-side. A visitor can start another session, and an anonymous public service can be called by scripts. These controls are not a global dollar cap.
- `INTERVIEW_ENABLED` defaults off. Set it to `false` and redeploy to stop live AI calls while retaining sample mode.
- The function enforces same-origin browser requests and returns no permissive CORS headers. This is not bot authentication. Add a verified challenge or shared global quota if wider traffic warrants it.

## Privacy

Interview state is held in browser memory. It clears on reload; the tool warns before leaving an active session. Job posting, optional resume, and transcript are sent to the API in AI mode; voice recordings and question text are sent for transcription and read-aloud. Uploaded files are read in the browser and not sent; only the extracted text is used. With "Remember" checked, setup and the last session are kept in the browser's localStorage. `store:false` is used, but provider data retention rules and account settings still apply. This application does not persist or log interview contents. Provider and hosting infrastructure have their own logging and data policies. Transcript downloads happen only when the visitor clicks Download.

## Voice

Voice is optional; typing always works. `netlify/functions/voice.mjs` does two things:

- `?action=speak` reads an interviewer question aloud with OpenAI text-to-speech (default `gpt-4o-mini-tts`, voice `coral`). The browser caches each question's audio so replays are free.
- `?action=transcribe` turns a spoken answer (max 3 minutes) into text with OpenAI transcription (default `whisper-1`, prompted to keep "um"/"uh" so filler words can be counted). The text goes into the answer box for the student to check and edit before sending.

It uses the same `OPENAI_API_KEY` and `INTERVIEW_ENABLED` settings. Optional settings: `VOICE_ENABLED=false` turns voice off while keeping typed interviews; `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE`, `OPENAI_TRANSCRIBE_MODEL` override the defaults. Rate limit: 40 voice requests per minute per visitor IP. Recordings are not stored.

Speaking stats (time, words per minute, filler words) are calculated in the browser from the transcript and shown on the review page and in the download. The time and pace guides are practice rules of thumb.

`netlify.toml` allows the microphone on `/interview/` (`microphone=(self)`) and `media-src 'self' blob:` for audio playback.

Ten-question sessions produce longer feedback. If the final review times out on 10 questions, raise the function timeout in Netlify or lower `max_output_tokens`.

## Job posting and resume

- Job posting: paste it, upload it (PDF, .docx, text), or use a link. `netlify/functions/posting.mjs` reads public pages only (private/internal addresses refused, redirects re-checked, 2 MB / 8 s limits, 10 requests per minute per IP). Greenhouse, Lever and Workday links are read from those systems' public posting feeds; other pages use schema.org JobPosting data when present, otherwise the page text. LinkedIn, Indeed, Glassdoor, Handshake and ZipRecruiter block automated reading, so students are told to paste.
- Resume: paste or upload (PDF, .docx, text). Uploads are read in the browser with bundled pdf.js and mammoth (`interview/vendor/`, licenses included); files are never uploaded. Email addresses and phone numbers are removed from uploaded resumes.
- There is no job title field. The title comes from the imported posting or the first short line of the posting text and is only used as a heading and in the download.

## Answer timing

Coach Jeff's target is 60–90 seconds per answer, under 2 minutes. A live timer shows green 1:00–1:30, amber to 2:00, red past 2:00; recording stops at 3:00. Typed answers are estimated at about 140 words per minute. The review page and download list each answer's length.

## Practice again, question style, remembered details

- Question style: Most likely (default), Likely + a curveball or two, or Curveball challenge.
- Review page: "Redo these same questions" reuses the exact questions (no AI calls until the final review, which adds a Compared with last time section). "New questions on my weak spots" sends the previous feedback so new questions target it, and the review adds Progress on weak spots.
- "Remember my details and past questions on this device" is opt-in and off by default. It saves the setup, the last 40 questions asked and the last session (questions, answers, feedback) in the browser's localStorage only, so students can come back later and new sessions avoid repeat questions. "Forget saved details" clears it.

## Validation

Run `node --test tests/*.test.mjs` and `node scripts/build-static.mjs`. Tests mock API calls, including provider failures; they do not prove live AI quality, Netlify routing or deployed rate limiting. Check those on the Netlify deployment before release.

## Usage counts (GoatCounter)

`interview/analytics.mjs` loads GoatCounter (site code `coachjeff-interview`) only on coachjeff.netlify.app, so deploy previews and local testing aren't counted. It counts page visits plus these events (names only, never student text): interview-started-{N}q-{style}, interview-redo-started, interview-weak-spots-started, interview-finished, sample-started, sample-finished, voice-answer, resume-uploaded, posting-uploaded, posting-link-imported, posting-link-failed, session-downloaded. The CSP for /interview/* allows https://gc.zgo.at (script) and https://coachjeff-interview.goatcounter.com (count requests).
