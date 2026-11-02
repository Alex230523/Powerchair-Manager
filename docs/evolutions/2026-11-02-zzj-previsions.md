# Trésorerie prévisionnelle sur 12 mois (02/11/2026)

Point H4 de l'avis. Onglet « Prévisions » des Finances (`/funding/forecast`), calculé à chaque lecture à partir des données existantes, sans ressaisie. Migration `0102_forecast.sql` : seuil d'alerte (`organization.forecast_threshold_cents`) et lignes de simulation (`forecast_line`).

## Sources

- Point de départ : trésorerie du grand livre aujourd'hui, part réservée (point 9) affichée à part.
- Entrées : échéances de cotisations non payées (le payé couvre d'abord les premières), pondérées par le taux d'encaissement de la saison passée (le reste en « probable ») ; subsides accordés moins les tranches reçues ; sponsors signés non encaissés ; levées de fonds ouvertes jusqu'à leur objectif (probable) ; lignes du budget non couvertes par ces sources, réparties sur les mois restants de la saison (probable).
- Sorties : factures de salle non payées (certaines) et coût prévu restant des réservations selon leur facturation, la salle n'est donc jamais comptée deux fois ; déplacements planifiés (budget moins dépensé, certain s'il est confirmé) ; affiliations à payer ; tâches avec un montant prévu ; révisions de fauteuils prévues au coût habituel (probable).
- Un montant en retard tombe dans le mois en cours ; au-delà de 12 mois, il sort de la prévision.

## Lecture

- Graphique en ligne mois par mois : « Certain seulement », « Certain et probable », seuil réglable ; le même contenu en tableau, et le détail de chaque mois.
- Alerte quand le scénario certain passe sous le seuil dans les 3 prochains mois : sur la page, sur l'accueil du président (chiffre « Trésorerie prévue sous le seuil ») et en tâche dans la to-do (une par mois concerné, avec les plus grosses sorties).
- Simulations (« achat de 2 fauteuils en avril », « prêt relais en mars ») : elles restent dans la prévision et n'entrent jamais dans le grand livre.
- Export PDF pour le conseil d'administration ou un dossier de prêt.

## Vérification

- `npx vitest run tests/forecast.test.ts`
- `npm run test:integration` (`tests/integration/forecast.integration.ts`) : subside au bon mois puis retiré une fois encaissé, cotisation payée retirée, salle comptée une fois, alerte sous le seuil, simulation absente du grand livre, coach sans accès, deux clubs.
- `tests/e2e/forecast.spec.ts` à 390 px avec axe.
