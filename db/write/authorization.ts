import "server-only";

import { holdsRole } from "./rules";
import type { Netid, OpenTransaction } from "./transaction";
import { writeFields } from "./write-fields";

/**
 * **Appointing a director: two writes that are one act** (issues/34, issues/38,
 * issues/51).
 *
 * **Not a fifth write path.** It performs no check, writes no row and refuses
 * nothing: it decides which of the two rows the act needs and hands them to
 * `writeFields`, which is where the chair's clause, standing principle 6 and every
 * other rule still live. The four write paths are still four.
 *
 * It lives here rather than in the roles page's Server Action because that action
 * is an **actor-resolution wrapper and nothing more** (issues/28, issues/81): a
 * question about the world, asked to shape a payload, is the writer's side of the
 * seam and not the page's. Putting it here is also what lets
 * `db/read/roles.test.ts` exercise the act itself rather than a copy of it.
 *
 * **The role row rides along with the program and is inserted only if absent**, so
 * the chair is never asked to think about whether this person is a newcomer or an
 * existing director gaining a second program. `holdsRole` is asked **inside the
 * caller's transaction**, which is the only place it can be asked without being
 * stale by the time it is used — and principle 6 is then checked by `writeFields`
 * against the state this write *leaves* rather than the one it found, so the
 * newcomer half is not refused for lacking a role the same call grants.
 *
 * There is **no un-appoint**: `SEED_ONLY` in `docs/fixtures/fixtures.ts` records
 * the consequence — a program with no director is seedable and unreachable at
 * runtime — and names the missing piece as a control rather than a rule
 * (issues/49).
 */
export async function appointDirector(
  open: OpenTransaction,
  appointment: { netid: Netid; programCode: string },
  actor: Netid,
): Promise<void> {
  const { netid, programCode } = appointment;
  const alreadyQualified = await holdsRole(open.tx, netid, "program_director");

  await writeFields(
    open,
    {
      record: { authorization: true },
      rows: [
        ...(alreadyQualified
          ? []
          : [
              {
                table: "user_role" as const,
                op: "insert" as const,
                values: { netid, role: "program_director" },
              },
            ]),
        { table: "program_director", op: "insert", values: { program_code: programCode, netid } },
      ],
    },
    actor,
  );
}
