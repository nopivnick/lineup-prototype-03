"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ActionIcon, Group, Paper, Text } from "@mantine/core";

/**
 * **PROTOTYPE — throwaway.** The floating variant switcher.
 *
 * Not part of the design being evaluated: it is deliberately a high-contrast
 * pill pinned to the bottom of the viewport so nobody mistakes it for chrome the
 * app is proposing to keep. It writes the variant into the URL, so a variant is
 * shareable and survives a reload, and it never renders in a production build.
 *
 * Delete this file when the nav question is settled.
 */
export type PrototypeVariant = { key: string; name: string };

export function PrototypeSwitcher({
  variants,
  current,
  param = "variant",
}: {
  variants: readonly PrototypeVariant[];
  current: string;
  param?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const at = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

  const go = useCallback(
    (step: number) => {
      const next = variants[(at + step + variants.length) % variants.length];
      if (!next) return;
      const params = new URLSearchParams(search.toString());
      params.set(param, next.key);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [at, param, pathname, router, search, variants],
  );

  // `←` / `→` cycle too, except while something is being typed into.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, select, [contenteditable]")
      ) {
        return;
      }
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  // A stray merge cannot ship the bar to a reader.
  if (process.env.NODE_ENV === "production") return null;

  const showing = variants[at];

  return (
    <Paper
      pos="fixed"
      bottom={16}
      left="50%"
      withBorder
      shadow="md"
      radius="xl"
      px={6}
      py={4}
      style={{ transform: "translateX(-50%)", zIndex: 400 }}
    >
      <Group gap={4} wrap="nowrap">
        <ActionIcon variant="subtle" radius="xl" onClick={() => go(-1)} aria-label="Previous variant">
          ‹
        </ActionIcon>
        <Text size="xs" fw={600} px={4} style={{ whiteSpace: "nowrap" }}>
          nav {showing?.key} — {showing?.name}
        </Text>
        <ActionIcon variant="subtle" radius="xl" onClick={() => go(1)} aria-label="Next variant">
          ›
        </ActionIcon>
      </Group>
    </Paper>
  );
}
