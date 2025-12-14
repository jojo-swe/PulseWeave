# Beta (VPS) Deployment

## Pseudocode

```text
betaDeploy():
  create DNS A record: beta.pulsweave.app -> VPS_IP
  on VPS:
    install docker + docker compose
    clone repo
    copy deploy/beta/.env.example -> deploy/beta/.env
    set JWT_SECRET (64+ chars)
    set COOKIE_SECRET (32+ chars)
    run:
      docker compose --env-file deploy/beta/.env \
        -f docker-compose.yml \
        -f deploy/beta/docker-compose.beta.yml \
        up -d --build
  verify:
    https://beta.pulsweave.app loads
    https://beta.pulsweave.app/api/health/live returns ok
```

## Notes

- This setup terminates TLS in Caddy and forwards traffic to the internal Docker network.
- `BEHIND_PROXY=true` is enabled for the backend in `deploy/beta/docker-compose.beta.yml`.
- Do not publish backend/frontend ports publicly on the VPS. Only `80/443` should be exposed.
