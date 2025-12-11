# API Calling Convention

## Frontend API Layer

### Convention
The `api` object in `src/lib/api.ts` provides generic helpers that **automatically prepend `/api`** to endpoints.

### ✅ Correct Usage
```typescript
import { api } from '@/lib/api';

// Generic helpers - DO NOT include /api prefix
await api.get('/users/me');           // → GET /api/users/me
await api.post('/friends/request', {}); // → POST /api/friends/request
await api.patch('/users/me', data);   // → PATCH /api/users/me
await api.delete('/friends/123');     // → DELETE /api/friends/123

// Or use typed helper methods (already include /api)
await api.users.getMe(token);         // → GET /api/users/me
await api.auth.login(credentials);    // → POST /api/auth/login
```

### ❌ Incorrect Usage
```typescript
// DON'T include /api - it will be doubled: /api/api/friends
await api.get('/api/friends'); // ❌ Wrong!

// Use this instead:
await api.get('/friends');     // ✅ Correct
```

### Implementation Details
```typescript
// src/lib/api.ts
export const api = {
  get: <T>(endpoint: string) =>
    fetchApi<T>(`/api${endpoint}`, ...),  // Prepends /api
  
  // Typed helpers call fetchApi directly
  users: {
    getMe: (token: string) =>
      fetchApi<any>('/api/users/me', ...),  // Already includes /api
  }
}
```

### Error Handling
All API calls should use try/catch:
```typescript
try {
  const data = await api.get('/users/me');
} catch (error) {
  console.error('Failed to load user:', error);
  // Handle error appropriately
}
```

## Debugging
- Use `console.error()` for errors
- Avoid `console.log()` in production code
- Backend uses structured logging (`logger.info()`)
