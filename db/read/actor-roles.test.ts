/**
 * **The read-side role lookup** (issues/11, issues/79), against a real database
 * pair.
 *
 * The claim worth a test is the one the seam is built around: this is keyed by
 * **netid**, it is a separate call from `getActor()`, and it answers for whoever
 * is asked about rather than for whoever is signed in. A person's roles are all
 * of them at once — issues/11 refuses role-narrowing — and a netid the department
 * has granted nothing gets an empty list rather than an error, because holding no
 * role is an ordinary state and not a second kind of `null`.
 */
import { describe, expect, test } from "vitest";

import { DATABASES_CONFIGURED, freshWorld, WHO } from "@/db/write/test-world";

import { getActorRoles } from "./actor-roles";

describe.skipIf(!DATABASES_CONFIGURED)("getActorRoles", () => {
  test("answers for the netid it is handed, in the order lib/permissions declares", async () => {
    await freshWorld();

    await expect(getActorRoles(WHO.areaHead)).resolves.toEqual(["instructor", "area_head"]);
    await expect(getActorRoles(WHO.chair)).resolves.toEqual(["chair"]);
    await expect(getActorRoles(WHO.student)).resolves.toEqual(["student"]);
  });

  test("a netid the department has granted nothing holds no roles, and that is not an error", async () => {
    await freshWorld();

    await expect(getActorRoles("nobody0000")).resolves.toEqual([]);
  });

  test("answers for a netid the directory has never heard of", async () => {
    await freshWorld();

    // `user_role` lives in `classes` and `person` lives in the other project, so
    // this lookup neither joins nor checks the directory. `WHO.ghost` holds
    // `instructor` and is nobody `people` knows — the writer is where that gets
    // refused (`peopleKnows`), never here.
    await expect(getActorRoles(WHO.ghost)).resolves.toEqual(["instructor"]);
  });
});
