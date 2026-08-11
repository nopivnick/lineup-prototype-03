"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { listDirectory } from "@/db/read/directory";

import { clearActorCookie, requireActor, writeActorCookie } from "./actor";

/**
 * **The dev bar's two Server Actions** (issues/11, issues/79), and the only two
 * places the actor cookie is written.
 *
 * The cookie is written by a Server Action and never by the client, which is
 * what keeps its payload from becoming an interface: the browser posts a netid
 * and reads nothing back. Both of these are the actor-resolution shape every
 * later Server Action takes — resolve, refuse a `null`, then act — with no write
 * path behind them, because switching who you are is not a lifecycle move.
 *
 * **The SSO swap deletes this file.** It is the entry screen's other half.
 */

/**
 * Be one of the seed's thirteen. One click, one write, one netid.
 *
 * The netid is checked against the directory rather than trusted, because a
 * Server Action is a public endpoint and the switcher's whole claim is that it
 * makes you *one of the seed's people*. It is not a way to become an arbitrary
 * string: a netid `people` has never heard of is a real thing in this map — the
 * fixtures carry one on purpose — but it is a thing the seed writes, not a thing
 * a picker offers.
 *
 * `revalidatePath("/", "layout")` rather than a redirect, so switching leaves you
 * on the record you were reading. That is the point of the switcher: the same
 * class, watched offering different moves to different people.
 */
export async function beSomebody(netid: string): Promise<void> {
  const directory = await listDirectory();
  if (!directory.some((person) => person.netid === netid)) {
    throw new Error(`${netid} is not one of the seed's people.`);
  }

  await writeActorCookie(netid);
  revalidatePath("/", "layout");
}

/**
 * Stop being anybody — **and it needs somebody to be acting** (issues/11).
 *
 * `requireActor()` first, because an action that resolved a null actor and
 * carried on would be the fallback-user shape #11 rejected, wearing a different
 * hat. It is also the only way to reach the picker once a cookie exists, which
 * is what makes *no session → sign in* a state a reader can actually get back to.
 */
export async function beNobody(): Promise<void> {
  await requireActor();
  await clearActorCookie();
  redirect("/be-somebody");
}
