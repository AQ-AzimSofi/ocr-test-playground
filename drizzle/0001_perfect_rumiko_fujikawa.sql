ALTER TABLE "accuracy_metrics" ADD COLUMN "character_error_rate" real;--> statement-breakpoint
ALTER TABLE "accuracy_metrics" ADD COLUMN "character_set_coverage" real;--> statement-breakpoint
ALTER TABLE "accuracy_metrics" ADD COLUMN "extracted_char_count" integer;--> statement-breakpoint
ALTER TABLE "accuracy_metrics" ADD COLUMN "ground_truth_char_count" integer;--> statement-breakpoint
ALTER TABLE "accuracy_metrics" ADD COLUMN "exact_char_count_match" boolean;--> statement-breakpoint
ALTER TABLE "accuracy_metrics" ADD COLUMN "char_count_difference" integer;--> statement-breakpoint
ALTER TABLE "accuracy_metrics" ADD COLUMN "edit_distance" integer;--> statement-breakpoint
ALTER TABLE "accuracy_metrics" DROP COLUMN IF EXISTS "word_accuracy";--> statement-breakpoint
ALTER TABLE "accuracy_metrics" DROP COLUMN IF EXISTS "dimensions_found";--> statement-breakpoint
ALTER TABLE "accuracy_metrics" DROP COLUMN IF EXISTS "dimensions_total";--> statement-breakpoint
ALTER TABLE "accuracy_metrics" DROP COLUMN IF EXISTS "dimensions_correct";--> statement-breakpoint
ALTER TABLE "accuracy_metrics" DROP COLUMN IF EXISTS "dimension_recall";--> statement-breakpoint
ALTER TABLE "accuracy_metrics" DROP COLUMN IF EXISTS "dimension_precision";--> statement-breakpoint
ALTER TABLE "accuracy_metrics" DROP COLUMN IF EXISTS "dimension_f1_score";--> statement-breakpoint
ALTER TABLE "accuracy_metrics" DROP COLUMN IF EXISTS "equipment_found";--> statement-breakpoint
ALTER TABLE "accuracy_metrics" DROP COLUMN IF EXISTS "equipment_total";--> statement-breakpoint
ALTER TABLE "accuracy_metrics" DROP COLUMN IF EXISTS "equipment_correct";--> statement-breakpoint
ALTER TABLE "accuracy_metrics" DROP COLUMN IF EXISTS "equipment_recall";--> statement-breakpoint
ALTER TABLE "accuracy_metrics" DROP COLUMN IF EXISTS "equipment_precision";--> statement-breakpoint
ALTER TABLE "accuracy_metrics" DROP COLUMN IF EXISTS "equipment_f1_score";--> statement-breakpoint
ALTER TABLE "accuracy_metrics" DROP COLUMN IF EXISTS "areas_found";--> statement-breakpoint
ALTER TABLE "accuracy_metrics" DROP COLUMN IF EXISTS "areas_total";--> statement-breakpoint
ALTER TABLE "accuracy_metrics" DROP COLUMN IF EXISTS "areas_correct";--> statement-breakpoint
ALTER TABLE "accuracy_metrics" DROP COLUMN IF EXISTS "area_recall";--> statement-breakpoint
ALTER TABLE "accuracy_metrics" DROP COLUMN IF EXISTS "area_precision";--> statement-breakpoint
ALTER TABLE "extraction_results" DROP COLUMN IF EXISTS "extracted_data";--> statement-breakpoint
ALTER TABLE "tool_comparisons" DROP COLUMN IF EXISTS "agreement";