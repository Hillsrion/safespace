# Product Requirements Document (PRD)

## Project: SafeSpace - Confidential Community Platform for Sharing Information on Dangerous Photographers

---

### TL;DR

SafeSpace is a secure, invite-only platform for aspiring and professional models (primarily women) and people in the photography world to share confidential intel about reported entities (photographers). Features robust user roles, anonymous posting, evidence uploads, post editing, super admin controls, and expiring invites to ensure privacy, trust, and community protection.

### Executive Summary

SafeSpace is a secure, invite-only platform designed to protect models, photographers, and agencies by facilitating the confidential sharing of information about dangerous or unethical behavior in the industry. The platform prioritizes user privacy, data security, content reliability, and user control over their contributions, while maintaining a supportive community environment.

### Project Goals

**Overall Mission:** Foster a safer environment in the photography industry by facilitating discreet, credible sharing of information about reported entities.

**Business Goals:**

1.  Build trust within tight-knit professional communities, with clear privacy boundaries and absolute invite-only participation.
2.  Prevent incidents of harassment or abuse by enabling proactive research and alerts.
3.  Operate strictly as a public good, without monetization, ads, or law enforcement data sharing.

**User Goals:**

1.  Empower models and industry insiders to protect themselves by verifying the reputation of photographers.
2.  Share warnings and experiences with evidence, controlling privacy, post visibility, and the ability to edit their contributions.
3.  Rely on tight access controls and anonymity to participate without fear of exposure or reprisal.
4.  Retain agency over membership—invitation required, with active, human moderation.
5.  Create a safe space for industry professionals to share experiences.
6.  Protect whistleblowers through robust anonymity options.
7.  Establish reliable verification processes for shared information.
8.  Build trust through transparent moderation and governance.
9.  Ensure platform security and data protection at all levels.

**Non-Goals:**

- Not for public shaming, defamation, or legal proceedings.
- No open registration or social networking features.
- No advertisements, commercial offers, or monetization streams.

---

### Core Features

#### User Roles & Authentication

- **Authentication System**

  - Secure sign-up/login via Remix Auth + Prisma
  - Session timeout and secure cookie management
  - Password strength requirements
  - Two-factor authentication (future consideration, not in initial release)
  - Dedicated login URL for Super Admins (e.g., `/superadmin/login`)
  - Space-specific login URLs for other users (e.g., `/[spaceId]/login`)

- **Role Management & Permissions**

  - Hierarchical access based on the following roles:

  | **Role**    | **Abilities**                                                                                                                                                 |
  | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Super Admin | CRUD spaces; all admin powers in any space; space switching; dedicated login URL; view global analytics & logs                                                |
  | Admin       | Invite/kick users; manage reported entities list; moderate posts (including editing/deleting); assign roles; user/reported entity dashboard in their space(s) |
  | Moderator   | Hide/unhide/delete posts; edit posts; flag content; all Editor rights                                                                                         |
  | Editor      | Create posts; edit own posts; attach media; mark anonymous; set admin-only visibility option for posts                                                        |
  | Read-only   | Search; view posts; flag content (no posting or moderation)                                                                                                   |

  - Role-based permission system with granular controls
  - Space-specific role assignments

- **Registration & Onboarding**
  - Strictly invite-only registration system.
  - Email-based invitation flow with space-specific onboarding.
  - Invitations expire after 24 hours if not used.
  - Required code of conduct acceptance.
  - Clear user invitation acceptance screen with space information.

#### Communities (Spaces)

- **Space Structure**

  - Simple community spaces for sharing information.
  - Each space has its own set of members and posts.
  - Users can belong to multiple spaces.
  - Space selector available throughout the application.
  - Last visited space persists as default entry point.
  - Super Admins can create, read, update, and delete spaces globally.

- **Membership Management**
  - Space-specific user management by Admins.
  - Ability to leave spaces with data deletion option.
  - Structured invitation workflows (Admin invites users with specific roles, invites expire in 24h).

#### Content Sharing

- **Reports & Documentation (Posts)**

  - Posts must target a specific entity (name + one or more Instagram identifiers).
  - If a targeted entity is not in the "reported entities" database, they are auto-added.
  - Structured reporting templates with required/optional fields (Description required).
  - Original authors (Editors+) can edit their own posts. Moderators and Admins can edit any post within their scope.
  - Instagram handle verification system (support for multiple handles per entity).
  - Support for evidence classification and organization.
  - Option for anonymous posting.
  - Option for "admin-only" post visibility for sensitive cases.

- **Media Management**

  - Secure upload for photos/videos/audio as supporting evidence.
  - Automatic metadata stripping from uploaded content.
  - Content blurring by default with explicit user interaction to view.
  - Watermarking options for shared media.
  - Media never exposed to non-members.

- **Search & Discovery**
  - Comprehensive search in floating modal for posts and reported entities.
  - Search bar always present, supports real-time querying by name and IG handle. Accessible via click or `Cmd/Ctrl+K`.
  - Autocomplete suggestions during search.
  - Saved searches and alerts for specific handles.
  - Content filtering options by severity, verification status.
  - Safety warnings for particularly sensitive content.

#### Moderation Systems

- **Content Moderation**

  - Three-tiered review process for sensitive allegations.
  - Moderators/Admins can review, hide, unhide, edit, or delete posts.
  - Flagged content queue for review.
  - Clear criteria for content removal or flagging.
  - Appeals process for contested moderation decisions.
  - Automated detection of potentially problematic content (future consideration).

- **User Management (by Admins/Super Admins)**

  - Progressive discipline system.
  - Detailed user history accessible to moderators/admins.
  - Communication templates for common moderation actions.
  - Admins can invite/kick users and manage roles within their space.

- **Administration Tools**
  - **Admin Dashboard (Space-Specific):**
    - User management: list users, add by invite, assign roles, remove.
    - Reported entity management: CRUD on reported entities list.
    - Invite users (role specified, invite expires in 24h).
  - **Super Admin Dashboard (Global):**
    - Space management: create, edit, delete any space.
    - Access analytics and logs for all spaces.
    - User and reported entity management across every space.
    - Override controls.
  - Comprehensive admin dashboard with activity metrics.
  - System-wide announcements and notifications.
  - Detailed audit logs for all administrative actions.

#### Communication Tools

- **Notifications**
  - Basic email notifications via Resend for invitations only.
  - Future enhancement: In-app notification center.
  - Future enhancement: Expanded email notification options.

#### Security & Privacy Features

- **Data Protection**

  - Comprehensive data deletion workflows for account termination.
  - Anonymity toggles for all contributions.
  - Full user control over account data.
  - Data minimization: collect only necessary PII.
  - All personal data encrypted at rest and in transit where applicable.
  - Media files rigorously access-controlled; deleted immediately upon content removal.

- **Platform Security**

  - Basic authentication security (as per Remix Auth + Prisma).
  - Password protection and secure sessions.
  - Future enhancement: Rate limiting on all endpoints.

- **Legal Protections**
  - Basic content policies.
  - Code of Conduct.
  - Future enhancement: Comprehensive terms of service.
  - Compliance with GDPR/common data protection standards.

---

### Technical Architecture

#### Core Infrastructure

| Component      | Technology                                | Notes                                                                                                                    |
| -------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Framework      | React Router 7                            | For server and client-side rendering                                                                                     |
| Authentication | Remix Auth + Prisma                       | Session management (2FA planned for future)                                                                              |
| Database       | PostgreSQL + Prisma ORM                   | With row-level security policies. Tables: users, posts, reported_entities (handles), spaces, invites, media, audit_logs. |
| File Storage   | Cloudflare R2                             | With signed URLs and content verification (managed service, not self-hosted initially)                                   |
| Email          | Resend                                    | For invitations, templating, scheduled delivery.                                                                         |
| UI             | Tailwind CSS 4.1 + ShadCN UI              | With accessibility compliance and responsive design. Minimalist, privacy-first design language.                          |
| Hosting        | Netlify (demo) + Coolify VPS (production) | With auto-scaling configuration.                                                                                         |
| Monitoring     | Sentry + Custom Audit Logs                | With privacy-focused event filtering.                                                                                    |
| Search         | PostgreSQL full-text search               | With future migration path to Meilisearch. Low-latency search, denormalized indices.                                     |

#### System Integration Points

- Authentication service ↔ Database
- Media processing pipeline ↔ Storage service (secure, access-controlled)
- Email delivery system ↔ User management (for invites)
- Search indexing ↔ Content management
- Moderation tools ↔ Content/User systems
- Logging and analytics hooks for adoption and user flows.

#### API Access & Security

- The API is designed for first-party client consumption by the SafeSpace web application.
- Access is protected through:
  - **Authentication:** All private routes require valid session tokens (cookies).
  - **Authorization:** Role-based permissions are enforced at the API level for all actions.
  - **CORS (Cross-Origin Resource Sharing):** Configured to primarily allow requests from the application's own domain.
  - **CSRF (Cross-Site Request Forgery) Protection:** Implemented for all state-changing requests (e.g., form submissions), typically handled by RR7.
- These measures ensure that the API is not an open public interface and is secured against common web vulnerabilities and unauthorized external application access.

---

### API Routes Plan

Base URL: `/api`

#### Authentication (`/auth`)

- **`POST /auth/register`**
  - Description: Register a new user via an invitation.
  - Required Role(s): Public (requires valid invite token).
  - Request Body: `email`, `password`, `name`, `inviteToken`.
  - Response: User object (excluding password), session token.
- **`POST /auth/login`**
  - Description: Log in an existing user.
  - Required Role(s): Public.
  - Request Body: `email`, `password`.
  - Response: User object (excluding password), session token.
- **`POST /auth/superadmin/login`**
  - Description: Log in a Super Admin.
  - Required Role(s): Public (Super Admin credentials).
  - Request Body: `username`, `password`.
  - Response: Super Admin user object, session token.
- **`POST /auth/logout`**
  - Description: Log out the current user.
  - Required Role(s): Authenticated (any role).
  - Response: Success message.
- **`GET /auth/me`**
  - Description: Get current authenticated user's details.
  - Required Role(s): Authenticated (any role).
  - Response: User object.

#### Users (`/users`)

- **`GET /users/current`** (alias for `/auth/me` essentially, for preferences)
  - Description: Get current user's profile for management.
  - Required Role(s): Authenticated.
  - Response: User profile details.
- **`PUT /users/current`**
  - Description: Update current user's profile (name, password).
  - Required Role(s): Authenticated.
  - Request Body: `name?`, `currentPassword?`, `newPassword?`.
  - Response: Updated user profile.
- **`DELETE /users/current`**
  - Description: Delete current user's account.
  - Required Role(s): Authenticated.
  - Request Body: `password` (for confirmation).
  - Response: Success message.

#### Spaces (`/spaces`)

- **`GET /spaces`**
  - Description: List spaces the current user is a member of.
  - Required Role(s): Authenticated.
  - Response: Array of Space objects.
- **`GET /spaces/{spaceId}`**
  - Description: Get details of a specific space (if member).
  - Required Role(s): Authenticated (member of space).
  - Response: Space object.
- **`POST /spaces/{spaceId}/leave`**
  - Description: Current user leaves a space.
  - Required Role(s): Authenticated (member of space).
  - Request Body: `deleteData?` (boolean).
  - Response: Success message.

#### Posts / Reports (`/spaces/{spaceId}/posts`)

- **`GET /spaces/{spaceId}/posts`**
  - Description: List posts within a specific space.
  - Required Role(s): Authenticated (member of space, specific visibility based on role).
  - Query Params: `page?`, `limit?`, `sortBy?`, `filterBySeverity?`, `filterByVerification?`.
  - Response: Paginated list of Post objects.
- **`POST /spaces/{spaceId}/posts`**
  - Description: Create a new post in a space.
  - Required Role(s): Editor, Moderator, Admin.
  - Request Body: `targetEntityName`, `targetEntityHandles[]`, `description`, `mediaIds[]?`, `isAnonymous`, `isAdminOnly`.
  - Response: Created Post object.
- **`GET /spaces/{spaceId}/posts/{postId}`**
  - Description: Get details of a specific post.
  - Required Role(s): Authenticated (member of space, specific visibility based on role).
  - Response: Post object with associated media and target entity.
- **`PUT /spaces/{spaceId}/posts/{postId}`**
  - Description: Edit an existing post.
  - Required Role(s): Original Author (if they have Editor+ rights), Moderator, Admin.
  - Request Body: Fields to update (`targetEntityName?`, `targetEntityHandles[]?`, `description?`, `mediaIds[]?`, `isAnonymous?`, `isAdminOnly?`).
  - Response: Updated Post object.
- **`DELETE /spaces/{spaceId}/posts/{postId}`**
  - Description: Delete a post.
  - Required Role(s): Moderator, Admin.
  - Response: Success message.
- **`POST /spaces/{spaceId}/posts/{postId}/flag`**
  - Description: Flag a post for review.
  - Required Role(s): Read-only, Editor, Moderator, Admin.
  - Request Body: `reason?`.
  - Response: Success message.

#### Media / Evidence (`/media`)

- **`POST /media/upload`**
  - Description: Upload media file for evidence.
  - Required Role(s): Editor, Moderator, Admin.
  - Request: File data (multipart/form-data).
  - Response: `mediaId`, `url` (temporary signed URL for client use if needed), `metadataStripped` (boolean).
- **`GET /media/{mediaId}`** (Potentially through signed URLs directly from storage)
  - Description: Get a media file (requires appropriate permissions).
  - Required Role(s): Authenticated (member of space where media is referenced, specific visibility rules).
  - Response: Media file.

#### Reported Entities (`/spaces/{spaceId}/reported-entities`)

- **`GET /spaces/{spaceId}/reported-entities`**
  - Description: List all reported entities tracked in the space.
  - Required Role(s): Authenticated (member of space).
  - Response: Array of ReportedEntity objects with their handles.
- **`GET /spaces/{spaceId}/reported-entities/{entityId}`**
  - Description: Get details of a specific reported entity and their related posts.
  - Required Role(s): Authenticated (member of space).
  - Response: ReportedEntity object with associated Posts.

#### Search (`/search`)

- **`GET /search`**
  - Description: Global search for posts and reported entities across spaces user is member of.
  - Required Role(s): Authenticated.
  - Query Params: `query`, `type?` (`posts`|`entities`|`all`), `spaceId?`.
  - Response: Search results object containing arrays of posts and reported entities.

#### Admin Routes (`/admin/spaces/{spaceId}`) - Requires Admin role for the specific space

- **`GET /admin/spaces/{spaceId}/users`**
  - Description: List users in the space.
  - Required Role(s): Admin.
  - Response: Array of User objects with their roles in the space.
- **`POST /admin/spaces/{spaceId}/invites`**
  - Description: Invite a new user to the space.
  - Required Role(s): Admin.
  - Request Body: `email`, `role`.
  - Response: Invite object.
- **`PUT /admin/spaces/{spaceId}/users/{userId}/role`**
  - Description: Change a user's role in the space.
  - Required Role(s): Admin.
  - Request Body: `role`.
  - Response: Updated UserSpaceMembership object.
- **`DELETE /admin/spaces/{spaceId}/users/{userId}`**
  - Description: Remove/kick a user from the space.
  - Required Role(s): Admin.
  - Response: Success message.
- **`GET /admin/spaces/{spaceId}/reported-entities`** (Admin version of list, possibly with more details)
  - Description: List reported entities for management.
  - Required Role(s): Admin.
  - Response: Array of ReportedEntity objects.
- **`POST /admin/spaces/{spaceId}/reported-entities`**
  - Description: Add a new reported entity entry.
  - Required Role(s): Admin.
  - Request Body: `name`, `handles[]`, `initialSeverity?`.
  - Response: Created ReportedEntity object.
- **`PUT /admin/spaces/{spaceId}/reported-entities/{entityId}`**
  - Description: Update a reported entity's details.
  - Required Role(s): Admin.
  - Request Body: Fields to update (name, handles, severity).
  - Response: Updated ReportedEntity object.
- **`GET /admin/spaces/{spaceId}/posts/flagged`**
  - Description: Get list of flagged posts requiring moderation.
  - Required Role(s): Moderator, Admin.
  - Response: Array of flagged Post objects.
- **`PUT /admin/spaces/{spaceId}/posts/{postId}/moderate`**
  - Description: Moderate a post (hide, unhide, resolve flag, edit).
  - Required Role(s): Moderator, Admin.
  - Request Body: `action` (`hide`|`unhide`|`resolve`|`edit`), `reason?`, `updatedPostData?` (if action is `edit`).
  - Response: Updated Post object.

#### Super Admin Routes (`/superadmin`) - Requires Super Admin role

- **`GET /superadmin/spaces`**
  - Description: List all spaces in the system.
  - Required Role(s): Super Admin.
  - Response: Array of Space objects.
- **`POST /superadmin/spaces`**
  - Description: Create a new space.
  - Required Role(s): Super Admin.
  - Request Body: `name`, `description?`.
  - Response: Created Space object.
- **`GET /superadmin/spaces/{spaceId}`**
  - Description: Get details of any space.
  - Required Role(s): Super Admin.
  - Response: Space object.
- **`PUT /superadmin/spaces/{spaceId}`**
  - Description: Update any space's details.
  - Required Role(s): Super Admin.
  - Request Body: Fields to update.
  - Response: Updated Space object.
- **`DELETE /superadmin/spaces/{spaceId}`**
  - Description: Delete a space.
  - Required Role(s): Super Admin.
  - Response: Success message.
- **`GET /superadmin/users`**
  - Description: List all users in the system.
  - Required Role(s): Super Admin.
  - Response: Array of User objects.
- **`GET /superadmin/audit-logs`**
  - Description: View system-wide audit logs.
  - Required Role(s): Super Admin.
  - Query Params: `page?`, `limit?`, `filterByUser?`, `filterByAction?`.
  - Response: Paginated list of AuditLog entries.

---

### Database Models/Architecture Plan

#### Core Tables:

1.  **`User`**

    - `id` (UUID, PK)
    - `email` (VARCHAR, UNIQUE, NOT NULL, Indexed)
    - `passwordHash` (VARCHAR, NOT NULL)
    - `name` (VARCHAR, NOT NULL)
    - `isSuperAdmin` (BOOLEAN, DEFAULT FALSE)
    - `createdAt` (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP)
    - `updatedAt` (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP)
    - **Relationships:**
      - Has many `UserSpaceMembership`
      - Has many `Post` (as author)
      - Has many `Invite` (as inviter, if applicable)
      - Has many `AuditLog` (as actor)
    - **Indexes:** `email`

2.  **`Space`**

    - `id` (UUID, PK)
    - `name` (VARCHAR, NOT NULL, UNIQUE, Indexed)
    - `description` (TEXT)
    - `createdBy` (UUID, FK to `User.id`) - SuperAdmin who created it
    - `createdAt` (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP)
    - `updatedAt` (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP)
    - **Relationships:**
      - Has many `UserSpaceMembership`
      - Has many `Post`
      - Has many `Invite`
    - **Indexes:** `name`

3.  **`UserSpaceMembership`** (Join table for User and Space)

    - `userId` (UUID, FK to `User.id`, PK component)
    - `spaceId` (UUID, FK to `Space.id`, PK component)
    - `role` (VARCHAR, NOT NULL, e.g., 'Admin', 'Moderator', 'Editor', 'Read-only')
    - `joinedAt` (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP)
    - **Primary Key:** (`userId`, `spaceId`)
    - **Relationships:**
      - Belongs to `User`
      - Belongs to `Space`
    - **Indexes:** (`userId`), (`spaceId`)

4.  **`Invite`**

    - `id` (UUID, PK)
    - `email` (VARCHAR, NOT NULL)
    - `token` (VARCHAR, UNIQUE, NOT NULL, Indexed)
    - `spaceId` (UUID, FK to `Space.id`, NOT NULL)
    - `roleToAssign` (VARCHAR, NOT NULL)
    - `invitedByUserId` (UUID, FK to `User.id`, NOT NULL) - The Admin who sent the invite
    - `expiresAt` (TIMESTAMP, NOT NULL)
    - `isUsed` (BOOLEAN, DEFAULT FALSE)
    - `createdAt` (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP)
    - **Relationships:**
      - Belongs to `Space`
      - Belongs to `User` (inviter)
    - **Indexes:** `token`, (`email`, `spaceId`)

5.  **`ReportedEntity`**

    - `id` (UUID, PK)
    - `name` (VARCHAR, NOT NULL, Indexed) - Full name or primary known name
    - `createdAt` (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP)
    - `updatedAt` (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP)
    - `addedByUserId` (UUID, FK to `User.id`)
    - `spaceId` (UUID, FK to `Space.id`) - (For now, assume global, linked by posts in spaces. If scoped per space, this FK is necessary and NOT NULL).
    - **Relationships:**
      - Has many `ReportedEntityHandle`
      - Has many `Post`
    - **Indexes:** `name` (Full-text search candidate)

6.  **`ReportedEntityHandle`**

    - `id` (UUID, PK)
    - `reportedEntityId` (UUID, FK to `ReportedEntity.id`, NOT NULL)
    - `platform` (VARCHAR, e.g., 'Instagram', 'Twitter', 'Other', DEFAULT 'Instagram')
    - `handle` (VARCHAR, NOT NULL, Indexed)
    - `createdAt` (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP)
    - **Relationships:**
      - Belongs to `ReportedEntity`
    - **Indexes:** `handle`, (`reportedEntityId`, `handle`) UNIQUE

7.  **`Post`** (or Report)

    - `id` (UUID, PK)
    - `spaceId` (UUID, FK to `Space.id`, NOT NULL)
    - `authorId` (UUID, FK to `User.id`, NULLABLE if anonymous or system-generated)
    - `reportedEntityId` (UUID, FK to `ReportedEntity.id`, NOT NULL)
    - `description` (TEXT, NOT NULL)
    - `isAnonymous` (BOOLEAN, DEFAULT FALSE)
    - `isAdminOnly` (BOOLEAN, DEFAULT FALSE) - Visible only to Admins/Moderators of the space
    - `status` (VARCHAR, e.g., 'active', 'hidden', 'flagged_for_review', DEFAULT 'active')
    - `severity` (VARCHAR, NULLABLE, e.g., 'low', 'medium', 'high') - Optional
    - `verificationStatus` (VARCHAR, NULLABLE, e.g., 'unverified', 'pending', 'verified') - Optional
    - `createdAt` (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP)
    - `updatedAt` (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP) <!-- Tracks edits -->
    - **Relationships:**
      - Belongs to `Space`
      - Belongs to `User` (author)
      - Belongs to `ReportedEntity`
      - Has many `Media` (through a join table or direct FK on Media if 1-to-many from Post)
      - Has many `PostFlag`
    - **Indexes:** (`spaceId`), (`authorId`), (`reportedEntityId`), `createdAt` (for feed sorting), `updatedAt`

8.  **`Media`** (or Evidence)

    - `id` (UUID, PK)
    - `postId` (UUID, FK to `Post.id`, NOT NULL)
    - `uploaderId` (UUID, FK to `User.id`, NOT NULL)
    - `storageKey` (VARCHAR, NOT NULL, UNIQUE) - Key in R2 storage
    - `fileName` (VARCHAR, NOT NULL)
    - `mimeType` (VARCHAR, NOT NULL)
    - `fileSize` (INTEGER, NOT NULL) - In bytes
    - `metadataStripped` (BOOLEAN, DEFAULT FALSE)
    - `isBlurred` (BOOLEAN, DEFAULT TRUE)
    - `createdAt` (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP)
    - **Relationships:**
      - Belongs to `Post`
      - Belongs to `User` (uploader)
    - **Indexes:** `postId`

9.  **`PostFlag`**

    - `id` (UUID, PK)
    - `postId` (UUID, FK to `Post.id`, NOT NULL)
    - `flaggerUserId` (UUID, FK to `User.id`, NOT NULL)
    - `reason` (TEXT, NULLABLE)
    - `status` (VARCHAR, e.g., 'pending_review', 'resolved', 'dismissed', DEFAULT 'pending_review')
    - `resolvedByUserId` (UUID, FK to `User.id`, NULLABLE)
    - `resolvedAt` (TIMESTAMP, NULLABLE)
    - `createdAt` (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP)
    - **Relationships:**
      - Belongs to `Post`
      - Belongs to `User` (flagger)
      - Belongs to `User` (resolver)
    - **Indexes:** `postId`, `status`

10. **`AuditLog`**
    - `id` (UUID, PK)
    - `actorUserId` (UUID, FK to `User.id`, NULLABLE for system actions)
    - `action` (VARCHAR, NOT NULL, e.g., 'USER_LOGIN', 'POST_CREATE', 'POST_EDIT', 'USER_REMOVED_FROM_SPACE')
    - `targetEntityType` (VARCHAR, NULLABLE, e.g., 'Post', 'User', 'Space', 'ReportedEntity')
    - `targetEntityId` (UUID, NULLABLE)
    - `spaceId` (UUID, FK to `Space.id`, NULLABLE for global actions)
    - `details` (JSONB, NULLABLE) - Additional context/data for the action (e.g., changed fields for POST_EDIT)
    - `ipAddress` (VARCHAR, NULLABLE)
    - `createdAt` (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP)
    - **Relationships:**
      - Belongs to `User` (actor)
      - Belongs to `Space` (if action is space-specific)
    - **Indexes:** `createdAt`, `actorUserId`, `action`, `targetEntityId`

#### Considerations:

- **Row-Level Security (RLS):** PostgreSQL RLS will be crucial for enforcing that users can only access data within spaces they are members of and according to their role.
- **Full-Text Search:** For fields like `ReportedEntity.name`, `ReportedEntityHandle.handle`, and `Post.description`, PostgreSQL's built-in full-text search capabilities will be used initially. Indexes like GIN or GIST will be necessary.
- **Anonymity:** If `Post.authorId` is NULL for anonymous posts, ensure RLS policies and application logic respect this.
- **Data Deletion:** Cascade deletes or application-level logic must handle data removal when users leave spaces or delete accounts, respecting data retention policies.
- **UUIDs as Primary Keys:** Good for distributed systems and preventing enumeration attacks, but can have slight performance implications if not indexed properly.
- **Timestamps:** `createdAt` and `updatedAt` on most tables for auditing and tracking.

---

### Implementation Roadmap

#### Phase 1: Foundation (Weeks 1-6)

- Core authentication system (without 2FA), roles (Super Admin, Admin, Editor, Read-only).
- Basic space/community structure (Super Admin can create spaces).
- Simple text-based reporting (Post creation targeting entities, IG handle support, anonymity option).
- Essential moderation tools (Admin/Moderator can hide/delete posts).
- Email notifications for invites (with 24h expiry).
- Basic security measures.

#### Phase 2: Enhanced Security & Features (Weeks 7-12)

- Media upload and processing (images, audio, video) with secure storage (Cloudflare R2).
- Post editing functionality (original author, moderators, admins).
- Advanced search capabilities (real-time, by name/handle, autocomplete, Cmd/Ctrl+K).
- Expanded moderation toolset (Admin dashboard for user/reported entity management).
- Initial audit logging (covering creations, edits, deletions).
- End-to-end encryption implementation (research and begin implementation if feasible).

#### Phase 3: Community & Scale (Weeks 13-20)

- Enhanced user reputation systems (if deemed necessary).
- Advanced anonymity features (review and enhance).
- Performance optimizations for search and platform.
- Full audit capability for all critical actions.
- System-wide announcements.
- Mobile optimization and responsive design polish.
- Moderator role fully implemented.

---

### User Flows & Screens

#### Invitation Flow

1.  **Invitation Email**
    - User receives email from Admin with "Join SafeSpace" button/link.
    - Email clearly states which space they're being invited to, by whom, and the assigned role.
    - Email includes brief explanation of the platform purpose.
    - Link is unique and expires in 24 hours.
2.  **Registration Screen**
    - If invite is expired: Clear error message with support contact/request new invite.
    - If invite is valid: Landing page shows "You've been invited to join {space name} as {Role}".
    - Form collects: name, email, password, profile information (minimal).
    - Confirmation that signup is accepting the invitation and Code of Conduct.
3.  **Space Welcome**
    - After registration, user is automatically added to the invited space with the assigned role.
    - Welcome screen introduces the space. User is logged in.

#### Login Flow

1.  **Super Admin Login:** Uses a dedicated URL (e.g., `/superadmin/login`) to access the master dashboard.
2.  **Standard User Login:** All other users log in via a space-aware URL (e.g., `/[spaceId]/login`) or a general login that defaults to the last visited space.

#### Add a Report Flow (Editor Role & Above)

1.  **Trigger:** User (Editor role or higher) clicks "Create New Post" / "Add Report" button.
2.  **Form Display:** The "Report (Post) Form" screen is displayed (empty for creation).
3.  **Fill Information:**
    - User enters the target entity's name and Instagram handle(s). System checks if the entity exists in the "Reported Entities" list; if not, prepares to add them.
    - User fills in the description of the incident/behavior (required).
    - User selects/uploads media evidence (images, audio, video).
    - User chooses anonymity option (toggle).
    - User chooses admin-only visibility option (toggle, if applicable for their role and sensitivity).
4.  **Validation & Preview:** User can preview the report. System performs client-side and server-side validation on required fields and media uploads.
5.  **Submission:** User clicks "Submit Report."
6.  **Confirmation:**
    - System confirms successful submission with a success message.
    - The new report appears in the Space Timeline/Feed (subject to visibility rules and moderation queue if applicable).
    - If the target entity was new, they are added to the "Reported Entities" list.
    - Notification (optional, e.g., to moderators if review is needed for certain flags or content).

#### Edit Post Flow (Original Author with Editor+ Rights, Moderator, Admin)

1.  **Trigger:** Eligible user clicks an "Edit" button associated with a post (e.g., on a `Report Card` or a full post detail view).
2.  **Form Display:** The "Report (Post) Form" screen is displayed, pre-filled with the existing data of the post to be edited. The title might indicate "Edit Report".
3.  **Modify Information:**
    - User modifies the target entity's name/handles, description, media evidence, anonymity, or admin-only visibility settings as needed and permitted.
4.  **Validation & Preview:** User can preview the changes. System performs validation.
5.  **Submission:** User clicks "Save Changes" / "Update Report."
6.  **Confirmation:**
    - System confirms successful update with a success message.
    - The post is updated in the database (including `updatedAt` timestamp).
    - The Space Timeline/Feed and any detail views reflect the updated post.
    - An audit log entry is created for the edit.

#### Invite Someone Flow (Admin Role)

1.  **Trigger:** Admin navigates to the "User Management Screen" within their space.
2.  **Initiate Invite:** Admin clicks the "Invite New User" button.
3.  **Invite Form:** A modal or section appears prompting for:
    - Invitee's Email Address.
    - Role to assign from a dropdown (e.g., Editor, Read-only).
    - Optional: A brief personal message to include in the invitation email.
4.  **Send Invitation:** Admin clicks "Send Invitation."
5.  **System Action:**
    - System generates a unique, time-limited (24-hour) invitation link.
    - System sends an invitation email (via Resend) to the invitee's email address. The email contains the link, inviting Admin's name (or a generic "Space Admin" message), space name, and the assigned role.
    - The pending invitation is logged and may be visible in an "Invited Users" or "Pending Invites" tab on the User Management screen, showing status (sent, expired, accepted).
6.  **Admin Confirmation:** UI confirms the invitation has been sent successfully.

#### Remove Someone from Space Flow (Admin Role)

1.  **Trigger:** Admin navigates to the "User Management Screen" within their space.
2.  **Locate User:** Admin finds the user in the user list (can use search/filter).
3.  **Initiate Removal:** Admin clicks a "Remove User" or "Kick User" action.
4.  **Confirmation Prompt:** A confirmation dialog appears: "Are you sure you want to remove {Username} from {Space Name}? Their contributions within this space will be [handled according to policy - e.g., anonymized/deleted]. This action cannot be undone."
5.  **Confirm Removal:** Admin confirms the action.
6.  **System Action:**
    - The user is immediately removed from the space's member list.
    - The user's session for that space is invalidated; they lose access to the space.
    - The user's content within that space is handled according to the defined data policy.
    - An audit log entry is created.
7.  **Admin Confirmation:** UI confirms the user has been removed. The user list updates.
8.  **User Notification (Optional, Policy Dependent):** The removed user might receive an email.

#### Search Flow (via Search Bar - Click or Cmd/Ctrl+K)

1.  **Trigger:** Click search icon/bar or use `Cmd/Ctrl+K`.
2.  **Search Interface Activation:** Floating modal appears, input field auto-focused.
3.  **Enter Query:** User types search query.
4.  **Real-time Results:** Results display dynamically, categorized ("Posts," "Reported Entities"). Autocomplete suggestions may appear.
5.  **Filter/Navigate Results (Optional):** Switch tabs, apply filters, use keyboard/mouse to navigate.
6.  **View Detail:** User selects a result.
7.  **Action:** Modal closes, user navigates to the detail view of the selected item.
8.  **Dismiss Search:** Click outside, `Esc`, or close button.

#### Account Management Flow

1.  **Account Preferences Screen**
    - Personal information management.
    - Privacy controls.
    - Space membership overview.
2.  **Space Leaving Process**
    - Option to leave space with data deletion choice.
    - Confirmation step.
3.  **Account Deletion Process**
    - "Delete Account" section with clear consequences.
    - Two-step confirmation.
4.  **Post-Deletion Confirmation**
    - Email confirmation.

#### Main Application Screens

1.  **Space Timeline/Feed (Home)**

    - Default landing page: last visited space, feed of recent reports (cards).
    - Each card: target entity info, summary, evidence/anonymity indicators, edit button for eligible users.
    - Space selector, responsive layout, sorting/filtering.

2.  **User Management Screen (Admin/Super Admin Only)**

    - Table of users: Username, Email, Role, Join Date, Last Active.
    - CTA to invite new users.
    - Actions: edit roles, remove users. Search, filter, pagination.

3.  **Reported Entities List (Admin/Super Admin View & Searchable by All)**

    - Table of reported entities: Handle/Name, Date Added, Severity, # Reports.
    - CTA for Admins/Super Admins to add/edit entries.
    - Actions: view details. Search, filter, pagination.

4.  **Report (Post) Form (For Creation & Editing by Editor Role & Above)**

    - Used for both creating new reports and editing existing ones.
    - If editing, fields are pre-filled with the existing post's data.
    - Structured form: target entity (name, multiple IG handles), description, evidence upload, privacy toggles (anonymous, admin-only).
    - Preview, validation, submit/update button.

5.  **Reported Entity Detail View**

    - Profile of the entity: verified data, timeline of related reports.
    - Evidence gallery (privacy controls), status/severity indicators, related handles.
    - Admin actions section.

6.  **Search Interface (Floating Modal)**
    - Triggered by search icon or `Cmd/Ctrl+K`.
    - Tabs: "Posts," "Reported Entities." Real-time results, filters, quick actions, keyboard navigation.

---

### UI Components

#### Navigation

- **Header**

  - Space selector dropdown (ShadcnUI Select)
  - User menu (ShadcnUI DropdownMenu)
  - Search trigger button/icon (leading to Search Modal)
  - Notifications indicator (future)

- **Sidebar (Optional, or for Admin areas)**
  - Navigation links to main sections
  - Collapsible on mobile (ShadcnUI Sheet)
  - Space-specific shortcuts

#### Content Components

- **Report Card**

  - Reported entity handle/name
  - Severity indicator (ShadcnUI Badge) - if applicable
  - Preview text with truncation
  - Timestamp and author info (with anonymity respected)
  - Quick action buttons (e.g., View Details, Flag, **Edit** for eligible users)
  - Evidence indicator
  - Responsive layout

- **User Table**

  - Sortable columns (ShadcnUI Table)
  - Pagination controls (ShadcnUI Pagination)
  - Role badges (ShadcnUI Badge)
  - Action menu (ShadcnUI DropdownMenu) for edit role, remove
  - Responsive

- **Reported Entities Table**

  - Similar structure to User Table
  - Severity indicators, last report date, total reports count, verification status.

- **Report (Post) Form**

  - Field groups (ShadcnUI Form)
  - Target entity input (Name + multi-IG handle input)
  - Media upload area (ShadcnUI FileInput or custom drag-and-drop)
  - Toggle switches for options (anonymous, admin-only) (ShadcnUI Switch)
  - Submit/Update button with loading state. Used for both creating and editing posts (pre-filled when editing).

- **Search Modal**
  - Floating dialog (ShadcnUI Dialog)
  - Search input with autocomplete (ShadcnUI Input)
  - Tab navigation between result types (Posts, Reported Entities) (ShadcnUI Tabs)
  - Result cards with preview information
  - Keyboard shortcuts

---

### Narrative

Samira, a rising model, is concerned when receiving a message from a new photographer. Her friend, an established model and Admin of a SafeSpace community, invites her to their private space as an Editor. She signs up in one click using a link—available for only 24 hours—feeling reassured by the privacy, invite-only nature, and the Code of Conduct she accepts.

Upon logging in, Samira’s landing page reveals recent posts made by trusted peers in her space. She’s greeted with a clear search bar (`Cmd+K` also works) and quickly searches the photographer’s name and Instagram handle (who is a type of "reported entity" the system tracks). Within seconds, she discovers a detailed report—complete with screenshots and text, corroborated by other posts—describing concerning behavior by the same photographer. Grateful, she decides to avoid the session and thanks her friend for the invitation. Later, after an unrelated incident, she uses the "Add Report" feature to share her own experience. Realizing she made a typo, she easily finds her post and uses the "Edit" button to correct it.

Meanwhile, the space’s Admin monitors who is joining (using the "Invite User" flow) and what is posted, with the power to moderate content (including editing posts if necessary) or users (including "Remove User from Space" if necessary). The Super Admin, overseeing all SafeSpace communities, quietly ensures that every space remains safe, private, and on-mission—ready to step in at the earliest sign of abuse or misuse, manage spaces, or handle system-wide issues. The result: private, empowered, and safer communities, where transparency and anonymity (when chosen) walk hand-in-hand.

---

### Success Metrics

- **Security**:
  - Zero data breaches.
  - 100% compliance with encryption requirements for sensitive data.
  - Platform uptime (aim: 99.9%).
- **Trust & Safety**:
  - > 80% user satisfaction with platform safety measures (survey-based).
  - Rate of posts flagged and reviewed effectively.
- **Growth & Adoption**:
  - Invitation acceptance rate >75%.
  - Space creation and growth rate (via super admin dashboard).
- **Engagement**:
  - Weekly active users (WAU) >60% of total user base per space.
  - Number of unique searches performed and posts read per user.
  - Frequency of new, credible posts (with evidence).
  - Frequency of post edits (indicating users are maintaining accuracy).
- **Impact**:
  - Documented cases of prevented harm based on shared information (qualitative feedback).
- **Usability**:
  - Task completion rate >90% for core user flows (e.g., creating/editing a post, searching, inviting user).
  - Median page load time (<2.5 seconds).
  - Media upload success rate (>98%).
  - Auth failure rate (<1% of login attempts).

**Tracking Plan:**

- Track "invite accepted" vs "invite sent" events (conversion rate, expiry rates).
- Every post creation and edit (flagging if evidence uploaded, anonymity status).
- All moderation actions (hide, unhide, delete, edit by mod/admin, flagged-for-review resolutions).
- Search queries and search-result clickthroughs.
- Space/user CRUD operations (adds, edits, removals by Admins/Super Admins).
- Media upload/download success/errors.
- User role changes.

---

### Governance & Operations

- Monthly security audits and penetration testing (post-MVP).
- Quarterly review of moderation policies and effectiveness.
- Transparent reporting to community on platform status (anonymized, aggregated).
- Regular training and guidelines for moderators and administrators.
- Clear escalation paths for security, safety concerns, and policy violations.

---

### Technical Considerations (Additional)

- **Data Storage & Privacy:**
  - All personal data minimized.
  - Media files rigorously access-controlled; deleted immediately upon content removal or account deletion as per policy.
  - Robust audit trail for data access and administrative actions (including post edits).
- **Scalability & Performance:**
  - Spaces designed for ~500 users each initially; architecture should allow for scaling.
  - Load-tested media upload/download to prevent bottlenecks.
- **Potential Challenges:**
  - Preventing abuse of the platform (e.g., false reporting, malicious actors). Mitigation: Rigorous invite system, human moderation, evidence requirements, audit logs.
  - Mitigating false reporting: Manual evidence review, community flagging, multi-tiered review for severe allegations.
  - Handling account takeover or malicious admin: Super Admin oversight, robust audit logging, potential for multi-sig operations for critical Super Admin actions in the future.
  - Edge cases: Large/broken media files, vanishing Instagram handles (need ability to update/add aliases), accidental user removal (soft delete/recovery options for Admins).
  - Maintaining anonymity: Ensuring no technical leakage of identifying information when anonymity is chosen, even through edit histories if they become more detailed.

---

### Future Considerations

- API for trusted partner integrations (e.g., agency verification systems).
- Enhanced analytics for pattern detection (e.g., multiple low-severity reports on one reported entity).
- Multi-language support across the platform.
- Advanced threat modeling and proactive protection mechanisms.
- Expanded community tools for peer support and discussion (within privacy constraints).
- Content contest/dispute mechanics with a structured resolution process.
- Formalized legal review of Terms of Service and policies.
- Implementation of Two-Factor Authentication (2FA).
- Rate limiting on all critical endpoints.
- **Version history for edited reports/posts.**
- Automated detection of potentially problematic content using AI/ML.
- In-app notification center and expanded email notification options.
- Saved searches and alerts for specific handles.
- Advanced Instagram handle verification (e.g., API lookups).
