import { Group, Text } from "@mantine/core";

import type { StitchedName, StitchedPerson } from "@/db/read/stitch";

/**
 * **A person, and the one rendering `displayName` being nullable buys**
 * (issues/9, issues/37).
 *
 * A roster entry, a history line and an area head are never dropped for want of
 * a name, so every one of them can arrive with `displayName: null` — and the
 * fallback is the netid in monospace plus a quiet *no name on file*,
 * **deliberately not styled as an error**. It is not one: a netid is a real
 * identifier at NYU, the log keeps one forever, and the directory feed can stop
 * knowing somebody who is already on a roster. issues/69 kept the state
 * reachable in production while a checked seed cannot write it, which is why
 * three places on this one page can hit it.
 *
 * One component for all three, because the page states the fact three times and
 * a reader who learns the treatment on a history line should recognise it in the
 * rail. It moved up beside `stamp.ts` when the Offering page became the second
 * record page (issues/84), for the reason `fireCourseEvent` moved up when the
 * Course machine gained a second screen: two copies of a rendering the map spends
 * a paragraph on is how one of them quietly becomes an error state.
 *
 * **Pronouns are a prop and default to off.** issues/40 drew the line at *is
 * this person the record, or a fact about it*: the area head is presented as a
 * person and carries them; a history line's actor is the subject of a timestamp
 * and would read as noise.
 */
export function Named({
  who,
  bold = false,
  pronouns = false,
}: {
  who: StitchedName | StitchedPerson;
  bold?: boolean;
  pronouns?: boolean;
}) {
  const said = pronouns && "pronouns" in who ? who.pronouns : null;

  return (
    <>
      {who.displayName ? (
        <Text span size="sm" fw={bold ? 600 : undefined}>
          {who.displayName}
        </Text>
      ) : (
        <>
          <Text span size="sm" ff="monospace" fw={bold ? 600 : undefined}>
            {who.netid}
          </Text>
          <Text span size="xs" c="dimmed" fs="italic">
            {" "}
            no name on file
          </Text>
        </>
      )}
      {said ? (
        <Text span size="xs" c="dimmed">
          {" "}
          ({said})
        </Text>
      ) : null}
    </>
  );
}

/** The same person, as a block rather than inline — a table cell or a rail box. */
export function NamedLine(props: Parameters<typeof Named>[0]) {
  return (
    <Group gap={0} wrap="nowrap">
      <Named {...props} />
    </Group>
  );
}
