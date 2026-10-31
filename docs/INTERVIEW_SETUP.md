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

Interview state is held in browser memory. It clears on reload; the tool warns before leaving an active session. Job description, optional background, and transcript are sent to the API in AI mode. `store:false` is used, but provider data retention rules and account settings still apply. This application does not persist or log interview contents. Provider and hosting infrastructure have their own logging and data policies. Transcript downloads happen only when the visitor clicks Download.

## Audio later

The UI and API exchange role/content text turns. Audio can be added as optional transcription into the answer field and playback of interviewer messages while retaining typed practice. This release does not request microphone access. Update the microphone Permissions-Policy when audio is implemented.

## Validation

Run `node --test tests/interview.test.mjs` and `node scripts/build-static.mjs`. Tests mock API calls, including provider failures; they do not prove live AI quality, Netlify routing or deployed rate limiting. Check those on the Netlify deployment before release.
