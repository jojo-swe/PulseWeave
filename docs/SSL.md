# SSL / TLS Setup

This guide covers enabling HTTPS for the PulseWeave backend and serving the frontend securely in development or production.

## 1) Choose certificate source

1. **Real certificate (recommended in prod)**
   - Use a certificate from a trusted CA (e.g., Let's Encrypt) or your corporate PKI.
   - Place files where the backend can read them, and set the env vars below.
2. **Self-signed certificate (dev only)**
   - Run the helper script (requires OpenSSL in PATH):

   ```bash
   pnpm --filter backend tsx src/middleware/ssl.ts
   ```

   - This generates `./certs/server.key` and `./certs/server.crt`.
   - Trust the self-signed cert on your OS so the browser accepts it.

## 2) Configure environment

Set these in `apps/backend/.env` (already documented in `.env.example`):

```env
SSL_ENABLED=true
SSL_KEY_PATH=./certs/server.key
SSL_CERT_PATH=./certs/server.crt
SSL_CA_PATH=./certs/ca.crt   # optional, for client certs
SSL_PORT=3443
SSL_HTTP_REDIRECT=true       # force HTTP→HTTPS
SSL_MIN_VERSION=TLSv1.2      # or TLSv1.3
COOKIE_SECRET=change-me      # required for signed cookies
FRONTEND_URL=https://localhost:3000
```

## 3) Run the backend with HTTPS

```bash
# From repo root
env SSL_ENABLED=true pnpm --filter backend dev
```

- Server listens on `https://localhost:3443` (or your SSL_PORT).
- If `SSL_HTTP_REDIRECT=true`, HTTP traffic is redirected to HTTPS.

## 4) Frontend configuration

Set the API URL to HTTPS in `apps/frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=https://localhost:3443
```

Restart the frontend dev server after changing envs.

## 5) Production checklist

- Use **real certificates** and a strong `COOKIE_SECRET` and `JWT_SECRET`.
- Terminate TLS at a reverse proxy (nginx/Traefik) or at the Node server—keep one source of truth for TLS.
- Keep `SSL_MIN_VERSION` at least `TLSv1.2` (prefer `TLSv1.3` if supported).
- Ensure HSTS is acceptable for your domains before enabling preload.

## 6) Troubleshooting

- **Browser shows insecure/self-signed warning**: trust the dev certificate in your OS keychain.
- **Port conflicts**: change `SSL_PORT` in `.env`.
- **Cert file not found**: confirm absolute/relative paths from `apps/backend` cwd.
- **Mixed content errors**: ensure both frontend `NEXT_PUBLIC_API_URL` and backend are using HTTPS.
