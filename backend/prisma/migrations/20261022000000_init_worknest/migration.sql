-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firebase_uid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "join_code" TEXT NOT NULL,
    "join_password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),
    "is_banned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("user_id","workspace_id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "invitee_id" UUID NOT NULL,
    "inviter_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '3 days'),

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "created_by" UUID NOT NULL,
    "assignee_id" UUID,
    "workspace_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_join_code_key" ON "workspaces"("join_code");

-- CreateIndex
CREATE INDEX "memberships_workspace_id_idx" ON "memberships"("workspace_id");

-- CreateIndex
CREATE INDEX "invitations_workspace_id_invitee_id_status_expires_at_idx" ON "invitations"("workspace_id", "invitee_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "invitations_invitee_id_idx" ON "invitations"("invitee_id");

-- CreateIndex
CREATE INDEX "invitations_inviter_id_idx" ON "invitations"("inviter_id");

-- CreateIndex
CREATE INDEX "tasks_workspace_id_status_position_id_idx" ON "tasks"("workspace_id", "status", "position", "id");

-- CreateIndex
CREATE INDEX "tasks_assignee_id_workspace_id_idx" ON "tasks"("assignee_id", "workspace_id");

-- CreateIndex
CREATE INDEX "tasks_created_by_idx" ON "tasks"("created_by");

-- CreateIndex
CREATE INDEX "activity_logs_workspace_id_created_at_id_idx" ON "activity_logs"("workspace_id", "created_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitee_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_workspace_id_fkey" FOREIGN KEY ("assignee_id", "workspace_id") REFERENCES "memberships"("user_id", "workspace_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Handwritten constraints: preserve these when maintaining future migrations.
ALTER TABLE "users" ADD CONSTRAINT "users_account_state_check" CHECK (
    ("is_active" AND "email" IS NOT NULL AND "deleted_at" IS NULL)
    OR (NOT "is_active" AND "email" IS NULL AND "deleted_at" IS NOT NULL)
);
ALTER TABLE "users" ADD CONSTRAINT "users_name_check" CHECK (length(trim("name")) > 0);
ALTER TABLE "users" ADD CONSTRAINT "users_firebase_uid_check" CHECK (length(trim("firebase_uid")) > 0);
ALTER TABLE "users" ADD CONSTRAINT "users_email_check" CHECK ("email" IS NULL OR length(trim("email")) > 0);

ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_name_check" CHECK (length(trim("name")) > 0);
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_join_code_check" CHECK (length(trim("join_code")) > 0);
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_password_hash_check" CHECK (length(trim("join_password_hash")) > 0);

ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_check" CHECK ("role" IN ('OWNER', 'ADMIN', 'MEMBER'));
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_time_check" CHECK ("left_at" IS NULL OR "left_at" >= "joined_at");
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_ban_check" CHECK (NOT "is_banned" OR "left_at" IS NOT NULL);

-- At most one active Owner. Backend transactions must also prevent zero Owners.
CREATE UNIQUE INDEX "memberships_one_active_owner"
ON "memberships" ("workspace_id") WHERE "role" = 'OWNER' AND "left_at" IS NULL;

ALTER TABLE "invitations" ADD CONSTRAINT "invitations_status_check" CHECK ("status" IN ('PENDING', 'ACCEPTED', 'REJECTED'));
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_different_users_check" CHECK ("inviter_id" <> "invitee_id");
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_time_check" CHECK ("expires_at" > "created_at");

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_title_check" CHECK (length(trim("title")) > 0);
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_priority_check" CHECK ("priority" IN ('LOW', 'MEDIUM', 'HIGH'));
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_check" CHECK ("status" IN ('TODO', 'IN_PROGRESS', 'DONE'));
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_position_check" CHECK ("position" > 0);
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completion_check" CHECK (
    ("status" = 'DONE' AND "completed_at" IS NOT NULL)
    OR ("status" <> 'DONE' AND "completed_at" IS NULL)
);
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_content_check" CHECK (length(trim("content")) > 0);
