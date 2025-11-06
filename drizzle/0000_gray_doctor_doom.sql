CREATE TABLE IF NOT EXISTS "accuracy_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extraction_result_id" uuid NOT NULL,
	"drawing_id" text NOT NULL,
	"tool" text NOT NULL,
	"character_accuracy" real,
	"word_accuracy" real,
	"dimensions_found" integer,
	"dimensions_total" integer,
	"dimensions_correct" integer,
	"dimension_recall" real,
	"dimension_precision" real,
	"dimension_f1_score" real,
	"equipment_found" integer,
	"equipment_total" integer,
	"equipment_correct" integer,
	"equipment_recall" real,
	"equipment_precision" real,
	"equipment_f1_score" real,
	"areas_found" integer,
	"areas_total" integer,
	"areas_correct" integer,
	"area_recall" real,
	"area_precision" real,
	"avg_confidence_score" real,
	"breakdown" jsonb,
	"calculated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "extraction_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drawing_id" text NOT NULL,
	"tool" text NOT NULL,
	"raw_text" text,
	"extracted_data" jsonb,
	"bounding_boxes" jsonb,
	"processing_time_ms" real,
	"api_cost" real,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "test_drawings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drawing_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_path" text NOT NULL,
	"type" text NOT NULL,
	"quality" text NOT NULL,
	"source" text NOT NULL,
	"ground_truth" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "test_drawings_drawing_id_unique" UNIQUE("drawing_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "test_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_name" text NOT NULL,
	"description" text,
	"drawing_ids" jsonb NOT NULL,
	"tools" jsonb NOT NULL,
	"summary" jsonb,
	"completed" boolean DEFAULT false,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tool_comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drawing_id" text NOT NULL,
	"tool_a" text NOT NULL,
	"tool_b" text NOT NULL,
	"better_tool" text,
	"metric_comparison" jsonb,
	"agreement" jsonb,
	"compared_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accuracy_metrics" ADD CONSTRAINT "accuracy_metrics_extraction_result_id_extraction_results_id_fk" FOREIGN KEY ("extraction_result_id") REFERENCES "public"."extraction_results"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accuracy_metrics" ADD CONSTRAINT "accuracy_metrics_drawing_id_test_drawings_drawing_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."test_drawings"("drawing_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "extraction_results" ADD CONSTRAINT "extraction_results_drawing_id_test_drawings_drawing_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."test_drawings"("drawing_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tool_comparisons" ADD CONSTRAINT "tool_comparisons_drawing_id_test_drawings_drawing_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."test_drawings"("drawing_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
