ALTER TABLE "accuracy_metrics" ADD COLUMN "order_independent_cer" real;--> statement-breakpoint
ALTER TABLE "accuracy_metrics" ADD COLUMN "order_independent_accuracy" real;--> statement-breakpoint
ALTER TABLE "accuracy_metrics" ADD COLUMN "order_independent_edit_distance" integer;--> statement-breakpoint
ALTER TABLE "accuracy_metrics" ADD COLUMN "normalized_extracted_length" integer;--> statement-breakpoint
ALTER TABLE "accuracy_metrics" ADD COLUMN "normalized_ground_truth_length" integer;