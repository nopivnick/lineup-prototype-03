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

import { getCoursePage, type CoursePage } from "@/db/read/course";
import { getActor } from "@/lib/auth/actor";

import { CourseHistory } from "./course-history";
import { NamedLine } from "../../named";
import { CourseRail } from "./course-rail";
import { CourseSections } from "./course-sections";

/**
 * **The Course page — and with it the page conventions every later detail page
 * inherits wholesale** (issues/41, issues/42, issues/62, issues/83).
 *
 * The record on the left, what you may do about it on the right in a sticky
 * rail, its history in sentences at the foot of the main column. Three things
 * vary by role and **all three are absent rather than empty**: no history section
 * for a `student` or an `advisor`, no actions and no refusals for an actor who
 * can never act, and the record itself can be refused — new here, because a list
 * row outside its tier is simply absent but a page has a URL and has to answer.
 *
 * This page holds no database handle and writes no `WHERE` clause. It calls one
 * view-shaped read module and receives a finished page: the record, its sections
 * with every name already stitched in from the other project, what this actor may
 * do about it, the refusal for what they may not, and the history already
 * resolved to names.
 *
 * **Two Mantine facts this is the first page in the skeleton to hit**, both
 * because it is the first Server Component to use the library for anything but a
 * heading — recorded here so the Offering and Review pages do not rediscover
 * them:
 *
 *   * **A compound component is `GridCol`, never `Grid.Col`.** Every Mantine
 *     component is a Client Component, and a client module reaches a Server
 *     Component as a reference rather than as the object it is, so the attached
 *     statics are `undefined` and React reports *element type is invalid*. The
 *     flat named exports — `GridCol`, `TableTbody`, `TableTr`, `TableTd` — are the
 *     same components. The list views get away with the dotted form because they
 *     are `"use client"` end to end.
 *   * **`component={Link}` is a function passed across that boundary**, which the
 *     serializer refuses outright. A Server Component's links are plain `Anchor`s
 *     with an `href`, exactly as the roles page's are; `component={Link}` belongs
 *     in the Client Components, which is where the `↗` controls live.
 */
export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/be-somebody");

  const { courseId } = await params;
  const read = await getCoursePage(courseId, actor);

  if (!read.visible) return <NoCourseHere />;

  const page = read.page;

  return (
    <Container size="xl" py="xl">
      <Group gap={6} mb="md">
        <Anchor href="/catalog" size="sm">
          Catalog
        </Anchor>
        <Text size="sm" c="dimmed">
          /
        </Text>
        <Text size="sm" ff="monospace">
          {page.courseNumber}
        </Text>
      </Group>

      <Grid gap="xl">
        <GridCol span={{ base: 12, md: 8 }}>
          <Stack gap="xl">
            <Stack gap={4}>
              <Text ff="monospace" c="dimmed">
                {page.courseNumber}
              </Text>
              <Title order={1}>{page.title}</Title>
              <Group gap="sm" mt={4}>
                <Badge variant="light">{page.programCode}</Badge>
                <Text size="sm" c="dimmed">
                  {page.credits} credits
                </Text>
                <Text size="sm" c="dimmed">
                  Edition {page.edition}
                </Text>
                <NotOfferableYet page={page} />
              </Group>
            </Stack>

            {page.description ? (
              <Section title="Description">
                <Text style={{ maxWidth: "66ch" }}>{page.description}</Text>
              </Section>
            ) : null}

            <Section title="Where it sits">
              <Stack gap="sm">
                <Fact label="Areas">
                  <Tags tags={page.areas} empty="Not yet assigned" />
                </Fact>
                <Fact label="Requirements">
                  <Tags tags={page.requirementCategories} empty="None" />
                </Fact>
                <Fact label="Area head">
                  {/*
                    **One of the two places a person is presented as a person**, so
                    pronouns show (issues/40). The other is the roster on an
                    Offering page; a history line is not one.
                  */}
                  {page.areaHead ? (
                    <NamedLine who={page.areaHead} pronouns />
                  ) : (
                    <Text size="sm" c="dimmed" fs="italic">
                      Not yet assigned
                    </Text>
                  )}
                </Fact>
                <Fact label="Link">
                  {page.url ? (
                    <Anchor href={page.url} size="sm">
                      {page.url}
                    </Anchor>
                  ) : (
                    <Text size="sm" c="dimmed" fs="italic">
                      None
                    </Text>
                  )}
                </Fact>
              </Stack>
            </Section>

            <Section title="Where it came from">
              <Stack gap="xs">
                <Text size="sm">
                  Minted by {page.mintedFrom.programCode}&rsquo;s{" "}
                  <Anchor href={`/reviews/${page.mintedFrom.reviewId}`}>
                    review of the proposal
                  </Anchor>
                  . The mint copies the body, so the two are free to diverge afterwards.
                </Text>
                {/*
                  **The body-drift line, which is the half that matters**
                  (issues/42 amending issues/41). A proposal can be edited
                  legitimately after one program has already minted from it, and
                  whoever is about to schedule or teach the course is never on the
                  proposal screen — so the fact is stated here or nowhere.
                */}
                {page.mintedFrom.bodyHasDriftedSince ? (
                  <Alert color="yellow" variant="light" title="The proposal has drifted">
                    <Text size="sm">
                      The proposal this course was minted from no longer says what this course
                      says. One of them has been edited since the approval — the title, the
                      description or the credits — and nothing else in the system records that
                      they disagree.
                    </Text>
                  </Alert>
                ) : null}
              </Stack>
            </Section>

            <Section
              title="Sections"
              count={
                page.sections.length === 0
                  ? "none"
                  : `${page.sections.reduce((total, group) => total + group.offerings.length, 0)} across ${page.sections.length} ${page.sections.length === 1 ? "term" : "terms"}`
              }
            >
              <CourseSections groups={page.sections} courseNumber={page.courseNumber} />
            </Section>

            {/*
              **Absent, not empty, for `student` and `advisor`** — Tier 2's
              boundary (issues/28, issues/41). Not a greyed section and not an
              explanation of why there is no section: *if you can do nothing, you
              may not see the record of who did*, and a sentence saying so would
              be the announcement the tier exists to avoid.
            */}
            {page.history ? <CourseHistory history={page.history} /> : null}
          </Stack>
        </GridCol>

        <GridCol span={{ base: 12, md: 4 }}>
          <Box style={{ position: "sticky", top: "1rem" }}>
            <CourseRail
              courseId={page.courseId}
              status={page.status}
              actions={page.actions}
              edit={page.edit}
              lastChanged={page.lastChanged}
              showLastChanged={page.history !== null}
            />
          </Box>
        </GridCol>
      </Grid>
    </Container>
  );
}

/**
 * **A page has a URL and has to answer** (issues/41).
 *
 * `course` is Tier 1, so nothing here is hidden from a reader who is signed in —
 * this is what a course id that names nothing looks like. The wording still
 * **names no state**, because it is the same sentence the Offering page will owe
 * a reader whose section is `Declined`, and saying `Declined` there would leak
 * exactly what hiding it is for. A silent redirect was rejected on issues/9's
 * rule that a cosmetic fault must not masquerade as a broken link.
 */
function NoCourseHere() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Title order={1}>Course</Title>
        <Alert color="gray" title="There is no course here">
          <Stack gap="xs">
            <Text size="sm">
              Nothing at this address is a course you can open. Try{" "}
              <Anchor href="/catalog">
                the Catalog
              </Anchor>
              , which lists every course the department can offer.
            </Text>
          </Stack>
        </Alert>
      </Stack>
    </Container>
  );
}

/**
 * **The derived *not offerable yet* marker, stated in halves** (issues/32,
 * issues/37, issues/43). Area and head are separate assignments, so *half
 * missing* is a real state with its own sentence rather than one catch-all.
 */
function NotOfferableYet({ page }: { page: CoursePage }) {
  const marker = page.notOfferableYet;
  if (!marker) return null;

  const missing = [marker.missingArea ? "an area" : null, marker.missingAreaHead ? "an area head" : null]
    .filter((one): one is string => one !== null)
    .join(" and ");

  return (
    <Badge color="orange" variant="light">
      Not offerable yet — missing {missing}
    </Badge>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: string;
  children: React.ReactNode;
}) {
  return (
    <Stack gap="xs">
      <Group gap="sm" align="baseline">
        <Text fw={600} size="lg">
          {title}
        </Text>
        {count ? (
          <Text size="sm" c="dimmed">
            {count}
          </Text>
        ) : null}
      </Group>
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

/**
 * The course's **own** tags, unlabelled, because they carry no program name: a
 * course's areas and requirement categories are always its own program's
 * (issues/30). The only program name that ever appears against a record other
 * than its own is a seat-sharing grant, and those attach to a section.
 *
 * Keyed by position: `area` and `requirement_category` are two tables, each
 * unique within a program and neither constrained against the other, so one
 * program can hold an area and a category that share a name.
 */
function Tags({ tags, empty }: { tags: readonly { name: string }[]; empty: string }) {
  if (tags.length === 0) {
    return (
      <Text size="sm" c="dimmed" fs="italic">
        {empty}
      </Text>
    );
  }
  return (
    <Group gap={4}>
      {tags.map((tag, index) => (
        <Badge key={index} variant="default" size="sm">
          {tag.name}
        </Badge>
      ))}
    </Group>
  );
}
