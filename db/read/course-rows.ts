import "server-only";

import { sql, type SQL } from "drizzle-orm";
import type { EventFromLogic } from "xstate";

import {
  area,
  course,
  courseArea,
  courseRequirementCategory,
  requirementCategory,
} from "@/db/classes/schema";
import {
  notYours,
  permitted,
  routesFor,
  stillTeaching,
  type ActorFacts,
  type Subject,
} from "@/db/write/rules";
import { machine as courseMachine, type CourseState } from "@/lib/machines/course.machine";

import { qualified } from "./qualified";
import type { OwnTag, PermittedAction } from "./shape";

/**
 * **What the Catalog row and the Course page agree a Course is** (issues/37,
 * issues/41, issues/83).
 *
 * The fifth module in `db/read/` that is not one of the seven views, and the
 * sibling of `offering-rows.ts`: what makes something one of the seven is that
 * it is a **view**, and two views of one entity must not each intersect the
 * rules for themselves. A Catalog row and a Course page offering different moves
 * on the same course — or naming the same refusal in two wordings — is the drift
 * issues/14 exists to prevent, one level up from the sentence.
 */

/**
 * The Course machine's event names, read off the machine rather than restated
 * (issues/13's rule that a hand-maintained second list is the thing that gets
 * forgotten).
 *
 * Named `CourseEventName` and not `CourseEvent` because
 * `db/write/apply-transition.ts` already owns that name for the richer thing a
 * *transition* carries — the event plus its payload and its optional `reason`. A
 * row offers a move; the writer takes the move and what came with it.
 */
export type CourseEventName = EventFromLogic<typeof courseMachine>["type"];

/**
 * **A course's two tag sets, as JSON beside the course row** (issues/25,
 * issues/37).
 *
 * Both are the course's **own** program's — the composite foreign keys check
 * `program_code` against the course on one side and the area or category on the
 * other, so they cannot be anything else (issues/30). That is why they render
 * unlabelled: the only program name a screen ever puts against a record other
 * than its own is a seat-sharing grant, and those attach to a section.
 *
 * Shared because the Lineup states them on its group header and the Course page
 * states them in *Where it sits*, and they are the same two lists read the same
 * way. `qualified` is not decoration here — see its own module.
 */
export const COURSE_TAGS = {
  areas: sql<TagJson>`(
    SELECT coalesce(json_agg(json_build_object('name', ${qualified(area.name)}) ORDER BY ${qualified(area.name)}), '[]'::json)
    FROM ${courseArea}
    JOIN ${area} ON ${qualified(area.areaId)} = ${qualified(courseArea.areaId)}
    WHERE ${qualified(courseArea.courseId)} = ${qualified(course.courseId)}
  )`,
  requirementCategories: sql<TagJson>`(
    SELECT coalesce(json_agg(json_build_object('name', ${qualified(requirementCategory.name)}) ORDER BY ${qualified(requirementCategory.name)}), '[]'::json)
    FROM ${courseRequirementCategory}
    JOIN ${requirementCategory}
      ON ${qualified(requirementCategory.requirementCategoryId)}
       = ${qualified(courseRequirementCategory.requirementCategoryId)}
    WHERE ${qualified(courseRequirementCategory.courseId)} = ${qualified(course.courseId)}
  )`,
} satisfies Record<string, SQL<unknown>>;

/** The shape of what `COURSE_TAGS` hands back, mapped into `OwnTag[]` before it leaves a module. */
export type TagJson = readonly OwnTag[];

/**
 * **Machine legality AND invariants AND permissions, intersected here** — the
 * same three terms in the same order as `applyTransition`, computed one step
 * earlier so a screen can say what it offers before anybody clicks (issues/28,
 * issues/37).
 *
 * Every move the machine offers from this state is listed, the permitted ones
 * clickable and the refused ones carrying their reason: the Catalog renders the
 * set as `⋯ n`, whose count says *nothing to do here* without opening anything,
 * and the Course page renders it as buttons with the refusals stated beneath
 * (issues/40, issues/41). **Two treatments, one set** — it is not a second source
 * of truth, which is why it is computed here and not in either screen's module.
 *
 * A move the machine does not offer at all is **absent** rather than greyed — the
 * state is not a refusal, it is the shape of the lifecycle, and `Retired` is
 * final, so it offers nothing anywhere.
 *
 * The `retire` guard is the one invariant a Course carries, and its refusal is
 * `stillTeaching`'s sentence rather than one written here, so what the greyed
 * control says and what the writer throws cannot drift apart.
 */
export function courseActionsFor(
  status: CourseState,
  record: { programCode: string; areaHead: string | null },
  live: readonly { termCode: string; status: string }[],
  facts: ActorFacts,
): readonly PermittedAction<CourseEventName>[] {
  const subject: Subject = { course: record };

  return movesFrom(status).map((event) => {
    if (event === "retire" && live.length > 0) {
      return { event, permitted: false, refusal: stillTeaching(live) };
    }

    const routes = routesFor("course", event);
    return permitted(routes, facts, subject)
      ? { event, permitted: true }
      : { event, permitted: false, refusal: notYours(event, "this course", routes, subject) };
  });
}

/**
 * The edges the machine draws out of one state, **guards included**, read off
 * the machine itself.
 *
 * `.can()` is deliberately not what asks: it folds the guard in, and a guarded
 * edge is precisely the one that has to be listed and greyed with its reason.
 */
function movesFrom(status: CourseState): readonly CourseEventName[] {
  return courseMachine.states[status].ownEvents as readonly CourseEventName[];
}

/**
 * **Derived, not stored** — true when `course_area` is empty or
 * `course.area_head` is null (issues/37), naming which of the two is missing so
 * the marker can say it.
 *
 * This is issues/32's create-time gate made visible one step earlier, where a
 * director can act on it, and it is the closest the Catalog gets to a Course
 * state that issues/32 proved could not exist: the machine is flat and
 * `Approved ⇄ Revising` has no room for a fourth state. What could not be a state
 * is a derived marker instead.
 *
 * `null` is a course that can be offered, so the marker is an object exactly when
 * there is something to say. The Course page states the same fact in the same
 * two halves, because area and head are separate assignments and *half missing*
 * is a real state with its own sentence (issues/43).
 */
export type NotOfferableYet = { missingArea: boolean; missingAreaHead: boolean } | null;

export function notOfferableYet(areaCount: number, areaHead: string | null): NotOfferableYet {
  const missingArea = areaCount === 0;
  const missingAreaHead = areaHead === null;
  return missingArea || missingAreaHead ? { missingArea, missingAreaHead } : null;
}
