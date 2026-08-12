import { redirect } from "next/navigation";
import { Button, Container, Group, Stack, Text, Title } from "@mantine/core";

import { getProposalsPage, mayProposeACourse } from "@/db/read/proposals";
import { getActor, type Actor } from "@/lib/auth/actor";

import { ProposalsFilterBar } from "./proposals-filters";
import { ProposalsList } from "./proposals-list";
import { asked } from "./views";

/**
 * **The proposals list** — one group per proposal, one row per review, and every
 * program's verdict on the group header (issues/42, issues/85).
 *
 * This page holds no database handle and writes no `WHERE` clause. It calls one
 * view-shaped read module and receives finished groups: the shared body with its
 * proposer's name already stitched in from the other project, the verdict chips,
 * what this actor may do about each review and the refusal for what they may not.
 * Everything it does with what comes back is rendering.
 *
 * **Proposing starts here**, as a control beside the heading, because the way in
 * should be where the reader already is. The Catalog was rejected as a second
 * door: it is the one person-free, single-database read in the skeleton, and
 * hanging a create action off it starts the drift toward it needing to know who
 * you are.
 *
 * **The three empty states are decided here and not in the read module**, which
 * is the Lineup's arrangement with one more case. *Nothing matches those filters*
 * and *you have never proposed anything* are both no groups, and which one a
 * reader is looking at is a fact about what they clicked and about what Tier 3's
 * arms reach — the module knows the filter it was asked about and nothing about
 * either.
 */
export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/be-somebody");

  // A query parameter is a public input, and `asked` narrows it to one of the
  // four the bar offers — see `./views` for why the four are declared neither
  // here nor beside the bar.
  const params = await searchParams;
  const view = asked(one(params.view));

  const answer = await getProposalsPage(actor, { view });
  if (!answer.visible) return <NoScreen />;

  const groups = answer.page;
  const reviews = groups.reduce((total, group) => total + group.reviews.length, 0);
  const mayPropose = await mayProposeACourse(actor);

  /**
   * **Asked only on the empty path, and only when a filter could be the reason.**
   *
   * The default view hides finished reviews, so *no groups* on it is ambiguous in
   * a way *no groups* on the Lineup never was: an instructor who has never
   * proposed anything and a director whose every review is approved both land on
   * an empty screen, and they need opposite sentences. One more read answers it,
   * on a path where the first read found nothing to render anyway.
   */
  const reachable = groups.length > 0 || (view !== "any" && (await anythingReachable(actor)));

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/*
          **The control sits beside the heading**, which is where the decision
          that proposing starts here actually shows: the description is width-
          bounded so the button keeps the top-right corner rather than wrapping
          under the prose.
        */}
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={4} maw={720}>
            <Title order={1}>Proposals</Title>
            <Text c="dimmed">
              A proposal is one description read by however many programs it was sent to. Each
              decides for itself, so the reviews beneath a proposal can disagree — and the chips on
              its header say what every one of them has decided.
            </Text>
          </Stack>
          {mayPropose ? <Propose /> : null}
        </Group>

        {reachable ? (
          <>
            <ProposalsFilterBar view={view} matched={reviews} />
            {groups.length > 0 ? (
              <ProposalsList groups={groups} />
            ) : (
              <Nothing
                heading="Nothing matches that filter"
                body="Every review you can reach is in another state. Try Any state, which holds the approved and the rejected ones too."
              />
            )}
          </>
        ) : mayPropose ? (
          <NeverProposed />
        ) : (
          <Nothing
            heading="No proposals to show you"
            body="Proposals reach you three ways: you direct a program one was sent to, you wrote it, or you are the area head on a review of it. None applies right now."
          />
        )}
      </Stack>
    </Container>
  );
}

/**
 * **The empty state is the invitation** (issues/42, issues/43). An instructor who
 * has never proposed anything sees a screen whose entire content is an
 * explanation and a button — no filter bar above it, because there is nothing for
 * a filter to be about, and the one thing they can do here is the one thing on
 * screen.
 */
function NeverProposed() {
  return (
    <Stack gap="sm" maw={620}>
      <Title order={2} size="h3">
        You have not proposed a course yet
      </Title>
      <Text c="dimmed">
        A proposal is one description sent to whichever programs you want to teach it in. Each
        decides for itself, and any that approves mints its own course, with its own number, in its
        own catalog. Nothing is approved by submitting it.
      </Text>
      <Group>
        <Propose />
      </Group>
    </Stack>
  );
}

/**
 * The control, and it is the same one in both places it appears. It points at
 * `/propose`, which is the create form's own ticket — the route does not exist
 * yet, and the affordance is this screen's to state either way, since the
 * decision that proposing starts here is what put a control beside the heading.
 */
function Propose() {
  return (
    <Button component="a" href="/propose">
      Propose a course
    </Button>
  );
}

function Nothing({ heading, body }: { heading: string; body: string }) {
  return (
    <Stack gap={4} maw={620}>
      <Text fw={600}>{heading}</Text>
      <Text c="dimmed">{body}</Text>
    </Stack>
  );
}

/**
 * **Tier 3 has no arm that reaches a `student` or an `advisor`**, so the whole
 * screen is refused — issues/37's *absent, never empty* scaled from a control to
 * a page, as the roles page scaled it before. The nav item is absent too; the
 * route still refuses on its own, because a link nobody rendered is not a check.
 *
 * The wording names the three arms rather than the tier, and points at the one
 * screen that does answer *what courses does this department have* — a refusal
 * that leaves the reader with nowhere to go is a dead end dressed as an
 * explanation.
 */
function NoScreen() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="xs">
        <Title order={1}>There is nothing here for you</Title>
        <Text c="dimmed">
          Course proposals are read by the program directors they were sent to, by whoever wrote
          them, and by the area heads assigned to review them. The Catalog lists every course that
          made it through.
        </Text>
      </Stack>
    </Container>
  );
}

/** Whether any proposal reaches this actor at all, filter set aside. */
async function anythingReachable(actor: Actor): Promise<boolean> {
  const answer = await getProposalsPage(actor, { view: "any" });
  return answer.visible && answer.page.length > 0;
}

/** A repeated query parameter is a caller's mistake, not a second filter. */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
