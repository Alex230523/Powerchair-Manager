"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import { useScope } from "./use-scope";
import type {
  clubLicensesView,
  federationLicensesView,
} from "@/domains/federation/service";
import { licensesCopy } from "./licenses-copy";
import { errors } from "./access-copy";
import { useData, usePost } from "./use-api";
import { Badge, PageHeader, Card, EmptyState } from "./ui";

const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
export function ClubLicenses({ locale }: { locale: Locale }) {
  const t = licensesCopy[locale];
  const failure = useCallback(
    (code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable,
    [t, locale],
  );
  const scope = useScope();
  const { data, error, setError, denied, reload } = useData<
    Awaited<ReturnType<typeof clubLicensesView>>
  >("/api/licenses" + (scope.teamId ? `?team=${scope.teamId}` : ""), failure);
  const { busy, message, post } = usePost(
    "/api/licenses",
    reload,
    setError,
    failure,
  );
  const [chosen, setChosen] = useState<string[]>([]);
  const send = (body: Record<string, unknown>, done: string) =>
    post({ ...body, organizationId: data?.organization_id }, done);
  const candidates =
    data?.players.filter(
      (x) => !x.license_status || x.license_status === "refused",
    ) ?? [];

  return (
    <main id="main" className="access licenses">
      <PageHeader title={t.clubTitle} subtitle={t.clubIntro} />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {denied && <p className="notice">{t.denied}</p>}
      {!data && !denied && !error && <p role="status">{t.loading}</p>}
      {data && !data.federation && <p className="notice">{t.noFederation}</p>}
      {data && (
        <>
          <p>
            <strong>
              {data.federation?.name} · {t.season} {data.season}
            </strong>
          </p>
          {data.players.length ? (
            <div
              className="table-scroll"
              role="region"
              aria-label={t.clubTitle}
              tabIndex={0}
            >
              <table className="ledger">
                <thead>
                  <tr>
                    {data.can.manage && (
                      <th scope="col">
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={
                              chosen.length > 0 &&
                              chosen.length === candidates.length
                            }
                            onChange={(e) =>
                              setChosen(
                                e.target.checked
                                  ? candidates.map((x) => x.id)
                                  : [],
                              )
                            }
                          />
                          <span className="sr-only">{t.selectAll}</span>
                        </label>
                      </th>
                    )}
                    <th scope="col">{t.player}</th>
                    <th scope="col">{t.born}</th>
                    <th scope="col">{t.license}</th>
                    <th scope="col">{t.classification}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.players.map((x) => {
                    const selectable =
                      !x.license_status || x.license_status === "refused";
                    return (
                      <tr key={x.id}>
                        {data.can.manage && (
                          <td>
                            {selectable && (
                              <input
                                type="checkbox"
                                aria-label={`${t.select} : ${x.full_name}`}
                                checked={chosen.includes(x.id)}
                                onChange={(e) =>
                                  setChosen(
                                    e.target.checked
                                      ? [...chosen, x.id]
                                      : chosen.filter((c) => c !== x.id),
                                  )
                                }
                              />
                            )}
                          </td>
                        )}
                        <td>
                          <Link href={`/${locale}/players/${x.id}`}>
                            {x.full_name}
                          </Link>
                        </td>
                        <td>{x.birth_year ?? ""}</td>
                        <td>
                          <Badge tone={
                              x.license_status === "active"
                                ? "success"
                                : x.license_status === "requested"
                                  ? "warning"
                                  : x.license_status
                                    ? "danger"
                                    : ""
                            }>
                            {t.licenseStatus[x.license_status ?? "none"]}
                          </Badge>
                          {x.license_number && (
                            <span className="muted"> · {x.license_number}</span>
                          )}
                          {x.license_status === "requested" &&
                            data.can.manage && (
                              <button
                                type="button"
                                className="text-button"
                                disabled={busy}
                                onClick={() =>
                                  void send(
                                    {
                                      action: "cancelLicense",
                                      id: x.license_id,
                                    },
                                    t.done,
                                  )
                                }
                              >
                                {t.cancel}
                                <span className="sr-only">
                                  {" "}
                                  : {x.full_name}
                                </span>
                              </button>
                            )}
                        </td>
                        <td>
                          {t.classes[x.classification] ?? x.classification}
                          {x.classification_valid_until && (
                            <span className="muted">
                              {" "}
                              · {t.until} {x.classification_valid_until}
                            </span>
                          )}{" "}
                          <Badge tone={
                              x.classification_status === "validated"
                                ? "success"
                                : x.classification_status === "requested"
                                  ? "warning"
                                  : x.classification_status === "refused"
                                    ? "danger"
                                    : ""
                            }>
                            {t.classStatus[x.classification_status]}
                          </Badge>
                          {x.classification_note && (
                            <span className="muted">
                              {" "}
                              · {x.classification_note}
                            </span>
                          )}
                          {data.can.manage &&
                            data.federation &&
                            ["PF1", "PF2", "pending"].includes(
                              x.classification,
                            ) &&
                            ["unverified", "refused"].includes(
                              x.classification_status,
                            ) && (
                              <button
                                type="button"
                                className="text-button"
                                disabled={busy}
                                onClick={() =>
                                  void send(
                                    {
                                      action: "requestClassification",
                                      profileId: x.id,
                                    },
                                    t.requested,
                                  )
                                }
                              >
                                {t.askCheck}
                                <span className="sr-only">
                                  {" "}
                                  : {x.full_name}
                                </span>
                              </button>
                            )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title={t.noPlayer} />
          )}
          {data.can.manage && data.federation && (
            <p>
              <button
                type="button"
                className="button"
                disabled={busy || !chosen.length}
                onClick={() =>
                  void send(
                    {
                      action: "requestLicenses",
                      season: data.season,
                      profileIds: chosen,
                    },
                    t.requested,
                  ).then((ok) => ok && setChosen([]))
                }
              >
                {t.request} ({chosen.length})
              </button>
            </p>
          )}
        </>
      )}
    </main>
  );
}

export function FederationLicenses({ locale }: { locale: Locale }) {
  const t = licensesCopy[locale];
  const failure = useCallback(
    (code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable,
    [t, locale],
  );
  const { data, error, setError, denied, reload } = useData<
    Awaited<ReturnType<typeof federationLicensesView>>
  >("/api/federation/licenses", failure);
  const { busy, message, post } = usePost(
    "/api/federation/licenses",
    reload,
    setError,
    failure,
  );
  const [chosen, setChosen] = useState<string[]>([]);
  const send = (body: Record<string, unknown>) =>
    post({ ...body, organizationId: data?.organization_id }, t.done);
  const day = (d: string | null) =>
    d
      ? new Intl.DateTimeFormat(tag(locale), {
          day: "numeric",
          month: "short",
          year: "numeric",
        }).format(new Date(d))
      : "";
  const pending = data?.licenses.filter((l) => l.status === "requested") ?? [];
  const decided = data?.licenses.filter((l) => l.status !== "requested") ?? [];

  return (
    <main id="main" className="access licenses">
      <PageHeader title={t.fedTitle} subtitle={t.fedIntro} />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {denied && <p className="notice">{t.denied}</p>}
      {!data && !denied && !error && <p role="status">{t.loading}</p>}
      {data && (
        <>
          <Card title={<>{t.licenses} · {t.pending} ({pending.length})</>} labelledBy="fed-licenses" headingId="fed-licenses">
            {pending.length ? (
              <>
                <ul className="records">
                  {pending.map((l) => (
                    <li key={l.id}>
                      <label className="check">
                        {data.can.manage && (
                          <input
                            type="checkbox"
                            checked={chosen.includes(l.id)}
                            onChange={(e) =>
                              setChosen(
                                e.target.checked
                                  ? [...chosen, l.id]
                                  : chosen.filter((c) => c !== l.id),
                              )
                            }
                          />
                        )}
                        <span>
                          <strong>{l.full_name}</strong>
                          <span className="muted">
                            {" "}
                            · {l.birth_year ?? ""} · {l.club} · {t.season}{" "}
                            {l.season} · {day(l.requested_at)}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                {data.can.manage && (
                  <form
                    className="inline-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      const decision =
                        (
                          (e.nativeEvent as SubmitEvent)
                            .submitter as HTMLButtonElement | null
                        )?.value ?? "active";
                      void send({
                        action: "decideLicenses",
                        ids: chosen,
                        decision,
                        note: String(f.get("note") ?? ""),
                      }).then((ok) => ok && setChosen([]));
                    }}
                  >
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setChosen(pending.map((l) => l.id))}
                    >
                      {t.selectAll}
                    </button>
                    <label>
                      <span className="sr-only">{t.note}</span>
                      <input name="note" maxLength={500} placeholder={t.note} />
                    </label>
                    <button
                      className="button"
                      value="active"
                      disabled={busy || !chosen.length}
                    >
                      {t.approve} ({chosen.length})
                    </button>
                    <button
                      className="button secondary"
                      value="refused"
                      disabled={busy || !chosen.length}
                    >
                      {t.refuse}
                    </button>
                  </form>
                )}
              </>
            ) : (
              <EmptyState title={t.none} />
            )}
            {decided.length > 0 && (
              <details>
                <summary>
                  {t.licenses} ({decided.length})
                </summary>
                <div className="table-scroll">
                  <table className="ledger">
                    <thead>
                      <tr>
                        <th scope="col">{t.player}</th>
                        <th scope="col">{t.club}</th>
                        <th scope="col">{t.season}</th>
                        <th scope="col">{t.number}</th>
                        <th scope="col">{t.license}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {decided.map((l) => (
                        <tr key={l.id}>
                          <td>{l.full_name}</td>
                          <td>{l.club}</td>
                          <td>{l.season}</td>
                          <td>{l.number ?? ""}</td>
                          <td>
                            {t.licenseStatus[l.status]}
                            {l.note && (
                              <span className="muted"> · {l.note}</span>
                            )}
                            {l.status === "active" && data.can.manage && (
                              <form
                                className="inline-form"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void send({
                                    action: "suspendLicense",
                                    id: l.id,
                                    note: String(
                                      new FormData(e.currentTarget).get(
                                        "note",
                                      ) ?? "",
                                    ),
                                  });
                                }}
                              >
                                <label>
                                  <span className="sr-only">
                                    {t.suspendNote}
                                  </span>
                                  <input
                                    name="note"
                                    required
                                    minLength={5}
                                    maxLength={500}
                                    placeholder={t.suspendNote}
                                  />
                                </label>
                                <button className="text-button" disabled={busy}>
                                  {t.suspend}
                                  <span className="sr-only">
                                    {" "}
                                    : {l.full_name}
                                  </span>
                                </button>
                              </form>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </Card>

          <Card title={t.classifications} labelledBy="fed-classes" headingId="fed-classes">
            {data.classifications.length ? (
              <ul className="records">
                {data.classifications.map((x) => (
                  <li key={x.profile_id}>
                    <strong>{x.full_name}</strong>
                    <span className="muted">
                      {" "}
                      · {x.birth_year ?? ""} · {x.club} ·{" "}
                      {t.classes[x.classification] ?? x.classification}
                      {x.valid_until ? ` · ${t.until} ${x.valid_until}` : ""}
                    </span>{" "}
                    <Badge tone={
                        x.status === "validated"
                          ? "success"
                          : x.status === "refused"
                            ? "danger"
                            : "warning"
                      }>
                      {t.classStatus[x.status]}
                    </Badge>
                    {x.note && <span className="muted"> · {x.note}</span>}
                    {x.status === "requested" && data.can.manage && (
                      <form
                        className="inline-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          const decision =
                            (
                              (e.nativeEvent as SubmitEvent)
                                .submitter as HTMLButtonElement | null
                            )?.value ?? "validated";
                          void send({
                            action: "decideClassification",
                            profileId: x.profile_id,
                            decision,
                            classification:
                              decision === "validated" ? f.get("class") : null,
                            validUntil: (f.get("until") as string) || null,
                            note: String(f.get("note") ?? ""),
                          });
                        }}
                      >
                        <label>
                          <span className="sr-only">{t.classification}</span>
                          <select
                            name="class"
                            defaultValue={
                              x.classification === "PF2" ? "PF2" : "PF1"
                            }
                          >
                            <option value="PF1">PF1</option>
                            <option value="PF2">PF2</option>
                          </select>
                        </label>
                        <label>
                          <span className="sr-only">{t.validUntil}</span>
                          <input
                            name="until"
                            type="date"
                            defaultValue={x.valid_until ?? ""}
                            aria-label={t.validUntil}
                          />
                        </label>
                        <label>
                          <span className="sr-only">{t.note}</span>
                          <input
                            name="note"
                            maxLength={500}
                            placeholder={t.note}
                          />
                        </label>
                        <button
                          className="button"
                          value="validated"
                          disabled={busy}
                        >
                          {t.validate}
                          <span className="sr-only"> : {x.full_name}</span>
                        </button>
                        <button
                          className="button secondary"
                          value="refused"
                          disabled={busy}
                        >
                          {t.refuse}
                          <span className="sr-only"> : {x.full_name}</span>
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title={t.none} />
            )}
          </Card>

          <Card title={t.transfers} labelledBy="fed-transfers" headingId="fed-transfers">
            {data.transfers.length ? (
              <div className="table-scroll">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th scope="col">{t.player}</th>
                      <th scope="col">{t.from}</th>
                      <th scope="col">{t.to}</th>
                      <th scope="col">{t.license}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transfers.map((x) => (
                      <tr key={x.id}>
                        <td>{x.full_name}</td>
                        <td>{x.from_club}</td>
                        <td>{x.to_club ?? ""}</td>
                        <td>
                          {t.transferStatus[x.status]} ·{" "}
                          {day(x.accepted_at ?? x.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title={t.none} />
            )}
          </Card>
        </>
      )}
    </main>
  );
}


