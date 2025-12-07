# PulseWeave Production Deployment Guide

This guide covers deploying PulseWeave to production with security best practices.

## Pre-Deployment Checklist

### 1. Environment Configuration

Generate secure secrets:

```bash
# Generate JWT secret (64+ characters)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate cookie secret (32+ characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Required environment variables:

```env
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:5432/pulseweave
JWT_SECRET=<generated-64-char-secret>
COOKIE_SECRET=<generated-32-char-secret>
CORS_ORIGINS=https://your-domain.com
SSL_ENABLED=true
USE_DB_SESSIONS=true
```

### 2. Database Setup

**Recommended: PostgreSQL** (SQLite is for development only)

```bash
# Update DATABASE_URL in .env
DATABASE_URL="postgresql://user:password@localhost:5432/pulseweave?schema=public"

# Run migrations
pnpm db:push
```

### 3. SSL/TLS Configuration

```env
SSL_ENABLED=true
SSL_KEY_PATH=/path/to/server.key
SSL_CERT_PATH=/path/to/server.crt
SSL_CA_PATH=/path/to/ca.crt  # Optional
SSL_MIN_VERSION=TLSv1.2
```

For Let's Encrypt:
```bash
certbot certonly --standalone -d your-domain.com
```

### 4. Security Hardening

#### Rate Limiting
```env
RATE_LIMIT_WINDOW_MS=900000      # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100      # Per window
AUTH_RATE_LIMIT_MAX=5            # Login attempts
```

#### Account Security
```env
ACCOUNT_MAX_FAILED_ATTEMPTS=5
ACCOUNT_LOCKOUT_DURATION_MINUTES=15
MAX_FAILED_ATTEMPTS=10           # IP-based
IP_BLOCK_DURATION_MINUTES=30
```

## Deployment Options

### Option 1: Docker (Recommended)

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/pulseweave
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:15-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=pulseweave
      - POSTGRES_PASSWORD=password
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

### Option 2: PM2 (Process Manager)

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start dist/index.js --name pulseweave -i max

# Save process list
pm2 save

# Setup startup script
pm2 startup
```

### Option 3: Kubernetes

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pulseweave
spec:
  replicas: 3
  selector:
    matchLabels:
      app: pulseweave
  template:
    metadata:
      labels:
        app: pulseweave
    spec:
      containers:
      - name: pulseweave
        image: pulseweave:latest
        ports:
        - containerPort: 3001
        env:
        - name: NODE_ENV
          value: "production"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3001
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          limits:
            memory: "512Mi"
            cpu: "500m"
          requests:
            memory: "256Mi"
            cpu: "250m"
```

## Monitoring

### Health Endpoints

| Endpoint | Purpose | Response |
|----------|---------|----------|
| `/health` | Full health check | Status, services, metrics |
| `/health/live` | Liveness probe | Is server running? |
| `/health/ready` | Readiness probe | Ready for traffic? |
| `/metrics` | Prometheus metrics | Memory, CPU, connections |

### Prometheus Configuration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'pulseweave'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/metrics'
```

### Logging

Logs are structured JSON for easy parsing:

```json
{
  "level": "info",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "message": "Request completed",
  "method": "GET",
  "path": "/api/messages",
  "statusCode": 200,
  "duration": "15ms"
}
```

Configure log aggregation (ELK, Loki, CloudWatch).

## Security Audit Checklist

- [ ] JWT_SECRET is unique and 64+ characters
- [ ] COOKIE_SECRET is unique and 32+ characters
- [ ] SSL/TLS is enabled with valid certificates
- [ ] Database uses PostgreSQL (not SQLite)
- [ ] Database credentials are not default
- [ ] Rate limiting is configured
- [ ] CORS origins are restricted to your domain
- [ ] File upload limits are set
- [ ] Session storage uses database (not memory)
- [ ] All default passwords are changed
- [ ] Audit logging is enabled
- [ ] Health checks are monitored
- [ ] Backups are configured

## Backup Strategy

### Database Backups

```bash
# PostgreSQL backup
pg_dump -h localhost -U postgres pulseweave > backup.sql

# Automated daily backups (cron)
0 2 * * * pg_dump -h localhost -U postgres pulseweave | gzip > /backups/pulseweave-$(date +\%Y\%m\%d).sql.gz
```

### File Uploads

```bash
# Sync uploads to S3
aws s3 sync ./uploads s3://your-bucket/uploads --delete
```

## Scaling Considerations

### Horizontal Scaling

1. Use Redis for session storage
2. Use PostgreSQL for database
3. Use S3/MinIO for file storage
4. Use load balancer with sticky sessions for WebSocket

### WebSocket Scaling

For multiple instances, use Redis adapter:

```typescript
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

## Troubleshooting

### Common Issues

**Database connection errors:**
- Check DATABASE_URL format
- Verify network connectivity
- Check PostgreSQL is running

**WebSocket connection issues:**
- Verify CORS origins include your domain
- Check load balancer supports WebSocket
- Verify SSL certificates are valid

**High memory usage:**
- Check for memory leaks in custom code
- Monitor with `/metrics` endpoint
- Consider increasing Node.js heap size

### Debug Mode

```bash
# Enable debug logging
DEBUG=pulseweave:* NODE_ENV=production node dist/index.js
```

## Support

For issues, check:
1. Application logs
2. Health endpoint: `/health`
3. Metrics endpoint: `/metrics`
4. Database connectivity
5. Redis connectivity (if used)
