# Sécurité : dépendances compromises

Audit du 07/11/2026 : une bibliothèque installée par le site peut-elle contenir une faille connue, ou du code malveillant glissé par un pirate (comme les versions piégées de `chalk`, `debug` ou `ansi-styles` en septembre 2025) ?

## Ce qui a été vérifié

- **553 paquets** du fichier de verrouillage (`package-lock.json`), chacun à sa version exacte.
- Contre les **avis de sécurité de GitHub** (37 571 avis relus, base du 07/11/2026) et la **liste des paquets malveillants de l'OpenSSF** (versions piégées connues de `chalk`, `debug`, `ansi-styles`, `supports-color`, `color-convert`, `color-name`, `keyv`, `flat-cache`, `file-entry-cache`, `napi-postinstall`, `fsevents`).
- **Aucune version malveillante installée** : le site a `debug` 4.4.3 (la version piégée était 4.4.2), `chalk` 4.1.2 (5.6.1), `keyv` 4.5.4 (6.0.0), `flat-cache` 4.0.1 (6.1.24), `napi-postinstall` 0.3.4 (0.3.1), etc.
- Toutes les versions de `package.json` sont figées, tous les paquets viennent du registre npm avec leur empreinte `sha512`, aucun ne vient d'un dépôt git ou d'une adresse à part.

## Failles connues trouvées

- **`image-size` 1.2.1** (deux failles hautes, déni de service sur des images JXL, HEIF ou ICNS piégées), installé par `pptxgenjs` 4.0.1. **Non atteignable** : le code de `pptxgenjs` ne charge jamais `image-size` (son seul appel est en commentaire), et les diapositives sont faites de nos propres images. Un test vérifie que ça reste vrai à chaque mise à jour de `pptxgenjs`. À corriger par une version 2.0.3 dès que le registre npm est joignable depuis l'outil (il ne l'est pas ici : un `overrides` sans fichier de verrouillage mis à jour casserait `npm ci`).
- **`minimatch` 10.2.6** (faille modérée), outil de développement seulement (le lint), sur nos propres motifs de fichiers. Jamais livré au site.

Les deux sont consignées dans `security/reviewed-advisories.json`, avec la raison, la date et une **expiration à trois mois** : passé ce délai, la CI échoue et la faille est relue.

## Ce qui protège désormais

- **À chaque CI**, juste après `npm ci` et avant tout code du projet, `scripts/check-deps.mjs` interroge OSV (avis GitHub et paquets malveillants) pour chaque paquet installé :
  - une version **malveillante** fait échouer la CI, toujours (elle ne peut pas être « revue ») ;
  - une faille dans un paquet **livré au site** fait échouer la CI, sauf revue valide ;
  - une faille **haute ou critique** dans un outil de développement aussi ; les autres s'affichent en avertissement ;
  - OSV injoignable : la CI échoue plutôt que de passer sans vérifier.
- `npm audit signatures` vérifie que chaque paquet est **signé par le registre npm** (un paquet altéré en chemin ou republié ailleurs est refusé).
- `npx` n'exécute que ce que le verrou a installé (`--no-install`), jamais un paquet téléchargé sur le moment ; Vercel installe aussi par `npm ci`.
- `.npmrc` : `save-exact=true`, un paquet ajouté est figé d'emblée.
- `tests/deps-safety.test.ts` : versions figées, registre et empreintes, verrou en phase avec `package.json`, **liste fermée des paquets qui exécutent un script à l'installation** (onze aujourd'hui : PostgreSQL des tests, `esbuild`, `fsevents`, `unrs-resolver`) ; un nouveau doit être relu et ajouté à la main. Règles de jugement (malveillant, livré, développement, expiration) et revues datées, limitées à six mois, jamais pour un `MAL-`.

## À régler à la main (réglages de compte)

- GitHub : activer les **alertes Dependabot** et les **mises à jour de sécurité** (gratuites sur un dépôt public), avec un délai d'attente (`cooldown`) de quelques jours avant de proposer une nouvelle version : la plupart des versions piégées sont retirées du registre en quelques heures.
- La CI utilise l'image `postgres:18` par son étiquette ; la figer par son empreinte (`postgres:18@sha256:…`) quand Docker Hub est joignable.

## Vérification

```
npx vitest run tests/deps-safety.test.ts
node scripts/check-deps.mjs
npm audit signatures
```
