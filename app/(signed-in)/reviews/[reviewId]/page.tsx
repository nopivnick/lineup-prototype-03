import { redirect } from "next/navigation";
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Container,
  Grid,
  GridCol,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import { getReviewPage, type ReviewPage } from "@/db/read/review";
import { getActor } from "@/lib/auth/actor";

import { Named, NamedLine } from "../../named";
import { reviewWhere } from "../../review-where";
import { REVIEW_TONE } from "../../verdicts";
import { stamp } from "../../stamp";
import { ReviewGroupHeader } from "./review-group";
import { ReviewHistory } from "./review-history";
import { ReviewRail } from "./review-rail";

/**
 * **The review page — the first screen in the skeleton that renders one record at
 * two fidelities** (issues/42, issues/86).
 *
 * It takes the Course page's conventions unchanged — the record on the left, what
 * you may do about it on the right in a sticky rail, the history in sentences at
 * the foot of the main column — and adds the four things variant D adds: the
 * group header restated above the record with this review highlighted, the shared
 * body with a line saying how many programs are reading it and which have sent it
 * back, this program's area and area head, and the minted course linked from the
 * rail beside the body-drift line.
 *
 * **The read-only fidelity is a banner and two absent boxes**, and the banner is
 * the only thing on the page that is *about* the fidelity. issues/38's rule is
 * that read-only means controls **and** refusals absent rather than greyed, so
 * there is nothing to explain under a control — what the banner explains is why
 * the reader is here at all, which is a fact about the proposal rather than about
 * this review.
 *
 * This page holds no database handle and writes no `WHERE` clause. It calls one
 * view-shaped read module and receives a finished page: the record, the group it
 * belongs to with every name already stitched in from the other project, what
 * this actor may do about it, the refusal for what they may not, and the history
 * already resolved to names.
 */
export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/be-somebody");

  const { reviewId } = await params;
  const read = await getReviewPage(reviewId, actor);

  if (!read.visible) return <NoReviewHere />;

  const page = read.page;
  const where = reviewWhere(page.proposal.title, page.programCode);

  return (
    <Container size="xl" py="xl">
      <Group gap={6} mb="md">
        <Anchor href="/proposals" size="sm">
          Proposals
        </Anchor>
        <Text size="sm" c="dimmed">
          /
        </Text>
        <Text size="sm">{where}</Text>
      </Group>

      <Stack gap="md">
        {/*
          **The group restated above the record**, which is variant D's answer and
          the reason this page needs no *other reviews* section further down: the
          siblings are the group the reader came from, not a footnote to the
          record they landed on.
        */}
        <ReviewGroupHeader proposal={page.proposal} reviewId={page.reviewId} />

        {page.fidelity === "read-only" ? <ReadOnly page={page} /> : null}

        <Grid gap="xl">
          <GridCol span={{ base: 12, md: 8 }}>
            <Stack gap="xl">
              <Stack gap={4}>
                <Title order={1}>{page.proposal.title}</Title>
                <Group gap="sm" mt={4}>
                  <Badge variant="light">{page.programCode}</Badge>
                  {/*
                    **The verdict shows on the record as well as in the rail**,
                    which is variant D's pagehead: the rail states what you may
                    do about the state and the head states the state, and a
                    reader who scrolled past the rail on a narrow screen would
                    otherwise be reading a body with no verdict attached.
                  */}
                  <Badge color={REVIEW_TONE[page.state]} variant="light">
                    {page.state}
                  </Badge>
                  <Text size="sm" c="dimmed">
                    {page.body.credits} credits
                  </Text>
                  {/*
                    The proposer, stated the way every other screen states a
                    person (issues/9, issues/84): `Named` carries the
                    netid-plus-*no name on file* fallback, which is reachable
                    here rather than hypothetical.
                  */}
                  <Group gap={4} wrap="nowrap">
                    <Text size="sm" c="dimmed">
                      proposed by
                    </Text>
                    <Named who={page.proposal.proposedBy} />
                    <Text size="sm" c="dimmed">
                      on {stamp(page.proposal.proposedAt)}
                    </Text>
                  </Group>
                </Group>
              </Stack>

              <Section title="The proposal">
                <Stack gap="sm">
                  <SharedBody page={page} />
                  {page.body.description ? (
                    <Text style={{ maxWidth: "66ch" }}>{page.body.description}</Text>
                  ) : (
                    <Text size="sm" c="dimmed" fs="italic">
                      No description was written.
                    </Text>
                  )}
                </Stack>
              </Section>

              <Section title={`${page.programCode}’s assignment`}>
                <Stack gap="sm">
                  <Fact label="Areas">
                    {page.areas.length > 0 ? (
                      <Group gap={4}>
                        {page.areas.map((tag, index) => (
                          <Badge key={index} variant="default" size="sm">
                            {tag.name}
                          </Badge>
                        ))}
                      </Group>
                    ) : (
                      <Text size="sm" c="dimmed" fs="italic">
                        Not assigned yet
                      </Text>
                    )}
                  </Fact>
                  <Fact label="Area head">
                    {/*
                      **A person presented as a person, so pronouns show**
                      (issues/40) — this is who a director is deciding whether to
                      hand a course to, not the subject of a timestamp.
                    */}
                    {page.areaHead ? (
                      <NamedLine who={page.areaHead} pronouns />
                    ) : (
                      <Text size="sm" c="dimmed" fs="italic">
                        Not assigned yet
                      </Text>
                    )}
                  </Fact>

                  <Coincidence page={page} />
                  <NotOfferableYet marker={page.notOfferableYet} />
                </Stack>
              </Section>

              {/*
                **Never absent, unlike the other two record pages' histories**
                (issues/28's Tier 3). `course_proposal_review_transition` rows are
                Tier 3's own subject and Tier 3's may-read is what admitted this
                reader, so there is no reader here with the record and without its
                log — including at the read-only fidelity, where the reasons on it
                are the whole reason the page opens at all.
              */}
              <ReviewHistory history={page.history} programCode={page.programCode} />
            </Stack>
          </GridCol>

          <GridCol span={{ base: 12, md: 4 }}>
            <Box style={{ position: "sticky", top: "1rem" }}>
              <ReviewRail
                reviewId={page.reviewId}
                where={where}
                programCode={page.programCode}
                state={page.state}
                actions={page.actions}
                edit={page.edit}
                mintedCourse={page.mintedCourse}
                bodyHasDrifted={page.bodyShare.hasDriftedSinceAnyMint}
                lastChanged={page.lastChanged}
              />
            </Box>
          </GridCol>
        </Grid>
      </Stack>
    </Container>
  );
}

/**
 * **Why this reader is here without controls** (issues/42, issues/38).
 *
 * The one sentence on the page that is about the fidelity rather than about the
 * review. It is not a refusal and carries none: a refusal explains why a control
 * will not fire, and there is no control here to explain. What it explains is the
 * shape of Tier 3 — *standing on the proposal, not on this review* — which is the
 * thing a reader would otherwise read as a bug, having just been offered the
 * chip that brought them here.
 */
function ReadOnly({ page }: { page: ReviewPage }) {
  return (
    <Alert color="gray" variant="light" title="Read only">
      <Text size="sm">
        You can read {page.programCode}&rsquo;s review because you have standing on this proposal,
        not on this one of its reviews. {page.programCode}&rsquo;s program director, the area head
        assigned to it, and the chair are who can move it. Everything the record says — including
        the history, and the reasons on it — is here.
      </Text>
    </Alert>
  );
}

/**
 * **How many programs are reading this body and which have sent it back**
 * (issues/10, issues/42).
 *
 * The row **is** the request, so there is no requested-programs table to read and
 * *which programs were asked* is the set of reviews. This is that absence made
 * legible on the one screen where it matters — a reader about to change a body
 * that every one of those programs is reading, and that can change under them
 * while a sibling has it under development.
 */
function SharedBody({ page }: { page: ReviewPage }) {
  const { programCount, developingProgramCodes } = page.bodyShare;
  if (programCount === 1) {
    return (
      <Text size="sm" c="dimmed">
        {page.programCode} is the only program reading this body.
      </Text>
    );
  }

  const sentBack = PROGRAMS.format(developingProgramCodes);

  return (
    <Text size="sm" c="dimmed">
      One body, {programCount} reviews. An edit changes what every program is reading, and nothing
      notifies them.
      {developingProgramCodes.length > 0
        ? ` ${sentBack} ${developingProgramCodes.length > 1 ? "have" : "has"} sent it back, so it can change under you.`
        : ""}
    </Text>
  );
}

/**
 * **The coincidence, stated because forbidding it was ruled out of scope**
 * (issues/42).
 *
 * `course_proposal.created_by` gates body edits and `course_proposal_review.area_head`
 * gates `approve`, and nothing forbids one person holding both — the obvious rule
 * has an unchecked failure mode, since a small program may have exactly one area
 * head and the rule could leave certain proposals with no legal approver at all.
 * So the map declined to forbid it and took this instead: it costs nothing, and it
 * makes the situation visible to anybody reading the record.
 */
/**
 * *ITP and IMA*, and *ITP, IMA and LowRes* — a join rather than
 * `join(" and ")`, which reads *"ITP and IMA and LowRes"* the moment a third
 * program is asked, and three is the number the fixtures already carry.
 */
const PROGRAMS = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

function Coincidence({ page }: { page: ReviewPage }) {
  if (!page.authorIsAreaHead) return null;
  return (
    <Text size="sm">
      This proposal&rsquo;s author is also this review&rsquo;s area head, so the person who wrote
      it is the person assigned to approve it. Nothing forbids that, and nothing else in the system
      says so.
    </Text>
  );
}

/**
 * **The gate one step earlier than the Catalog states it** (issues/32,
 * issues/37, issues/43). Area and head are separate assignments, so *half
 * missing* is a real state with its own sentence rather than one catch-all — and
 * here it is a warning about a course that does not exist yet rather than a
 * marker on one that does.
 *
 * **The derivation is `getReviewPage`'s and the sentence is this page's**, which
 * is how the Catalog and the Course page split the same marker: three screens
 * word it three ways and none of them decides *what counts as missing*.
 */
function NotOfferableYet({ marker }: { marker: ReviewPage["notOfferableYet"] }) {
  if (!marker) return null;

  const missing =
    marker.missingArea && marker.missingAreaHead
      ? "neither an area nor an area head"
      : marker.missingArea
        ? "no area"
        : "no area head";

  return (
    <Text size="sm" c="dimmed">
      A course minted from this review would carry {missing}, and could not be offered until one
      was assigned.
    </Text>
  );
}

/**
 * **A page has a URL and has to answer, and the refusal names no state**
 * (issues/41, issues/84's wording).
 *
 * `getReviewPage` reaches this one answer from four worlds — an address that is
 * not an id, an id that names nothing, a review on a proposal no arm of Tier 3
 * reaches, and a reader who holds nothing in the matrix at all — and they are one
 * answer in one wording, because the moment they differ the difference **is** the
 * leak. A sentence naming the program or the proposal would be built from facts
 * the page could only have by reading the record it is refusing, so the first two
 * worlds could not produce it and a reader comparing two addresses would learn
 * which one holds a record.
 *
 * It points at the proposals list for the reason every refusal in this skeleton
 * points somewhere: a refusal that leaves the reader with nowhere to go is a dead
 * end dressed as an explanation.
 */
function NoReviewHere() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Title order={1}>Review</Title>
        <Alert color="gray" title="There is no review here">
          <Text size="sm">
            Nothing at this address is a review you can open. Try{" "}
            <Anchor href="/proposals">the proposals list</Anchor>, which holds every proposal that
            reaches you and every program&rsquo;s verdict on it.
          </Text>
        </Alert>
      </Stack>
    </Container>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Stack gap="xs">
      <Text fw={600} size="lg">
        {title}
      </Text>
      {children}
    </Stack>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Group gap="md" align="flex-start" wrap="nowrap">
      <Text size="sm" c="dimmed" w={120} style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Box>{children}</Box>
    </Group>
  );
}
