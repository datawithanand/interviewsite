# API Reference

Base URL: `/api`. All authenticated endpoints expect `Authorization: Bearer <jwt>`.

## Auth (`/api/auth`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | none | `{username, password, email?, securityQuestions: [{question, answer}] (3-5)}` → `{token, user}`. First user on an empty DB becomes ADMIN. 403 if an admin has disabled registration. |
| POST | `/login` | none | `{username, password}` → `{token, user}`. 423 if locked. Lockout threshold/duration are admin-configurable (see Settings). |
| POST | `/logout` | user | Revokes the current session. |
| GET | `/me` | user | Current user. |
| GET | `/sessions` | user | List this user's active sessions (id, ipAddress, userAgent, lastActivity, `current` flag). |
| DELETE | `/sessions/:id` | user | Revoke one of your own sessions. |
| POST | `/sessions/revoke-all` | user | Sign out every other session, keep the current one. |
| POST | `/forgot-password/start` | none | `{username}` → `{questions: [{id, question}]}` (3 random, never reveals if username exists). |
| POST | `/forgot-password/verify` | none | `{username, answers: [{id, answer}], newPassword}` → resets if ≥2 answers correct. Revokes all sessions on success. |

A JWT is bound to a server-side `Session` row (`sid` claim); revoking the session invalidates the token immediately even though the JWT itself hasn't expired.

## Profile (`/api/profile`) — self-service, any authenticated role

| Method | Path | Description |
|---|---|---|
| GET | `/` | Own profile + questionsCreated count. |
| PATCH | `/` | Update `{email?, bio?, profileAvatarUrl?}`. |
| POST | `/change-password` | `{currentPassword, newPassword}`. |
| PUT | `/security-questions` | Replace security questions `{securityQuestions: [...]}`. |
| POST | `/delete` | `{password}` — self-deactivate. |

## Users (`/api/users`) — admin only

| Method | Path | Description |
|---|---|---|
| GET | `/?role=&q=` | List users. |
| GET | `/:id/questions` | Questions created by a user. |
| PATCH | `/:id/role` | `{role: REGULAR_USER\|WRITER\|ADMIN}`. |
| POST | `/:id/reset-password` | Force-reset `{newPassword}`. |
| PATCH | `/:id/deactivate` | Soft-deactivate. Also revokes all of the user's sessions. |
| PATCH | `/:id/reactivate` | Reactivate. |
| POST | `/:id/force-logout` | Revoke all of a user's active sessions (force logout from every device). |

## Modules (`/api/modules`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | any | List active modules with question counts. |
| GET | `/:id` | any | Module detail + stats. |
| POST | `/` | writer/admin | `{name, description?}`. |
| PATCH | `/:id` | writer/admin | `{name?, description?}`. |
| DELETE | `/:id` | writer/admin | Soft-delete (archives). |

## Questions (`/api/questions`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/?moduleId=&difficulty=&format=&tag=&q=&sort=&page=&pageSize=` | user | Search/filter/sort/paginate. |
| GET | `/:id` | user | Detail (increments view count). |
| POST | `/` | writer/admin | Create; auto-assigns next serial number per module unless `serialNumber` given explicitly. |
| PATCH | `/:id` | writer/admin | Update; snapshots previous state to version history. |
| DELETE | `/:id` | writer/admin | Delete. |
| POST | `/:id/duplicate` | writer/admin | Clone with a new serial number. |
| GET | `/:id/versions` | user | Version history. |
| POST | `/:id/versions/:versionId/rollback` | writer/admin | Restore a previous version. |
| POST | `/:id/favorite` / `DELETE /:id/favorite` | user | Toggle favorite. |
| POST | `/bulk` | writer/admin | `{questionIds, action: delete\|setDifficulty\|addTag\|moveModule, ...}`. |

## Import / Export (`/api/import-export`) — writer/admin only

| Method | Path | Description |
|---|---|---|
| GET | `/export?format=json\|csv\|xlsx\|xml\|pdf&moduleIds=id1,id2` | Downloads a file. Omit `moduleIds` for all modules. |
| POST | `/import/preview` | Multipart `files[]` (json/csv/xlsx/xml) → parses + validates, returns `{rows, invalidRows, conflicts, ...}` without writing to the DB. |
| POST | `/import/commit` | `{rows, conflictResolution: skip\|overwrite\|renumber, fileName?, fileFormat?}` → commits. Creates modules by name if they don't exist. |
| GET | `/history` | Recent import/export activity for the current user. |

## Audit Logs (`/api/audit-logs`) — admin only

| Method | Path | Description |
|---|---|---|
| GET | `/?userId=&action=&targetType=&from=&to=&page=&pageSize=` | Filtered log entries. |
| GET | `/export` | CSV download (last 5000 entries). |

## Stats (`/api/stats`) — writer/admin

| Method | Path | Description |
|---|---|---|
| GET | `/` | Users/questions/modules totals, per-module counts, difficulty/format distribution, most-viewed, recently-added, questions-by-creator. |

## Settings (`/api/settings`) — admin only

Singleton platform policy, cached in-process and invalidated on write.

| Method | Path | Description |
|---|---|---|
| GET | `/` | Current settings. |
| PATCH | `/` | Update any subset: `passwordMinLength` (≥6), `passwordRequireLetter`, `passwordRequireNumber`, `maxFailedLoginAttempts` (≥3), `lockoutDurationMinutes`, `sessionTimeoutMinutes`, `registrationEnabled`. Changes to lockout/session-timeout apply to future logins, not sessions already issued. |

## Notifications (`/api/notifications`)

| Method | Path | Description |
|---|---|---|
| GET | `/?unreadOnly=&page=&pageSize=` | List this user's notifications + `unreadCount`. Types: `QUESTION_EDITED`, `QUESTION_DELETED`, `ROLE_CHANGED`, `NEW_COMMENT`. |
| POST | `/:id/read` | Mark one notification read. |
| POST | `/read-all` | Mark all read. |

Triggers: another writer/admin editing or deleting your question, your role being changed, or someone commenting on your question. You're never notified of your own actions.

## Comments (mounted at `/api`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/questions/:questionId/comments` | user | List comments (pinned first, then oldest-first). |
| POST | `/questions/:questionId/comments` | user | `{content}` — any authenticated user can comment. Notifies the question's creator. |
| DELETE | `/comments/:id` | user | Delete your own comment, or any comment if admin. |
| PATCH | `/comments/:id/pin` | admin | `{isPinned}`. |

## Saved Searches (`/api/saved-searches`)

| Method | Path | Description |
|---|---|---|
| GET | `/` | List your saved searches. |
| POST | `/` | `{name, filters}` — `filters` is an arbitrary JSON object (moduleId/difficulty/format/q/sort/favoritesOnly). 409 on duplicate name. |
| DELETE | `/:id` | Delete (owner only). |

## Error format

Non-2xx responses are `{"error": "message"}`. Validation errors are 400 with a semicolon-joined field summary.
