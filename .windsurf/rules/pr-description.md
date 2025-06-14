---
trigger: model_decision
description: When opening a Pull/Merge Request, use this as the template to stay consistant
---

# Standard PR Sections

When writing a PR description, follow this consistent structure and choose relevant sections from the list below. Use only the sections that apply, but **keep their names consistent** across PRs.

---

# Overview

A 1–3 sentence summary of **why** this PR exists. Avoid implementation details here.

---

## Changes

Group changes under relevant headings. Use only the ones that apply to your PR.

### 🔧 Backend

Use when the PR includes backend logic, data processing, or server-side functionality.

### 🗃️ Database Layer

Use when modifying Prisma queries, schema, or repository logic.

### 🔌 API

Use when creating or updating API endpoints, controllers, or request/response shapes.

### 📡 API Client

Use when updating frontend-side API logic — fetch calls, hooks, service layers, etc.

### 🧠 State Management

Use when modifying Zustand, Redux, or any other client-side state logic.

### 🧱 UI Components

Use when the PR involves component changes, layout tweaks, animations, or general UI work.

### 🎨 Styles / Theming

Use when the PR touches global styles, Tailwind config, themes, or design tokens.

### 🧪 Tests

Use when writing or updating unit tests, integration tests, or test utilities.

### 🧰 DevOps / Tooling

Use for changes in CI/CD, build scripts, linters, or other dev tooling.

---

## Dependencies

List any added/updated/removed packages.

Format:

- ➕ `package-name` (added)
- 🔄 `package-name` (updated)
- ➖ `package-name` (removed)

---

## Optional Sections

Use these if relevant:

### 🧭 Migration Guide

Brief instructions for migrating (if schema or API changes require it).

### 📎 Related Issues / Tickets

Link to Jira, Linear, GitHub Issues, etc.

---

## ✅ Example Structure

```md
# Overview

Adds infinite scrolling to the post feed to improve UX and reduce load time on large datasets.

## Changes

### Database Layer

- Added `cursor` support in `getAllPosts`, `getUserPosts`
- Updated return type with `nextCursor`, `hasNextPage`

### API

- New endpoint: `GET /api/posts/feed`

### State Management

- Added pagination state in `usePostStore`
- New `addPosts` and `isLoadingMore` flags

### UI Components

- Added scroll-based loading via `react-intersection-observer`
- “End of list” message and loading skeletons

## Dependencies

- ➕ `react-intersection-observer`
- 🔄 Prisma client types
```
