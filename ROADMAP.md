# PulseWeave Roadmap

This document outlines the future development plan for PulseWeave.

## Phase 3: Advanced Multi-tenancy (In Progress)
- [ ] **Advanced Role Management**: 
    - Implement granular permissions (e.g., `MANAGE_CHANNELS`, `KICK_MEMBERS`).
    - Create custom role definitions per workspace.

## Phase 4: Polish & Scale (Next Up)
- [ ] **File Uploads (Production)**: 
    - Migrate from local disk storage to S3-compatible object storage (AWS S3/MinIO).
    - Implement CDN for faster asset delivery.
- [ ] **Push Notifications**:
    - Implement Web Push API for desktop/browser notifications.
    - (Future) Mobile push notifications.
- [ ] **Search Implementation**:
    - Replace basic database search with full-text search (Postgres `tsvector` or Elasticsearch).
    - Implement fuzzy matching for users and content.
- [ ] **Billing & Subscription**:
    - Integrate Stripe for subscription billing.
    - Integrate RevenueCat for entitlement management.
    - Implement UI for upgrading/downgrading tiers.
- [ ] **Mobile Optimization**:
    - Audit all views for mobile responsiveness.
    - Implement touch-friendly navigation drawer.

## Phase 5: Advanced Features
- [ ] **Voice & Video**:
    - WebRTC integration for voice channels.
    - Screen sharing capabilities.
- [ ] **Integrations**:
    - GitHub/GitLab webhooks integration.
    - Jira/Linear link previews and status syncing.
- [ ] **AI Assistant**:
    - Integrate LLM for chat summaries and smart replies (PulseWeave AI).
