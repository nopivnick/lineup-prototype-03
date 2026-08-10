CREATE TABLE "person" (
	"netid" text PRIMARY KEY NOT NULL,
	"university_id" text,
	"official_firstname" text NOT NULL,
	"official_lastname" text NOT NULL,
	"preferred_firstname" text,
	"preferred_lastname" text,
	"pronouns" text,
	"display_name" text GENERATED ALWAYS AS (coalesce(preferred_firstname, official_firstname) || ' ' || coalesce(preferred_lastname, official_lastname)) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "person_university_id_unique" UNIQUE("university_id")
);
--> statement-breakpoint
CREATE INDEX "person_display_name" ON "person" USING btree ("display_name");