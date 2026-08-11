/**
 * **Ask Vercel whether the door is still shut** (issues/80).
 *
 * `npm run check:protection`. It reads the live project settings and the live
 * environment variable list, hands both to `auditDeploymentProtection`, and exits
 * non-zero with a reason if a preview of this repository could be reached by
 * anyone holding the link.
 *
 * **It is not in CI, and cannot be.** The settings it reads are not in this
 * repository and a pull request from a fork has no credential to read them with;
 * a job that skipped itself for want of a token would report a shut door on every
 * run in which it learned nothing. This is a check somebody runs — before sharing
 * a URL, and after touching anything in the project's settings.
 *
 * The rule itself is `scripts/deployment-protection.ts`, which is a pure function
 * over the two payloads and is tested without a network.
 */
import { readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

import {
  auditDeploymentProtection,
  DEV_ACTOR_FLAG,
  type ProjectEnvironmentVariable,
  type ProjectProtectionSettings,
} from "./deployment-protection";

/**
 * Written by `vercel link` and git-ignored: the project and the team, and nothing
 * secret. Its absence is a linking problem rather than a protection problem, so
 * it is reported as such.
 */
function readLinkedProject(): { projectId: string; orgId: string } {
  try {
    const linked = JSON.parse(readFileSync(join(process.cwd(), ".vercel", "project.json"), "utf8"));
    return { projectId: linked.projectId, orgId: linked.orgId };
  } catch {
    throw new Error("No .vercel/project.json — run `vercel link` first.");
  }
}

/**
 * `VERCEL_TOKEN` if it is set, and otherwise the token the CLI already holds from
 * `vercel login`. Reading the CLI's own file is what keeps this a command with no
 * setup: the person who can share the URL is the person already logged in.
 */
function readToken(): string {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;

  const dataDirectory =
    platform() === "darwin"
      ? join(homedir(), "Library", "Application Support")
      : (process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"));

  try {
    const auth = JSON.parse(readFileSync(join(dataDirectory, "com.vercel.cli", "auth.json"), "utf8"));
    if (auth.token) return auth.token;
  } catch {
    // Fall through to the same message as an empty file.
  }

  throw new Error("No Vercel credential: run `vercel login`, or set VERCEL_TOKEN.");
}

async function get<T>(path: string, token: string, teamId: string): Promise<T> {
  const url = new URL(`https://api.vercel.com${path}`);
  url.searchParams.set("teamId", teamId);

  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new Error(`Vercel API ${response.status} for ${path}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function main(): Promise<void> {
  const { projectId, orgId } = readLinkedProject();
  const token = readToken();

  const settings = await get<ProjectProtectionSettings & { name?: string }>(
    `/v9/projects/${projectId}`,
    token,
    orgId,
  );
  const { envs } = await get<{ envs: ProjectEnvironmentVariable[] }>(
    `/v10/projects/${projectId}/env`,
    token,
    orgId,
  );

  const findings = auditDeploymentProtection(settings, envs);

  if (findings.length > 0) {
    console.error(`${settings.name ?? projectId}: the door is open.\n`);
    for (const finding of findings) console.error(`  ✗ ${finding.message}\n`);
    console.error("Fix it in Project Settings → Deployment Protection before sharing any URL.");
    process.exitCode = 1;
    return;
  }

  const flagged = envs
    .filter((variable) => variable.key === DEV_ACTOR_FLAG)
    .flatMap((variable) => variable.target ?? []);

  console.log(
    `${settings.name ?? projectId}: shut. ` +
      `Deployment protection covers previews, and ${DEV_ACTOR_FLAG} is set on ` +
      `${flagged.length > 0 ? flagged.join(", ") : "no environment"}.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
