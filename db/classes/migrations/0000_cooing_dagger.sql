CREATE TABLE "area" (
	"area_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "area_area_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"program_code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone,
	"updated_by" text,
	CONSTRAINT "area_id_program_code" UNIQUE("area_id","program_code"),
	CONSTRAINT "area_program_code_name" UNIQUE("program_code","name")
);
--> statement-breakpoint
CREATE TABLE "course" (
	"course_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "course_course_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"program_code" text NOT NULL,
	"course_number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"credits" integer NOT NULL,
	"url" text,
	"edition" integer DEFAULT 1 NOT NULL,
	"area_head" text,
	"minted_from_review_id" bigint NOT NULL,
	"snapshot" jsonb NOT NULL,
	"status" text GENERATED ALWAYS AS (snapshot->>'value') STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone,
	"updated_by" text,
	CONSTRAINT "course_minted_from_review_id_unique" UNIQUE("minted_from_review_id"),
	CONSTRAINT "course_program_code_course_number" UNIQUE("program_code","course_number"),
	CONSTRAINT "course_id_program_code" UNIQUE("course_id","program_code"),
	CONSTRAINT "course_credits" CHECK (credits > 0),
	CONSTRAINT "course_edition" CHECK (edition >= 1),
	CONSTRAINT "course_status" CHECK (snapshot->>'value' IN ('Approved', 'Revising', 'Retired'))
);
--> statement-breakpoint
CREATE TABLE "course_area" (
	"course_id" bigint NOT NULL,
	"area_id" bigint NOT NULL,
	"program_code" text NOT NULL,
	CONSTRAINT "course_area_pkey" PRIMARY KEY("course_id","area_id")
);
--> statement-breakpoint
CREATE TABLE "course_proposal" (
	"course_proposal_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "course_proposal_course_proposal_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"description" text,
	"credits" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone,
	"updated_by" text,
	CONSTRAINT "course_proposal_credits" CHECK (credits > 0)
);
--> statement-breakpoint
CREATE TABLE "course_proposal_review" (
	"course_proposal_review_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "course_proposal_review_course_proposal_review_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"course_proposal_id" bigint NOT NULL,
	"program_code" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"status" text GENERATED ALWAYS AS (snapshot->>'value') STORED,
	"area_head" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone,
	"updated_by" text,
	CONSTRAINT "course_proposal_review_proposal_program" UNIQUE("course_proposal_id","program_code"),
	CONSTRAINT "course_proposal_review_id_program_code" UNIQUE("course_proposal_review_id","program_code"),
	CONSTRAINT "course_proposal_review_status" CHECK (snapshot->>'value' IN ('Proposed', 'Developing', 'Approved', 'Rejected'))
);
--> statement-breakpoint
CREATE TABLE "course_proposal_review_area" (
	"course_proposal_review_id" bigint NOT NULL,
	"area_id" bigint NOT NULL,
	"program_code" text NOT NULL,
	CONSTRAINT "course_proposal_review_area_pkey" PRIMARY KEY("course_proposal_review_id","area_id")
);
--> statement-breakpoint
CREATE TABLE "course_proposal_review_transition" (
	"course_proposal_review_transition_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "course_proposal_review_transition_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"course_proposal_review_id" bigint NOT NULL,
	"event" text NOT NULL,
	"from_state" text NOT NULL,
	"to_state" text NOT NULL,
	"actor_netid" text NOT NULL,
	"subject_netid" text,
	"reason" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_proposal_review_transition_from_state" CHECK (from_state IN ('Proposed', 'Developing', 'Approved', 'Rejected')),
	CONSTRAINT "course_proposal_review_transition_to_state" CHECK (to_state IN ('Proposed', 'Developing', 'Approved', 'Rejected'))
);
--> statement-breakpoint
CREATE TABLE "course_requirement_category" (
	"course_id" bigint NOT NULL,
	"requirement_category_id" bigint NOT NULL,
	"program_code" text NOT NULL,
	CONSTRAINT "course_requirement_category_pkey" PRIMARY KEY("course_id","requirement_category_id")
);
--> statement-breakpoint
CREATE TABLE "course_transition" (
	"course_transition_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "course_transition_course_transition_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"course_id" bigint NOT NULL,
	"event" text NOT NULL,
	"from_state" text NOT NULL,
	"to_state" text NOT NULL,
	"actor_netid" text NOT NULL,
	"subject_netid" text,
	"reason" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_transition_from_state" CHECK (from_state IN ('Approved', 'Revising', 'Retired')),
	CONSTRAINT "course_transition_to_state" CHECK (to_state IN ('Approved', 'Revising', 'Retired'))
);
--> statement-breakpoint
CREATE TABLE "offering" (
	"offering_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "offering_offering_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"course_id" bigint NOT NULL,
	"program_code" text NOT NULL,
	"term_code" char(5) NOT NULL,
	"section_number" text DEFAULT '1' NOT NULL,
	"call_number" text,
	"sis_class_number" integer,
	"url" text,
	"mode" text,
	"enrollment_limit" integer,
	"snapshot" jsonb NOT NULL,
	"status" text GENERATED ALWAYS AS (snapshot->>'value') STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone,
	"updated_by" text,
	CONSTRAINT "offering_course_term_section" UNIQUE("course_id","term_code","section_number"),
	CONSTRAINT "offering_enrollment_limit" CHECK (enrollment_limit > 0),
	CONSTRAINT "offering_status" CHECK (snapshot->>'value' IN ('Slated', 'Staffed', 'Offered', 'Accepted', 'Declined', 'Deferred', 'Scheduled', 'Published', 'Listed', 'Running', 'Evaluating', 'Canceled', 'Concluded', 'Dead'))
);
--> statement-breakpoint
CREATE TABLE "offering_area" (
	"offering_id" bigint NOT NULL,
	"area_id" bigint NOT NULL,
	"granted_by" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offering_area_pkey" PRIMARY KEY("offering_id","area_id")
);
--> statement-breakpoint
CREATE TABLE "offering_instructor" (
	"offering_id" bigint NOT NULL,
	"position" integer NOT NULL,
	"netid" text NOT NULL,
	"granted_by" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offering_instructor_pkey" PRIMARY KEY("offering_id","position"),
	CONSTRAINT "offering_instructor_offering_netid" UNIQUE("offering_id","netid"),
	CONSTRAINT "offering_instructor_position" CHECK ("position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "offering_meeting" (
	"offering_meeting_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "offering_meeting_offering_meeting_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"offering_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"day_of_week" smallint,
	"start_date" date,
	"end_date" date,
	"start_time" time,
	"end_time" time,
	"room" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone,
	"updated_by" text,
	CONSTRAINT "offering_meeting_kind" CHECK (kind IN ('weekly', 'dates', 'async')),
	CONSTRAINT "offering_meeting_shape" CHECK (CASE kind
      WHEN 'weekly' THEN
        day_of_week IS NOT NULL
        AND start_time IS NOT NULL AND end_time IS NOT NULL
        AND start_date IS NULL AND end_date IS NULL
      WHEN 'dates' THEN
        start_date IS NOT NULL AND end_date IS NOT NULL
        AND start_time IS NOT NULL AND end_time IS NOT NULL
        AND day_of_week IS NULL
      WHEN 'async' THEN
        day_of_week IS NULL
        AND start_date IS NULL AND end_date IS NULL
        AND start_time IS NULL AND end_time IS NULL
        AND room IS NULL
    END),
	CONSTRAINT "offering_meeting_day_of_week" CHECK (day_of_week IS NULL OR day_of_week BETWEEN 0 AND 6),
	CONSTRAINT "offering_meeting_times_ordered" CHECK (start_time IS NULL OR end_time IS NULL OR end_time > start_time),
	CONSTRAINT "offering_meeting_dates_ordered" CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);
--> statement-breakpoint
CREATE TABLE "offering_requirement_category" (
	"offering_id" bigint NOT NULL,
	"requirement_category_id" bigint NOT NULL,
	"granted_by" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offering_requirement_category_pkey" PRIMARY KEY("offering_id","requirement_category_id")
);
--> statement-breakpoint
CREATE TABLE "offering_transition" (
	"offering_transition_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "offering_transition_offering_transition_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"offering_id" bigint NOT NULL,
	"event" text NOT NULL,
	"from_state" text NOT NULL,
	"to_state" text NOT NULL,
	"actor_netid" text NOT NULL,
	"subject_netid" text,
	"reason" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offering_transition_from_state" CHECK (from_state IN ('Slated', 'Staffed', 'Offered', 'Accepted', 'Declined', 'Deferred', 'Scheduled', 'Published', 'Listed', 'Running', 'Evaluating', 'Canceled', 'Concluded', 'Dead')),
	CONSTRAINT "offering_transition_to_state" CHECK (to_state IN ('Slated', 'Staffed', 'Offered', 'Accepted', 'Declined', 'Deferred', 'Scheduled', 'Published', 'Listed', 'Running', 'Evaluating', 'Canceled', 'Concluded', 'Dead'))
);
--> statement-breakpoint
CREATE TABLE "program" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"degree_level" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone,
	"updated_by" text,
	CONSTRAINT "program_degree_level" CHECK (degree_level IN ('undergraduate', 'graduate'))
);
--> statement-breakpoint
CREATE TABLE "program_director" (
	"program_code" text NOT NULL,
	"netid" text NOT NULL,
	"granted_by" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_director_pkey" PRIMARY KEY("program_code","netid")
);
--> statement-breakpoint
CREATE TABLE "requirement_category" (
	"requirement_category_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "requirement_category_requirement_category_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"program_code" text NOT NULL,
	"name" text NOT NULL,
	"credits" integer,
	"group_no" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone,
	"updated_by" text,
	CONSTRAINT "requirement_category_id_program_code" UNIQUE("requirement_category_id","program_code"),
	CONSTRAINT "requirement_category_program_code_name" UNIQUE("program_code","name")
);
--> statement-breakpoint
CREATE TABLE "term" (
	"code" char(5) PRIMARY KEY NOT NULL,
	"year" smallint NOT NULL,
	"semester" text NOT NULL,
	"sis_term_code" text,
	CONSTRAINT "term_year_semester" UNIQUE("year","semester"),
	CONSTRAINT "term_year" CHECK ("year" BETWEEN 1979 AND 2999),
	CONSTRAINT "term_semester" CHECK (semester IN ('Spring', 'Summer', 'Fall')),
	CONSTRAINT "term_code_matches_year_and_semester" CHECK (code = "year"::text || CASE semester WHEN 'Spring' THEN '1' WHEN 'Summer' THEN '2' WHEN 'Fall' THEN '3' END)
);
--> statement-breakpoint
CREATE TABLE "user_role" (
	"netid" text NOT NULL,
	"role" text NOT NULL,
	"granted_by" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_role_pkey" PRIMARY KEY("netid","role"),
	CONSTRAINT "user_role_role" CHECK (role IN ('student', 'instructor', 'advisor', 'coordinator', 'program_director', 'area_head', 'chair'))
);
--> statement-breakpoint
ALTER TABLE "area" ADD CONSTRAINT "area_program_code_program_code_fk" FOREIGN KEY ("program_code") REFERENCES "public"."program"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_program_code_program_code_fk" FOREIGN KEY ("program_code") REFERENCES "public"."program"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_minted_from_review_fk" FOREIGN KEY ("minted_from_review_id") REFERENCES "public"."course_proposal_review"("course_proposal_review_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_area" ADD CONSTRAINT "course_area_course_fk" FOREIGN KEY ("course_id","program_code") REFERENCES "public"."course"("course_id","program_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_area" ADD CONSTRAINT "course_area_area_fk" FOREIGN KEY ("area_id","program_code") REFERENCES "public"."area"("area_id","program_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_proposal_review" ADD CONSTRAINT "course_proposal_review_program_code_program_code_fk" FOREIGN KEY ("program_code") REFERENCES "public"."program"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_proposal_review" ADD CONSTRAINT "course_proposal_review_proposal_fk" FOREIGN KEY ("course_proposal_id") REFERENCES "public"."course_proposal"("course_proposal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_proposal_review_area" ADD CONSTRAINT "course_proposal_review_area_review_fk" FOREIGN KEY ("course_proposal_review_id","program_code") REFERENCES "public"."course_proposal_review"("course_proposal_review_id","program_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_proposal_review_area" ADD CONSTRAINT "course_proposal_review_area_area_fk" FOREIGN KEY ("area_id","program_code") REFERENCES "public"."area"("area_id","program_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_proposal_review_transition" ADD CONSTRAINT "course_proposal_review_transition_review_fk" FOREIGN KEY ("course_proposal_review_id") REFERENCES "public"."course_proposal_review"("course_proposal_review_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_requirement_category" ADD CONSTRAINT "course_requirement_category_course_fk" FOREIGN KEY ("course_id","program_code") REFERENCES "public"."course"("course_id","program_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_requirement_category" ADD CONSTRAINT "course_requirement_category_category_fk" FOREIGN KEY ("requirement_category_id","program_code") REFERENCES "public"."requirement_category"("requirement_category_id","program_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_transition" ADD CONSTRAINT "course_transition_course_id_course_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("course_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering" ADD CONSTRAINT "offering_term_code_term_code_fk" FOREIGN KEY ("term_code") REFERENCES "public"."term"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering" ADD CONSTRAINT "offering_course_fk" FOREIGN KEY ("course_id","program_code") REFERENCES "public"."course"("course_id","program_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_area" ADD CONSTRAINT "offering_area_offering_id_offering_offering_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offering"("offering_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_area" ADD CONSTRAINT "offering_area_area_id_area_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("area_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_instructor" ADD CONSTRAINT "offering_instructor_offering_id_offering_offering_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offering"("offering_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_meeting" ADD CONSTRAINT "offering_meeting_offering_id_offering_offering_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offering"("offering_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_requirement_category" ADD CONSTRAINT "offering_requirement_category_offering_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offering"("offering_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_requirement_category" ADD CONSTRAINT "offering_requirement_category_category_fk" FOREIGN KEY ("requirement_category_id") REFERENCES "public"."requirement_category"("requirement_category_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_transition" ADD CONSTRAINT "offering_transition_offering_id_offering_offering_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offering"("offering_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_director" ADD CONSTRAINT "program_director_program_code_program_code_fk" FOREIGN KEY ("program_code") REFERENCES "public"."program"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_category" ADD CONSTRAINT "requirement_category_program_code_program_code_fk" FOREIGN KEY ("program_code") REFERENCES "public"."program"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_status_idx" ON "course" USING btree ("status");--> statement-breakpoint
CREATE INDEX "course_program_idx" ON "course" USING btree ("program_code");--> statement-breakpoint
CREATE INDEX "course_proposal_review_status_idx" ON "course_proposal_review" USING btree ("status");--> statement-breakpoint
CREATE INDEX "course_proposal_review_transition_review_idx" ON "course_proposal_review_transition" USING btree ("course_proposal_review_id","at");--> statement-breakpoint
CREATE INDEX "course_transition_course_idx" ON "course_transition" USING btree ("course_id","at");--> statement-breakpoint
CREATE INDEX "offering_status_idx" ON "offering" USING btree ("status");--> statement-breakpoint
CREATE INDEX "offering_term_idx" ON "offering" USING btree ("term_code");--> statement-breakpoint
CREATE INDEX "offering_course_idx" ON "offering" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "offering_meeting_offering_idx" ON "offering_meeting" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "offering_transition_offering_idx" ON "offering_transition" USING btree ("offering_id","at");