-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('active', 'hidden');

-- CreateEnum
CREATE TYPE "PostSeverity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "PostVerificationStatus" AS ENUM ('unverified', 'pending', 'verified', 'disputed');

-- CreateEnum
CREATE TYPE "PostFlagStatus" AS ENUM ('pending_review', 'resolved', 'rejected');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('user_invite', 'user_kick', 'user_role_change', 'post_create', 'post_update', 'post_delete', 'post_flag', 'flag_resolve', 'entity_add', 'entity_update', 'space_create', 'space_update', 'space_delete');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "instagram" TEXT,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Space" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSpaceMembership" (
    "userId" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSpaceMembership_pkey" PRIMARY KEY ("userId","spaceId")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "spaceId" UUID NOT NULL,
    "roleToAssign" TEXT NOT NULL,
    "invitedByUserId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportedEntity" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedByUserId" UUID NOT NULL,
    "spaceId" UUID NOT NULL,

    CONSTRAINT "ReportedEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportedEntityHandle" (
    "id" UUID NOT NULL,
    "reportedEntityId" UUID NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'Instagram',
    "handle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportedEntityHandle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "authorId" UUID,
    "reportedEntityId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "isAdminOnly" BOOLEAN NOT NULL DEFAULT false,
    "status" "PostStatus" NOT NULL DEFAULT 'active',
    "severity" "PostSeverity",
    "verificationStatus" "PostVerificationStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "uploaderId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "metadataStripped" BOOLEAN NOT NULL DEFAULT false,
    "isBlurred" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostFlag" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "flaggerUserId" UUID NOT NULL,
    "reason" TEXT,
    "status" "PostFlagStatus" NOT NULL DEFAULT 'pending_review',
    "resolvedByUserId" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "action" "AuditAction" NOT NULL,
    "targetEntityType" TEXT,
    "targetEntityId" UUID,
    "spaceId" UUID,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Space_name_key" ON "Space"("name");

-- CreateIndex
CREATE INDEX "Space_name_idx" ON "Space"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_token_key" ON "Invite"("token");

-- CreateIndex
CREATE INDEX "Invite_email_spaceId_idx" ON "Invite"("email", "spaceId");

-- CreateIndex
CREATE INDEX "ReportedEntity_name_idx" ON "ReportedEntity"("name");

-- CreateIndex
CREATE INDEX "ReportedEntityHandle_handle_idx" ON "ReportedEntityHandle"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "ReportedEntityHandle_reportedEntityId_handle_key" ON "ReportedEntityHandle"("reportedEntityId", "handle");

-- CreateIndex
CREATE INDEX "Post_createdAt_idx" ON "Post"("createdAt");

-- CreateIndex
CREATE INDEX "Post_updatedAt_idx" ON "Post"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Media_storageKey_key" ON "Media"("storageKey");

-- CreateIndex
CREATE INDEX "Media_postId_idx" ON "Media"("postId");

-- CreateIndex
CREATE INDEX "PostFlag_postId_idx" ON "PostFlag"("postId");

-- CreateIndex
CREATE INDEX "PostFlag_status_idx" ON "PostFlag"("status");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_targetEntityId_idx" ON "AuditLog"("targetEntityId");

-- CreateIndex
CREATE INDEX "AuditLog_spaceId_idx" ON "AuditLog"("spaceId");

-- AddForeignKey
ALTER TABLE "Space" ADD CONSTRAINT "Space_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSpaceMembership" ADD CONSTRAINT "UserSpaceMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSpaceMembership" ADD CONSTRAINT "UserSpaceMembership_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportedEntity" ADD CONSTRAINT "ReportedEntity_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportedEntity" ADD CONSTRAINT "ReportedEntity_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportedEntityHandle" ADD CONSTRAINT "ReportedEntityHandle_reportedEntityId_fkey" FOREIGN KEY ("reportedEntityId") REFERENCES "ReportedEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_reportedEntityId_fkey" FOREIGN KEY ("reportedEntityId") REFERENCES "ReportedEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostFlag" ADD CONSTRAINT "PostFlag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostFlag" ADD CONSTRAINT "PostFlag_flaggerUserId_fkey" FOREIGN KEY ("flaggerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostFlag" ADD CONSTRAINT "PostFlag_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE SET NULL ON UPDATE CASCADE;
