# Zetesis Phase 2b: accounts, sync, assistant

Folder: public/index.html (the site), src/worker.js (API), schema.sql, wrangler.toml.

## Deploy (about 10 minutes)
1. Install Node.js, then in this folder run: npm i -g wrangler && wrangler login
2. wrangler d1 create zetesis   (copy the database_id it prints into wrangler.toml)
3. wrangler d1 execute zetesis --remote --file=schema.sql
4. wrangler secret put ANTHROPIC_API_KEY   (paste your key when asked; never put it in index.html)
5. wrangler deploy

The site and API share one address, so there is no CORS setup.

## Notes
- Passwords are hashed (PBKDF2) and sessions use HttpOnly cookies. There is no password reset or email: a forgotten password means a new account. Say so to users.
- The assistant is capped at 20 calls per user per day (DAILY in wrangler.toml). It uses the model set by MODEL (default claude-sonnet-5-5).
- Sync is last-write-wins: the newest device overwrites the account data.
- Add Cloudflare rate limiting on /api/signup and /api/login before sharing widely.
