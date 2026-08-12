"use server";

import { revalidatePath } from "next/cache";

import { ROLES } from "@/db/read/actor-roles";
import { appointDirector } from "@/db/write/authorization";
import { WriteRefused, type Refusal } from "@/db/write/refusal";
import { writeToClasses } from "@/db/write/transaction";
import { writeFields } from "@/db/write/write-fields";
import { requireActor } from "@/lib/auth/actor";
import type { Role } from "@/lib/permissions";

/**
 * **A Server Action is an actor-resolution wrapper and nothing more** (issues/28,
 * issues/11, issues/81, issues/82).
 *
 * Resolve the actor, reject a null one, open the transaction, call the write path
 * in. Every check — the chair's clause, the four revocation invariants, standing
 * principle 6 — is inside `writeFields`, which is what lets the seed script and
 * `db/write/test-world.ts` be second callers of the same function and be checked
 * like anybody else.
 *
 * **Every write on this page is a field write.** `user_role` and `program_director`
 * are the Authorization field class, which belongs to no record — it is the chair's
 * page rather than anyone's rail — so each of the three acts below is one
 * `writeFields` call against `{ authorization: true }` and nothing here writes a row
 * itself.
 */

/**
 * The seven roles, as a set, because `role` arrives from a browser and a Server
 * Action is a public endpoint. It is `db/read/actor-roles.ts`'s list — itself read
 * off the map rather than typed out — for the same reason the Lineup's exposed
 * event union is read off the machine.
 */
const GRANTABLE: ReadonlySet<string> = new Set(ROLES);

/**
 * Grant one role to one person.
 *
 * **Refused by nothing at all** (issues/34): no invariant constrains who may hold a
 * role, and the qualification a role confers is checked by the writer of the
 * relationship — a roster row, an area-head assignment — rather than at the grant.
 * So a refusal reaching here means the actor stopped being the chair between the
 * render and the click, which is the affordance going stale exactly as designed.
 *
 * **The netid is never checked against `people`, deliberately.** The `user_role`
 * writer does not consult the directory (issues/9, issues/69), because a role that
 * gates whether somebody may be staffed has to be grantable ahead of the directory
 * feed. What stops a typo becoming a grant to nobody is that the page has no
 * free-text netid field: every netid it can send came out of a search over `people`
 * or off a record already on the page.
 */
export async function grantRole(netid: string, role: string): Promise<Refused> {
  const actor = await requireActor();
  const named = roleNamed(role);

  return refusalsFrom(() =>
    writeToClasses((open) =>
      writeFields(
        open,
        {
          record: { authorization: true },
          rows: [{ table: "user_role", op: "insert", values: { netid, role: named } }],
        },
        actor.netid,
      ),
    ),
  );
}

/**
 * Revoke one role from one person.
 *
 * A revoke is a `DELETE` and leaves no trace (issues/34): a `revoked_at` is how
 * `user_role` would drift into the temporal table issues/4 refused, since every
 * permission check would gain a `WHERE revoked_at IS NULL` and the one that forgot
 * it would silently restore a revoked director.
 *
 * The four refusals are already stated in the open beside the control, so one
 * arriving here means the world moved between the render and the click — a class
 * slated under an instructor, a course handed to this area head, a second chair
 * revoked in another tab.
 */
export async function revokeRole(netid: string, role: string): Promise<Refused> {
  const actor = await requireActor();
  const named = roleNamed(role);

  return refusalsFrom(() =>
    writeToClasses((open) =>
      writeFields(
        open,
        {
          record: { authorization: true },
          rows: [{ table: "user_role", op: "delete", key: { netid, role: named } }],
        },
        actor.netid,
      ),
    ),
  );
}

/**
 * **Appointing a director: one control on the person, two writes behind it**
 * (issues/34, issues/38).
 *
 * The act itself is `db/write/authorization.ts` — which rows one appointment needs
 * is the writer's side of the seam, not this one's, and an action that decided it
 * would be an action holding something rule-shaped. This resolves the actor, opens
 * the transaction and relays the refusal, which is the whole of what a Server
 * Action does here.
 */
export async function appointToProgram(netid: string, programCode: string): Promise<Refused> {
  const actor = await requireActor();

  return refusalsFrom(() =>
    writeToClasses((open) => appointDirector(open, { netid, programCode }, actor.netid)),
  );
}

/**
 * The refusal relayed rather than thrown, so the reader sees the sentence the
 * control would have carried had the page been re-read a moment later. It is a
 * **relay and not a rule**: the wording is the writer's.
 *
 * **A refusal revalidates too**, and for a sharper reason than success does: the
 * refusal reaching here means the page the reader is looking at is *known* to be
 * wrong, so returning the sentence without re-reading would leave a live control
 * that refuses identically on every further click until somebody reloads by hand.
 */
type Refused = { refusals: readonly Refusal[] } | null;

async function refusalsFrom(write: () => Promise<unknown>): Promise<Refused> {
  try {
    await write();
  } catch (thrown) {
    if (thrown instanceof WriteRefused) {
      revalidatePath("/roles");
      return { refusals: thrown.refusals };
    }
    throw thrown;
  }

  revalidatePath("/roles");
  return null;
}

function roleNamed(role: string): Role {
  if (!GRANTABLE.has(role)) {
    throw new Error(`${role} is not a role the department grants.`);
  }
  return role as Role;
}
