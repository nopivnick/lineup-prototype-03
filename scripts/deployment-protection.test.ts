/**
 * **The door check** (issues/80).
 *
 * The claim under test is not "Vercel has a setting". It is that this repository
 * can say, without a network, whether the settings it was handed leave a
 * deployment that impersonates anybody reachable by link.
 *
 * The three rules most likely to be broken by being helpful are the ones a reader
 * would call over-strict: `production` counts as protected only under `all`,
 * because every weaker setting leaves custom domains open; preview must be
 * protected whether or not the flag appears in the environment list, because a
 * deployment of this tree without the flag does not build at all; and a flag on a
 * custom environment is reported rather than passed over, because this check
 * cannot see that environment's protection.
 */
import { describe, expect, test } from "vitest";

import {
  DEV_ACTOR_FLAG,
  findProtectionGaps,
  type ProjectProtectionSettings,
} from "./deployment-protection";

/**
 * What the project carries today, in the shape the API actually answers with:
 * Vercel Authentication on every generated URL, and **no `enabled` field**. An
 * enabled mechanism is a bare `{ deploymentType }`; a disabled one is `null`.
 */
const STANDARD_PROTECTION: ProjectProtectionSettings = {
  ssoProtection: { deploymentType: "prod_deployment_urls_and_all_previews" },
  passwordProtection: null,
};

const NO_PROTECTION: ProjectProtectionSettings = {
  ssoProtection: null,
  passwordProtection: null,
};

const FLAG_ON_PREVIEW = [{ key: DEV_ACTOR_FLAG, target: ["preview"] }];

describe("findProtectionGaps", () => {
  test("the shipped arrangement is clean: protection on, flag on preview only", () => {
    expect(findProtectionGaps(STANDARD_PROTECTION, FLAG_ON_PREVIEW)).toEqual([]);
  });

  test("takes the API's other spelling of the same setting", () => {
    // The write side takes `prod_deployment_urls_and_all_previews`; the read side
    // has also been seen answering `all_except_custom_domains` for it.
    const settings: ProjectProtectionSettings = {
      ssoProtection: { deploymentType: "all_except_custom_domains" },
    };

    expect(findProtectionGaps(settings, FLAG_ON_PREVIEW)).toEqual([]);
  });

  test("a mechanism the write side turned off is off", () => {
    // `enabled: false` is what the update endpoint takes, and it is honoured —
    // but its *absence* must never be read as off, or a shut door reports open.
    const settings: ProjectProtectionSettings = {
      ssoProtection: { enabled: false, deploymentType: "all" },
    };

    expect(
      findProtectionGaps(settings, FLAG_ON_PREVIEW).map((finding) => finding.code),
    ).toEqual([
      "preview-unprotected",
      "flag-on-unprotected-environment",
    ]);
  });

  test("an unprotected preview is a finding even with no flag set anywhere", () => {
    // Deliberately no ALLOW_DEV_ACTOR in the list. A deployment without it does
    // not exist — the reader throws at import — so an open preview is exposure
    // whatever the environment list says.
    const findings = findProtectionGaps(NO_PROTECTION, []);

    expect(findings.map((finding) => finding.code)).toEqual(["preview-unprotected"]);
  });

  test("an unprotected preview carrying the flag reports both faults", () => {
    const findings = findProtectionGaps(NO_PROTECTION, FLAG_ON_PREVIEW);

    expect(findings.map((finding) => finding.code)).toEqual([
      "preview-unprotected",
      "flag-on-unprotected-environment",
    ]);
  });

  test("a password counts as protection, because the ask was protection or equivalent", () => {
    const settings: ProjectProtectionSettings = {
      ssoProtection: { enabled: false, deploymentType: null },
      passwordProtection: { deploymentType: "all_except_custom_domains" },
    };

    expect(findProtectionGaps(settings, FLAG_ON_PREVIEW)).toEqual([]);
  });

  test("protection scoped to previews alone leaves a flagged production open", () => {
    const settings: ProjectProtectionSettings = {
      ssoProtection: { enabled: true, deploymentType: "preview" },
    };

    const findings = findProtectionGaps(settings, [
      { key: DEV_ACTOR_FLAG, target: ["preview", "production"] },
    ]);

    expect(findings.map((finding) => finding.code)).toEqual(["flag-on-unprotected-environment"]);
    expect(findings[0].message).toContain("production");
  });

  test("standard protection is not enough to carry the flag into production", () => {
    // `all_except_custom_domains` covers the generated production URL and nothing
    // else, and a custom domain is what production eventually gets.
    const findings = findProtectionGaps(STANDARD_PROTECTION, [
      { key: DEV_ACTOR_FLAG, target: ["production"] },
    ]);

    expect(findings.map((finding) => finding.code)).toEqual(["flag-on-unprotected-environment"]);
  });

  test("`all` does carry it into production", () => {
    const settings: ProjectProtectionSettings = {
      ssoProtection: { enabled: true, deploymentType: "all" },
    };

    expect(
      findProtectionGaps(settings, [{ key: DEV_ACTOR_FLAG, target: ["production"] }]),
    ).toEqual([]);
  });

  test("the development target is not a deployment and is not exposure", () => {
    // `vercel env pull` writes it into a developer's .env.local. There is no URL.
    expect(
      findProtectionGaps(STANDARD_PROTECTION, [
        { key: DEV_ACTOR_FLAG, target: ["development"] },
      ]),
    ).toEqual([]);
  });

  test("other variables are none of its business", () => {
    expect(
      findProtectionGaps(NO_PROTECTION, [
        { key: "PEOPLE_DATABASE_URL", target: ["preview", "production"] },
      ]).map((finding) => finding.code),
    ).toEqual(["preview-unprotected"]);
  });

  test("a flag on a custom environment is reported rather than assumed shut", () => {
    // A custom environment carries `customEnvironmentIds` and no `target` at all,
    // and its protection is configured per environment. Reading only `target`
    // would answer "shut" about a door this check never looked at.
    const findings = findProtectionGaps(STANDARD_PROTECTION, [
      { key: DEV_ACTOR_FLAG, customEnvironmentIds: ["env_staging"] },
    ]);

    expect(findings.map((finding) => finding.code)).toEqual(["flag-on-custom-environment"]);
    expect(findings[0].message).toContain("env_staging");
  });

  test("absent settings are unprotected settings, not an error", () => {
    // A project that has never been configured answers with nulls.
    expect(findProtectionGaps({}, []).map((finding) => finding.code)).toEqual([
      "preview-unprotected",
    ]);
  });
});
