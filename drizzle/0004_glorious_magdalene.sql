CREATE TABLE IF NOT EXISTS "element_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drawing_id" text NOT NULL,
	"source_object_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"relationship_type" text NOT NULL,
	"spatial_data" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "geometric_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extraction_result_id" uuid NOT NULL,
	"drawing_id" text NOT NULL,
	"object_type" text NOT NULL,
	"sub_type" text,
	"geometry" jsonb NOT NULL,
	"properties" jsonb,
	"confidence" real,
	"detection_method" text NOT NULL,
	"associated_dimension_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "element_relationships" ADD CONSTRAINT "element_relationships_drawing_id_test_drawings_drawing_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."test_drawings"("drawing_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "element_relationships" ADD CONSTRAINT "element_relationships_source_object_id_geometric_objects_id_fk" FOREIGN KEY ("source_object_id") REFERENCES "public"."geometric_objects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "geometric_objects" ADD CONSTRAINT "geometric_objects_extraction_result_id_extraction_results_id_fk" FOREIGN KEY ("extraction_result_id") REFERENCES "public"."extraction_results"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "geometric_objects" ADD CONSTRAINT "geometric_objects_drawing_id_test_drawings_drawing_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."test_drawings"("drawing_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "geometric_objects" ADD CONSTRAINT "geometric_objects_associated_dimension_id_geometric_objects_id_fk" FOREIGN KEY ("associated_dimension_id") REFERENCES "public"."geometric_objects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
