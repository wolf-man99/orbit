-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "ledger_event_type" AS ENUM ('LOAN_DISBURSED', 'INTEREST_RECEIVED', 'PRINCIPAL_RECEIVED', 'PENALTY_CHARGED', 'PENALTY_WAIVED', 'ADJUSTMENT', 'REVERSAL', 'LOAN_CLOSED', 'LOAN_WRITTEN_OFF', 'LOAN_EXTENDED', 'LOAN_TERMS_AMENDED', 'NOTE_ADDED', 'DOCUMENT_UPLOADED', 'REMINDER_SENT');

-- CreateEnum
CREATE TYPE "event_source" AS ENUM ('MANUAL', 'IMPORTED', 'INTEGRATION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "interest_convention" AS ENUM ('FLAT', 'REDUCING_SIMPLE', 'COMPOUND', 'AMORTIZED_EMI');

-- CreateEnum
CREATE TYPE "day_count_convention" AS ENUM ('ACTUAL_365', 'ACTUAL_ACTUAL', 'THIRTY_360');

-- CreateEnum
CREATE TYPE "rate_period" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "loan_status" AS ENUM ('ACTIVE', 'DUE', 'OVERDUE', 'CLOSED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "borrower_status" AS ENUM ('ACTIVE', 'DUE_SOON', 'OVERDUE', 'DORMANT', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "relationship_tag" AS ENUM ('FAMILY', 'FRIEND', 'BUSINESS', 'REFERRAL', 'COMMUNITY', 'OTHER');

-- CreateEnum
CREATE TYPE "accrual_period_status" AS ENUM ('UPCOMING', 'DUE', 'OVERDUE', 'PARTIAL', 'SETTLED', 'WAIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "reminder_type" AS ENUM ('INTEREST_DUE', 'OVERDUE', 'LOAN_CLOSURE_DUE', 'CONCENTRATION_WARNING', 'CUSTOM');

-- CreateEnum
CREATE TYPE "reminder_status" AS ENUM ('PENDING', 'SNOOZED', 'RESOLVED', 'DISMISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('IN_APP', 'PUSH', 'EMAIL');

-- CreateEnum
CREATE TYPE "document_type" AS ENUM ('AGREEMENT', 'CHEQUE', 'ID_PROOF', 'RECEIPT', 'OTHER');

-- CreateEnum
CREATE TYPE "tax_category" AS ENUM ('INTEREST_INCOME', 'PRINCIPAL_MOVEMENT', 'PENALTY_INCOME', 'WRITE_OFF', 'NON_TAXABLE');

-- CreateEnum
CREATE TYPE "theme_preference" AS ENUM ('DARK', 'LIGHT', 'SYSTEM');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "full_name" TEXT,
    "avatar_url" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en-IN',
    "time_zone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'My Portfolio',
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "default_convention" "interest_convention" NOT NULL DEFAULT 'FLAT',
    "default_day_count" "day_count_convention" NOT NULL DEFAULT 'ACTUAL_365',
    "default_rate_period" "rate_period" NOT NULL DEFAULT 'MONTHLY',
    "default_grace_days" INTEGER NOT NULL DEFAULT 5,
    "anchor_to_start_day" BOOLEAN NOT NULL DEFAULT true,
    "concentration_warn_bps" INTEGER NOT NULL DEFAULT 2500,
    "is_default" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "user_id" UUID NOT NULL,
    "theme" "theme_preference" NOT NULL DEFAULT 'DARK',
    "reduced_motion" BOOLEAN NOT NULL DEFAULT false,
    "increased_contrast" BOOLEAN NOT NULL DEFAULT false,
    "app_lock_enabled" BOOLEAN NOT NULL DEFAULT false,
    "app_lock_timeout_seconds" INTEGER NOT NULL DEFAULT 300,
    "biometric_enabled" BOOLEAN NOT NULL DEFAULT false,
    "push_enabled" BOOLEAN NOT NULL DEFAULT false,
    "digest_enabled" BOOLEAN NOT NULL DEFAULT false,
    "quiet_hours_start" INTEGER,
    "quiet_hours_end" INTEGER,
    "notification_prefs" JSONB NOT NULL DEFAULT '{}',
    "closure_reminder_lead_days" INTEGER NOT NULL DEFAULT 7,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "borrower" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "email" CITEXT,
    "photo_url" TEXT,
    "address" TEXT,
    "id_reference" TEXT,
    "relationship_tag" "relationship_tag" NOT NULL DEFAULT 'OTHER',
    "relationship_since" DATE,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "borrower_status" NOT NULL DEFAULT 'ACTIVE',
    "risk_score" INTEGER,
    "risk_factors" JSONB,
    "risk_computed_at" TIMESTAMPTZ(6),
    "risk_model_version" TEXT,
    "linked_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "borrower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borrower_note" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "borrower_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "borrower_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "borrower_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "expected_end_date" DATE,
    "closed_on" DATE,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "original_principal_minor" BIGINT NOT NULL DEFAULT 0,
    "status" "loan_status" NOT NULL DEFAULT 'ACTIVE',
    "purpose" TEXT,
    "collateral_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_terms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "rate_bps" INTEGER NOT NULL,
    "rate_period" "rate_period" NOT NULL,
    "convention" "interest_convention" NOT NULL,
    "day_count" "day_count_convention" NOT NULL,
    "grace_days" INTEGER NOT NULL,
    "anchor_day" INTEGER NOT NULL,
    "source_event_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_balance" (
    "loan_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "outstanding_principal_minor" BIGINT NOT NULL DEFAULT 0,
    "principal_received_minor" BIGINT NOT NULL DEFAULT 0,
    "accrued_interest_minor" BIGINT NOT NULL DEFAULT 0,
    "interest_received_minor" BIGINT NOT NULL DEFAULT 0,
    "interest_outstanding_minor" BIGINT NOT NULL DEFAULT 0,
    "penalty_charged_minor" BIGINT NOT NULL DEFAULT 0,
    "penalty_outstanding_minor" BIGINT NOT NULL DEFAULT 0,
    "written_off_minor" BIGINT NOT NULL DEFAULT 0,
    "overdue_minor" BIGINT NOT NULL DEFAULT 0,
    "overdue_periods" INTEGER NOT NULL DEFAULT 0,
    "next_due_on" DATE,
    "next_due_minor" BIGINT,
    "last_event_seq" BIGINT NOT NULL DEFAULT 0,
    "recomputed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_balance_pkey" PRIMARY KEY ("loan_id")
);

-- CreateTable
CREATE TABLE "ledger_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "seq" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "borrower_id" UUID,
    "loan_id" UUID,
    "type" "ledger_event_type" NOT NULL,
    "group_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "amount_minor" BIGINT NOT NULL DEFAULT 0,
    "principal_delta_minor" BIGINT NOT NULL DEFAULT 0,
    "interest_delta_minor" BIGINT NOT NULL DEFAULT 0,
    "penalty_delta_minor" BIGINT NOT NULL DEFAULT 0,
    "cash_delta_minor" BIGINT NOT NULL DEFAULT 0,
    "reason" TEXT,
    "note" TEXT,
    "reverses_event_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "source" "event_source" NOT NULL DEFAULT 'MANUAL',
    "external_ref" TEXT,
    "tax_category" "tax_category",
    "created_by" UUID NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ledger_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accrual_period" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "cycle_index" INTEGER NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "due_on" DATE NOT NULL,
    "grace_until" DATE NOT NULL,
    "accrued_minor" BIGINT NOT NULL,
    "carry_in_minor" BIGINT NOT NULL DEFAULT 0,
    "carry_out_minor" BIGINT NOT NULL DEFAULT 0,
    "settled_minor" BIGINT NOT NULL DEFAULT 0,
    "waived_minor" BIGINT NOT NULL DEFAULT 0,
    "status" "accrual_period_status" NOT NULL DEFAULT 'UPCOMING',
    "engine_version" TEXT NOT NULL,
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accrual_period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accrual_segment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "segment_index" INTEGER NOT NULL,
    "segment_start" DATE NOT NULL,
    "segment_end" DATE NOT NULL,
    "basis_principal_minor" BIGINT NOT NULL,
    "rate_bps" INTEGER NOT NULL,
    "rate_period" "rate_period" NOT NULL,
    "convention" "interest_convention" NOT NULL,
    "day_count" "day_count_convention" NOT NULL,
    "days" INTEGER NOT NULL,
    "days_in_year" INTEGER NOT NULL,
    "accrued_micro_minor" BIGINT NOT NULL,
    "trigger_event_id" UUID,

    CONSTRAINT "accrual_segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "is_automatic" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "borrower_id" UUID,
    "loan_id" UUID,
    "period_id" UUID,
    "type" "reminder_type" NOT NULL,
    "status" "reminder_status" NOT NULL DEFAULT 'PENDING',
    "due_on" DATE NOT NULL,
    "snoozed_to" DATE,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by_event_id" UUID,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "deep_link" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "is_system_generated" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "reminder_id" UUID,
    "channel" "notification_channel" NOT NULL DEFAULT 'IN_APP',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "deep_link" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "delivered_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscription" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "push_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "borrower_id" UUID,
    "loan_id" UUID,
    "event_id" UUID,
    "type" "document_type" NOT NULL DEFAULT 'OTHER',
    "file_name" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "extracted_data" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_snapshot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "period_month" DATE NOT NULL,
    "outstanding_principal_minor" BIGINT NOT NULL,
    "accrued_interest_minor" BIGINT NOT NULL,
    "interest_received_minor" BIGINT NOT NULL,
    "principal_received_minor" BIGINT NOT NULL,
    "disbursed_minor" BIGINT NOT NULL,
    "penalty_received_minor" BIGINT NOT NULL,
    "written_off_minor" BIGINT NOT NULL,
    "portfolio_value_minor" BIGINT NOT NULL,
    "active_loans" INTEGER NOT NULL,
    "active_borrowers" INTEGER NOT NULL,
    "overdue_loans" INTEGER NOT NULL,
    "overdue_minor" BIGINT NOT NULL,
    "interest_due_minor" BIGINT NOT NULL,
    "collection_rate_bps" INTEGER NOT NULL,
    "avg_rate_bps" INTEGER NOT NULL,
    "avg_loan_size_minor" BIGINT NOT NULL,
    "concentration_hhi" INTEGER NOT NULL,
    "avg_days_to_settle" INTEGER,
    "health_score" INTEGER NOT NULL,
    "health_factors" JSONB NOT NULL,
    "engine_version" TEXT NOT NULL,
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engine_run" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "engine_version" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "succeeded" BOOLEAN,
    "error" TEXT,
    "stats" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "engine_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "portfolio_user_id_idx" ON "portfolio"("user_id");

-- CreateIndex
CREATE INDEX "borrower_portfolio_id_status_idx" ON "borrower"("portfolio_id", "status");

-- CreateIndex
CREATE INDEX "borrower_portfolio_id_archived_at_idx" ON "borrower"("portfolio_id", "archived_at");

-- CreateIndex
CREATE INDEX "borrower_user_id_idx" ON "borrower"("user_id");

-- CreateIndex
CREATE INDEX "borrower_note_borrower_id_created_at_idx" ON "borrower_note"("borrower_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "loan_borrower_id_status_idx" ON "loan"("borrower_id", "status");

-- CreateIndex
CREATE INDEX "loan_portfolio_id_status_idx" ON "loan"("portfolio_id", "status");

-- CreateIndex
CREATE INDEX "loan_user_id_idx" ON "loan"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "loan_portfolio_id_reference_key" ON "loan"("portfolio_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "loan_terms_source_event_id_key" ON "loan_terms"("source_event_id");

-- CreateIndex
CREATE INDEX "loan_terms_loan_id_effective_from_idx" ON "loan_terms"("loan_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "loan_terms_loan_id_version_key" ON "loan_terms"("loan_id", "version");

-- CreateIndex
CREATE INDEX "loan_balance_portfolio_id_next_due_on_idx" ON "loan_balance"("portfolio_id", "next_due_on");

-- CreateIndex
CREATE INDEX "loan_balance_portfolio_id_interest_outstanding_minor_idx" ON "loan_balance"("portfolio_id", "interest_outstanding_minor" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ledger_event_seq_key" ON "ledger_event"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_event_reverses_event_id_key" ON "ledger_event"("reverses_event_id");

-- CreateIndex
CREATE INDEX "ledger_event_portfolio_id_occurred_at_seq_idx" ON "ledger_event"("portfolio_id", "occurred_at" DESC, "seq" DESC);

-- CreateIndex
CREATE INDEX "ledger_event_loan_id_occurred_at_idx" ON "ledger_event"("loan_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "ledger_event_borrower_id_occurred_at_idx" ON "ledger_event"("borrower_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "ledger_event_portfolio_id_type_occurred_at_idx" ON "ledger_event"("portfolio_id", "type", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "ledger_event_group_id_idx" ON "ledger_event"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_event_user_id_idempotency_key_key" ON "ledger_event"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "accrual_period_portfolio_id_status_due_on_idx" ON "accrual_period"("portfolio_id", "status", "due_on");

-- CreateIndex
CREATE INDEX "accrual_period_portfolio_id_due_on_idx" ON "accrual_period"("portfolio_id", "due_on");

-- CreateIndex
CREATE INDEX "accrual_period_loan_id_period_start_idx" ON "accrual_period"("loan_id", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "accrual_period_loan_id_cycle_index_key" ON "accrual_period"("loan_id", "cycle_index");

-- CreateIndex
CREATE UNIQUE INDEX "accrual_segment_period_id_segment_index_key" ON "accrual_segment"("period_id", "segment_index");

-- CreateIndex
CREATE INDEX "payment_allocation_period_id_idx" ON "payment_allocation"("period_id");

-- CreateIndex
CREATE INDEX "payment_allocation_event_id_idx" ON "payment_allocation"("event_id");

-- CreateIndex
CREATE INDEX "reminder_portfolio_id_status_due_on_idx" ON "reminder"("portfolio_id", "status", "due_on");

-- CreateIndex
CREATE INDEX "reminder_borrower_id_status_idx" ON "reminder"("borrower_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_user_id_dedupe_key_key" ON "reminder"("user_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "notification_user_id_read_at_created_at_idx" ON "notification"("user_id", "read_at", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscription_endpoint_key" ON "push_subscription"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscription_user_id_revoked_at_idx" ON "push_subscription"("user_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "document_storage_path_key" ON "document"("storage_path");

-- CreateIndex
CREATE INDEX "document_borrower_id_created_at_idx" ON "document"("borrower_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "document_loan_id_idx" ON "document"("loan_id");

-- CreateIndex
CREATE INDEX "portfolio_snapshot_portfolio_id_period_month_idx" ON "portfolio_snapshot"("portfolio_id", "period_month" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_snapshot_portfolio_id_period_month_key" ON "portfolio_snapshot"("portfolio_id", "period_month");

-- CreateIndex
CREATE INDEX "engine_run_portfolio_id_kind_started_at_idx" ON "engine_run"("portfolio_id", "kind", "started_at" DESC);

-- AddForeignKey
ALTER TABLE "portfolio" ADD CONSTRAINT "portfolio_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrower" ADD CONSTRAINT "borrower_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrower" ADD CONSTRAINT "borrower_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrower_note" ADD CONSTRAINT "borrower_note_borrower_id_fkey" FOREIGN KEY ("borrower_id") REFERENCES "borrower"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan" ADD CONSTRAINT "loan_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan" ADD CONSTRAINT "loan_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan" ADD CONSTRAINT "loan_borrower_id_fkey" FOREIGN KEY ("borrower_id") REFERENCES "borrower"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_terms" ADD CONSTRAINT "loan_terms_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_terms" ADD CONSTRAINT "loan_terms_source_event_id_fkey" FOREIGN KEY ("source_event_id") REFERENCES "ledger_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_balance" ADD CONSTRAINT "loan_balance_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_event" ADD CONSTRAINT "ledger_event_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_event" ADD CONSTRAINT "ledger_event_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_event" ADD CONSTRAINT "ledger_event_borrower_id_fkey" FOREIGN KEY ("borrower_id") REFERENCES "borrower"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_event" ADD CONSTRAINT "ledger_event_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_event" ADD CONSTRAINT "ledger_event_reverses_event_id_fkey" FOREIGN KEY ("reverses_event_id") REFERENCES "ledger_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accrual_period" ADD CONSTRAINT "accrual_period_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accrual_period" ADD CONSTRAINT "accrual_period_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accrual_segment" ADD CONSTRAINT "accrual_segment_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "accrual_period"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "ledger_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "accrual_period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_borrower_id_fkey" FOREIGN KEY ("borrower_id") REFERENCES "borrower"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "accrual_period"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_reminder_id_fkey" FOREIGN KEY ("reminder_id") REFERENCES "reminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_borrower_id_fkey" FOREIGN KEY ("borrower_id") REFERENCES "borrower"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "ledger_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_snapshot" ADD CONSTRAINT "portfolio_snapshot_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

