"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Group, Loader, Select, Text, TextInput } from "@mantine/core";

export type FilterOption = { value: string; label: string };

export type ChosenFilters = {
  search: string;
  programCode: string;
  status: string;
};

/**
 * **The filters, and they live in the URL** (issues/37, issues/81).
 *
 * Nothing here filters anything: it writes the query string and the server
 * re-reads through `getCatalogPage`, which is the only thing in the skeleton
 * that may write a `WHERE` clause. That is what makes *`Retired` is hidden by
 * the filter's default and not by the query* a true statement rather than a
 * hopeful one — the default is a value this component can change, and changing
 * it reaches the retired courses.
 *
 * The current values arrive as **props** rather than out of `useSearchParams`,
 * so this component reads no router state and needs no Suspense boundary around
 * it; the server already knows what it filtered by, having done the filtering.
 */
export function CatalogFilterBar({
  chosen,
  programs,
  statuses,
  matched,
}: {
  chosen: ChosenFilters;
  programs: readonly FilterOption[];
  statuses: readonly FilterOption[];
  matched: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startNavigating] = useTransition();

  /**
   * **One draft holds all three, and it is the only thing a push reads.**
   *
   * The search box is typed into and pushes a beat later, while the two selects
   * push on click — so for a quarter of a second the three filters disagree with
   * the URL, and the two of them that are *not* being edited must still come
   * from somewhere. Taking them from the props was wrong twice over: a select
   * changed inside the debounce window was reverted when the pending timer fired
   * with the stale value it had captured, and a select push rebuilt the query
   * string from the last *committed* search rather than what was in the box.
   */
  const [draft, setDraft] = useState<ChosenFilters>(chosen);

  const incoming = urlFor(pathname, chosen);
  const [pushed, setPushed] = useState(incoming);
  const [followed, setFollowed] = useState(incoming);

  /**
   * Following the URL when it changes for a reason that is **not this bar** — a
   * back button, a shared link — adjusted during render rather than in an
   * effect, and only when the arriving URL is not the one we ourselves last
   * pushed. Without that second test the server's echo of our own push lands
   * mid-keystroke and wipes whatever was typed while it was in flight, silently:
   * the draft then matches the URL, so nothing pushes it and the character is
   * gone rather than late.
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
      <TextInput
        label="Search"
        description="Title and number"
        placeholder="ITPG-GT 2233, Physical Computing"
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
        w={240}
      />

      <Select
        label="Status"
        data={[...statuses]}
        value={draft.status}
        onChange={(value) => edit({ ...draft, status: value ?? DEFAULT_VIEW })}
        allowDeselect={false}
        w={240}
      />

      <Group gap="xs" pb={6}>
        {pending ? <Loader size="xs" /> : null}
        <Text size="sm" c="dimmed">
          {matched} {matched === 1 ? "course" : "courses"}
        </Text>
      </Group>
    </Group>
  );
}

/** The default status view is the absence of the parameter, so a bare `/catalog` is it. */
const DEFAULT_VIEW = "default";

function urlFor(pathname: string, chosen: ChosenFilters): string {
  const query = new URLSearchParams();
  if (chosen.search) query.set("q", chosen.search);
  if (chosen.programCode) query.set("program", chosen.programCode);
  if (chosen.status && chosen.status !== DEFAULT_VIEW) query.set("status", chosen.status);
  const suffix = query.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}
