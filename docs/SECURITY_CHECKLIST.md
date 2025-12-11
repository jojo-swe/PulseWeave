# Security Checklist

## ❌ CRITICAL - Fix Before Production

### Secrets
- [ ] **Change JWT_SECRET** in `apps/backend/.env`
  - Current: `change-this-to-a-secure-random-string-in-production`
  - Required: 64+ character random string
  - Generate: `openssl rand -base64 64`

- [ ] **Change COOKIE_SECRET** in `apps/backend/.env`
  - Current: `change-this-cookie-secret-in-production`
  - Required: 32+ character random string
  - Generate: `openssl rand -base64 32`

### .env Files
- [x] `.env` is in `.gitignore` ✅
- [ ] Remove `apps/backend/.env` from git tracking if committed
  - Run: `git rm --cached apps/backend/.env`
  - Verify it exists in `.gitignore`

## ✅ Good Practices Implemented

### TypeScript
- [x] Frontend: `strict: true` enabled ✅
- [x] Backend: `strict: true` enabled ✅
- [x] No `@ts-nocheck` directives ✅
- [ ] Only 2 `@ts-ignore` in desktop app (acceptable)

### Code Quality
- [x] Build passes with no errors ✅
- [x] API calling conventions documented ✅
- [x] Debug console.logs cleaned up ✅

### Git Security
- [x] `.env` files ignored ✅
- [x] `node_modules` ignored ✅
- [x] Upload directory ignored ✅
- [x] Database files ignored ✅

## Quick Commands

### Generate Secure Secrets
```bash
# JWT Secret (64 chars)
openssl rand -base64 64 | tr -d '\n' && echo

# Cookie Secret (32 chars)
openssl rand -base64 32 | tr -d '\n' && echo
```

### Verify .env Not Tracked
```bash
git ls-files | grep '\.env$'  # Should return nothing
```

### Check for Secrets in Code
```bash
# Search for potential hardcoded secrets
git grep -i "password\s*=\s*['\"]" | grep -v ".example"
git grep -i "secret\s*=\s*['\"]" | grep -v ".example"
```
