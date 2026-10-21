import type { Pool, PoolClient } from "pg";

/**
 * Demo tournaments (21 October 2026), added to the demo club and federation
 * by `npm run demo:seed`, also when the demo club already exists (an online
 * preview keeps its database from one deployment to the next).
 *
 * Creates four other affiliated clubs with a few players, then:
 * - the federation's league of the year, half played (one result waiting
 *   for validation), the next match days to come;
 * - the federation's cup of the year (semi-finals played, final to come);
 * - last year's cup, finished, the demo club on top of the podium;
 * - a tournament run by the demo club (groups then knockout), to come;
 * - an invitation from another club, waiting for the demo club's answer.
 * Nothing happens if the league of the year is already there.
 */
const OTHER_CLUBS: { name: string; players: string[] }[] = [
  { name: "Liège Power Club (démo)", players: ["Lucas Dubois", "Emma Lambert", "Noah Renard", "Chloé Hubert"] },
  { name: "Gent Rolling Lions (démo)", players: ["Arthur Claes", "Lotte Wouters", "Milan Jacobs", "Fien De Smet"] },
  { name: "Namur Wheels (démo)", players: ["Hugo Leroy", "Léa Simon", "Nathan Gilles", "Manon Collard"] },
  { name: "Antwerpen Sparks (démo)", players: ["Lars Peeters", "Noor Janssens", "Senne Maes", "Elise Willems"] },
];

export async function seedTournaments(db: Pool, clubName: string, federationName: string, refereeEmail: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const fed = (await c.query("SELECT id FROM organization WHERE name=$1 AND kind='federation'", [federationName])).rows[0]?.id as string | undefined;
    const demo = (await c.query("SELECT id FROM organization WHERE name=$1 AND kind='club'", [clubName])).rows[0]?.id as string | undefined;
    if (!fed || !demo) {
      await c.query("ROLLBACK");
      return;
    }
    const today = new Date();
    const year = today.getUTCFullYear();
    const leagueName = `Championnat de Belgique ${year}`;
    if ((await c.query("SELECT 1 FROM tournament WHERE organization_id=$1 AND name=$2", [fed, leagueName])).rowCount) {
      await c.query("ROLLBACK");
      console.log("Tournois de démo déjà présents.");
      return;
    }
    const day = (offset: number) => {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      d.setUTCDate(d.getUTCDate() + offset);
      return d.toISOString().slice(0, 10);
    };
    const referee = (await c.query('SELECT id FROM "user" WHERE lower(email)=$1', [refereeEmail])).rows[0]?.id as string | undefined;
    const fedPresident = (await c.query("SELECT user_id FROM role_assignment WHERE organization_id=$1 AND role='federation_president' AND revoked_at IS NULL LIMIT 1", [fed])).rows[0]
      ?.user_id as string | undefined;
    const demoPresident = (await c.query("SELECT user_id FROM role_assignment WHERE organization_id=$1 AND role='club_president' AND revoked_at IS NULL LIMIT 1", [demo])).rows[0]
      ?.user_id as string | undefined;

    // Clubs and their players.
    const clubs: { id: string; name: string; players: string[] }[] = [];
    const demoPlayers = (
      await c.query("SELECT id FROM club_person WHERE organization_id=$1 AND status='active' AND 'player'=ANY(directory_roles) ORDER BY full_name LIMIT 5", [demo])
    ).rows.map((r) => r.id as string);
    clubs.push({ id: demo, name: clubName, players: demoPlayers });
    for (const o of OTHER_CLUBS) {
      const id =
        ((await c.query("SELECT id FROM organization WHERE name=$1 AND kind='club'", [o.name])).rows[0]?.id as string | undefined) ??
        ((await c.query("INSERT INTO organization(name,kind,federation_id) VALUES($1,'club',$2) RETURNING id", [o.name, fed])).rows[0].id as string);
      const players: string[] = [];
      for (const [i, name] of o.players.entries()) {
        const existing = (await c.query("SELECT id FROM club_person WHERE organization_id=$1 AND full_name=$2", [id, name])).rows[0]?.id as string | undefined;
        players.push(
          existing ??
            ((
              await c.query(
                "WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles,jersey_number) SELECT $1,p.id,$2,$3,'{player}',$4 FROM p RETURNING id",
                [id, name, `${2000 + i * 3}-0${(i % 9) + 1}-15`, i + 4],
              )
            ).rows[0].id as string),
        );
      }
      clubs.push({ id, name: o.name, players });
    }
    const [club0, liege, gent, namur, antwerp] = clubs;

    const rules = (format: string) => ({ legs: 1, groups: 2, qualifiers: 2, win: 3, draw: 1, loss: 0, halves: 2, halfMinutes: 20, tiebreak: "goalDiff", shootout: format !== "league", other: "" });
    async function tournament(owner: string, name: string, y: number, format: string, description: string, members: string[], by: string | undefined, status = "open") {
      const id = (
        await c.query("INSERT INTO tournament(organization_id,name,year,format,rules,description,status,created_by,finished_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id", [
          owner,
          name,
          y,
          format,
          JSON.stringify(rules(format)),
          description,
          status,
          by ?? null,
          status === "finished" ? new Date() : null,
        ])
      ).rows[0].id as string;
      for (const m of members)
        await c.query("INSERT INTO tournament_club(tournament_id,organization_id,status,responded_at) VALUES($1,$2,'accepted',now())", [id, m]);
      return id;
    }
    async function matchDay(t: string, label: string, date: string, venue: string, host: string | null, notes = "") {
      return (await c.query("INSERT INTO tournament_day(tournament_id,label,day,venue,host_organization_id,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [t, label, date, venue, host, notes]))
        .rows[0].id as string;
    }
    // A match; with a score it is validated (or only reported), with the scorers drawn from each club's players.
    async function match(
      t: string,
      d: string,
      kickoff: string,
      stage: string,
      home: (typeof clubs)[number],
      away: (typeof clubs)[number],
      score?: [number, number],
      opts: { reported?: boolean; shootout?: [number, number]; group?: string } = {},
    ) {
      const status = !score ? "scheduled" : opts.reported ? "reported" : "validated";
      const id = (
        await c.query(
          `INSERT INTO tournament_match(tournament_id,day_id,kickoff,stage,group_label,home_organization_id,away_organization_id,referee_user_id,home_score,away_score,home_shootout,away_shootout,status,reported_by,reported_at,validated_by,validated_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,CASE WHEN $14::text IS NULL THEN NULL ELSE now() END,$15,CASE WHEN $15::text IS NULL THEN NULL ELSE now() END) RETURNING id`,
          [
            t,
            d,
            kickoff,
            stage,
            opts.group ?? "",
            home.id,
            away.id,
            referee ?? null,
            score?.[0] ?? null,
            score?.[1] ?? null,
            opts.shootout?.[0] ?? null,
            opts.shootout?.[1] ?? null,
            status,
            score ? (demoPresident ?? null) : null,
            status === "validated" ? (referee ?? fedPresident ?? null) : null,
          ],
        )
      ).rows[0].id as string;
      if (score)
        for (const [side, goals] of [
          [home, score[0]],
          [away, score[1]],
        ] as const) {
          const lines = new Map<string, { goals: number; assists: number; yellow: number }>();
          for (let g = 0; g < goals && side.players.length; g++) {
            const scorer = side.players[(g * 2 + score[0] + score[1]) % side.players.length];
            const assist = side.players[(g * 2 + 1 + score[0]) % side.players.length];
            const s = lines.get(scorer) ?? { goals: 0, assists: 0, yellow: 0 };
            s.goals++;
            lines.set(scorer, s);
            if (assist !== scorer) {
              const a = lines.get(assist) ?? { goals: 0, assists: 0, yellow: 0 };
              a.assists++;
              lines.set(assist, a);
            }
          }
          if ((score[0] + score[1]) % 3 === 0 && side.players.length) {
            const booked = side.players[side.players.length - 1];
            const b = lines.get(booked) ?? { goals: 0, assists: 0, yellow: 0 };
            b.yellow = 1;
            lines.set(booked, b);
          }
          for (const [profile, l] of lines)
            await c.query("INSERT INTO tournament_stat(match_id,organization_id,profile_id,goals,assists,yellow_cards) VALUES($1,$2,$3,$4,$5,$6)", [id, side.id, profile, l.goals, l.assists, l.yellow]);
        }
      return id;
    }

    // 1. The federation's league of the year: five clubs, two days played, two to come.
    const league = await tournament(
      fed,
      leagueName,
      year,
      "league",
      "Championnat national de powerchair football : une journée par mois, chaque club rencontre tous les autres une fois.",
      clubs.map((x) => x.id),
      fedPresident,
    );
    const l1 = await matchDay(league, "Journée 1", day(-45), "Hall omnisports de Liège", liege.id, "Accueil des équipes à 9 h. Contrôle des fauteuils à 9 h 30.");
    await match(league, l1, "10:00", "league", liege, gent, [2, 1]);
    await match(league, l1, "11:15", "league", club0, namur, [3, 0]);
    await match(league, l1, "14:00", "league", antwerp, liege, [1, 1]);
    const l2 = await matchDay(league, "Journée 2", day(-15), "Salle du Club démo", club0.id, "Parking adapté derrière la salle.");
    await match(league, l2, "10:00", "league", gent, antwerp, [0, 2]);
    await match(league, l2, "11:15", "league", club0, liege, [2, 2]);
    await match(league, l2, "14:00", "league", namur, gent, [1, 3], { reported: true });
    const l3 = await matchDay(league, "Journée 3", day(20), "Hall sportif de Namur", namur.id, "Vestiaires accessibles au rez-de-chaussée.");
    await match(league, l3, "10:00", "league", namur, antwerp);
    await match(league, l3, "11:15", "league", gent, club0);
    const l4 = await matchDay(league, "Journée 4", day(50), "Sportcentrum Antwerpen", antwerp.id);
    await match(league, l4, "10:00", "league", club0, antwerp);
    await match(league, l4, "11:15", "league", liege, namur);

    // 2. The federation's cup of the year: semi-finals played, final and third place to come.
    const cup = await tournament(fed, `Coupe de Belgique ${year}`, year, "knockout", "Élimination directe, tirs au but en cas d’égalité.", [club0.id, liege.id, gent.id, antwerp.id], fedPresident);
    const c1 = await matchDay(cup, "Demi-finales", day(-30), "Sportcentrum Gent", gent.id);
    await match(cup, c1, "10:00", "semi", club0, gent, [1, 1], { shootout: [3, 2] });
    await match(cup, c1, "11:30", "semi", liege, antwerp, [0, 2]);
    const c2 = await matchDay(cup, "Finales", day(35), "Palais des sports de Bruxelles", null, "Finale retransmise en direct sur la page de la fédération.");
    await match(cup, c2, "10:00", "third", gent, liege);
    await match(cup, c2, "14:00", "final", club0, antwerp);

    // 3. Last year's cup, finished: the demo club won it.
    const past = await tournament(fed, `Coupe de Belgique ${year - 1}`, year - 1, "knockout", "Édition précédente.", [club0.id, liege.id, gent.id, namur.id], fedPresident, "finished");
    const p1 = await matchDay(past, "Demi-finales", `${year - 1}-04-12`, "Hall omnisports de Liège", liege.id);
    await match(past, p1, "10:00", "semi", club0, namur, [4, 1]);
    await match(past, p1, "11:30", "semi", liege, gent, [2, 3]);
    const p2 = await matchDay(past, "Finales", `${year - 1}-05-24`, "Palais des sports de Bruxelles", null);
    await match(past, p2, "10:00", "third", liege, namur, [2, 0]);
    await match(past, p2, "14:00", "final", club0, gent, [3, 2]);
    for (const [rank, club] of [
      [1, club0.id],
      [2, gent.id],
      [3, liege.id],
    ] as const)
      await c.query("INSERT INTO tournament_trophy(tournament_id,organization_id,rank) VALUES($1,$2,$3)", [past, club, rank]);

    // 4. A tournament run by the demo club: two groups, then the final stage, to come.
    const autumn = await tournament(
      demo,
      `Tournoi d’automne du Club démo ${year}`,
      year,
      "groups_knockout",
      "Tournoi amical sur une journée : deux poules, puis demi-finales et finale.",
      [club0.id, liege.id, namur.id, antwerp.id],
      demoPresident,
    );
    for (const [club, group] of [
      [club0.id, "A"],
      [liege.id, "A"],
      [namur.id, "B"],
      [antwerp.id, "B"],
    ] as const)
      await c.query("UPDATE tournament_club SET group_label=$3 WHERE tournament_id=$1 AND organization_id=$2", [autumn, club, group]);
    const a1 = await matchDay(autumn, "Journée unique", day(10), "Salle du Club démo", club0.id, "Repas offert aux équipes à midi.");
    await match(autumn, a1, "09:30", "group", club0, liege, undefined, { group: "A" });
    await match(autumn, a1, "10:30", "group", namur, antwerp, undefined, { group: "B" });

    // 5. An invitation waiting for the demo club's answer.
    const invite = await tournament(gent.id, `Trophée de Gand ${year}`, year, "knockout", "Tournoi d’une journée organisé par les Rolling Lions.", [gent.id], undefined);
    await c.query("INSERT INTO tournament_club(tournament_id,organization_id) VALUES($1,$2)", [invite, demo]);
    await matchDay(invite, "", day(60), "Sportcentrum Gent", gent.id);

    await c.query("COMMIT");
    console.log("Tournois de démo créés.");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    (c as PoolClient).release();
  }
}
