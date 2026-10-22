# Database WorkNest

<!-- Initial migration was applied to the configured Neon development database on 2026-10-23. -->

Six models map to users, workspaces, memberships, invitations, tasks and activity_logs.
IDs use PostgreSQL UUIDs. Timestamps use TIMESTAMPTZ. Firebase owns account credentials;
join_password_hash is only the workspace join password, hashed with Argon2.

## Validate and generate locally

```powershell
npm run db:validate
npm run db:generate
npm run build
```

## Apply to the new, empty development database

Set DATABASE_URL in backend/.env to the intended Neon database. Do not commit it.
After reviewing the migration and confirming the target, run from backend:

```powershell
npm run db:deploy
```

Do not paste migration SQL into Neon SQL Editor separately: Prisma must record its
application history. Do not use db push, which does not apply the handwritten checks.
Migration files become immutable after application; add a new migration for changes.

## Database rules and backend responsibilities

- Custom CHECK constraints and the partial unique active-owner index live in migration.sql.
- The Owner index guarantees at most one active Owner, not at least one. Backend must
  serialize workspace creation, transfer, departure and account deletion appropriately.
- Pending invitations are usable only before expires_at. Backend must serialize creation
  per workspace/recipient and check current recipient/member status before accepting.
- Task assignment references the composite membership key. Backend also checks active
  users, left_at and is_banned; existence alone does not grant access.
- Assignment FK uses NO ACTION so workspace CASCADE can remove tasks and memberships in
  the same statement. Deleting a referenced membership alone still fails.
- @updatedAt applies to Prisma Client updates, not arbitrary SQL. Direct SQL must set it.
- Canonicalize emails and join codes in backend before saving and comparing.
- Workspace password changes do not revoke membership or invalidate invitations.
- Membership changes, task changes and activity logs must commit together.
- Commenting is deferred; there is no comments model in this version.
