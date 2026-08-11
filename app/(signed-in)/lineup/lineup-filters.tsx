"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Group, Loader, Select, Text, TextInput } from "@mantine/core";

export type FilterOption = { value: string; label: string };

export type ChosenFilters = {
  termCode: string;
  search: string;
  programCode: string;
  status: string;
};

/**
 * **The filters, and they live in the URL** (issues/37, issues/81, issues/82).
 *
 * Nothing here filters anything: it writes the query string and the server re-reads
 * through `getLineupPage`, which is the only thing on this screen that may write a
 * `WHERE` clause. The same shape as the Catalog's bar, with one filter that behaves
 * differently — **the term has no empty value.** Clearing a term is not a wider view
 * of the Lineup, it is a Lineup of nothing, because the view is term-scoped by
 * definition (issues/9).
 *
 * The current values arrive as **props** rather than out of `useSearchParams`, so
 * this component reads no router state and needs no Suspense boundary around it; the
 * server already knows what it filtered by, having done the filtering.
 */
export function LineupFilterBar({
  chosen,
  terms,
  programs,
  statuses,
  matched,
}: {
  chosen: ChosenFilters;
  terms: readonly FilterOption[];
  programs: readonly FilterOption[];
  statuses: readonly FilterOption[];
  matched: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startNavigating] = useTransition();

  /**
   * **One draft holds all four, and it is the only thing a push reads.**
   *
   * The search box is typed into and pushes a beat later, while the three selects
   * push on click — so for a quarter of a second the filters disagree with the URL,
   * and the ones that are *not* being edited must still come from somewhere. Taking
   * them from the props was wrong twice over: a select changed inside the debounce
   * window was reverted when the pending timer fired with the stale value it had
   * captured, and a select push rebuilt the query string from the last *committed*
   * search rather than what was in the box. Settled in the Catalog's bar (issues/81)
   * and inherited here rather than re-derived.
   */
  const [draft, setDraft] = useState<ChosenFilters>(chosen);

  const incoming = urlFor(pathname, chosen);
  const [pushed, setPushed] = useState(incoming);
  const [followed, setFollowed] = useState(incoming);

  /**
   * Following the URL when it changes for a reason that is **not this bar** — a back
   * button, a shared link — adjusted during render rather than in an effect, and only
   * when the arriving URL is not the one we ourselves last pushed. Without that
   * second test the server's echo of our own push lands mid-keystroke and wipes
   * whatever was typed while it was in flight, silently.
   */
  if (followed !== incoming) {
    setFollowed(incoming);
    if (incoming !== pushed) {
      setPushed(incoming);
      setDraft(chosen);
    }
  }

  const push = useCallback(
    (next: ChosenFilters) => {
      const url = urlFor(pathname, next);
      setPushed(url);
      startNavigating(() => router.replace(url));
    },
    [pathname, router],
  );

  const edit = (next: ChosenFilters) => {
    setDraft(next);
    push(next);
  };

  useEffect(() => {
    if (urlFor(pathname, draft) === pushed) return;
    const settle = setTimeout(() => push(draft), 250);
    return () => clearTimeout(settle);
  }, [draft, pushed, pathname, push]);

  return (
    <Group align="flex-end" gap="sm">
      <Select
        label="Term"
        description="Not optional"
        data={[...terms]}
        value={draft.termCode}
        onChange={(value) => edit({ ...draft, termCode: value ?? draft.termCode })}
        allowDeselect={false}
        w={180}
      />

      <TextInput
        label="Search"
        description="Title, number, instructor"
        placeholder="Live Web, Nora Applebaum, na2481"
        value={draft.search}
        onChange={(event) => setDraft({ ...draft, search: event.currentTarget.value })}
        w={280}
      />

      <Select
        label="Program"
        data={[{ value: "", label: "Every program" }, ...programs]}
        value={draft.programCode}
        onChange={(value) => edit({ ...draft, programCode: value ?? "" })}
        allowDeselect={false}
        w={220}
      />

      <Select
        label="State"
        data={[...statuses]}
        value={draft.status}
        onChange={(value) => edit({ ...draft, status: value ?? ANY_VIEW })}
        allowDeselect={false}
        w={180}
      />

      <Group gap="xs" pb={6}>
        {pending ? <Loader size="xs" /> : null}
        <Text size="sm" c="dimmed">
          {matched} {matched === 1 ? "section" : "sections"}
        </Text>
      </Group>
    </Group>
  );
}

/** *Any state* is the absence of the parameter, so a bare `/lineup` is it. */
const ANY_VIEW = "any";

function urlFor(pathname: string, chosen: ChosenFilters): string {
  const query = new URLSearchParams();
  // The term is always written, even when it is the newest one: a shared link to the
  // Lineup should keep showing the term it was shared about after a new term opens.
  if (chosen.termCode) query.set("term", chosen.termCode);
  if (chosen.search) query.set("q", chosen.search);
  if (chosen.programCode) query.set("program", chosen.programCode);
  if (chosen.status && chosen.status !== ANY_VIEW) query.set("status", chosen.status);
  const suffix = query.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}
