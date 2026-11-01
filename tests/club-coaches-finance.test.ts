import { describe, expect, it } from "vitest";
import {
  commandSchema as financeCommand,
  ledgerSummary,
  seasonOf,
} from "../src/domains/finance/schema";
import {
  clubCommand,
  coachAttendance,
  federationCommand,
  sessionGroup,
  validUntil,
} from "../src/domains/coaches/schema";
import {
  controlFrom,
  fieldsSchema,
  fieldVisible,
  installmentsFrom,
  splitConfidential,
  validateAnswers,
} from "../src/domains/registrations/schema";
import { addDays, duesStatus } from "../src/domains/reminders/schema";
import {
  builtin,
  validateTemplate,
} from "../src/domains/notifications/templates";
import { platformTemplate } from "../src/domains/registrations/templates";
import { importLimit, peopleCommand } from "../src/domains/people/schema";
import { delegable } from "../src/domains/access/policy";
import {
  parseCsv,
  parseXlsx,
  rowsFromGrid,
  toIsoDate,
} from "../src/lib/spreadsheet";
import { financeCopy } from "../src/components/finance-copy";
import { coachProfileCopy } from "../src/components/coach-profile-copy";
import { coursesCopy } from "../src/components/courses-copy";
import {
  settingsCopy,
  grantGroups,
  presets,
} from "../src/components/settings-copy";
import { registrationExtras } from "../src/components/registrations-copy";

const keys = (o: object) => Object.keys(o).sort();

describe("club ledger", () => {
  const entry = (
    occurred_on: string,
    direction: "in" | "out",
    amount_cents: number,
    category = "other",
    cancelled_at: string | null = null,
  ) => ({ occurred_on, direction, amount_cents, category, cancelled_at });
  it("splits the balance from the season figures and ignores cancelled lines", () => {
    const s = ledgerSummary(
      [
        entry("2026-05-01", "in", 10000, "subsidy"),
        entry("2026-08-01", "in", 5000, "sponsor"),
        entry("2026-09-01", "out", 2000, "venue"),
        entry("2026-09-02", "out", 999999, "venue", "2026-09-03"),
      ],
      "2026-07-01",
      "2027-06-30",
    );
    expect(s.balance).toBe(13000);
    expect(s.income).toBe(5000);
    expect(s.expenses).toBe(2000);
    expect(s.result).toBe(3000);
  });
  it("starts the season on 1 July", () => {
    expect(seasonOf("2026-10-19")).toMatchObject({
      from: "2026-07-01",
      to: "2027-06-30",
      label: "2026-27",
    });
    expect(seasonOf("2027-03-01").from).toBe("2026-07-01");
  });
  it("refuses zero amounts and short cancellation reasons", () => {
    const record = {
      action: "record",
      occurredOn: "2026-10-01",
      label: "Subside",
      direction: "in",
      category: "subsidy",
      amountCents: 0,
      method: "transfer",
      counterparty: "",
      reference: "",
      notes: "",
    };
    expect(financeCommand.safeParse(record).success).toBe(false);
    expect(
      financeCommand.safeParse({ ...record, amountCents: 1 }).success,
    ).toBe(true);
    expect(
      financeCommand.safeParse({
        action: "cancel",
        id: crypto.randomUUID(),
        reason: "oups",
      }).success,
    ).toBe(false);
  });
});

describe("coach education and attendance", () => {
  it("computes course expiry, including 29 February", () => {
    expect(validUntil("2026-03-10", 3)).toBe("2029-03-10");
    expect(validUntil("2028-02-29", 1)).toBe("2029-02-28");
    expect(validUntil("2026-03-10", null)).toBeNull();
  });
  it("groups sessions the way coaches read them", () => {
    expect(sessionGroup("training")).toBe("training");
    expect(sessionGroup("camp")).toBe("training");
    expect(sessionGroup("tournament")).toBe("match");
    expect(sessionGroup("meeting")).toBe("other");
    const row = (kind: string, actual: string, closed = true, extra = {}) => ({
      kind,
      status: "scheduled",
      response: "present",
      actual,
      closed,
      withdrawn: false,
      ...extra,
    });
    const a = coachAttendance([
      row("training", "present"),
      row("training", "absent"),
      row("training", "unchecked", false),
      row("friendly", "late"),
      row("friendly", "present", true, { status: "cancelled" }),
    ]);
    expect(a.training).toEqual({ invited: 3, closed: 2, attended: 1 });
    expect(a.match).toEqual({ invited: 1, closed: 1, attended: 1 });
  });
  it("validates club requests and federation decisions", () => {
    const id = crypto.randomUUID();
    expect(
      clubCommand.safeParse({
        action: "requestCourse",
        profileId: id,
        courseId: id,
        note: "",
      }).success,
    ).toBe(true);
    expect(
      federationCommand.safeParse({
        action: "decide",
        id,
        decision: "maybe",
        note: "",
        completedOn: null,
      }).success,
    ).toBe(false);
    expect(
      federationCommand.safeParse({
        action: "createCourse",
        title: "Initiateur",
        level: "1",
        description: "",
        hours: 16,
        validityYears: 25,
      }).success,
    ).toBe(false);
  });
});

describe("registration template", () => {
  it.each(["player", "renewal", "camp"] as const)("platform template %s is valid and neutral in the three languages", (id) => {
    for (const lang of ["fr", "nl", "en"] as const) {
      const t = platformTemplate(id, lang);
      expect(fieldsSchema.safeParse(t.fields).success).toBe(true);
      expect(t.fields.length).toBeLessThanOrEqual(20);
      // Wave 17 (F1): no club name, no account number in a product sold to every club.
      expect(JSON.stringify(t)).not.toMatch(/tigerstorm|BE\d{2} ?\d{4}/i);
    }
  });
  it.each(["fr", "nl", "en"] as const)("is a valid form in %s", (lang) => {
    const t = platformTemplate("player", lang);
    expect(fieldsSchema.safeParse(t.fields).success).toBe(true);
    expect(t.fields.length).toBeLessThanOrEqual(20);
    // The amount comes from the season's dues plan (wave 10), never from the text.
    expect(t.description).toMatch(/\{cotisation\}/);
    expect(JSON.stringify(t.fields)).not.toMatch(/250/);
    const confidential = t.fields
      .filter((f) => f.confidential)
      .map((f) => f.key);
    expect(confidential).toEqual(["national_number", "condition"]);
    const joystick = t.fields.find((f) => f.key === "joystick")!;
    expect([joystick.type, joystick.max, joystick.maps]).toEqual([
      "multi",
      2,
      "control",
    ]);
    const pay = t.fields.find((f) => f.maps === "installments")!;
    expect(pay.options.map((o) => installmentsFrom(o))).toEqual([1, 2, 3, 4]);
  });
});

describe("registration answers", () => {
  const fields = fieldsSchema.parse(platformTemplate("player", "fr").fields);
  const base = {
    address: "Rue 1",
    postal_code: "1030",
    email: "a@b.be",
    phone: "+32 470 00 00 00",
    emergency: "Maman, 0470 00 00 00",
    installments: "2 fois",
    privacy_consent: true,
  };
  it("accepts multiple choices within the limit and real e-mail addresses", () => {
    expect(
      validateAnswers(fields, { ...base, joystick: ["Main droite", "Menton"] })
        .joystick,
    ).toEqual(["Main droite", "Menton"]);
    expect(() =>
      validateAnswers(fields, {
        ...base,
        joystick: ["Main droite", "Menton", "Tête"],
      }),
    ).toThrow();
    expect(() =>
      validateAnswers(fields, { ...base, joystick: ["Pied"] }),
    ).toThrow();
    expect(() =>
      validateAnswers(fields, { ...base, email: "pas-un-email" }),
    ).toThrow();
    expect(() =>
      validateAnswers(fields, { ...base, privacy_consent: false }),
    ).toThrow();
  });
  it("separates confidential answers before storage", () => {
    const { clear, hidden } = splitConfidential(fields, {
      ...base,
      condition: "secret",
      national_number: "00",
    });
    expect(Object.keys(hidden).sort()).toEqual([
      "condition",
      "national_number",
    ]);
    expect(clear.condition).toBeUndefined();
  });
  it("reads the joystick and the number of payments", () => {
    expect(controlFrom(["Main gauche", "Menton"])).toBe("left_hand");
    expect(controlFrom(["Kin"])).toBe("chin");
    expect(controlFrom([])).toBe("");
    expect(installmentsFrom("4 fois")).toBe(4);
    expect(installmentsFrom("jamais")).toBeNull();
  });
  it("shows conditional questions when a multiple choice includes the value", () => {
    const f = { ...fields[0], condition: { key: "gender", equals: "Femme" } };
    expect(fieldVisible(f, { gender: ["Homme", "Femme"] })).toBe(true);
    expect(fieldVisible(f, { gender: ["Homme"] })).toBe(false);
  });
});

describe("reminders", () => {
  it("flags overdue and soon-due instalments only", () => {
    const s = duesStatus(
      [
        { due_on: "2026-09-29", amount_cents: 6250 },
        { due_on: "2026-10-29", amount_cents: 6250 },
        { due_on: "2026-11-29", amount_cents: 6250 },
      ],
      "2026-10-19",
    );
    expect([
      s.overdueCents,
      s.upcomingCents,
      s.next?.due_on,
      s.concerned,
    ]).toEqual([6250, 6250, "2026-10-29", true]);
    expect(
      duesStatus([{ due_on: "2027-01-01", amount_cents: 100 }], "2026-10-19")
        .concerned,
    ).toBe(false);
    expect(addDays("2026-12-25", 10)).toBe("2027-01-04");
  });
  it("ships editable reminder templates that pass validation", () => {
    for (const kind of [
      "dues_reminder",
      "document_reminder",
      "training_update",
    ] as const)
      for (const locale of ["fr", "nl", "en"] as const)
        expect(() =>
          validateTemplate(kind, builtin[kind][locale]),
        ).not.toThrow();
  });
});

describe("player spreadsheet import", () => {
  const today = "2026-10-19";
  it("reads Belgian Excel CSV (semicolons, quotes, BOM)", () => {
    const grid = parseCsv(
      '﻿Nom complet;Date de naissance;Email\r\n"Dupont; Léa";15/04/2008;LEA@EXAMPLE.ORG\r\n',
    );
    expect(grid).toEqual([
      ["Nom complet", "Date de naissance", "Email"],
      ["Dupont; Léa", "15/04/2008", "LEA@EXAMPLE.ORG"],
    ]);
  });
  it("understands written dates and Excel serial days", () => {
    expect(toIsoDate("15/04/2008")).toBe("2008-04-15");
    expect(toIsoDate("2008-04-15")).toBe("2008-04-15");
    expect(toIsoDate("39553")).toBe("2008-04-15");
    expect(toIsoDate("31/02/2008")).toBeUndefined();
    expect(toIsoDate("")).toBeNull();
  });
  it("maps French, Dutch and English titles and reports bad lines", () => {
    const { rows, issues, recognised } = rowsFromGrid(
      [
        ["Voornaam", "Achternaam", "Geboortedatum", "Rugnummer", "Positie"],
        ["Léa", "Dupont", "15/04/2008", "7", "Verdediger"],
        ["", "", "01/01/2010", "", ""],
        ["Tom", "Peeters", "2030-01-01", "", ""],
        ["Nina", "Claes", "", "120", ""],
      ],
      today,
    );
    expect(recognised).toEqual(
      expect.arrayContaining([
        "firstName",
        "lastName",
        "birthDate",
        "jerseyNumber",
        "position",
      ]),
    );
    expect(rows).toEqual([
      {
        fullName: "Léa Dupont",
        birthDate: "2008-04-15",
        email: "",
        phone: "",
        joinedOn: null,
        position: "Verdediger",
        jerseyNumber: 7,
        team: "",
        guardianName: "",
        guardianEmail: "",
        guardianPhone: "",
      },
    ]);
    expect(issues.map((i) => i.field)).toEqual([
      "fullName",
      "birthDate",
      "jerseyNumber",
    ]);
    expect(
      peopleCommand.safeParse({ action: "importPlayers", teamId: null, rows })
        .success,
    ).toBe(true);
    expect(
      peopleCommand.safeParse({
        action: "importPlayers",
        teamId: null,
        rows: Array.from({ length: importLimit + 1 }, () => rows[0]),
      }).success,
    ).toBe(false);
  });
  it("reads the first worksheet of an .xlsx file", async () => {
    const files: Record<string, string> = {
      "xl/workbook.xml":
        '<workbook><sheets><sheet name="Joueurs" sheetId="1" r:id="rId1"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels":
        '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      "xl/sharedStrings.xml":
        "<sst><si><t>Nom complet</t></si><si><t>Date de naissance</t></si><si><t>L&#233;a &amp; Co</t></si></sst>",
      "xl/worksheets/sheet1.xml":
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2" t="inlineStr"><is><t>x</t></is></c><c r="B2"><v>39553</v></c></row></sheetData></worksheet>',
    };
    const grid = await parseXlsx(storedZip(files));
    expect(grid[1][0]).toBe("Léa & Co");
    expect(rowsFromGrid(grid, today).rows[0]).toMatchObject({
      fullName: "Léa & Co",
      birthDate: "2008-04-15",
    });
  });
});

describe("settings and copy", () => {
  it("covers every delegable right exactly once", () => {
    const listed = grantGroups.flatMap((g) => g.grants);
    expect(new Set(listed).size).toBe(listed.length);
    // B8: tax.identity is given from the tax receipts page, shown only to an approved club.
    expect([...listed].sort()).toEqual(delegable.filter((d) => d !== "tax.identity").sort());
    for (const p of Object.values(presets))
      for (const g of p) expect(delegable).toContain(g);
  });
  it("keeps the three languages aligned", () => {
    for (const copy of [
      financeCopy,
      coachProfileCopy,
      coursesCopy,
      settingsCopy,
      registrationExtras,
    ]) {
      expect(keys(copy.nl)).toEqual(keys(copy.fr));
      expect(keys(copy.en)).toEqual(keys(copy.fr));
    }
    expect(keys(settingsCopy.en.grants)).toEqual([...delegable].sort());
  });
});

/** Minimal zip writer (stored entries) to build an .xlsx fixture. */
function storedZip(files: Record<string, string>) {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0;
  const crc = (data: Uint8Array) => {
    let c = ~0;
    for (const b of data) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  for (const [name, text] of Object.entries(files)) {
    const n = enc.encode(name),
      data = enc.encode(text),
      sum = crc(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint32(14, sum, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, n.length, true);
    chunks.push(new Uint8Array(local.buffer), n, data);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint32(16, sum, true);
    dir.setUint32(20, data.length, true);
    dir.setUint32(24, data.length, true);
    dir.setUint16(28, n.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), n);
    offset += 30 + n.length + data.length;
  }
  const size = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let at = 0;
  for (const c of all) {
    out.set(c, at);
    at += c.length;
  }
  return out.buffer;
}
