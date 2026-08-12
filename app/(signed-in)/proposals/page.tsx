import { redirect } from "next/navigation";
import { Alert, Button, Container, Group, Stack, Text, Title } from "@mantine/core";

import { getProposalsPage, mayProposeACourse } from "@/db/read/proposals";
import type { ProposalGroup } from "@/db/read/review-rows";
import { getActor, type Actor } from "@/lib/auth/actor";

import { ProposalsFilterBar } from "./proposals-filters";
import { ProposalsList } from "./proposals-list";
import { viewFor } from "./views";

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

  // A query parameter is a public input, and `viewFor` narrows it to one of the
  // four the bar offers — see `./views` for why the four are declared neither
  // here nor beside the bar.
  const params = await searchParams;
  const view = viewFor(one(params.view));

  const answer = await getProposalsPage(actor, { view });
  if (!answer.visible) return <NoScreen />;

  const groups = answer.page;
  const reviews = groups.reduce((total, group) => total + group.reviews.length, 0);
  const mayPropose = await mayProposeACourse(actor);

  /**
   * **Where a submitted proposal lands** (issues/43, issues/88): here, at the
   * group it just wrote, rather than on a record — a proposal has no page of its
   * own, and landing on a review means picking one of three by sort order.
   *
   * The id is a **query parameter and a public input**, and it is answered by
   * looking for it among the groups the tier and the filter already produced.
   * There is no second read and no lookup: a proposal the reader cannot reach is
   * simply not found, so the banner cannot state a title, a count or a verdict
   * that the page would not have rendered anyway.
   */
  const justProposed = one(params.new);
  const arrived = groups.find((group) => group.proposalId === justProposed) ?? null;

  /**
   * **Asked only on the empty path, and only when a filter could be the reason.**
   *
   * The default view hides finished reviews, so *no groups* on it is ambiguous in
   * a way *no groups* on the Lineup never was: an instructor who has never
   * proposed anything and a director whose every review is approved both land on
   * an empty screen, and they need opposite sentences.
   *
   * **It costs a second pass — two more round trips, and the module's *two round
   * trips* is per call rather than per render.** It is bought only where the
   * first read found nothing to render, so no populated screen pays it, and what
   * it buys is the one empty state this ticket names: *an explanation and a
   * button*. Carrying the reachable count on the read's own result would be
   * cheaper and would make every reader pay for a count only an empty screen
   * reads.
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

        {arrived ? <JustProposed group={arrived} /> : null}

        {reachable ? (
          <>
            <ProposalsFilterBar view={view} matched={reviews} />
            {groups.length > 0 ? (
              <ProposalsList groups={groups} newProposalId={arrived?.proposalId ?? null} />
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
 * **The arrival, and it says what was written** (issues/43, issues/88).
 *
 * The proposer's first sight of what they caused is the fan-out itself, which is
 * the whole argument for landing here: one body, one row and one chip per program
 * they checked, none of them decided. The count is read off the group's verdicts
 * rather than off the query parameter — the parameter says *which proposal*, and
 * everything the sentence states is a fact the page had already read.
 *
 * It is not dismissible, because it goes away by itself: it is a fact about how
 * this render was reached, and any click that leaves `?new=` behind drops it.
 */
function JustProposed({ group }: { group: ProposalGroup }) {
  const opened = group.verdicts.length;
  return (
    <Alert color="green" title="Proposed">
      <Text size="sm">
        <b>{group.title}</b> — {opened} {opened === 1 ? "review" : "reviews"} opened,{" "}
        {group.verdicts.map((verdict) => verdict.programCode).join(", ")}. The form said what
        submitting would write; this is it.
      </Text>
    </Alert>
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
 * `/propose`, which issues/88 built — and that page asks the same permission term
 * this control is drawn from, so a reader who sees the button is never refused the
 * page behind it. It is **the only door**: issues/42 rejected the Catalog as a
 * second one, which is why proposing starts beside this heading.
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
