"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Box, Flex, Group, Stack, Text, UnstyledButton } from "@mantine/core";

import type { DirectoryPerson } from "@/db/read/directory";
import type { Actor } from "@/lib/auth/actor";
import type { Role } from "@/lib/permissions";

import { DevBar } from "./dev-bar";
import { PrototypeSwitcher, type PrototypeVariant } from "./prototype-switcher";

/**
 * **PROTOTYPE — throwaway.** Three navigation bars for the signed-in app,
 * switchable with `?variant=` from the floating bar at the bottom of the screen.
 *
 * > Three variants of the top-level nav, switchable via `?variant=`, mounted in
 * > the existing `(signed-in)` layout so every real page renders under each one.
 *
 * **It lives in the layout, and that is the whole answer to *not on
 * `/be-somebody`*.** The picker is the one route outside the signed-in group, so
 * a nav mounted here cannot reach it — no pathname check, and no way for a later
 * route to forget one.
 *
 * **The three disagree about structure, not about colour:**
 *
 * - **A — One bar.** The tabs go *into* the dev bar's row. The app gains no
 *   chrome height at all, and navigation reads as a peer of the identity strip.
 * - **B — Two decks.** The dev bar stays a strip on top; a full-width tab deck
 *   with an underline indicator sits beneath it. Navigation is the app's spine
 *   and the dev bar is the temporary thing above it — which is what the two
 *   actually are, since the SSO swap deletes the dev bar.
 * - **C — Rail.** A vertical rail on the left, grouped and labelled, with the
 *   page in the remaining column. The only shape with room to *name* the create
 *   routes rather than leave them to their own doors.
 *
 * **The gating is real, not mocked.** The item list is computed in the layout
 * from the same predicates the routes refuse with — `mayOpenRolesPage`,
 * `mayOpenProposals`, `mayProposeACourse` — so *absent, never disabled* is
 * something you can watch by switching person in the dev bar rather than
 * something this file asserts.
 *
 * **`Slate a class` in variant C is ungated, and that is the finding rather than
 * the bug.** There is no cheap *may this actor slate anything at all* predicate:
 * `maySlateFrom` is asked per program and `getSlateForm` is a full query, so a
 * nav item for it would need a new department-wide predicate, paid for on every
 * page in the app. That cost is part of what variant C is asking you to decide.
 *
 * Delete this file when the nav question is settled; fold the winner into
 * `layout.tsx` properly.
 */
export type NavItem = {
  href: string;
  label: string;
  /** Record-page prefixes this item lights up for — `/catalog` owns `/courses`. */
  owns?: readonly string[];
  group: "browse" | "decide" | "make";
};

const VARIANTS: readonly PrototypeVariant[] = [
  { key: "A", name: "One bar" },
  { key: "B", name: "Two decks" },
  { key: "C", name: "Rail" },
];

export type NavChrome = {
  actor: Actor;
  roles: readonly Role[];
  people: readonly DirectoryPerson[];
  items: readonly NavItem[];
};

export function NavPrototype({ children, ...chrome }: NavChrome & { children: React.ReactNode }) {
  const search = useSearchParams();
  const asked = search.get("variant")?.toUpperCase() ?? "";
  const variant = VARIANTS.some((each) => each.key === asked) ? asked : "A";

  // Every nav link carries the variant along, so you can walk the whole app in
  // one shape rather than falling back to A on the first click.
  const carried = variant === "A" ? null : variant;

  return (
    <>
      {variant === "A" ? <VariantA {...chrome} carried={carried}>{children}</VariantA> : null}
      {variant === "B" ? <VariantB {...chrome} carried={carried}>{children}</VariantB> : null}
      {variant === "C" ? <VariantC {...chrome} carried={carried}>{children}</VariantC> : null}
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </>
  );
}

type VariantProps = NavChrome & { carried: string | null; children: React.ReactNode };

/**
 * **A — One bar.** Tabs in the dev bar's own row, between the wordmark and the
 * identity menu. Zero added height, and the densest of the three; it is also the
 * one whose nav dies with the bar it is sitting in unless somebody moves it.
 */
function VariantA({ actor, roles, people, items, carried, children }: VariantProps) {
  const active = useActive();

  return (
    <>
      <DevBar
        actor={actor}
        roles={roles}
        people={people}
        nav={
          <Group component="nav" gap={2} ml="md">
            {items
              .filter((item) => item.group !== "make")
              .map((item) => (
                <UnstyledButton
                  key={item.href}
                  component={Link}
                  href={hrefWith(item.href, carried)}
                  px={10}
                  py={4}
                  style={{
                    borderRadius: "var(--mantine-radius-sm)",
                    background: active(item)
                      ? "var(--mantine-color-default-hover)"
                      : "transparent",
                  }}
                >
                  <Text size="sm" fw={active(item) ? 700 : 500} c={active(item) ? undefined : "dimmed"}>
                    {item.label}
                  </Text>
                </UnstyledButton>
              ))}
          </Group>
        }
      />
      {children}
    </>
  );
}

/**
 * **B — Two decks.** The identity strip on top, the nav deck beneath it. The
 * underline is the indicator, so the active tab is legible without colour, and
 * the deck is wide enough that a fifth and sixth item would still fit.
 */
function VariantB({ actor, roles, people, items, carried, children }: VariantProps) {
  const active = useActive();

  return (
    <>
      <DevBar actor={actor} roles={roles} people={people} />
      <Box
        component="nav"
        px="md"
        bd="0 0 1px 0 solid var(--mantine-color-default-border)"
      >
        <Group gap="lg" wrap="nowrap">
          {items
            .filter((item) => item.group !== "make")
            .map((item) => (
              <UnstyledButton
                key={item.href}
                component={Link}
                href={hrefWith(item.href, carried)}
                py="sm"
                style={{
                  borderBottom: active(item)
                    ? "2px solid var(--mantine-color-anchor)"
                    : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                <Text size="sm" fw={active(item) ? 700 : 500} c={active(item) ? undefined : "dimmed"}>
                  {item.label}
                </Text>
              </UnstyledButton>
            ))}
        </Group>
      </Box>
      {children}
    </>
  );
}

/**
 * **C — Rail.** Grouped and labelled, in the one arrangement with room to say
 * what the groups are for. *Browse* is what everybody gets, *Decide* is the two
 * screens the matrix gates, and *Make* is the pair of create routes that today
 * have doors of their own — `/propose` from the proposals heading (issues/42
 * having refused the Catalog as a second door) and `/slate` from the Course
 * page's rail. Putting them here **is** that second door, which is the argument
 * this variant exists to have.
 */
function VariantC({ actor, roles, people, items, carried, children }: VariantProps) {
  const active = useActive();

  const groups: readonly { key: NavItem["group"]; label: string }[] = [
    { key: "browse", label: "Browse" },
    { key: "decide", label: "Decide" },
    { key: "make", label: "Make" },
  ];

  return (
    <>
      <DevBar actor={actor} roles={roles} people={people} />
      <Flex align="flex-start">
        <Box
          component="nav"
          w={200}
          miw={200}
          py="lg"
          px="md"
          pos="sticky"
          top={0}
          // The divider is the rail, so it runs the height of the window rather
          // than the height of six links.
          mih="calc(100vh - 53px)"
          bd="0 1px 0 0 solid var(--mantine-color-default-border)"
        >
          <Stack gap="lg">
            {groups.map((group) => {
              const inGroup = items.filter((item) => item.group === group.key);
              if (inGroup.length === 0) return null;

              return (
                <Stack key={group.key} gap={2}>
                  <Text size="xs" tt="uppercase" fw={700} c="dimmed" mb={4} style={{ letterSpacing: 0.6 }}>
                    {group.label}
                  </Text>
                  {inGroup.map((item) => (
                    <UnstyledButton
                      key={item.href}
                      component={Link}
                      href={hrefWith(item.href, carried)}
                      px="xs"
                      py={6}
                      style={{
                        borderRadius: "var(--mantine-radius-sm)",
                        background: active(item)
                          ? "var(--mantine-color-default-hover)"
                          : "transparent",
                      }}
                    >
                      <Text
                        size="sm"
                        fw={active(item) ? 700 : 500}
                        c={active(item) ? undefined : "dimmed"}
                      >
                        {item.label}
                      </Text>
                    </UnstyledButton>
                  ))}
                </Stack>
              );
            })}
          </Stack>
        </Box>
        <Box flex={1} miw={0}>
          {children}
        </Box>
      </Flex>
    </>
  );
}

/**
 * Whether an item is the one the reader is on. Exact match, or a record page
 * beneath it — `/courses/abc` lights up Catalog, `/reviews/abc` lights up
 * Proposals — so a reader who followed a `↗` off a list still knows where they
 * are.
 *
 * The `+ "/"` is load-bearing: a bare `startsWith("/propose")` would light
 * `Propose a course` on the whole of `/proposals`.
 */
function useActive() {
  const pathname = usePathname();

  return (item: NavItem) =>
    [item.href, ...(item.owns ?? [])].some(
      (base) => pathname === base || pathname.startsWith(`${base}/`),
    );
}

function hrefWith(href: string, variant: string | null): string {
  return variant ? `${href}?variant=${variant}` : href;
}
