"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Group, Text, UnstyledButton } from "@mantine/core";

/**
 * **The navigation deck** — every screen the app has, one row under the dev bar.
 *
 * **It lives in the layout, and that is the whole of *not on the picker*.**
 * `/be-somebody` is the one route outside the signed-in group (issues/11), so a
 * nav mounted here cannot reach it: there is no pathname check to keep in step
 * with the routes, and no way for a later screen to be added outside the group
 * and quietly get one.
 *
 * **A deck of its own rather than tabs inside the dev bar.** The two were
 * prototyped side by side and this is what settled it: **the SSO swap deletes
 * the dev bar** and does not delete the nav, so tabs living in that row would be
 * a move somebody has to remember to make later, on the ticket least likely to
 * be looking at navigation. The border between them is the seam that swap cuts
 * along.
 *
 * **The current item is a filled pill and not an underline.** Both were drawn;
 * the pill reads as *where you are* at a glance where a 2px rule reads as
 * decoration, and it carries weight and colour beside the fill, so a reader who
 * cannot tell the fill from the ground still has two signals and
 * `aria-current` besides.
 *
 * **The items are the caller's**, computed in the layout from the same
 * predicates the routes refuse with — a link nobody rendered is not a check
 * (issues/38, issues/42), and this component must not become a second place
 * where who-sees-what is decided.
 */
export type NavItem = {
  href: string;
  label: string;
  /**
   * Record-page prefixes this item stands for. A course page is somewhere
   * *within* the Catalog rather than somewhere else, and a reader who followed
   * a `↗` off a list should still be told where they are.
   */
  owns?: readonly string[];
};

export function SiteNav({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();

  return (
    <Box
      component="nav"
      aria-label="Sections"
      px="md"
      py={6}
      bd="0 0 1px 0 solid var(--mantine-color-default-border)"
    >
      <Group gap={2} wrap="nowrap">
        {items.map((item) => {
          const here = isHere(pathname, item);

          return (
            <UnstyledButton
              key={item.href}
              component={Link}
              href={item.href}
              aria-current={here ? "page" : undefined}
              px={10}
              py={4}
              style={{
                borderRadius: "var(--mantine-radius-sm)",
                background: here ? "var(--mantine-color-default-hover)" : "transparent",
              }}
            >
              <Text size="sm" fw={here ? 700 : 500} c={here ? undefined : "dimmed"}>
                {item.label}
              </Text>
            </UnstyledButton>
          );
        })}
      </Group>
    </Box>
  );
}

/**
 * Whether an item is the screen being read: its own route, or a record page
 * beneath one of the prefixes it stands for.
 *
 * **The `/` is load-bearing.** `startsWith("/propose")` is true of
 * `/proposals`, so a bare prefix test would light the wrong item the first time
 * two routes shared an opening — which two of these already do.
 */
function isHere(pathname: string, item: NavItem): boolean {
  return [item.href, ...(item.owns ?? [])].some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
}
