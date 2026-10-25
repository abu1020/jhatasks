# Cadence — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Strict Ownership Isolation**: Every document in `/users/{userId}/tasks/{taskId}` and `/users/{userId}/events/{eventId}` belongs exclusively to `userId`. Only an authenticated user with `request.auth.uid == userId` and `request.auth.token.email_verified == true` may read, list, create, update, or delete documents in their namespace.
2. **Identity Integrity**: `incoming().ownerId` must strictly match `request.auth.uid` and `userId`, and `incoming().id` must match the document path variable (`taskId` or `eventId`). Both `id` and `ownerId` are immutable on update.
3. **Path Variable Hardening**: All document IDs (`userId`, `taskId`, `eventId`) must match `^[a-zA-Z0-9_\-]+$` and be at most 128 characters.
4. **Strict Key & Size Enforcement**: Every string has an explicit `.size() <= MAX` bound, every array has a strict maximum length (`tags.size() <= 20`, `subtasks.size() <= 50`, `attachments.size() <= 20`), and shadow fields are blocked via `hasOnly`.
5. **Temporal Integrity**: `createdAt` must equal `request.time` on creation and remain immutable on update (`incoming().createdAt == existing().createdAt`). `updatedAt` must equal `request.time` on every write.
6. **Secure List Queries**: `allow list` verifies `request.auth.uid == userId` and `resource.data.ownerId == request.auth.uid`.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: `auth = null` attempting to create `/users/u1/tasks/t1`.
2. **Unverified Email Spoof**: `auth = { uid: 'u1', token: { email_verified: false } }` attempting to create `/users/u1/tasks/t1`.
3. **Cross-Tenant Ownership Spoof**: `auth.uid = 'u2'` attempting to write to `/users/u1/tasks/t1` with `ownerId: 'u1'`.
4. **Payload Owner Mismatch**: `auth.uid = 'u1'` writing to `/users/u1/tasks/t1` with `ownerId: 'u2'`.
5. **ID Poisoning Attack**: `taskId` containing spaces/special characters (`"task/../../admin"`) or >128 chars.
6. **Shadow Field Injection (Create)**: Creating a task with an undeclared field `"isAdmin": true`.
7. **Shadow Field Injection (Update)**: Updating a task with an undeclared field `"hacked": 1`.
8. **Value Poisoning (Title Overflow)**: Updating `title` with a 2,000-character string (`maxLength` is 500) or empty string.
9. **Enum Bypass (Invalid Workspace/Status)**: Setting `workspace: "hacker"` or `status: "archived"`.
10. **Unbounded Array Exhaustion**: Passing 100 tags (`tags.size() > 20`).
11. **Immortal Field Mutation**: Attempting to mutate `createdAt` or `ownerId` during `update`.
12. **Client Timestamp Forgery**: Setting `updatedAt` to a past or future timestamp instead of `request.time`.

## 3. Red Team Conflict Report
- **Identity Spoofing**: Blocked (`request.auth.uid == userId && incoming().ownerId == request.auth.uid` + immutability on update).
- **State Shortcutting / Enum Violation**: Blocked (`workspace in ['office', 'personal']` and `status in ['todo', 'in_progress', 'in_review', 'done']`).
- **Resource Poisoning**: Blocked (`isValidId` regex + `.size()` caps on every string and array).
- **Validation Helper Presence**: `isValidTask(incoming())` and `isValidEvent(incoming())` wrap both `create` and `update`.
