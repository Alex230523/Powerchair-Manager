"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { trophiesView } from "@/domains/tournaments/service";
import { Badge, EmptyState, PageHeader } from "./ui";
import { Icon } from "./icons";
import { showToast } from "./toast";
import { useData } from "./use-api";
import { fill, tournamentsCopy } from "./tournaments-copy";
import { tournamentFailure } from "./tournaments";

type View = Awaited<ReturnType<typeof trophiesView>>;

/** The trophy gallery: podiums of finished tournaments by year, each with its photo. */
export function Trophies({ locale }: { locale: Locale }) {
  const t = tournamentsCopy[locale];
  const failure = useCallback((code: string) => tournamentFailure(t)(code), [t]);
  const { data, error, setError, denied, reload } = useData<View>("/api/tournaments/trophies", failure);
  const [busy, setBusy] = useState("");
  async function upload(id: string, file: File | undefined) {
    if (!file || !data) return;
    setBusy(id);
    setError("");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const r = await fetch(`/api/tournaments/trophies/${id}/photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaType: file.type, data: btoa(binary), organizationId: data.organization_id }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      await reload();
      showToast({ message: t.photoSaved, icon: "check" });
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
    } finally {
      setBusy("");
    }
  }
  const years = [...new Set((data?.trophies ?? []).map((x) => x.year))];
  return (
    <main id="main" className="access trophies">
      <p className="back-link">
        <Link href={`/${locale}/tournaments`}>
          <Icon name="back" size={16} /> {t.back}
        </Link>
      </p>
      <PageHeader title={t.galleryTitle} subtitle={t.gallerySubtitle} />
      {error && <p role="alert">{error}</p>}
      {denied && <p className="notice">{t.errors.FORBIDDEN}</p>}
      {!data && !denied && !error && <p role="status" className="muted">{t.loading}</p>}
      {data && data.trophies.length === 0 && <EmptyState icon="trophy" title={t.galleryEmpty} text={t.galleryEmptyText} />}
      {years.map((year) => (
        <section key={year} aria-labelledby={"year-" + year} className="trophy-year">
          <h2 id={"year-" + year}>{year}</h2>
          <ul className="trophy-grid">
            {data!.trophies
              .filter((x) => x.year === year)
              .map((x) => (
                <li key={x.id} className="trophy-card card" data-rank={x.rank} data-mine={x.mine || undefined}>
                  <div className="trophy-photo">
                    {x.hasPhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element -- private image served by the API, no optimisation route
                      <img src={`/api/tournaments/trophies/${x.id}/photo?v=${x.photoVersion ?? ""}`} alt={fill(t.photoAlt, { rank: t.ranks[x.rank], club: x.club, tournament: x.tournament })} loading="lazy" />
                    ) : (
                      <span className="trophy-placeholder" aria-hidden="true">
                        <Icon name="trophy" size={44} />
                      </span>
                    )}
                  </div>
                  <div className="card-body">
                    <p>
                      <Badge tone={x.rank === 1 ? "warning" : x.rank === 2 ? "neutral" : "info"}>{t.ranks[x.rank]}</Badge>
                      {x.mine && <Badge tone="primary">{t.myClub}</Badge>}
                    </p>
                    <h3>{x.club}</h3>
                    <p className="muted">
                      <Link href={`/${locale}/tournaments/${x.tournamentId}`}>{x.tournament}</Link>
                    </p>
                    {x.canPhoto && (
                      <label className="button secondary sm file-button">
                        <Icon name="plus" size={14} /> {x.hasPhoto ? t.changePhoto : t.addPhoto}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          disabled={busy === x.id}
                          onChange={(e) => void upload(x.id, e.target.files?.[0])}
                        />
                      </label>
                    )}
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
