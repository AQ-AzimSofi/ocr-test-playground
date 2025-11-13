CREATE TABLE IF NOT EXISTS "bbox_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extraction_result_id" uuid NOT NULL,
	"drawing_id" text NOT NULL,
	"bbox_index" integer NOT NULL,
	"status" text NOT NULL,
	"notes" text,
	"verified_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "missing_text_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extraction_result_id" uuid NOT NULL,
	"drawing_id" text NOT NULL,
	"text" text NOT NULL,
	"estimated_location" jsonb,
	"notes" text,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "test_drawings" ADD COLUMN "is_confidential" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bbox_verifications" ADD CONSTRAINT "bbox_verifications_extraction_result_id_extraction_results_id_fk" FOREIGN KEY ("extraction_result_id") REFERENCES "public"."extraction_results"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bbox_verifications" ADD CONSTRAINT "bbox_verifications_drawing_id_test_drawings_drawing_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."test_drawings"("drawing_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "missing_text_entries" ADD CONSTRAINT "missing_text_entries_extraction_result_id_extraction_results_id_fk" FOREIGN KEY ("extraction_result_id") REFERENCES "public"."extraction_results"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "missing_text_entries" ADD CONSTRAINT "missing_text_entries_drawing_id_test_drawings_drawing_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."test_drawings"("drawing_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
