"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Group, Loader, SegmentedControl, Text } from "@mantine/core";

import { urlFor, VIEWS, type ProposalsView } from "./views";

/**
 * **The four filters, and they live in the URL** (issues/42, issues/81,
 * issues/85).
 *
 * Nothing here filters anything: it writes the query string and the server
 * re-reads through `getProposalsPage`, which is the only thing on this screen
 * that may narrow a row set. The current value arrives as a **prop** rather than
 * out of `useSearchParams`, so this component reads no router state and needs no
 * Suspense boundary around it — the server already knows what it filtered by,
 * having done the filtering.
 *
 * It is a segmented control rather than the Lineup's row of selects because the
 * four are **one question with four answers** rather than four independent
 * narrowings: *In play* and *Rejected* are not composable, and a reader picking
 * one is choosing which pile of work to look at. There is no draft state and no
 * debounce for the same reason the Catalog's search box needs both and this does
 * not — a click is already a complete answer.
 *
 * The four themselves live in `./views`, which the page reads too. See that
 * module for why they are not declared here.
 */
export function ProposalsFilterBar({
  view,
  matched,
}: {
  view: ProposalsView;
  matched: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startNavigating] = useTransition();

  return (
    <Group gap="sm">
      <SegmentedControl
        value={view}
        onChange={(next) => startNavigating(() => router.replace(urlFor(pathname, next)))}
        data={[...VIEWS]}
      />
      <Group gap="xs">
        {pending ? <Loader size="xs" /> : null}
        <Text size="sm" c="dimmed">
          {matched} {matched === 1 ? "review" : "reviews"}
        </Text>
      </Group>
    </Group>
  );
}
