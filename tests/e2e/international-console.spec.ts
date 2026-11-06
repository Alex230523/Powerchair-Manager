import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/** 05/11/2026: the federation's rulebook page (international, step 2) and the operator's console (step 1), at 390 px. */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
async function signIn(page: Page, db: Pool, name: string, email: string) {
  await prepareSignIn(page, db, name, email, "Browser-test-passphrase-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
  return (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
}
async function mandate(page: Page, db: Pool, user: string, org: string, role: string) {
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, user]);
  const id = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, user, role])).rows[0].id;
  await page.goto("/fr");
  await page.evaluate(async (mandateId) => {
    await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId }) });
  }, id);
}

test("the federation sets its country and its scale, every save versioned", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(120000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now();
  try {
    const fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédé règlement','federation') RETURNING id")).rows[0].id as string;
    const user = await signIn(page, db, "Présidente Règlement", `policy-${stamp}@example.test`);
    await mandate(page, db, user, fed, "federation_president");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/federation/policy");
    await expect(page.getByText("Barème BPCF 2025, sans modification.")).toBeVisible();
    await page.getByRole("combobox", { name: "Pays de la fédération" }).selectOption("NL");
    await page.getByRole("button", { name: "Enregistrer le pays" }).click();
    await expect.poll(async () => (await db.query("SELECT country_code FROM organization WHERE id=$1", [fed])).rows[0].country_code).toBe("NL");
    const academy = page.getByRole("group", { name: "Transfert international" }).getByLabel(/^Académie/);
    await academy.fill("600");
    await page.getByRole("button", { name: "Enregistrer le barème" }).click();
    await expect(page.getByText(/^Version 1, /)).toBeVisible();
    await expect(page.locator("#policy-history")).toContainText("Version 1");
    await axe(page, "policy");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.getByRole("button", { name: "Revenir au barème BPCF 2025" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Revenir au barème BPCF 2025" }).click();
    await expect(page.getByText("Barème BPCF 2025, sans modification.")).toBeVisible();
    // The registry: a player of a club of this federation, recorded by hand, the sheet following.
    const club = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club registre','club',$1) RETURNING id", [fed])).rows[0].id as string;
    const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id,identity_code")).rows[0] as { id: string; identity_code: string };
    const profile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles,status,phone) VALUES($1,$2,'Rafa Dupont','2001-02-02','{player}','active','0470 00 00 00') RETURNING id", [club, person.id])).rows[0].id as string;
    await page.goto("/fr/federation/registry");
    await expect(page.getByRole("rowheader", { name: "Rafa Dupont" })).toBeVisible();
    await expect(page.getByText(person.identity_code).first()).toBeVisible();
    await page.getByRole("radio", { name: "Par code d'identité" }).check();
    await page.getByRole("textbox", { name: /Par code d'identité/ }).fill(person.identity_code.toLowerCase());
    await page.getByLabel("Décidée le").fill("2026-01-15");
    await page.getByLabel("Classificateur ou organe (facultatif)").fill("Dr Janssens");
    await axe(page, "registry");
    await page.getByRole("button", { name: "Inscrire", exact: true }).click();
    await expect(page.getByText("PF1 · Fédé règlement · 15 janv. 2026").first()).toBeVisible();
    await expect.poll(async () => (await db.query("SELECT classification FROM player_sport_profile WHERE profile_id=$1", [profile])).rows[0]?.classification).toBe("PF1");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  } finally {
    await db.end();
  }
});

test("an operator reads the console; a club president is refused", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(120000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now();
  try {
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club console','club') RETURNING id")).rows[0].id as string;
    const user = await signIn(page, db, "Alex Exploitant", `operator-${stamp}@example.test`);
    await mandate(page, db, user, club, "club_president");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/console");
    await expect(page.getByText("Cette console est réservée aux exploitants de la plateforme.")).toBeVisible();
    await db.query("INSERT INTO platform_operator(user_id,role) VALUES($1,'owner')", [user]);
    await page.goto("/fr/console");
    await expect(page.getByRole("heading", { level: 1, name: "Console de la plateforme" })).toBeVisible();
    await expect(page.locator(".console-bar")).toContainText("Console");
    await expect(page.locator(".console-tiles")).toContainText("Organisations");
    await axe(page, "console home");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.getByRole("tab", { name: "Organisations" }).click();
    await page.getByRole("searchbox").fill("Club console");
    await page.getByRole("button", { name: "Club console" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Club console" })).toBeVisible();
    await page.getByLabel("Nouvelle note (jamais visible par l'organisation)").fill("Premier contact.");
    await page.getByRole("button", { name: "Ajouter la note" }).click();
    await expect(page.getByText("Premier contact.")).toBeVisible();
    await axe(page, "console organisation");
    await page.getByRole("tab", { name: "Opérateurs" }).click();
    await expect(page.getByRole("rowheader", { name: "Alex Exploitant" })).toBeVisible();
    // A key for the MCP server: the secret shown once, then listed by its prefix only.
    await page.getByLabel("Nom de la clé (par exemple : Claude sur mon portable)").fill("Claude portable");
    await page.getByRole("button", { name: "Créer la clé" }).click();
    await expect(page.getByText("Copiez cette clé maintenant : elle ne sera plus affichée.")).toBeVisible();
    const secret = (await page.locator(".mcp-secret code").textContent()) ?? "";
    expect(secret).toMatch(/^pfmop_[a-z0-9]{8}_/);
    await expect(page.locator("#console-mcp .console-plan strong", { hasText: "Claude portable" })).toBeVisible();
    // The server answers the protocol with that key, and refuses without it.
    const probe = await page.evaluate(async (key) => {
      const post = (headers: Record<string, string>, body: unknown) => fetch("/api/mcp", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
      return {
        noKey: (await post({}, { jsonrpc: "2.0", id: 1, method: "ping" })).status,
        list: await post({ Authorization: `Bearer ${key}` }, { jsonrpc: "2.0", id: 2, method: "tools/list" }),
      };
    }, secret);
    expect(probe.noKey).toBe(401);
    expect(probe.list.status).toBe(200);
    expect((probe.list.body as { result: { tools: { name: string }[] } }).result.tools.map((x) => x.name)).toContain("platform_overview");
    await axe(page, "console operators");
    // Series A: the daily alert's rules, saved; the reports card.
    await page.locator("#console-alerts").getByLabel("À partir de (heure, Bruxelles)").fill("8");
    await page.locator("#console-alerts").getByRole("button", { name: "Enregistrer mes alertes" }).click();
    await expect.poll(async () => (await db.query("SELECT hour FROM platform_alert_pref WHERE operator_id=$1", [user])).rows[0]?.hour).toBe(8);
    await page.getByRole("tab", { name: "Supervision" }).click();
    await expect(page.getByRole("heading", { name: "Tâches planifiées" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Rapports mensuels" })).toBeVisible();
    await axe(page, "console supervision");
    // The assistant without a key: says so, sends nothing.
    await page.getByRole("tab", { name: "Assistant" }).click();
    await expect(page.getByText(/ANTHROPIC_API_KEY/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Envoyer" })).toBeDisabled();
    await axe(page, "console assistant");
  } finally {
    await db.end();
  }
});

test("the owner bills a club, suspends it, and the president reads the invoice and the reason", async ({ page, browser }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(150000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now();
  try {
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club facturé','club') RETURNING id")).rows[0].id as string;
    // The president, in a browser of their own, reads their invoices and the suspension.
    const other = await browser.newContext({ baseURL: "http://127.0.0.1:3100", viewport: { width: 390, height: 844 } });
    const presidentPage = await other.newPage();
    const president = await signIn(presidentPage, db, "Présidente Facturée", `billed-${stamp}@example.test`);
    await mandate(presidentPage, db, president, club, "club_president");
    // The operator.
    const user = await signIn(page, db, "Alex Facturation", `billing-${stamp}@example.test`);
    await db.query("INSERT INTO platform_operator(user_id,role) VALUES($1,'owner')", [user]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/console");
    await page.getByRole("tab", { name: "Facturation" }).click();
    await page.getByRole("button", { name: "Nouvelle formule" }).click();
    const dialog = page.getByRole("dialog", { name: "Nouvelle formule" });
    await dialog.getByLabel("Code").fill(`club-${stamp}`);
    await dialog.getByLabel("Nom").fill("Club, annuel");
    await dialog.getByLabel("Montant (euros)").fill("240");
    await axe(page, "plan window");
    await dialog.getByRole("button", { name: "Enregistrer la formule" }).click();
    await expect(page.locator(".console-plan strong", { hasText: "Club, annuel" }).first()).toBeVisible();
    // The subscription opens from the club's sheet.
    await page.getByRole("tab", { name: "Organisations" }).click();
    await page.getByRole("searchbox").fill("Club facturé");
    await page.getByRole("button", { name: "Club facturé" }).click();
    const planSelect = page.getByRole("form", { name: "Ouvrir un abonnement" }).getByRole("combobox", { name: "Formule" });
    const planLabel = await planSelect.locator("option", { hasText: "Club, annuel" }).first().textContent();
    await planSelect.selectOption({ label: planLabel ?? "" });
    await page.getByRole("button", { name: "Ouvrir un abonnement" }).click();
    await expect(page.getByText("Terminer aujourd'hui")).toBeVisible();
    // The invoice, created then sent.
    await page.getByRole("tab", { name: "Facturation" }).click();
    await page.getByRole("button", { name: /Facturer une période : Club facturé/ }).click();
    await page.getByRole("button", { name: "Créer la facture" }).click();
    await expect(page.getByRole("rowheader", { name: /^F-\d{4}-\d{4}$/ }).first()).toBeVisible();
    await page.getByRole("button", { name: /^Envoyer : F-/ }).first().click();
    await expect(page.getByRole("button", { name: /^Marquer payée : F-/ }).first()).toBeVisible();
    await axe(page, "billing");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const number = (await db.query("SELECT number FROM billing_invoice WHERE organization_id=$1", [club])).rows[0].number as string;
    // Series B: Mollie not configured here, so no online button; the electronic invoice (UBL) downloads for both sides.
    await expect(page.getByText(/Mollie n'est pas branché/)).toBeVisible();
    const ublOps = await page.evaluate(async (n) => {
      const r = await fetch(`/api/console/billing?ubl=${n}`);
      return { status: r.status, type: r.headers.get("content-type") ?? "", disposition: r.headers.get("content-disposition") ?? "", body: await r.text() };
    }, (await db.query("SELECT id FROM billing_invoice WHERE number=$1", [number])).rows[0].id as string);
    expect(ublOps.status).toBe(200);
    expect(ublOps.type).toContain("xml");
    expect(ublOps.disposition).toContain(`${number}.xml`);
    expect(ublOps.body).toContain(`<cbc:ID>${number}</cbc:ID>`);
    await presidentPage.goto("/fr/club/billing");
    await expect(presidentPage.getByRole("rowheader", { name: number })).toBeVisible();
    await expect(presidentPage.getByText("À payer", { exact: true })).toBeVisible();
    await expect(presidentPage.getByRole("link", { name: /^Payer en ligne/ })).toHaveCount(0);
    const ublLink = presidentPage.getByRole("link", { name: `Facture électronique (UBL) : ${number}` });
    await expect(ublLink).toBeVisible();
    const ublMine = await presidentPage.evaluate(async (href) => {
      const r = await fetch(href);
      return { status: r.status, body: await r.text() };
    }, (await ublLink.getAttribute("href")) ?? "");
    expect(ublMine.status).toBe(200);
    expect(ublMine.body).toContain("<cbc:RegistrationName>Club facturé</cbc:RegistrationName>");
    await axe(presidentPage, "organisation billing");
    // Suspended: the president reads the reason and cannot write.
    await page.getByRole("tab", { name: "Organisations" }).click();
    await page.getByRole("searchbox").fill("Club facturé");
    await page.getByRole("button", { name: "Club facturé" }).click();
    await page.getByRole("button", { name: "Suspendre (lecture seule)" }).click();
    await page.getByRole("dialog").getByLabel("Raison, lue par les membres de l'organisation").fill("Facture impayée depuis 60 jours");
    await page.getByRole("dialog").getByRole("button", { name: "Suspendre (lecture seule)" }).click();
    await expect(page.getByText("Facture impayée depuis 60 jours")).toBeVisible();
    await presidentPage.goto("/fr");
    await expect(presidentPage.locator(".suspended-banner")).toContainText("Facture impayée depuis 60 jours");
    const status = await presidentPage.evaluate(async () => (await fetch("/api/club", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "x" }) })).status);
    expect(status).toBe(403);
    await page.getByRole("button", { name: "Réactiver" }).click();
    await expect(page.getByRole("button", { name: "Suspendre (lecture seule)" })).toBeVisible();
    // Support access: the operator opens the club as president for a while, goes in, and ends it.
    await page.getByRole("button", { name: "Ouvrir comme président (support)" }).click();
    await page.getByRole("dialog").getByLabel("Raison, lue par la présidence").fill("Vérifier la page des cotisations avec la présidente");
    await axe(page, "borrow window");
    await page.getByRole("dialog").getByRole("button", { name: "Ouvrir l'accès" }).click();
    await expect(page.getByText(/^Accès de support ouvert jusqu'à /)).toBeVisible();
    await expect(page.getByText("Vérifier la page des cotisations avec la présidente").first()).toBeVisible();
    await page.getByRole("button", { name: "Passer dans l'organisation" }).click();
    await expect(page).toHaveURL(/\/fr$/);
    await expect(page.locator(".brand-org")).toContainText("Club facturé", { timeout: 15000 });
    await page.goto("/fr/console");
    await page.getByRole("tab", { name: "Organisations" }).click();
    await page.getByRole("searchbox").fill("Club facturé");
    await page.getByRole("button", { name: "Club facturé" }).click();
    await page.getByRole("button", { name: "Terminer l'accès" }).click();
    await expect(page.getByRole("button", { name: "Ouvrir comme président (support)" })).toBeVisible();
    expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE organization_id=$1 AND action IN ('platform.borrow','platform.borrow.end')", [club])).rows[0].n).toBe(2);
    await other.close();
  } finally {
    await db.end();
  }
});

test("a president writes to the support, the operator answers from the console and follows a GDPR request", async ({ page, browser }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(120000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now();
  try {
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club support','club') RETURNING id")).rows[0].id as string;
    // The president, in a browser of their own, at phone width.
    const other = await browser.newContext({ baseURL: "http://127.0.0.1:3100", viewport: { width: 390, height: 844 } });
    const presidentPage = await other.newPage();
    const president = await signIn(presidentPage, db, "Présidente Demandeuse", `asking-${stamp}@example.test`);
    await mandate(presidentPage, db, president, club, "club_president");
    await presidentPage.goto("/fr/support");
    await presidentPage.getByRole("button", { name: "Écrire au support" }).click();
    await presidentPage.getByLabel("Sujet").fill("Facture introuvable");
    await presidentPage.getByLabel("Votre message").fill("Je ne trouve pas la facture de novembre.");
    await axe(presidentPage, "support form");
    await presidentPage.getByRole("button", { name: "Envoyer", exact: true }).click();
    await expect(presidentPage.getByText("Votre demande est envoyée ; le support vous répond ici.")).toBeVisible();
    await expect(presidentPage.getByRole("heading", { name: /Facture introuvable/ })).toBeVisible();
    await expect(presidentPage.getByText("En attente de réponse")).toBeVisible();
    expect(await presidentPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    // The operator answers from the console.
    const user = await signIn(page, db, "Sam Support", `desk-${stamp}@example.test`);
    await db.query("INSERT INTO platform_operator(user_id,role) VALUES($1,'support')", [user]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/console");
    await page.getByRole("tab", { name: "Support" }).click();
    await expect(page.getByText(/1 en attente/)).toBeVisible();
    await axe(page, "support desk");
    await page.getByRole("button", { name: "Facture introuvable : Ouvrir le ticket" }).click();
    await expect(page.getByText("Je ne trouve pas la facture de novembre.")).toBeVisible();
    await page.getByLabel("Votre réponse").fill("Elle est sur la page Abonnement à la plateforme.");
    await axe(page, "ticket");
    await page.getByRole("button", { name: "Répondre", exact: true }).click();
    await expect(page.getByText("Répondu", { exact: true })).toBeVisible();
    await expect(page.getByText(/Réponse · Sam Support/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    // The president reads the answer and replies; the ticket waits again.
    await presidentPage.reload();
    await expect(presidentPage.getByText("Elle est sur la page Abonnement à la plateforme.")).toBeVisible();
    await expect(presidentPage.getByText("Répondu", { exact: true })).toBeVisible();
    await presidentPage.getByRole("button", { name: /^Répondre : Facture introuvable/ }).click();
    await presidentPage.getByLabel("Votre réponse").fill("Trouvée, merci.");
    await presidentPage.getByRole("button", { name: "Envoyer", exact: true }).click();
    await expect(presidentPage.getByText("Votre réponse est envoyée.")).toBeVisible();
    await page.getByRole("button", { name: "Retour aux tickets" }).click();
    await expect(page.locator(".badge", { hasText: "En attente de réponse" })).toBeVisible();
    // A GDPR request of a member, three days from its deadline: the operator reminds the presidency.
    const member = (await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true) RETURNING id', [`m-${stamp}`, "Membre Curieux", `member-${stamp}@example.test`])).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, member]);
    const request = (await db.query("INSERT INTO data_request(organization_id,requester_id,kind,details,due_on) VALUES($1,$2,'access','Tout',CURRENT_DATE+3) RETURNING id", [club, member])).rows[0].id as string;
    await page.reload();
    await page.getByRole("tab", { name: "Support" }).click();
    await expect(page.getByText("3 jour(s) restant(s)")).toBeVisible();
    await page.getByRole("button", { name: "Rappeler la présidence : Club support" }).click();
    await expect(page.getByText(/1 rappel\(s\), dernier le/)).toBeVisible();
    expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE resource_id LIKE $1", [`privacy:${request}:manual%`])).rows[0].n).toBe(1);
    // Answered by the president: the certificate downloads for the president, not for the operator.
    await db.query("UPDATE data_request SET status='done',response='Copie envoyée.',handled_by=$2,handled_at=now(),certificate_number='RGPD-2026-' || lpad((floor(random()*8999)+1000)::text,4,'0') WHERE id=$1", [request, president]);
    const mine = await presidentPage.evaluate(async (id) => {
      const r = await fetch(`/api/privacy/requests?certificate=${id}`);
      return { status: r.status, type: r.headers.get("content-type") ?? "", head: (await r.text()).slice(0, 5) };
    }, request);
    expect(mine).toEqual({ status: 200, type: "application/pdf", head: "%PDF-" });
    expect(await page.evaluate(async (id) => (await fetch(`/api/privacy/requests?certificate=${id}`)).status, request)).toBe(404);
    await other.close();
  } finally {
    await db.end();
  }
});
