# Coach Jeff homepage and interview practice

Static career-tools homepage with a typed interview tool at `/interview/`.

Netlify build: `node scripts/build-static.mjs`; publish directory: `public`; functions directory: `netlify/functions`. No npm installation or frontend framework is required. The build copies only browser assets so owner instructions and server source are not served as static files.

See [interview setup](docs/INTERVIEW_SETUP.md) for the server-side API key, enable switch, usage controls and deployment checks.

Run checks with `node --test tests/interview.test.mjs` and `node scripts/build-static.mjs`.

The sample interview works without an API connection. Live AI needs `OPENAI_API_KEY` and `INTERVIEW_ENABLED=true` in Netlify's Functions environment. Students need no ChatGPT login. Audio is planned for a later release.
