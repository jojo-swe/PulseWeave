# Changelog

All notable changes to the "PulseWeave" project will be documented in this file.

## [Unreleased]

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
