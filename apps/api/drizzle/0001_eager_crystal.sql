CREATE TYPE "public"."connection_status" AS ENUM('disconnected', 'connecting', 'connected', 'error');--> statement-breakpoint
CREATE TYPE "public"."external_reference_type" AS ENUM('meeting', 'transcript', 'summary', 'action_item', 'decision', 'issue', 'event', 'notification');--> statement-breakpoint
CREATE TYPE "public"."ingestion_status" AS ENUM('processed', 'duplicate', 'failed');--> statement-breakpoint
CREATE TYPE "public"."integration_event_status" AS ENUM('ok', 'error');--> statement-breakpoint
CREATE TYPE "public"."integration_provider" AS ENUM('google_calendar', 'fathom', 'slack', 'linear', 'microsoft_outlook', 'fireflies', 'tldv', 'github', 'zoom', 'google_meet', 'notion', 'email', 'zapier');--> statement-breakpoint
CREATE TYPE "public"."provider_capability" AS ENUM('calendar', 'meeting_intelligence', 'communication', 'project', 'meeting_platform', 'automation');--> statement-breakpoint
CREATE TABLE "external_references" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" "integration_provider" NOT NULL,
	"external_id" text NOT NULL,
	"external_url" text,
	"reference_type" "external_reference_type" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_records" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" "integration_provider" NOT NULL,
	"source_event_id" text NOT NULL,
	"source_event_type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload_hash" text NOT NULL,
	"status" "ingestion_status" NOT NULL,
	"output_entity_type" text,
	"output_entity_id" text,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" "integration_provider" NOT NULL,
	"capability" "provider_capability" NOT NULL,
	"status" "connection_status" DEFAULT 'disconnected' NOT NULL,
	"display_name" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"config" jsonb,
	"last_sync_at" timestamp with time zone,
	"last_error" jsonb,
	"connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_events" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"provider_id" "integration_provider" NOT NULL,
	"event_type" text NOT NULL,
	"status" "integration_event_status" NOT NULL,
	"summary" text NOT NULL,
	"details" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "external_references_provider_external_idx" ON "external_references" USING btree ("provider_id","external_id");--> statement-breakpoint
CREATE INDEX "external_references_entity_idx" ON "external_references" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_records_provider_event_unique" ON "ingestion_records" USING btree ("provider_id","source_event_id");--> statement-breakpoint
CREATE INDEX "integration_connections_provider_idx" ON "integration_connections" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "integration_connections_status_idx" ON "integration_connections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "integration_events_connection_idx" ON "integration_events" USING btree ("connection_id","occurred_at");