import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * B9: a calendar appointment opened to the public; someone without an
 * account registers from a phone (390 px) by the link; the club sees the
 * registration and checks the person in. Axe on each step.
 */
async function axe(page: Page, label: string, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]);
  if (include) builder.include(include);
  const violations = (await builder.analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("an open event: opened, registered by link without an account, checked in", async ({ page, browser }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `b9-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "B9 Présidente", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('B9 club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [club, user])).rows[0].id;
    await db.query(
      "INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,responsible_user_id,visibility) VALUES($1,$2,1,'Journée découverte','custom','Europe/Brussels',now()+interval '10 days',now()+interval '10 days 4 hours','2026-11-11T10:00','2026-11-11T14:00',$3,'organization')",
      [club, series, user],
    );
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 390, height: 844 });

    // 1. The club opens the appointment, with places and a question.
    await page.goto("/fr/events");
    await expect(page.getByText("Aucun événement ouvert pour l'instant.")).toBeVisible();
    await page.getByRole("button", { name: "Ouvrir un événement" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Ouvrir un événement au public" });
    await dialog.getByLabel("Présentation").fill("Venez essayer le powerchair football.");
    await dialog.getByLabel("Places").fill("12");
    await dialog.getByLabel("Questions de l'inscription").fill("Avez-vous déjà joué ? *");
    await axe(page, "open", "dialog[open]");
    await dialog.getByRole("button", { name: "Ouvrir un événement" }).click();
    await expect(dialog).toHaveCount(0);
    const card = page.locator(".incident-card").filter({ hasText: "Journée découverte" });
    await expect(card).toContainText("Inscriptions ouvertes");
    const token = (await db.query("SELECT token FROM open_event WHERE organization_id=$1", [club])).rows[0].token;
    await axe(page, "list");

    // 2. Someone without an account registers from the link, on a phone.
    const guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pub = await guest.newPage();
    await pub.goto(`/fr/evenement/${token}`);
    await expect(pub.getByText("12 places restantes")).toBeVisible();
    await pub.getByLabel("Nom et prénom").fill("Noa Visiteur");
    await pub.getByLabel("Adresse e-mail").fill("noa@example.test");
    await pub.getByRole("checkbox", { name: "Fauteuil" }).click();
    await pub.getByRole("group", { name: /Avez-vous déjà joué/ }).getByRole("radio", { name: "Non" }).click();
    await pub.getByRole("checkbox", { name: /utilise ces données/ }).click();
    await axe(pub, "public form");
    await pub.getByRole("button", { name: "S'inscrire" }).click();
    await expect(pub.getByRole("status")).toContainText("vous êtes inscrit");
    await expect(pub).toHaveURL(/\?r=/);
    await expect(pub.getByRole("img", { name: /code d'entrée/ })).toBeVisible();
    await axe(pub, "public registered");
    await guest.close();
    const reg = (await db.query("SELECT needs,consent_image,answers FROM open_registration WHERE email='noa@example.test'")).rows[0];
    expect(reg).toEqual({ needs: { wheelchair: true, helper: false, transport: false, diet: "" }, consent_image: false, answers: { q1: false } });

    // 3. The club sees the registration and checks the person in.
    await page.reload();
    await card.getByRole("button", { name: /^Inscrits/ }).click();
    await expect(card).toContainText("Noa Visiteur");
    await card.getByRole("tab", { name: "Pointage", exact: true }).click();
    await card.getByRole("button", { name: /^Pointer/ }).click();
    await expect(page.locator(".incident-card").filter({ hasText: "Journée découverte" }).getByText("Présent", { exact: true })).toBeVisible();
    await axe(page, "checkin");
  } finally {
    await db.end();
  }
});
