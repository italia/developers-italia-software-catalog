-- CreateEnum
CREATE TYPE "onboarding_flow" AS ENUM ('STANDARD', 'FAST');

-- CreateEnum
CREATE TYPE "request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "request_source" AS ENUM ('FORM', 'GITHUB_ISSUE');

-- CreateEnum
CREATE TYPE "actor_type" AS ENUM ('SYSTEM', 'DASHBOARD_USER', 'REQUESTER', 'GITHUB');

-- CreateEnum
CREATE TYPE "dashboard_role" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');

-- CreateTable
CREATE TABLE "catalogs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "alternative_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "publishers_namespace" TEXT,
    "scopes" TEXT,
    "analysis" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_sources" (
    "id" TEXT NOT NULL,
    "driver" TEXT,
    "url" TEXT NOT NULL,
    "args" TEXT,
    "catalog_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "catalog_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publishers" (
    "id" TEXT NOT NULL,
    "catalog_id" TEXT,
    "email" TEXT,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "alternative_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "publishers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publishers_code_hosting" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "group" BOOLEAN NOT NULL DEFAULT true,
    "publisher_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "publishers_code_hosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "software" (
    "id" TEXT NOT NULL,
    "catalog_id" TEXT,
    "software_url_id" TEXT NOT NULL,
    "publiccode_yml" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "vitality" TEXT,
    "analysis" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "software_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "software_urls" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "software_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "software_urls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entity_id" TEXT,
    "entity_type" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT,
    "entity_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "type" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ipa_entities" (
    "ipa" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "fiscal_code" TEXT,
    "website" TEXT,
    "pec" TEXT[],
    "city" TEXT,
    "region" TEXT,
    "synced_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ipa_entities_pkey" PRIMARY KEY ("ipa")
);

-- CreateTable
CREATE TABLE "onboarding_requests" (
    "id" TEXT NOT NULL,
    "legacy_id" INTEGER,
    "ipa" TEXT NOT NULL,
    "administration" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "contact_phone" TEXT,
    "pec" TEXT,
    "code_hosting_url" TEXT NOT NULL,
    "flow" "onboarding_flow",
    "status" "request_status" NOT NULL DEFAULT 'PENDING',
    "verification" JSONB,
    "confirm_token_hash" TEXT,
    "confirm_expires_at" TIMESTAMPTZ,
    "publisher_id" TEXT,
    "decided_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "onboarding_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "third_party_requests" (
    "id" TEXT NOT NULL,
    "source" "request_source" NOT NULL DEFAULT 'FORM',
    "repository_url" TEXT NOT NULL,
    "requester_email" TEXT,
    "requester_name" TEXT,
    "requester_github" TEXT,
    "github_repo" TEXT,
    "github_issue_number" INTEGER,
    "github_issue_url" TEXT,
    "github_issue_body" TEXT,
    "notes" TEXT,
    "declarations" JSONB NOT NULL,
    "validation" JSONB,
    "status" "request_status" NOT NULL DEFAULT 'PENDING',
    "reviewer_note" TEXT,
    "software_id" TEXT,
    "decided_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "third_party_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_type" "actor_type" NOT NULL,
    "actor_id" TEXT,
    "from_status" "request_status",
    "to_status" "request_status",
    "data" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "dashboard_role" NOT NULL DEFAULT 'EDITOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "dashboard_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "magic_link_tokens" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "requested_ip" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "magic_link_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "last_seen_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "user_agent" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "catalogs_alternative_id_key" ON "catalogs"("alternative_id");

-- CreateIndex
CREATE INDEX "catalogs_created_at_idx" ON "catalogs"("created_at");

-- CreateIndex
CREATE INDEX "idx_catalogs_analysis_gin" ON "catalogs" USING GIN ("analysis");

-- CreateIndex
CREATE INDEX "catalog_sources_driver_idx" ON "catalog_sources"("driver");

-- CreateIndex
CREATE INDEX "catalog_sources_catalog_id_idx" ON "catalog_sources"("catalog_id");

-- CreateIndex
CREATE INDEX "catalog_sources_created_at_idx" ON "catalog_sources"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "publishers_description_key" ON "publishers"("description");

-- CreateIndex
CREATE UNIQUE INDEX "publishers_alternative_id_key" ON "publishers"("alternative_id");

-- CreateIndex
CREATE INDEX "publishers_catalog_id_idx" ON "publishers"("catalog_id");

-- CreateIndex
CREATE INDEX "publishers_created_at_idx" ON "publishers"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "publishers_code_hosting_url_key" ON "publishers_code_hosting"("url");

-- CreateIndex
CREATE INDEX "publishers_code_hosting_publisher_id_idx" ON "publishers_code_hosting"("publisher_id");

-- CreateIndex
CREATE INDEX "publishers_code_hosting_created_at_idx" ON "publishers_code_hosting"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "software_software_url_id_key" ON "software"("software_url_id");

-- CreateIndex
CREATE INDEX "software_catalog_id_idx" ON "software"("catalog_id");

-- CreateIndex
CREATE INDEX "software_created_at_idx" ON "software"("created_at");

-- CreateIndex
CREATE INDEX "idx_software_analysis_gin" ON "software" USING GIN ("analysis");

-- CreateIndex
CREATE UNIQUE INDEX "software_urls_url_key" ON "software_urls"("url");

-- CreateIndex
CREATE INDEX "software_urls_software_id_idx" ON "software_urls"("software_id");

-- CreateIndex
CREATE INDEX "software_urls_created_at_idx" ON "software_urls"("created_at");

-- CreateIndex
CREATE INDEX "idx_log_entity" ON "logs"("entity_id", "entity_type");

-- CreateIndex
CREATE INDEX "logs_created_at_idx" ON "logs"("created_at");

-- CreateIndex
CREATE INDEX "logs_deleted_at_idx" ON "logs"("deleted_at");

-- CreateIndex
CREATE INDEX "webhooks_created_at_idx" ON "webhooks"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idx_webhook_url" ON "webhooks"("url", "entity_id", "entity_type");

-- CreateIndex
CREATE INDEX "events_deleted_at_idx" ON "events"("deleted_at");

-- CreateIndex
CREATE INDEX "ipa_entities_description_idx" ON "ipa_entities"("description");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_requests_legacy_id_key" ON "onboarding_requests"("legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_requests_confirm_token_hash_key" ON "onboarding_requests"("confirm_token_hash");

-- CreateIndex
CREATE INDEX "onboarding_requests_status_idx" ON "onboarding_requests"("status");

-- CreateIndex
CREATE INDEX "onboarding_requests_code_hosting_url_idx" ON "onboarding_requests"("code_hosting_url");

-- CreateIndex
CREATE INDEX "third_party_requests_status_idx" ON "third_party_requests"("status");

-- CreateIndex
CREATE INDEX "third_party_requests_repository_url_idx" ON "third_party_requests"("repository_url");

-- CreateIndex
CREATE UNIQUE INDEX "third_party_requests_github_repo_github_issue_number_key" ON "third_party_requests"("github_repo", "github_issue_number");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_users_email_key" ON "dashboard_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "magic_link_tokens_token_hash_key" ON "magic_link_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "magic_link_tokens_email_idx" ON "magic_link_tokens"("email");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_sessions_token_hash_key" ON "dashboard_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "dashboard_sessions_user_id_idx" ON "dashboard_sessions"("user_id");

-- AddForeignKey
ALTER TABLE "catalog_sources" ADD CONSTRAINT "catalog_sources_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "catalogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publishers" ADD CONSTRAINT "publishers_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "catalogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publishers_code_hosting" ADD CONSTRAINT "publishers_code_hosting_publisher_id_fkey" FOREIGN KEY ("publisher_id") REFERENCES "publishers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "software" ADD CONSTRAINT "software_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "catalogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "software" ADD CONSTRAINT "software_software_url_id_fkey" FOREIGN KEY ("software_url_id") REFERENCES "software_urls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "software_urls" ADD CONSTRAINT "software_urls_software_id_fkey" FOREIGN KEY ("software_id") REFERENCES "software"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_requests" ADD CONSTRAINT "onboarding_requests_ipa_fkey" FOREIGN KEY ("ipa") REFERENCES "ipa_entities"("ipa") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_requests" ADD CONSTRAINT "onboarding_requests_publisher_id_fkey" FOREIGN KEY ("publisher_id") REFERENCES "publishers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "third_party_requests" ADD CONSTRAINT "third_party_requests_software_id_fkey" FOREIGN KEY ("software_id") REFERENCES "software"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_sessions" ADD CONSTRAINT "dashboard_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "dashboard_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
