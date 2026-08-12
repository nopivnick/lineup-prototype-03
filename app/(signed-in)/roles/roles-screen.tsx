"use client";

import { useState } from "react";
import { Alert, Badge, Button, Card, Group, ScrollArea, SimpleGrid, Stack, Text } from "@mantine/core";

import type { RoleHolder, RolesPage } from "@/db/read/roles";
import type { Refusal } from "@/db/read/shape";

import { RoleRecord, Refused } from "./role-record";
import { LABEL, named } from "./role-copy";
import { RolesSearch } from "./roles-search";

/**
 * **The roles page's screen** (issues/38): a read-only program strip, a person
 * list, and one record at a time.
 *
 * It **does not inherit the Catalog's `⋯ n` menu**, and a build agent reading
 * issues/37 alone would build it here. issues/37 rejected reasons-in-the-open *for
 * row height in a grouped table* and named it the strongest option it had; this
 * page is one record at a time, so the premise of that rejection is absent and the
 * rejected option wins — see `role-record.tsx`, where the refusals are.
 *
 * What **is** inherited is issues/14's one-object rule — the refused thing and its
 * explanation arrive as one value — and issues/37's *absent, never empty*: for a
 * non-chair the controls are gone and the refusals with them, decided by the server
 * shipping a `null` action rather than by anything computed here.
 */
export function RolesScreen({ page, search }: { page: RolesPage; search: string }) {
  const everybody = [...page.holders, ...page.directory];

  // **Selection is component state and not a query parameter**: it changes nothing
  // the server read. Every record on the page was computed in the same set-based
  // pass, so choosing a person is a rendering decision — and a selection that the
  // search has filtered away falls back to the first person still listed.
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = everybody.find((one) => one.netid === chosen) ?? everybody[0] ?? null;

  // A refusal that arrives *after* the click: the world moved between the render
  // and the button. The refusals the page already knows about are stated in the
  // open, beside the control they explain.
  const [refused, setRefused] = useState<readonly Refusal[] | null>(null);

  return (
    <Stack gap="lg">
      <ProgramStrip page={page} />

      {refused ? (
        <Alert color="orange" title="That write was refused" withCloseButton onClose={() => setRefused(null)}>
          <Stack gap={4}>
            {refused.map((refusal) => (
              <Refused key={refusal.sentence} refusal={refusal} />
            ))}
          </Stack>
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <PersonList page={page} search={search} selected={selected?.netid ?? null} onSelect={setChosen} />
        {selected ? (
          <RoleRecord holder={selected} page={page} onRefused={setRefused} />
        ) : (
          <Card withBorder padding="lg">
            <Text c="dimmed">Nobody here matches.</Text>
          </Card>
        )}
      </SimpleGrid>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// The program strip
// ---------------------------------------------------------------------------

/**
 * **Read-only, so there is one writer and not two** (issues/38): the appointing
 * happens on the person, where the role row and the program row are one act.
 *
 * A program with no director says so. Half of every director permission in the
 * matrix is a relationship row somebody has to have written, and an empty seat is
 * the one fact about the department that a person-centric page cannot otherwise
 * show — *LowRes has no director* would be an absence a reader had to already know
 * to look for.
 */
function ProgramStrip({ page }: { page: RolesPage }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: page.programs.length || 1 }} spacing="sm">
      {page.programs.map((program) => (
        <Card key={program.code} withBorder padding="sm">
          <Stack gap={2}>
            <Group gap="xs">
              <Text ff="monospace" fw={700}>
                {program.code}
              </Text>
              <Text size="sm" c="dimmed">
                {program.name}
              </Text>
            </Group>
            {program.directors.length === 0 ? (
              <Text size="sm" c="orange.8" fw={600}>
                No director
              </Text>
            ) : (
              <Text size="sm">{program.directors.map(named).join(", ")}</Text>
            )}
          </Stack>
        </Card>
      ))}
    </SimpleGrid>
  );
}

// ---------------------------------------------------------------------------
// The person list, and the search that is also the directory
// ---------------------------------------------------------------------------

/**
 * **Holders are listed and the directory is reached through the search box**
 * (issues/38).
 *
 * Listing everybody was rejected because the full-directory grid only works at
 * fixture scale — NYU's real `people` is thousands of rows, which would reopen the
 * paging issues/37 closed. **There is no free-text netid field**: a typo in one
 * grants a role to nobody and is indistinguishable from a legitimate grant made
 * ahead of the directory feed, so every netid this page can name came off a record
 * or out of a search.
 */
function PersonList({
  page,
  search,
  selected,
  onSelect,
}: {
  page: RolesPage;
  search: string;
  selected: string | null;
  onSelect: (netid: string) => void;
}) {
  return (
    <Card withBorder padding="sm">
      <Stack gap="sm">
        <RolesSearch
          search={search}
          placeholder={page.mayWrite ? "Search anyone in the directory" : "Search"}
        />

        {page.holders.length > 0 ? (
          <Stack gap={4}>
            <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
              Holds a role · {page.holders.length}
            </Text>
            <ScrollArea.Autosize mah={420}>
              <Stack gap={4}>
                {page.holders.map((holder) => (
                  <PersonButton
                    key={holder.netid}
                    holder={holder}
                    selected={holder.netid === selected}
                    onSelect={onSelect}
                  />
                ))}
              </Stack>
            </ScrollArea.Autosize>
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">
            Nobody who holds a role matches.
          </Text>
        )}

        {page.directory.length > 0 ? (
          <Stack gap={4}>
            <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
              Not on this list · grant a role to…
            </Text>
            {page.directory.map((holder) => (
              <PersonButton
                key={holder.netid}
                holder={holder}
                selected={holder.netid === selected}
                onSelect={onSelect}
              />
            ))}
          </Stack>
        ) : null}

        {page.mayWrite && search && page.holders.length === 0 && page.directory.length === 0 ? (
          <Text size="sm" c="dimmed">
            Nobody in the directory matches. A role can only be granted to somebody{" "}
            <code>people</code> knows.
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}

function PersonButton({
  holder,
  selected,
  onSelect,
}: {
  holder: RoleHolder;
  selected: boolean;
  onSelect: (netid: string) => void;
}) {
  const held = holder.roles.filter((one) => one.held);

  return (
    <Button
      variant={selected ? "light" : "subtle"}
      color={selected ? "blue" : "gray"}
      justify="space-between"
      h="auto"
      py={6}
      onClick={() => onSelect(holder.netid)}
      rightSection={
        <Group gap={4} wrap="wrap" justify="flex-end">
          {held.length === 0 ? (
            <Text size="xs" c="dimmed">
              no roles yet
            </Text>
          ) : (
            held.map((one) => (
              <Badge key={one.role} size="xs" variant={one.role === "chair" ? "filled" : "light"}>
                {LABEL[one.role]}
              </Badge>
            ))
          )}
        </Group>
      }
    >
      <Group gap={6} wrap="nowrap">
        <PersonName holder={holder} />
        {holder.isActor ? (
          <Badge size="xs" variant="outline" color="gray">
            you
          </Badge>
        ) : null}
      </Group>
    </Button>
  );
}

/**
 * **A netid with no `people` row renders**, with issues/37's treatment: the netid in
 * monospace and a quiet *no name on file*, deliberately not styled as an error. A
 * role that gates whether somebody may be staffed must not be invisible to the only
 * page that can revoke it.
 */
function PersonName({ holder }: { holder: RoleHolder }) {
  if (holder.displayName) {
    return <Text size="sm">{holder.displayName}</Text>;
  }
  return (
    <Group gap={6} wrap="nowrap">
      <Text size="sm" ff="monospace">
        {holder.netid}
      </Text>
      <Text size="xs" c="dimmed" fs="italic">
        no name on file
      </Text>
    </Group>
  );
}
