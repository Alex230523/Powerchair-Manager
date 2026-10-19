"use client";
import { useState } from "react";
import type { Locale } from "@/lib/locale";
import type { ImportRow } from "@/domains/people/schema";
import { importLimit } from "@/domains/people/schema";
import {
  parseCsv,
  parseXlsx,
  rowsFromGrid,
  templateHeaders,
  type ImportIssue,
} from "@/lib/spreadsheet";
import { Modal } from "./modal";

const copy = {
  fr: {
    open: "Importer (Excel)",
    title: "Importer des joueurs",
    intro:
      "Déposez un fichier Excel (.xlsx) ou CSV. La première ligne contient les titres de colonnes ; seul le nom complet est obligatoire. Le fichier est lu sur votre appareil : rien n'est envoyé avant votre confirmation.",
    template: "Télécharger le modèle",
    file: "Fichier Excel ou CSV",
    team: "Ajouter à l'équipe (facultatif)",
    noTeam: "Aucune équipe",
    columns: "Colonnes reconnues",
    ready: "{n} joueurs prêts à être importés",
    issues: "Lignes ignorées",
    line: "ligne",
    fields: {
      fullName: "nom manquant",
      birthDate: "date de naissance invalide",
      joinedOn: "date d'arrivée invalide",
      email: "e-mail invalide",
      jerseyNumber: "numéro invalide (0 à 99)",
    } as Record<string, string>,
    preview: "Aperçu",
    more: "et {n} autres",
    name: "Nom",
    birth: "Naissance",
    contact: "Contact",
    position: "Poste",
    number: "N°",
    submit: "Importer {n} joueurs",
    done: "{created} joueurs ajoutés, {skipped} déjà présents ignorés.",
    tooMany: "Maximum {n} joueurs par import : découpez le fichier.",
    unreadable:
      "Ce fichier n'a pas pu être lu. Enregistrez-le en .xlsx ou .csv.",
    failed: "L'import a échoué, aucun joueur n'a été ajouté.",
  },
  nl: {
    open: "Importeren (Excel)",
    title: "Spelers importeren",
    intro:
      "Voeg een Excel-bestand (.xlsx) of CSV toe. De eerste rij bevat de kolomtitels; enkel de volledige naam is verplicht. Het bestand wordt op uw toestel gelezen: niets wordt verzonden voor uw bevestiging.",
    template: "Model downloaden",
    file: "Excel- of CSV-bestand",
    team: "Aan team toevoegen (optioneel)",
    noTeam: "Geen team",
    columns: "Herkende kolommen",
    ready: "{n} spelers klaar om te importeren",
    issues: "Overgeslagen rijen",
    line: "rij",
    fields: {
      fullName: "naam ontbreekt",
      birthDate: "ongeldige geboortedatum",
      joinedOn: "ongeldige aansluitingsdatum",
      email: "ongeldig e-mailadres",
      jerseyNumber: "ongeldig nummer (0 tot 99)",
    } as Record<string, string>,
    preview: "Voorbeeld",
    more: "en {n} andere",
    name: "Naam",
    birth: "Geboorte",
    contact: "Contact",
    position: "Positie",
    number: "Nr.",
    submit: "{n} spelers importeren",
    done: "{created} spelers toegevoegd, {skipped} reeds aanwezig overgeslagen.",
    tooMany: "Maximaal {n} spelers per import: splits het bestand.",
    unreadable:
      "Dit bestand kon niet gelezen worden. Bewaar het als .xlsx of .csv.",
    failed: "De import is mislukt, er werd geen speler toegevoegd.",
  },
  en: {
    open: "Import (Excel)",
    title: "Import players",
    intro:
      "Add an Excel (.xlsx) or CSV file. The first row holds the column titles; only the full name is required. The file is read on your device: nothing is sent before you confirm.",
    template: "Download the template",
    file: "Excel or CSV file",
    team: "Add to team (optional)",
    noTeam: "No team",
    columns: "Recognised columns",
    ready: "{n} players ready to import",
    issues: "Skipped lines",
    line: "line",
    fields: {
      fullName: "missing name",
      birthDate: "invalid date of birth",
      joinedOn: "invalid joining date",
      email: "invalid email",
      jerseyNumber: "invalid number (0 to 99)",
    } as Record<string, string>,
    preview: "Preview",
    more: "and {n} more",
    name: "Name",
    birth: "Birth",
    contact: "Contact",
    position: "Position",
    number: "No.",
    submit: "Import {n} players",
    done: "{created} players added, {skipped} already listed skipped.",
    tooMany: "At most {n} players per import: split the file.",
    unreadable: "This file could not be read. Save it as .xlsx or .csv.",
    failed: "The import failed; no player was added.",
  },
};
const fill = (s: string, v: Record<string, number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

/** Spreadsheet import of players with a preview before anything is saved. */
export function PlayerImport({
  locale,
  organizationId,
  teams,
  done,
}: {
  locale: Locale;
  organizationId: string;
  teams: { id: string; name: string }[];
  done: (message: string) => void;
}) {
  const t = copy[locale];
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<ImportRow[]>([]),
    [issues, setIssues] = useState<ImportIssue[]>([]),
    [recognised, setRecognised] = useState<string[]>([]),
    [team, setTeam] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  function downloadTemplate() {
    const sample = [
      "Camille Exemple",
      "2008-04-15",
      "camille@example.org",
      "+32 470 00 00 00",
      today,
      "Attaquant",
      "9",
    ];
    const csv =
      "﻿" + [templateHeaders, sample].map((r) => r.join(";")).join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "modele-import-joueurs.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function read(file: File) {
    setError("");
    setRows([]);
    setIssues([]);
    try {
      const grid = /\.xlsx$/i.test(file.name)
        ? await parseXlsx(await file.arrayBuffer())
        : parseCsv(await file.text());
      const result = rowsFromGrid(grid, today);
      setRows(result.rows);
      setIssues(result.issues);
      setRecognised(result.recognised);
      if (result.rows.length > importLimit)
        setError(fill(t.tooMany, { n: importLimit }));
    } catch {
      setError(t.unreadable);
    }
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "importPlayers",
          teamId: team || null,
          rows,
          organizationId,
        }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setOpen(false);
      setRows([]);
      done(fill(t.done, { created: v.created ?? 0, skipped: v.skipped ?? 0 }));
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="button secondary"
        onClick={() => setOpen(true)}
      >
        {t.open}
      </button>
      {open && (
        <Modal title={t.title} close={() => setOpen(false)}>
          <p className="muted">{t.intro}</p>
          <p>
            <button
              type="button"
              className="text-button"
              onClick={downloadTemplate}
            >
              {t.template}
            </button>
            <span className="muted"> ({templateHeaders.join(", ")})</span>
          </p>
          <div className="form-pair">
            <label htmlFor="import-file">
              {t.file}
              <input
                id="import-file"
                type="file"
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void read(f);
                }}
              />
            </label>
            <label htmlFor="import-team">
              {t.team}
              <select
                id="import-team"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
              >
                <option value="">{t.noTeam}</option>
                {teams.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error && <p role="alert">{error}</p>}
          {(rows.length > 0 || issues.length > 0) && (
            <section aria-labelledby="import-preview">
              <h3 id="import-preview">{t.preview}</h3>
              <p className="muted">
                {t.columns} : {recognised.length ? recognised.join(", ") : "0"}
              </p>
              <p role="status">
                <strong>{fill(t.ready, { n: rows.length })}</strong>
              </p>
              {rows.length > 0 && (
                <div
                  className="table-scroll"
                  role="region"
                  aria-label={t.preview}
                  tabIndex={0}
                >
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{t.name}</th>
                        <th scope="col">{t.birth}</th>
                        <th scope="col">{t.contact}</th>
                        <th scope="col">{t.position}</th>
                        <th scope="col">{t.number}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 50).map((r, i) => (
                        <tr key={i}>
                          <td>{r.fullName}</td>
                          <td>{r.birthDate ?? ""}</td>
                          <td>
                            {[r.email, r.phone].filter(Boolean).join(" · ")}
                          </td>
                          <td>{r.position}</td>
                          <td>{r.jerseyNumber ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {rows.length > 50 && (
                <p className="muted">{fill(t.more, { n: rows.length - 50 })}</p>
              )}
              {issues.length > 0 && (
                <details>
                  <summary>
                    {t.issues} ({issues.length})
                  </summary>
                  <ul>
                    {issues.slice(0, 100).map((x) => (
                      <li key={x.line}>
                        {t.line} {x.line} : {t.fields[x.field] ?? x.field}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <button
                type="button"
                className="button"
                disabled={busy || !rows.length || rows.length > importLimit}
                onClick={() => void submit()}
              >
                {fill(t.submit, { n: rows.length })}
              </button>
            </section>
          )}
        </Modal>
      )}
    </>
  );
}
