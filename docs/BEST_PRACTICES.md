# Development Best Practices - PulseWeave

## Code Quality Standards

### TypeScript
- ✅ **Use strict mode** - Already enabled in both frontend and backend
- ✅ **Avoid `any` type** - Use proper typing or `unknown`
- ✅ **No `@ts-ignore`** without descriptive comment (minimum 10 chars)

### Debugging & Logging
- ❌ **No `console.log` in production code**
- ✅ **Use `console.error()` for errors** (frontend)
- ✅ **Use `logger.info/error/warn()`** (backend)
- ❌ **No `debugger` statements**

### API Conventions
- ✅ **Read `docs/API_CONVENTIONS.md`** before making API calls
- ✅ Generic helpers (`api.get/post`) prepend `/api` automatically
- ❌ **Never use** `/api/api/...` patterns

### Git Practices
- ✅ **Never commit `.env` files** - Use `.env.example`
- ✅ **Review changes before commit** - Check for secrets/logs
- ✅ **Use descriptive commit messages**

## Quick Commands

### Before Committing
```bash
# Type check
pnpm typecheck

# Lint code
pnpm lint

# Build to catch errors
pnpm build

# Check for console.logs (frontend only allows console.error/warn/info)
git grep -n "console\.log" apps/frontend/src apps/backend/src
```

### Linting
```bash
# Lint everything
pnpm lint

# Lint frontend only
pnpm lint:frontend

# Lint backend only
pnpm lint:backend

# Auto-fix issues
cd apps/frontend && npx eslint --fix src
cd apps/backend && npx eslint --fix src
```

## Pre-Commit Checklist

- [ ] No `console.log` statements
- [ ] No `debugger` statements
- [ ] No hardcoded secrets
- [ ] TypeScript builds successfully (`pnpm build`)
- [ ] Linting passes (`pnpm lint`)
- [ ] `.env` files not tracked
- [ ] API calls follow convention (no `/api/api/`)

## Security

### Critical for Production
See `docs/SECURITY_CHECKLIST.md` for:
- [ ] Change `JWT_SECRET`
- [ ] Change `COOKIE_SECRET`
- [ ] Remove default secrets

### Development
- ✅ Never commit real API keys
- ✅ Use `.env.example` for documentation
- ✅ Keep secrets in `.env` (gitignored)

## Code Review Focus

1. **Security** - Secrets, auth, input validation
2. **Type Safety** - Proper TypeScript usage
3. **Error Handling** - Try/catch, error logging
4. **Performance** - Memory leaks, unnecessary re-renders
5. **API Conventions** - Correct endpoint patterns

## Resources

- `docs/API_CONVENTIONS.md` - API calling patterns
- `docs/SECURITY_CHECKLIST.md` - Pre-production security
- `apps/frontend/.eslintrc.json` - Linting rules
- `apps/backend/.eslintrc.json` - Backend linting

## Automation

Consider adding:
- Pre-commit hooks (husky + lint-staged)
- CI/CD pipeline checks
- Automated security scanning
