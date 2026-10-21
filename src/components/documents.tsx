"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import type { Locale } from "@/lib/locale";
import { useScope } from "./use-scope";
import type { documentView } from "@/domains/documents/service";
import { categories, statuses } from "@/domains/documents/schema";
import {
  documentCopy,
  categoryLabels,
  documentStatuses,
  documentErrors,
} from "./documents-copy";
import { registrationErrors } from "./registrations-copy";
import { Button, Panel, Badge, PageHeader } from "./ui";
import { DataGrid, postCommand } from "./data-grid";
import { bulkCopy } from "./bulk-copy";
import { SignaturePad, signatureCopy } from "./signature-pad";
type View = Awaited<ReturnType<typeof documentView>>;
function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}
const remindLabel = {
  fr: "Relancer les documents manquants",
  nl: "Herinneren aan ontbrekende documenten",
  en: "Remind about missing documents",
};
export function Documents({ locale }: { locale: Locale }) {
  const t = documentCopy[locale],
    cl = categoryLabels[locale],
    sl = documentStatuses[locale];
  const [data, setData] = useState<View | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [selected, setSelected] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [category, setCategory] = useState(""),
    [ruleId, setRule] = useState(""),
    [templateId, setTemplate] = useState("");
  // The top bar's team (wave 12) narrows the list to its members' documents.
  const scope = useScope();
  const scopedUrl = "/api/documents" + (scope.teamId ? `?team=${scope.teamId}` : "");
  const load = useCallback(async () => {
    const r = await fetch(scopedUrl, { cache: "no-store" }),
      body = await r.json();
    if (!r.ok) throw new Error(body.error);
    setData(body);
  }, [scopedUrl]);
  const errorText = useCallback(
    (code: string) =>
      (documentErrors[code] ?? registrationErrors[code])?.[
        locale === "en" ? 2 : locale === "fr" ? 0 : 1
      ] ??
      (locale === "en"
        ? "Service unavailable. Refresh and try again."
        : locale === "fr"
          ? "Service indisponible. Actualisez puis réessayez."
          : "Dienst niet beschikbaar. Vernieuw en probeer opnieuw."),
    [locale],
  );
  useEffect(() => {
    Promise.resolve()
      .then(load)
      .catch((e) => setError(errorText(e.message)))
      .finally(() => setLoading(false));
  }, [load, errorText]);
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await load();
      setMessage(t.saved);
    } catch (e) {
      setError(errorText(e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }
  async function send(body: Record<string, unknown>) {
    const r = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          organizationId: data?.context.organization_id,
        }),
      }),
      b = await r.json();
    if (!r.ok) throw new Error(b.error);
    return b;
  }
  function form(
    e: FormEvent<HTMLFormElement>,
    fn: (d: FormData) => Promise<void>,
  ) {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    void task(() => fn(values));
  }
  const b = bulkCopy[locale];
  const doc = data?.documents.find((d) => d.id === selected),
    rule = data?.rules.find((r) => r.id === ruleId),
    tpl = data?.templates.find((r) => r.id === templateId);
  const seasons = (data?.seasons ?? []).map((s) => (
      <option key={s.id} value={s.id}>
        {s.name}
      </option>
    )),
    categoryOptions = categories.map((c) => (
      <option key={c} value={c}>
        {cl[c]}
      </option>
    ));
  const visible =
    data?.documents.filter(
      (d) =>
        (!status || d.status === status) &&
        (!category || d.category === category) &&
        (d.name + " " + (d.owner_name ?? ""))
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    ) ?? [];
  return (
    <>
      <main id="main" className="access documents">
        <PageHeader title={t.title} subtitle={t.intro} />
        {data?.manage && (
          <p>
            <Link
              className="button secondary"
              href={`/${locale}/reminders?kind=documents`}
            >
              {remindLabel[locale]}
            </Link>
          </p>
        )}
        <div role="status">{loading ? t.loading : message}</div>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        {!data && !loading && (
          <Link href={"/" + locale + "/access"}>{t.access}</Link>
        )}
        {data && (
          <>
            <p className="notice">{data.context.name}</p>
            {!data.mfa && <p>{t.mfa}</p>}
            <p className="muted">{t.sensitiveHint}</p>
            <div className="actions">
              {/* Licences and transfers keep their own page; the documents page points to it (wave 11). */}
              <Link className="button secondary" href={"/" + locale + "/licenses"}>
                {locale === "fr" ? "Licences et transferts" : locale === "en" ? "Licences and transfers" : "Licenties en transfers"}
              </Link>
              <Button
                onClick={() => {
                  setCategory("training");
                  setStatus("");
                  setQuery("");
                }}
              >
                {locale === "fr"
                  ? "Fiches d’exercice"
                  : locale === "en"
                    ? "Exercise sheets"
                    : "Oefenfiches"}
              </Button>
              <Link href={"/" + locale + "/calendar"}>
                {locale === "fr"
                  ? "Associer à un entraînement"
                  : locale === "en"
                    ? "Attach to training"
                    : "Aan training koppelen"}
              </Link>
              <Link href={"/" + locale + "/messages"}>
                {locale === "fr"
                  ? "Messagerie"
                  : locale === "en"
                    ? "Messages"
                    : "Berichten"}
              </Link>
            </div>
            <Panel title={t.library}>
              <p className="muted">{t.limits}</p>
              <Field id="document-search" label={t.search}>
                <input
                  id="document-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </Field>
              <Field id="document-status" label={t.status}>
                <select
                  id="document-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">{t.all}</option>
                  {statuses.map((v) => (
                    <option key={v} value={v}>
                      {sl[v]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="document-category" label={t.category}>
                <select
                  id="document-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">{t.all}</option>
                  {categoryOptions}
                </select>
              </Field>
              <DataGrid
                locale={locale}
                label={t.library}
                storageKey="documents"
                rows={visible}
                rowId={(d) => d.id}
                rowName={(d) => `${d.name} · ${d.owner_name ?? t.org}`}
                onDone={load}
                reasons={b.reasons}
                columns={[
                  {
                    key: "name",
                    header: b.document,
                    rowHeader: true,
                    hideable: false,
                    sort: (d) => d.name,
                    cell: (d) => (
                      <Button onClick={() => setSelected(d.id)}>
                        {d.name} · {sl[d.status as (typeof statuses)[number]]}
                      </Button>
                    ),
                  },
                  { key: "owner", header: b.person, sort: (d) => d.owner_name ?? "", cell: (d) => d.owner_name ?? t.org },
                  { key: "season", header: t.season, sort: (d) => d.season_name, cell: (d) => d.season_name },
                  { key: "expires", header: b.expiresOn, sort: (d) => d.expires_on, cell: (d) => d.expires_on ?? "" },
                  {
                    key: "task",
                    header: t.status,
                    sort: (d) => sl[d.status as (typeof statuses)[number]],
                    cell: (d) =>
                      d.task ? (
                        <Badge tone={d.task.kind === "expired" ? "danger" : "warning"}>{d.task.kind === "expired" ? t.expired : d.task.kind === "review" ? t.reviewTask : t.missing}</Badge>
                      ) : (
                        sl[d.status as (typeof statuses)[number]]
                      ),
                  },
                ]}
                actions={[
                  {
                    id: "relaunch",
                    label: b.relaunch,
                    icon: "bell",
                    hidden: !data.manage,
                    confirm: b.relaunchConfirm,
                    run: async (chosen) => {
                      // One reminder per person, whatever the number of their documents chosen.
                      const outcome = new Map<string, string | null>();
                      for (const profile of new Set(chosen.map((d) => d.profile_id).filter((x): x is string => !!x))) {
                        try {
                          const r = await postCommand("/api/reminders", { organizationId: data.context.organization_id, action: "send", kind: "documents", profileIds: [profile] });
                          outcome.set(profile, !r.people ? "NOT_CONCERNED" : !r.messages ? "NO_EMAIL" : null);
                        } catch (e) {
                          outcome.set(profile, e instanceof Error ? e.message : "UNAVAILABLE");
                        }
                      }
                      return chosen.map((d) => {
                        const code = d.profile_id ? outcome.get(d.profile_id) : "NO_PERSON";
                        return code ? { id: d.id, ok: false as const, code } : { id: d.id, ok: true as const };
                      });
                    },
                  },
                ]}
              />
              {!visible.length && <p>{t.empty}</p>}
            </Panel>
            {doc && (
              <Panel title={doc.name}>
                <p>
                  {sl[doc.status as (typeof statuses)[number]]} ·{" "}
                  {cl[doc.category as (typeof categories)[number]]} ·{" "}
                  {doc.owner_name ?? t.org}
                </p>
                {doc.canUpload && (
                  <form
                    onSubmit={(e) =>
                      form(e, async (d) => {
                        d.set("organizationId", data.context.organization_id);
                        d.set("version", String(doc.version));
                        const r = await fetch("/api/documents/file/" + doc.id, {
                          method: "POST",
                          body: d,
                        });
                        if (!r.ok) throw new Error((await r.json()).error);
                      })
                    }
                  >
                    <Field id="document-upload" label={t.file}>
                      <input
                        id="document-upload"
                        name="file"
                        type="file"
                        accept="application/pdf,image/png,image/jpeg"
                        required
                      />
                    </Field>
                    <p className="muted">{t.fileHint}</p>
                    <Button disabled={busy}>{t.upload}</Button>
                  </form>
                )}
                {doc.signatures.length > 0 && (
                  <ul className="records">
                    {doc.signatures.map(
                      (
                        g: { signer_name: string; signed_at: string },
                        i: number,
                      ) => (
                        <li key={i}>
                          <Badge tone="success">
                            {signatureCopy[locale].signed
                              .replace("{name}", g.signer_name)
                              .replace(
                                "{date}",
                                new Date(g.signed_at).toLocaleString(
                                  locale === "en" ? "en-GB" : `${locale}-BE`,
                                  { timeZone: "Europe/Brussels" },
                                ),
                              )}
                          </Badge>
                        </li>
                      ),
                    )}
                  </ul>
                )}
                {doc.canSign && (
                  <SignaturePad
                    locale={locale}
                    busy={busy}
                    onSign={(input) =>
                      void task(async () => {
                        const r = await fetch("/api/documents/sign/" + doc.id, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            ...input,
                            accept: true,
                            version: doc.version,
                            organizationId: data.context.organization_id,
                          }),
                        });
                        if (!r.ok) throw new Error((await r.json()).error);
                      })
                    }
                  />
                )}
                <h3>{t.versions}</h3>
                <ul>
                  {doc.versions.map(
                    (v: {
                      id: string;
                      sequence: number;
                      filename: string;
                      uploader: string;
                      reviewer: string | null;
                      verdict: string | null;
                    }) => (
                      <li key={v.id}>
                        {t.version} {v.sequence} ·{" "}
                        <a
                          href={
                            "/api/documents/file/" +
                            v.id +
                            "?organizationId=" +
                            data.context.organization_id
                          }
                        >
                          {t.download} {v.filename}
                        </a>
                        <p>
                          {v.uploader}
                          {v.reviewer && " · " + v.reviewer}
                          {v.verdict &&
                            " · " + sl[v.verdict as (typeof statuses)[number]]}
                        </p>
                      </li>
                    ),
                  )}
                </ul>
                {doc.canManage && (
                  <>
                    <h3>{t.review}</h3>
                    <form
                      key={doc.id + ":" + doc.version}
                      onSubmit={(e) =>
                        form(e, async (d) => {
                          await send({
                            action: "review",
                            id: doc.id,
                            expectedVersion: doc.version,
                            status: d.get("status"),
                            message: d.get("message"),
                            expiresOn: d.get("expires") || null,
                          });
                        })
                      }
                    >
                      <Field id="review-status" label={t.decision}>
                        <select
                          id="review-status"
                          name="status"
                          defaultValue="review"
                        >
                          {(
                            [
                              "review",
                              "valid",
                              "refused",
                              "requested",
                              "archived",
                            ] as const
                          ).map((v) => (
                            <option key={v} value={v}>
                              {sl[v]}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field id="review-message" label={t.message}>
                        <textarea
                          id="review-message"
                          name="message"
                          maxLength={2000}
                        />
                      </Field>
                      <Field id="review-expires" label={t.expires}>
                        <input
                          id="review-expires"
                          name="expires"
                          type="date"
                          defaultValue={doc.expires_on ?? ""}
                        />
                      </Field>
                      <Button disabled={busy || doc.status === "archived"}>
                        {t.validate}
                      </Button>
                    </form>
                    {data.templates.length > 0 && (
                      <form
                        onSubmit={(e) =>
                          form(e, async (d) => {
                            await send({
                              action: "generate",
                              id: doc.id,
                              templateId: d.get("template"),
                              expectedVersion: doc.version,
                            });
                          })
                        }
                      >
                        <Field id="generation-template" label={t.template}>
                          <select
                            id="generation-template"
                            name="template"
                            required
                          >
                            <option value="">—</option>
                            {data.templates.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name} · {v.locale} · {v.version}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Button disabled={busy || doc.status === "archived"}>
                          {t.generate}
                        </Button>
                      </form>
                    )}
                    {data.imports.some(
                      (f) => f.profile_id === doc.profile_id,
                    ) && (
                      <form
                        onSubmit={(e) =>
                          form(e, async (d) => {
                            await send({
                              action: "import",
                              id: doc.id,
                              attachmentId: d.get("attachment"),
                              expectedVersion: doc.version,
                            });
                          })
                        }
                      >
                        <Field id="import-attachment" label={t.imports}>
                          <select
                            id="import-attachment"
                            name="attachment"
                            required
                          >
                            {data.imports
                              .filter((f) => f.profile_id === doc.profile_id)
                              .map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.filename}
                                </option>
                              ))}
                          </select>
                        </Field>
                        <p>{t.importHint}</p>
                        <Button disabled={busy}>{t.import}</Button>
                      </form>
                    )}
                    <h3>{t.share}</h3>
                    <p>{t.shareHint}</p>
                    {doc.status === "valid" && data.federations.length > 0 && (
                      <form
                        onSubmit={(e) =>
                          form(e, async (d) => {
                            await send({
                              action: "share",
                              id: doc.id,
                              expectedVersion: doc.version,
                              federationId: d.get("federation"),
                              expiresOn: d.get("until"),
                            });
                          })
                        }
                      >
                        <Field id="share-federation" label={t.federation}>
                          <select
                            id="share-federation"
                            name="federation"
                            required
                          >
                            {data.federations.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field id="share-until" label={t.until}>
                          <input
                            id="share-until"
                            name="until"
                            type="date"
                            required
                            max={doc.expires_on ?? undefined}
                          />
                        </Field>
                        <Button disabled={busy}>{t.shareButton}</Button>
                      </form>
                    )}
                    <ul>
                      {doc.shares.map(
                        (sh: {
                          id: string;
                          name: string;
                          expires_on: string;
                          revoked_at: string | null;
                        }) => (
                          <li key={sh.id}>
                            {sh.name} · {sh.expires_on}{" "}
                            {sh.revoked_at ? (
                              t.revoked
                            ) : (
                              <Button
                                disabled={busy}
                                onClick={() =>
                                  void task(async () => {
                                    await send({ action: "revoke", id: sh.id });
                                  })
                                }
                              >
                                {t.revoke}
                              </Button>
                            )}
                          </li>
                        ),
                      )}
                    </ul>
                  </>
                )}
                <h3>{t.history}</h3>
                <ol>
                  {doc.history.map(
                    (h: {
                      id: string;
                      action: string;
                      actor: string | null;
                      created_at: string;
                      message: string;
                    }) => (
                      <li key={h.id}>
                        {sl[h.action as (typeof statuses)[number]] ??
                          (h.action === "uploaded"
                            ? sl.uploaded
                            : h.action === "downloaded"
                              ? t.download
                              : h.action === "shared"
                                ? t.share
                                : h.action === "share.revoked"
                                  ? t.revoked
                                  : h.action)}{" "}
                        · {h.actor ?? t.system} ·{" "}
                        {new Date(h.created_at).toLocaleString(locale)}
                        {h.message && <p>{h.message}</p>}
                      </li>
                    ),
                  )}
                </ol>
              </Panel>
            )}
            {data.manage && (
              <>
                <Panel title={t.request}>
                  <form
                    onSubmit={(e) =>
                      form(e, async (d) => {
                        const r = await send({
                          action: "request",
                          profileId: d.get("profile") || undefined,
                          seasonId: d.get("season"),
                          name: d.get("name"),
                          category: d.get("category"),
                          sensitive: d.has("sensitive"),
                        });
                        setSelected(r.id);
                      })
                    }
                  >
                    <Field id="request-owner" label={t.owner}>
                      <select id="request-owner" name="profile">
                        <option value="">{t.org}</option>
                        {data.profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field id="request-season" label={t.season}>
                      <select id="request-season" name="season" required>
                        {seasons}
                      </select>
                    </Field>
                    <Field id="request-name" label={t.name}>
                      <input
                        id="request-name"
                        name="name"
                        required
                        minLength={2}
                        maxLength={120}
                      />
                    </Field>
                    <Field id="request-category" label={t.category}>
                      <select id="request-category" name="category">
                        {categoryOptions}
                      </select>
                    </Field>
                    <label className="check">
                      <input type="checkbox" name="sensitive" />
                      {t.sensitive}
                    </label>
                    <Button disabled={busy || !data.seasons.length}>
                      {t.create}
                    </Button>
                  </form>
                </Panel>
                <Panel title={t.rules}>
                  <p>{t.ruleHint}</p>
                  <ul>
                    {data.rules.map((r) => (
                      <li key={r.id}>
                        {r.name} · {r.active ? t.active : sl.archived}{" "}
                        <Button onClick={() => setRule(r.id)}>
                          {t.edit} {r.name}
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <Button onClick={() => setRule("")}>{t.newRule}</Button>
                  <form
                    key={ruleId + ":" + (rule?.version ?? 0)}
                    onSubmit={(e) =>
                      form(e, async (d) => {
                        await send({
                          action: "rule",
                          id: rule?.id,
                          expectedVersion: rule?.version,
                          seasonId: d.get("season"),
                          name: d.get("name"),
                          category: d.get("category"),
                          sensitive: d.has("sensitive"),
                          role: d.get("role"),
                          minAge: Number(d.get("minAge")),
                          maxAge: Number(d.get("maxAge")),
                          active: d.has("active"),
                        });
                      })
                    }
                  >
                    <Field id="rule-name" label={t.rule}>
                      <input
                        id="rule-name"
                        name="name"
                        required
                        minLength={2}
                        maxLength={120}
                        defaultValue={rule?.name}
                      />
                    </Field>
                    <Field id="rule-season" label={t.season}>
                      <select
                        id="rule-season"
                        name="season"
                        required
                        defaultValue={rule?.season_id}
                        disabled={!!rule}
                      >
                        {seasons}
                      </select>
                      {rule && (
                        <input
                          type="hidden"
                          name="season"
                          value={rule.season_id}
                        />
                      )}
                    </Field>
                    <Field id="rule-category" label={t.category}>
                      <select
                        id="rule-category"
                        name="category"
                        defaultValue={rule?.category}
                      >
                        {categoryOptions}
                      </select>
                    </Field>
                    <Field id="rule-role" label={t.role}>
                      <select
                        id="rule-role"
                        name="role"
                        defaultValue={rule?.role ?? "any"}
                      >
                        <option value="any">{t.any}</option>
                        {["player", "coach", "assistant", "volunteer"].map(
                          (r) => (
                            <option key={r} value={r}>
                              {locale === "en"
                                ? {
                                    player: "Player",
                                    coach: "Coach",
                                    assistant: "Assistant",
                                    volunteer: "Volunteer",
                                  }[r]
                                : locale === "fr"
                                  ? {
                                      player: "Joueur",
                                      coach: "Coach",
                                      assistant: "Assistant",
                                      volunteer: "Bénévole",
                                    }[r]
                                  : {
                                      player: "Speler",
                                      coach: "Coach",
                                      assistant: "Assistent",
                                      volunteer: "Vrijwilliger",
                                    }[r]}
                            </option>
                          ),
                        )}
                      </select>
                    </Field>
                    <Field id="rule-min" label={t.minAge}>
                      <input
                        id="rule-min"
                        name="minAge"
                        type="number"
                        required
                        min={0}
                        max={120}
                        defaultValue={rule?.min_age ?? 0}
                      />
                    </Field>
                    <Field id="rule-max" label={t.maxAge}>
                      <input
                        id="rule-max"
                        name="maxAge"
                        type="number"
                        required
                        min={0}
                        max={120}
                        defaultValue={rule?.max_age ?? 120}
                      />
                    </Field>
                    <label className="check">
                      <input
                        name="active"
                        type="checkbox"
                        defaultChecked={rule?.active ?? true}
                      />
                      {t.active}
                    </label>
                    <label className="check">
                      <input
                        name="sensitive"
                        type="checkbox"
                        defaultChecked={rule?.sensitive}
                      />
                      {t.sensitive}
                    </label>
                    <Button disabled={busy || !data.seasons.length}>
                      {t.saveRule}
                    </Button>
                  </form>
                  <form
                    onSubmit={(e) =>
                      form(e, async (d) => {
                        await send({
                          action: "plan",
                          seasonId: d.get("season"),
                        });
                      })
                    }
                  >
                    <Field id="plan-season" label={t.season}>
                      <select id="plan-season" name="season" required>
                        {seasons}
                      </select>
                    </Field>
                    <p>{t.planHint}</p>
                    <Button disabled={busy || !data.seasons.length}>
                      {t.plan}
                    </Button>
                  </form>
                  {data.followups.length > 0 && (
                    <>
                      <h3>{t.followups}</h3>
                      <ul>
                        {data.followups.map((f) => (
                          <li key={f.id}>
                            {f.full_name} · {f.season_name}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </Panel>
                <Panel title={t.templates}>
                  <Field id="template-select" label={t.template}>
                    <select
                      id="template-select"
                      value={templateId}
                      onChange={(e) => setTemplate(e.target.value)}
                    >
                      <option value="">{t.newTemplate}</option>
                      {data.templates.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} · {v.locale} · {v.version}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <form
                    key={templateId}
                    onSubmit={(e) =>
                      form(e, async (d) => {
                        await send({
                          action: "template",
                          name: d.get("name"),
                          locale: d.get("locale"),
                          body: d.get("body"),
                          expectedVersion: tpl?.version ?? 0,
                        });
                      })
                    }
                  >
                    <Field id="template-name" label={t.name}>
                      <input
                        id="template-name"
                        name="name"
                        required
                        minLength={2}
                        maxLength={120}
                        defaultValue={tpl?.name}
                        readOnly={!!tpl}
                      />
                    </Field>
                    <Field id="template-locale" label={t.language}>
                      <select
                        id="template-locale"
                        name="locale"
                        defaultValue={tpl?.locale ?? locale}
                        disabled={!!tpl}
                      >
                        <option value="fr">Français</option>
                        <option value="nl">Nederlands</option>
                        <option value="en">English</option>
                      </select>
                      {tpl && (
                        <input name="locale" type="hidden" value={tpl.locale} />
                      )}
                    </Field>
                    <Field id="template-body" label={t.body}>
                      <textarea
                        id="template-body"
                        name="body"
                        required
                        minLength={5}
                        maxLength={10000}
                        rows={7}
                        defaultValue={tpl?.body}
                      />
                    </Field>
                    <p>{t.templateHint}</p>
                    <Button disabled={busy}>{t.saveTemplate}</Button>
                  </form>
                </Panel>
              </>
            )}
          </>
        )}
        <Button disabled={busy} onClick={() => void task(load)}>
          {t.refresh}
        </Button>
      </main>
    </>
  );
}
