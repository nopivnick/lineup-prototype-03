"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader, TextInput } from "@mantine/core";

/**
 * **The search box, and it lives in the URL** (issues/37, issues/81, issues/82).
 *
 * Nothing here filters anything: it writes the query string and the server re-reads
 * through `getRolesPage`, which is the only thing on this screen that may write a
 * `WHERE` clause. It is **one box doing two things**, which is what issues/38
 * settled — it narrows the people who already hold something, and for a chair it
 * reaches past them into `people`, which is what makes granting possible with no
 * free-text netid field.
 *
 * The debounce, and the *follow the URL only when it changed for a reason that is
 * not this box* test, are the Catalog's (issues/81): without the second one the
 * server's echo of our own push lands mid-keystroke and silently wipes what was
 * typed while it was in flight.
 *
 * **This is the third copy of that device**, after `catalog-filters.tsx` and
 * `lineup-filters.tsx`. Those two carry a four-field draft and this one carries a
 * single string, so folding all three into one hook is a change to two screens this
 * ticket does not touch — recorded here rather than left for somebody to notice.
 */
export function RolesSearch({ search, placeholder }: { search: string; placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startNavigating] = useTransition();

  const [draft, setDraft] = useState(search);
  const incoming = urlFor(pathname, search);
  const [pushed, setPushed] = useState(incoming);
  const [followed, setFollowed] = useState(incoming);

  if (followed !== incoming) {
    setFollowed(incoming);
    if (incoming !== pushed) {
      setPushed(incoming);
      setDraft(search);
    }
  }

  const push = useCallback(
    (next: string) => {
      const url = urlFor(pathname, next);
      setPushed(url);
      startNavigating(() => router.replace(url));
    },
    [pathname, router],
  );

  useEffect(() => {
    if (urlFor(pathname, draft) === pushed) return;
    const settle = setTimeout(() => push(draft), 250);
    return () => clearTimeout(settle);
  }, [draft, pushed, pathname, push]);

  return (
    <TextInput
      label="Search"
      description="Name or netid"
      placeholder={placeholder}
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      rightSection={pending ? <Loader size="xs" /> : null}
    />
  );
}

function urlFor(pathname: string, search: string): string {
  const query = new URLSearchParams();
  if (search) query.set("q", search);
  const suffix = query.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}
