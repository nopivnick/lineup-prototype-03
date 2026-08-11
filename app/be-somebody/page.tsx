import { redirect } from "next/navigation";
import { Container, Stack, Text, Title } from "@mantine/core";

import { listDirectory } from "@/db/read/directory";
import { getActor } from "@/lib/auth/actor";

import { Picker } from "./picker";

export const metadata = { title: "Be somebody — ITP/IMA catalog" };

/**
 * **The picker** (issues/11, issues/79). What a reader with no cookie sees, and
 * the only route outside the signed-in group.
 *
 * It redirects once you are somebody, which is what makes one click here land you
 * in the app: `beSomebody` revalidates the layout, this route re-renders, and by
 * then `getActor()` has an answer. The dev bar is the switcher from that point
 * on — this screen is the entry, and *stop being somebody* is how you get back.
 *
 * The list it reads is subject to no tier, because there is no actor yet to have
 * a tier (issues/34, and `listDirectory`).
 */
export default async function BeSomebodyPage() {
  if (await getActor()) {
    redirect("/");
  }

  const people = await listDirectory();

  return (
    <Container size="xs" py="xl">
      <Stack gap="md">
        <Stack gap={4}>
          <Title order={1}>Be somebody</Title>
          <Text c="dimmed" size="sm">
            The skeleton has no login. Pick one of the seed&rsquo;s {people.length} people and the
            department&rsquo;s records will offer you their moves — and only theirs. Switching is one
            click from the bar at the top, and what it remembers is a netid.
          </Text>
        </Stack>
        <Picker people={people} />
      </Stack>
    </Container>
  );
}
