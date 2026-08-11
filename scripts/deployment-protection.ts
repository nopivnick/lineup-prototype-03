/**
 * **What is holding the door shut** (issues/11, issues/28, issues/80).
 *
 * The application ships a dev identity reader on purpose: `lib/auth/actor.ts` is
 * gated on `ALLOW_DEV_ACTOR` and never on `NODE_ENV`, *precisely so that a
 * preview deployment can carry it*, and issues/28 declined to close that door
 * with RLS on the grounds that it was opened deliberately. The consequence is
 * exact and is the one inherited constraint that is a live risk rather than a
 * design note: **a deployment carrying the flag lets anyone with the link be any
 * user in the department.**
 *
 * Nothing in the application can hold that door shut, because the door is the
 * application. What holds it shut is Vercel deployment protection, which lives in
 * project settings rather than in this repository — so the one thing the
 * repository *can* do is refuse to let the setting drift unnoticed. This module
 * is the check, and `scripts/check-deployment-protection.ts` is the caller that
 * hands it the live settings.
 *
 * It is a pure function over two API payloads so that the rule is testable
 * without a network, the same way `db/machine-states.test.ts` asserts against a
 * migration it reads rather than a database it connects to.
 */

/**
 * Where a protection setting applies, in Vercel's own vocabulary.
 *
 * `all` includes custom production domains; `prod_deployment_urls_and_all_previews`
 * — which the API also spells `all_except_custom_domains` when reading it back —
 * covers every generated `*.vercel.app` URL and leaves a custom domain open.
 * Both spellings are accepted because the API answers with one and takes the
 * other.
 */
export type DeploymentType =
  | "all"
  | "all_except_custom_domains"
  | "prod_deployment_urls_and_all_previews"
  | "preview"
  | (string & {});

/**
 * One protection mechanism, as `GET /v9/projects/{id}` returns it.
 *
 * **The API says "off" by answering `null`, not by answering `enabled: false`** —
 * an enabled mechanism is a bare `{ deploymentType }`. The `enabled` field is
 * what the *write* side of the same API takes, so it is accepted here too and a
 * literal `false` is honoured; what must not happen is a missing `enabled` being
 * read as off, which would report a shut door as open.
 */
export type Protection = { enabled?: boolean; deploymentType?: DeploymentType | null } | null;

/**
 * The subset of a Vercel project this check reads. Trusted IPs are deliberately
 * not consulted: they restrict *where* a reader is, not *who* they are, and the
 * thing being protected against is a link forwarded to somebody outside the
 * department.
 */
export type ProjectProtectionSettings = {
  ssoProtection?: Protection;
  passwordProtection?: Protection;
};

/**
 * One environment variable, as `GET /v10/projects/{id}/env` returns it.
 *
 * A variable bound to a **custom environment** carries `customEnvironmentIds`
 * and no `target` at all, which is why that field is read rather than ignored: a
 * check that looked only at `target` would answer "shut" about a flag it never
 * saw.
 */
export type ProjectEnvironmentVariable = {
  key: string;
  target?: string[] | null;
  customEnvironmentIds?: string[] | null;
};

export type Finding = {
  code: "preview-unprotected" | "flag-on-unprotected-environment" | "flag-on-custom-environment";
  message: string;
};

/** The flag whose presence on a deployment is what makes protection load-bearing. */
export const DEV_ACTOR_FLAG = "ALLOW_DEV_ACTOR";

/**
 * Every target the flag is set on — the one reading of the environment list, so
 * that the caller reporting what it found cannot drift from what the rule
 * measured.
 */
export function flagTargets(
  environmentVariables: readonly ProjectEnvironmentVariable[],
): string[] {
  return Array.from(
    new Set(
      environmentVariables
        .filter((variable) => variable.key === DEV_ACTOR_FLAG)
        .flatMap((variable) => variable.target ?? []),
    ),
  );
}

/**
 * `development` is not a deployment. It is what `vercel env pull` writes into a
 * developer's `.env.local`, and it reaches localhost rather than a URL anyone can
 * be sent, so the flag being set there is not exposure.
 */
const DEPLOYED_TARGETS = ["production", "preview"] as const;

type DeployedTarget = (typeof DEPLOYED_TARGETS)[number];

/**
 * Whether a protection setting covers a target.
 *
 * **`production` counts as protected only under `all`.** Every other setting
 * leaves custom domains open, and a custom domain is exactly what a production
 * deployment eventually gets. A preview URL has no such escape hatch, so the
 * weaker settings do cover it.
 */
function covers(protection: Protection, target: DeployedTarget): boolean {
  if (!protection || protection.enabled === false) return false;

  const type = protection.deploymentType;
  if (type === "all") return true;
  if (target === "production") return false;

  return (
    type === "preview" ||
    type === "prod_deployment_urls_and_all_previews" ||
    type === "all_except_custom_domains"
  );
}

/** Whether *some* mechanism — Vercel Authentication, or a password — covers a target. */
function isProtected(settings: ProjectProtectionSettings, target: DeployedTarget): boolean {
  return covers(settings.ssoProtection ?? null, target) || covers(settings.passwordProtection ?? null, target);
}

/**
 * Everything wrong with the door, or an empty array. **Not** `audit`: `CONTEXT.md`
 * fences that word for the audit log the schema deliberately does not keep.
 *
 * Three rules, and the first does not mention the flag on purpose. A deployment
 * of this repository *without* `ALLOW_DEV_ACTOR` does not exist: the reader
 * throws at import and the build fails, which is issues/79's whole gate. So every
 * preview that manages to be reachable is a preview that impersonates, and
 * "protect it only once the flag is set" would be a rule with no unprotected
 * case to catch.
 */
export function findProtectionGaps(
  settings: ProjectProtectionSettings,
  environmentVariables: readonly ProjectEnvironmentVariable[],
): Finding[] {
  const findings: Finding[] = [];

  if (!isProtected(settings, "preview")) {
    findings.push({
      code: "preview-unprotected",
      message:
        "Preview deployments are not behind Vercel Authentication or a password. " +
        "A preview of this repository carries the dev identity reader, so the link alone " +
        "would let anyone be any user (issues/11, issues/80).",
    });
  }

  const targets = flagTargets(environmentVariables);

  for (const target of DEPLOYED_TARGETS) {
    if (!targets.includes(target)) continue;
    if (isProtected(settings, target)) continue;

    findings.push({
      code: "flag-on-unprotected-environment",
      message:
        `${DEV_ACTOR_FLAG} is set on the ${target} environment, which is not protected. ` +
        "Either protect it or unset the flag — a build without the flag refuses to start, " +
        "which is the safe half of the pair (issues/79, issues/80).",
    });
  }

  /**
   * A custom environment is a deployment with a URL, and its protection is
   * configured per environment rather than in the three settings read above.
   * Nothing here can tell whether that one is shut, so the honest answer is to
   * say so rather than to report a door it never looked at.
   */
  const customEnvironments = environmentVariables
    .filter((variable) => variable.key === DEV_ACTOR_FLAG)
    .flatMap((variable) => variable.customEnvironmentIds ?? []);

  if (customEnvironments.length > 0) {
    findings.push({
      code: "flag-on-custom-environment",
      message:
        `${DEV_ACTOR_FLAG} is set on ${customEnvironments.length} custom environment(s) ` +
        `(${customEnvironments.join(", ")}), whose protection this check cannot read. ` +
        "Confirm each is protected by hand, or take the flag off it (issues/80).",
    });
  }

  return findings;
}
