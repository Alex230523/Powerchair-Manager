/**
 * Demo data for trying the application (Codespaces or local development).
 *
 *   npm run demo:seed
 *
 * Creates "Club démo Powerchair" with four ready-to-use accounts, a team,
 * trainings with call-ups, documents, dues and a pending application.
 * Business data goes through the real domain services (calendar, attendance,
 * documents, dues) so it obeys the same rules as the interface.
 *
 * Never run against a production database: the passwords below are public.
 */
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { createAuth } from "../src/lib/auth";
import { execute, type Principal } from "../src/domains/access/service";
import { calendarExecute } from "../src/domains/calendar/service";
import { attendanceExecute } from "../src/domains/attendance/service";
import {
  documentExecute,
  documentUpload,
} from "../src/domains/documents/service";
import { duesExecute } from "../src/domains/dues/service";
import { equipmentExecute } from "../src/domains/equipment/service";
import { playerProfileExecute } from "../src/domains/player-profile/service";

const CLUB = "Club démo Powerchair";
export const DEMO_PASSWORD = "Demo-Powerchair-2026";
const accounts = [
  {
    key: "president",
    email: "president@demo.pfm",
    name: "Alex Martin",
    role: "club_president",
    profile: "Présidence · Club démo",
  },
  {
    key: "coach",
    email: "coach@demo.pfm",
    name: "Sam Leroy",
    role: "coach",
    profile: "Coach · Équipe A",
  },
  {
    key: "player",
    email: "joueur@demo.pfm",
    name: "Camille Dubois",
    role: "player",
    profile: "Joueuse · Club démo",
  },
  {
    key: "parent",
    email: "parent@demo.pfm",
    name: "Nadia Peeters",
    role: "guardian",
    profile: "Parent de Lucas",
  },
] as const;
type Key = (typeof accounts)[number]["key"];

if (process.env.NODE_ENV === "production" && !process.argv.includes("--force"))
  throw new Error("Refusing to create public demo accounts in production.");
// The seed acts through the services as the president; MFA is not set up for demo accounts.
process.env.PFM_MFA_SUSPENDED = "true";

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const auth = createAuth(db);
const sessions: string[] = [];

async function principal(userId: string, mandateId: string): Promise<P> {
  const sessionId = randomUUID();
  await db.query(
    'INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 hour\')',
    [sessionId, userId, randomUUID()],
  );
  sessions.push(sessionId);
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
type P = Principal;
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
// Next given weekday (0 = Sunday) strictly after today, as YYYY-MM-DD.
function next(weekday: number, extraWeeks = 0) {
  const d = new Date();
  d.setDate(
    d.getDate() + ((weekday - d.getDay() + 7) % 7 || 7) + extraWeeks * 7,
  );
  return d.toISOString().slice(0, 10);
}
const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

try {
  if (
    (await db.query("SELECT 1 FROM organization WHERE name=$1", [CLUB]))
      .rowCount
  ) {
    console.log(`« ${CLUB} » existe déjà : rien à faire.`);
    printAccounts();
    process.exit(0);
  }

  // 1. Accounts (Better Auth hashes the passwords and creates the person row).
  const users = {} as Record<Key, string>;
  for (const a of accounts) {
    const existing = (
      await db.query('SELECT id FROM "user" WHERE lower(email)=$1', [a.email])
    ).rows[0];
    users[a.key] =
      existing?.id ??
      (
        await auth.api.signUpEmail({
          body: { email: a.email, name: a.name, password: DEMO_PASSWORD },
        })
      ).user.id;
  }

  // 2. Club, season, team, people (plain SQL: the same rows the people module writes).
  const org = (
    await db.query(
      "INSERT INTO organization(name,kind,contact_email) VALUES($1,'club','contact@demo.pfm') RETURNING id",
      [CLUB],
    )
  ).rows[0].id as string;
  const year =
    new Date().getMonth() >= 6
      ? new Date().getFullYear()
      : new Date().getFullYear() - 1;
  const season = (
    await db.query(
      "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,$2,$3,$4) RETURNING id",
      [
        org,
        `${year}-${String(year + 1).slice(2)}`,
        `${year}-07-01`,
        `${year + 1}-06-30`,
      ],
    )
  ).rows[0].id as string;
  const team = (
    await db.query(
      "INSERT INTO team(organization_id,season_id,name,category,level,home_location) VALUES($1,$2,'Équipe A','Powerchair','Championnat','Hall sportif du Parc') RETURNING id",
      [org, season],
    )
  ).rows[0].id as string;
  const mandates = {} as Record<Key, string>;
  for (const a of accounts) {
    await db.query(
      "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)",
      [org, users[a.key]],
    );
    mandates[a.key] = (
      await db.query(
        "INSERT INTO role_assignment(organization_id,user_id,role,team_id,created_by,grants) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
        [
          org,
          users[a.key],
          a.role,
          a.role === "coach" ? team : null,
          users.president,
          // The president also holds the explicit grants for confidential health data.
          a.role === "club_president"
            ? ["people.sensitive", "documents.sensitive"]
            : [],
        ],
      )
    ).rows[0].id;
    // A default saved profile: after signing in, the account lands directly in the club.
    await db.query(
      "INSERT INTO user_profile(user_id,mandate_id,name,is_default) VALUES($1,$2,$3,true)",
      [users[a.key], mandates[a.key], a.profile],
    );
  }
  async function member(
    name: string,
    birth: string,
    roles: string[],
    userId: string | null,
    extra: { position?: string; jersey?: number } = {},
  ) {
    const person = userId
      ? (await db.query("SELECT id FROM person WHERE user_id=$1", [userId]))
          .rows[0].id
      : (
          await db.query(
            "INSERT INTO person(user_id) VALUES(NULL) RETURNING id",
          )
        ).rows[0].id;
    return (
      await db.query(
        "INSERT INTO club_person(organization_id,person_id,full_name,birth_date,joined_on,directory_roles,playing_position,jersey_number) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
        [
          org,
          person,
          name,
          birth,
          `${year - 2}-09-01`,
          roles,
          extra.position ?? "",
          extra.jersey ?? null,
        ],
      )
    ).rows[0].id as string;
  }
  const people = {
    president: await member("Alex Martin", "1979-03-14", [], users.president),
    coach: await member("Sam Leroy", "1986-11-02", ["coach"], users.coach),
    camille: await member(
      "Camille Dubois",
      "2001-06-21",
      ["player"],
      users.player,
      { position: "Attaquante", jersey: 7 },
    ),
    nadia: await member("Nadia Peeters", "1982-01-09", [], users.parent),
    lucas: await member("Lucas Peeters", "2013-04-30", ["player"], null, {
      position: "Défenseur",
      jersey: 4,
    }),
    yanis: await member("Yanis El Amrani", "2005-09-17", ["player"], null, {
      position: "Gardien",
      jersey: 1,
    }),
    emma: await member("Emma Janssens", "2010-12-03", ["player"], null, {
      position: "Défenseuse",
      jersey: 9,
    }),
    thomas: await member("Thomas Wouters", "1998-02-26", ["player"], null, {
      position: "Attaquant",
      jersey: 11,
    }),
  };
  const players = [
    people.camille,
    people.lucas,
    people.yanis,
    people.emma,
    people.thomas,
  ];
  for (const id of players)
    await db.query(
      "INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',$4)",
      [org, team, id, `${year}-07-01`],
    );
  await db.query(
    "INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'coach',$4)",
    [org, team, people.coach, `${year}-07-01`],
  );
  await db.query(
    "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,starts_on,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,true,$4,'Données de démonstration',$5)",
    [org, people.nadia, people.lucas, `${year}-07-01`, users.president],
  );

  const president = await principal(users.president, mandates.president);

  // 3. Calendar: a venue, a weekly training series and a friendly match.
  await calendarExecute(
    db,
    president,
    {
      action: "place",
      name: "Hall sportif du Parc",
      address: "Rue du Parc 12, 1080 Bruxelles",
      contact: "Accueil du hall",
      capacity: 40,
      costCents: 0,
      accessible: true,
      toilets: true,
      parking: true,
      storage: true,
      charging: true,
      logistics: "Recharge des fauteuils possible dans le local matériel.",
      archived: false,
    },
    org,
  );
  const place = (
    await db.query("SELECT id FROM calendar_place WHERE organization_id=$1", [
      org,
    ])
  ).rows[0].id as string;
  const event = (
    title: string,
    kind: "training" | "friendly" | "meeting",
    date: string,
    from: string,
    to: string,
    occurrences = 1,
  ) =>
    calendarExecute(
      db,
      president,
      {
        action: "create",
        title,
        kind,
        customType: "",
        timezone: "Europe/Brussels",
        localStart: `${date}T${from}`,
        localEnd: `${date}T${to}`,
        fold: "reject",
        teamId: kind === "meeting" ? null : team,
        placeId: kind === "meeting" ? null : place,
        freeLocation: kind === "meeting" ? "Club house" : undefined,
        responsibleId: kind === "meeting" ? users.president : users.coach,
        visibility: kind === "meeting" ? "organization" : "team",
        equipment:
          kind === "training" ? "Fauteuil chargé, ballon, protections" : "",
        instructions: kind === "training" ? "Échauffement à 18:15." : "",
        participants: [],
        documents: [],
        intervalDays: occurrences > 1 ? 7 : 0,
        occurrences,
        requestId: randomUUID(),
      },
      org,
    );
  const training = await event(
    "Entraînement Équipe A",
    "training",
    next(2),
    "18:30",
    "20:30",
    8,
  );
  const friendly = await event(
    "Match amical contre Liège",
    "friendly",
    next(6),
    "14:00",
    "16:00",
  );
  await event(
    "Assemblée générale du club",
    "meeting",
    next(0, 1),
    "10:00",
    "12:00",
  );

  // 4. Call-ups: the next training and the friendly match.
  for (const [eventId, hoursBefore] of [
    [training.id, 6],
    [friendly.id, 24],
  ] as const) {
    const starts = (
      await db.query("SELECT starts_at FROM calendar_event WHERE id=$1", [
        eventId,
      ])
    ).rows[0].starts_at as Date;
    await attendanceExecute(
      db,
      president,
      {
        action: "invite",
        eventId,
        expectedVersion: null,
        profiles: players,
        deadline: new Date(
          starts.getTime() - hoursBefore * 3600_000,
        ).toISOString(),
        minimum: 4,
      },
      org,
    );
  }
  // A finished training whose register was never closed (shows in the president's to-do list).
  const series = randomUUID();
  await db.query(
    "INSERT INTO calendar_series(id,organization_id,interval_days,occurrences,created_by) VALUES($1,$2,0,1,$3)",
    [series, org, users.president],
  );
  const past = (
    await db.query(
      `INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,place_id,responsible_user_id,visibility)
       SELECT $1,$2,1,'Entraînement Équipe A','training','Europe/Brussels',s,s+interval '2 hours',
              to_char(s AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI'),to_char((s+interval '2 hours') AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI'),$3,$4,$5,'team'
         FROM (SELECT ((CURRENT_DATE-3)+time '18:30') AT TIME ZONE 'Europe/Brussels' AS s) t RETURNING id`,
      [org, series, team, place, users.coach],
    )
  ).rows[0].id;
  const register = (
    await db.query(
      "INSERT INTO attendance_register(organization_id,event_id,deadline) VALUES($1,$2,now()-interval '4 days') RETURNING id",
      [org, past],
    )
  ).rows[0].id;
  for (const id of players)
    await db.query(
      "INSERT INTO attendance_invitation(organization_id,register_id,profile_id,response) VALUES($1,$2,$3,'present')",
      [org, register, id],
    );

  // Earlier sessions with closed registers, so profiles and statistics have history.
  const history: [
    number,
    string,
    "training" | "friendly",
    Record<string, [string, string]>,
  ][] = [
    [
      10,
      "Entraînement Équipe A",
      "training",
      {
        camille: ["present", "present"],
        lucas: ["present", "late"],
        yanis: ["absent", "absent"],
        emma: ["present", "present"],
        thomas: ["present", "present"],
      },
    ],
    [
      13,
      "Match amical contre Namur",
      "friendly",
      {
        camille: ["present", "present"],
        lucas: ["present", "present"],
        yanis: ["present", "present"],
        emma: ["uncertain", "absent"],
        thomas: ["present", "present"],
      },
    ],
    [
      17,
      "Entraînement Équipe A",
      "training",
      {
        camille: ["present", "present"],
        lucas: ["absent", "absent"],
        yanis: ["present", "present"],
        emma: ["present", "early"],
        thomas: ["none", "absent"],
      },
    ],
    [
      24,
      "Entraînement Équipe A",
      "training",
      {
        camille: ["present", "late"],
        lucas: ["present", "present"],
        yanis: ["present", "present"],
        emma: ["present", "present"],
        thomas: ["present", "present"],
      },
    ],
  ];
  const key = {
    camille: people.camille,
    lucas: people.lucas,
    yanis: people.yanis,
    emma: people.emma,
    thomas: people.thomas,
  } as Record<string, string>;
  for (const [daysAgo, title, kind, results] of history) {
    const s = randomUUID();
    await db.query(
      "INSERT INTO calendar_series(id,organization_id,interval_days,occurrences,created_by) VALUES($1,$2,0,1,$3)",
      [s, org, users.president],
    );
    const eventId = (
      await db.query(
        `INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,place_id,responsible_user_id,visibility)
         SELECT $1,$2,1,$3,$4,'Europe/Brussels',t.s,t.s+interval '2 hours',
                to_char(t.s AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI'),to_char((t.s+interval '2 hours') AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI'),$5,$6,$7,'team'
           FROM (SELECT ((CURRENT_DATE-$8::int)+time '18:30') AT TIME ZONE 'Europe/Brussels' AS s) t RETURNING id`,
        [org, s, title, kind, team, place, users.coach, daysAgo],
      )
    ).rows[0].id;
    const reg = (
      await db.query(
        "INSERT INTO attendance_register(organization_id,event_id,deadline,closed_at,closed_by) VALUES($1,$2,now()-($3::int||' days')::interval,now()-(($3::int-1)||' days')::interval,$4) RETURNING id",
        [org, eventId, daysAgo, users.coach],
      )
    ).rows[0].id;
    for (const [who, [response, actual]] of Object.entries(results))
      await db.query(
        "INSERT INTO attendance_invitation(organization_id,register_id,profile_id,response,actual) VALUES($1,$2,$3,$4,$5)",
        [org, reg, key[who], response, actual],
      );
  }

  // 5. Documents: one to verify, one expired, pieces still expected from families.
  const request = (
    profileId: string,
    name: string,
    category: "identity" | "licence" | "consent" | "insurance",
  ) =>
    documentExecute(
      db,
      president,
      {
        action: "request",
        profileId,
        seasonId: season,
        name,
        category,
        sensitive: false,
      },
      org,
    );
  await request(people.camille, "Carte d’identité", "identity");
  await request(people.camille, `Licence ${year}-${year + 1}`, "licence");
  await request(people.lucas, "Autorisation parentale", "consent");
  await request(people.yanis, "Attestation d’assurance", "insurance");
  for (const name of ["Carte d’identité", "Attestation d’assurance"]) {
    const doc = (
      await db.query(
        "SELECT id,version FROM club_document WHERE organization_id=$1 AND name=$2",
        [org, name],
      )
    ).rows[0];
    await documentUpload(
      db,
      president,
      doc.id,
      doc.version,
      { name: "exemple.pdf", type: "application/pdf", bytes: pdf },
      org,
    );
  }
  await db.query(
    "UPDATE club_document SET status='valid',expires_on=CURRENT_DATE-3,version=version+1 WHERE organization_id=$1 AND name='Attestation d’assurance'",
    [org],
  );

  // 6. Dues: a 250 EUR rate payable in four instalments.
  const plan = await duesExecute(
    db,
    president,
    {
      action: "plan",
      seasonId: season,
      category: "Cotisation joueur",
      amountCents: 25000,
      maxInstallments: 4,
      firstDue: day(10),
    },
    org,
  );
  for (const profileId of [people.camille, people.lucas])
    await duesExecute(
      db,
      president,
      {
        action: "issue",
        planId: plan.id,
        profileId,
        discountCents: 0,
        reason: "",
        installments: 4,
        firstDue: day(10),
      },
      org,
    );

  // 7. Equipment: club chairs (one shared), a player's own chair, a loan chair in repair.
  const chair = async (input: {
    name: string;
    ownership: "club" | "player" | "loan";
    status: "available" | "maintenance";
    speed: number;
    last: string | null;
    next: string | null;
    notes?: string;
  }) =>
    (
      await equipmentExecute(
        db,
        president,
        {
          action: "chair",
          name: input.name,
          brand: "Démo Sport",
          model: "Pivot 10",
          serialNumber:
            "DEMO-" + input.name.replace(/\D/g, "").padStart(3, "0"),
          ownership: input.ownership,
          status: input.status,
          maxSpeedKmh: input.speed,
          battery: "2 × 12 V, 73 Ah (gel)",
          acquiredOn: `${year - 2}-09-01`,
          lastServiceOn: input.last,
          nextServiceOn: input.next,
          notes: input.notes ?? "",
        },
        org,
      )
    ).id;
  const club1 = await chair({
    name: "Fauteuil club n°1",
    ownership: "club",
    status: "available",
    speed: 10,
    last: day(-90),
    next: day(90),
  });
  const club2 = await chair({
    name: "Fauteuil club n°2",
    ownership: "club",
    status: "available",
    speed: 10,
    last: day(-170),
    next: day(7),
  });
  const own = await chair({
    name: "Fauteuil de Camille",
    ownership: "player",
    status: "available",
    speed: 10,
    last: day(-30),
    next: day(150),
  });
  await chair({
    name: "Fauteuil de prêt",
    ownership: "loan",
    status: "maintenance",
    speed: 11,
    last: day(-200),
    next: null,
    notes: "Contrôleur à recalibrer : 11 km/h mesurés.",
  });
  for (const [chairId, profileId, primary] of [
    [club1, people.yanis, true],
    [club1, people.thomas, false],
    [club2, people.lucas, true],
    [own, people.camille, true],
    [club2, people.emma, true],
  ] as const)
    await equipmentExecute(
      db,
      president,
      {
        action: "assign",
        chairId,
        profileId,
        primary,
        startsOn: `${year}-09-01`,
      },
      org,
    );

  // 8. Player profiles: sport class, chair control, support needs and confidential notes (fictitious).
  const profiles: [
    string,
    "PF1" | "PF2" | "pending",
    "right_hand" | "left_hand" | "chin",
    string,
    string,
    string,
    string,
    string,
  ][] = [
    [
      people.camille,
      "PF2",
      "right_hand",
      "Finition rapide, bonne lecture du jeu. Capitaine.",
      "Autonome pour les transferts. Prévoir 10 minutes pour installer les sangles.",
      "Sangle de cuisse obligatoire en match.",
      "Marc Dubois (frère) · +32 470 00 00 01",
      "Myopathie (donnée fictive de démonstration)",
    ],
    [
      people.lucas,
      "PF1",
      "chin",
      "Très bon placement défensif. Travailler les passes longues.",
      "Transfert avec l’aide d’un adulte formé. Communication : laisser le temps de répondre.",
      "Ceinture pectorale. Pauses hydratation toutes les 20 minutes.",
      "Nadia Peeters (mère) · +32 470 00 00 02",
      "Amyotrophie spinale (donnée fictive de démonstration)",
    ],
    [
      people.yanis,
      "PF1",
      "left_hand",
      "Gardien titulaire, excellent sur les tirs de près.",
      "",
      "",
      "",
      "",
    ],
    [
      people.emma,
      "pending",
      "right_hand",
      "Nouvelle venue, classification demandée à la fédération.",
      "",
      "",
      "",
      "",
    ],
    [
      people.thomas,
      "PF2",
      "right_hand",
      "Attaquant de soutien, polyvalent.",
      "",
      "",
      "",
      "",
    ],
  ];
  for (const [
    id,
    classification,
    control,
    notes,
    needs,
    safety,
    emergency,
    impairment,
  ] of profiles) {
    await playerProfileExecute(
      db,
      president,
      {
        action: "sport",
        id,
        version: 0,
        classification,
        classificationValidUntil:
          classification === "pending" ? null : `${year + 2}-06-30`,
        control,
        sportNotes: notes,
      },
      org,
    );
    if (!needs) continue;
    await playerProfileExecute(
      db,
      president,
      {
        action: "support",
        id,
        version: 0,
        supportNeeds: needs,
        safetyNotes: safety,
        emergencyContact: emergency,
      },
      org,
    );
    await playerProfileExecute(
      db,
      president,
      {
        action: "confidential",
        id,
        version: 1,
        impairment,
        medicalNotes: "Aucune allergie connue (donnée fictive).",
      },
      org,
    );
  }

  // 9. A submitted application waiting for the club's decision.
  const form = (
    await db.query(
      "INSERT INTO registration_form(organization_id,season_id,title,description,published) VALUES($1,$2,'Inscription saison','Formulaire de démonstration.',true) RETURNING id",
      [org, season],
    )
  ).rows[0].id;
  const application = (
    await db.query(
      "INSERT INTO registration_application(organization_id,form_id,applicant_user_id,season_id,subject_kind,subject_name,birth_date,locale,form_snapshot,status,submitted_at) VALUES($1,$2,$3,$4,'represented','Inès Peeters','2015-08-12','fr',$5,'submitted',now()) RETURNING id",
      [
        org,
        form,
        users.parent,
        season,
        JSON.stringify({ title: "Inscription saison", fields: [] }),
      ],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO registration_history(application_id,actor_id,status) VALUES($1,$2,'submitted')",
    [application, users.parent],
  );

  console.log(`« ${CLUB} » est prêt.`);
  printAccounts();
} finally {
  for (const id of sessions) {
    await db.query("DELETE FROM active_context WHERE session_id=$1", [id]);
    await db.query("DELETE FROM session WHERE id=$1", [id]);
  }
  await db.end();
}

function printAccounts() {
  console.log(`\nComptes de démonstration (mot de passe : ${DEMO_PASSWORD})`);
  for (const a of accounts) console.log(`  ${a.email.padEnd(22)} ${a.profile}`);
  console.log("\nConnexion : /fr/access\n");
}
