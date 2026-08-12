/**
 * **The dev bar's user list, against a real database pair** (issues/79).
 *
 * The switcher's claim is *the seed's thirteen people*, and the property behind
 * that number is the one asserted here: the list is **`person`, all of it, in
 * name order**, with whatever `classes` knows about those netids hung off the
 * side. Nothing filters it, so thirteen rows in the directory is thirteen entries
 * in the switcher, and the seed is what makes the count thirteen.
 *
 * It runs against `db/write/test-world.ts`'s small world rather than the seed's,
 * because the seed's thirteen are `db/seed.ts`'s subject and the property is the
 * same at eight. The world it does use carries the two cases that matter: a
 * person holding several roles, and a netid holding a role that the directory has
 * never heard of.
 */
import { describe, expect, test } from "vitest";

import { DATABASES_CONFIGURED, freshWorld, WHO } from "@/db/write/test-world";

import { directoryLists, listDirectory } from "./directory";

describe.skipIf(!DATABASES_CONFIGURED)("listDirectory", () => {
  test("is the whole directory, in name order, with each person's roles", async () => {
    await freshWorld();

    const directory = await listDirectory();

    expect(directory.map((person) => person.netid)).toEqual([
      WHO.advisor, //     AD Example
      WHO.coordinator, // CO Example
      WHO.instructor, //  DH Example
      WHO.areaHead, //    NA Example
      WHO.itpDirector, // PR Example
      WHO.imaDirector, // RC Example
      WHO.student, //     ST Example
      WHO.chair, //       TV Example
    ]);
    expect(directory.every((person) => person.displayName.endsWith(" Example"))).toBe(true);
  });

  test("shows every role a person holds, in the order lib/permissions declares them", async () => {
    await freshWorld();

    const directory = await listDirectory();
    const roles = (netid: string) => directory.find((person) => person.netid === netid)?.roles;

    // issues/11 refuses role-narrowing: an actor is always all of their roles at
    // once, so the label is all of them too.
    expect(roles(WHO.areaHead)).toEqual(["instructor", "area_head"]);
    expect(roles(WHO.chair)).toEqual(["chair"]);
  });

  test("does not invent a person out of a role grant", async () => {
    await freshWorld();

    const directory = await listDirectory();

    // `WHO.ghost` holds `instructor` and `people` has never heard of them —
    // the netid the roster refusals need. The list is the directory, so a
    // grant naming somebody outside it adds no entry to the switcher.
    expect(directory.some((person) => person.netid === WHO.ghost)).toBe(false);
  });
});

describe.skipIf(!DATABASES_CONFIGURED)("directoryLists", () => {
  test("agrees with the list the switcher renders", async () => {
    await freshWorld();

    // The predicate `beSomebody` refuses on, asked of one row. It has to answer
    // the same question the list does, or the picker would offer a person the
    // action then rejects.
    await expect(directoryLists(WHO.chair)).resolves.toBe(true);
    await expect(directoryLists(WHO.ghost)).resolves.toBe(false);
    await expect(directoryLists("nobody0000")).resolves.toBe(false);
  });
});
