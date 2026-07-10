# Changelog

All notable changes to the "PulseWeave" project will be documented in this file.

## [Unreleased]

### Changed
- **Code Quality Pass**:
    - Fixed all ESLint errors and warnings (3 errors, 25 warnings → 0).
    - Removed unused imports, variables, and parameters across 19 files.
    - Fixed unnecessary regex escapes in password validation (`config/security.ts`).
    - Replaced `require()` with ES module import in `encryption.test.ts`.
    - Refactored `middleware/rbac.ts` — extracted `createPermissionMiddleware` helper to eliminate duplicated auth/workspaceId boilerplate across `requirePermission`, `requireAnyPermission`, `requireAllPermissions`.
    - Refactored `routes/message.ts` — extracted `verifyMessageAccess` helper to eliminate duplicated message verification + channel access check across pin, unpin, and reactions routes.
    - TypeScript `tsc --noEmit` passes clean. All 613 tests pass across 48 test files.

### Added
- **Multi-tenancy Architecture**:
    - Implemented strict data isolation per workspace using `workspaceId` schema updates.
    - Added `Workspace` model relations to `Messages`, `Channels`, `Reactions`, `Attachments` and `Conversations`.
    - Updated Prisma schema and regenerated client.
    - Implemented `X-Workspace-ID` header enforcement in backend authentication middleware.
    - Added tenant-based rate limiting favoring workspace context over IP.
    - Updated API Keys to be workspace-scoped.

- **Real-time Messaging**:
    - Integrated Socket.io for real-time bi-directional communication.
    - Implemented message delivery, typing indicators, and user presence.
    - Added support for 1:1 and Group Direct Messages.
    - Updated `scheduled.ts`, `dm.ts`, `message.ts` and `upload.ts` to support multi-tenancy context.

- **Core Infrastructure**:
    - Set up detailed `app_spec.txt` defining the project architecture.
    - Implemented `AuthContext` helper in frontend `api.ts` to automatically inject workspace context into requests.
    - Restored correct login background asset.

### Fixed
- Fixed `POST /api/messages` 400 Bad Request error by populating `workspaceId` from channel context.
- Fixed Direct Message creation crashing due to missing `workspaceId`.
- Fixed File Uploads failing due to missing `workspaceId` check.

### Changed
- Refactored `app_spec.txt` from a generic "Claude Clone" template to a specific "PulseWeave" SaaS specification.

## [Unreleased] - 2025-12-16
### Added
- **UX/UI Overhaul**: Introduced 'Obsidian' design system with deep blue-black theme and vibrant electric indigo highlights.
- **Micro-interactions**: Added spring animations to Command Palette and Message list using framer-motion.
- **Glassmorphism**: Enhanced UI depth with refined glass panels and glowing borders.

### Changed
- Refactored global color palette variables in globals.css.
- Updated CommandPalette and ChatArea components to support new motion engine.
- Fixed build errors in ChatArea and CommandPalette by resolving missing dependencies and type mismatches.
- Fixed 'Token expired' runtime handling by auto-redirecting to login when the session becomes invalid.
