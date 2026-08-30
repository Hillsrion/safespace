# Déploiement de production : Node / Coolify

Le runtime de production est un serveur Node SSR, pas le serveur de développement
Vite. `npm run build` produit `build/client`, `build/server` et la vérification
PostgreSQL `build/runtime`. `npm start` lance ce build en mode production.
La démonstration Netlify reste disponible via `npm run build:netlify` ; le plugin
Netlify n'est activé que pour cette cible ou lorsque `NETLIFY=true`.

## Image et configuration Coolify

Utiliser le `Dockerfile` du dépôt, cible finale `runtime`, port interne `3000`,
domaine HTTPS unique et reverse proxy TLS Coolify. Le processus tourne sous
l'utilisateur non-root `node`, avec Tini pour les signaux/processus enfants et
FFmpeg/FFprobe pour le décodage canonique des médias. Les dépendances de build
(Vite, TypeScript, CLI Prisma) ne sont pas installées dans le runtime web.
Ne pas remplacer sa commande par `npm run dev` et ne pas monter le code source
ou `node_modules` de l'hôte sur l'image.

L’image utilise Node 22.22.3 sur Debian Trixie, qui fournit FFmpeg 7. La CI
utilise la même distribution, puis construit les cibles Docker et démarre le
runtime avec PostgreSQL 16 et un rôle non propriétaire. Références de base :
[images Node officielles](https://github.com/docker-library/official-images/blob/master/library/node)
et [paquet FFmpeg Trixie](https://packages.debian.org/trixie/ffmpeg).

Le build ne reçoit aucun secret. `.dockerignore` exclut notamment `.env*`, `.git`,
les clients Prisma générés et les artefacts locaux. Prisma est généré pour la
plateforme Linux de l'image ; ne pas copier un moteur natif macOS dans le serveur.

Variables runtime à fournir dans Coolify, pas dans les build arguments :

| Variable | Valeur / usage |
| --- | --- |
| `APP_URL` | Origine HTTPS canonique, par exemple `https://safe.example`, sans chemin ni identifiants. |
| `DATABASE_URL` | PostgreSQL, schéma `public` : rôle applicatif non propriétaire, `NOBYPASSRLS`, avec les grants RLS requis. |
| `SESSION_SECRET` | Secret aléatoire privé d'au moins 24 caractères, identique entre réplicas. |
| `NODE_ENV` | `production` (déjà défini dans l'image). |
| `HOST`, `PORT` | `0.0.0.0`, `3000` par défaut ; aligner le port interne du proxy et du healthcheck. |
| `SHUTDOWN_TIMEOUT_MS` | Délai de drainage, 30000 ms par défaut, entre 1000 et 120000. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Bucket privé et credentials limités aux opérations nécessaires. |
| `R2_ENDPOINT`, `R2_SIGNED_URL_TTL_SECONDS` | Optionnels ; endpoint HTTPS et durée bornée par le service. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Nécessaires pour envoyer réellement les invitations. |
| `MEDIA_PROCESSING_TIMEOUT_MS`, `MEDIA_PROCESSING_MAX_CONCURRENT` | Limites du transcodage : 30000 ms et 2 par défaut ; ajuster à la mémoire/CPU. |
| `MEDIA_FFMPEG_PATH`, `MEDIA_FFPROBE_PATH` | Facultatifs : `ffmpeg` / `ffprobe` présents dans l'image. |
| `SENTRY_DSN`, `OBSERVABILITY_ENVIRONMENT`, `APP_RELEASE` | Télémétrie optionnelle ; voir les limites dans `privacy-first-observability.md`. |

`SYSTEM_DATABASE_URL` doit être **absente** du processus web : le serveur refuse
de démarrer si elle est présente. Avant d'ouvrir son port, il vérifie en base que
le rôle ne possède ni `SUPERUSER`, ni `BYPASSRLS`, ni les tables applicatives
(directement ou par appartenance à un rôle propriétaire), que toutes les tables
Prisma ont RLS et qu'aucun post n'est visible sans contexte. Une base inaccessible,
des tables manquantes ou un rôle privilégié rendent le démarrage non sain.
Cette vérification n'exécute ni migration, ni seed, ni écriture métier.

Le serveur reconstruit les URL des requêtes avec `APP_URL`, jamais avec `Host` ou
`X-Forwarded-*` reçus. Cela garde les contrôles CSRF corrects derrière TLS sans
faire confiance à des en-têtes forgés. Limiter l'accès au port Node au proxy
Coolify et au réseau de santé ; ne pas exposer ce port directement sur Internet.

## Migrations et jobs privilégiés

Construire/exécuter la cible Docker `migrations` une seule fois avant de basculer
les réplicas web. Son `DATABASE_URL` est celui du propriétaire des tables ; ce
secret appartient uniquement au job de migration. La commande de cette cible est
`prisma migrate deploy`, jamais `migrate dev` ni le seed de développement.

```sh
docker build --target migrations -t safespace-migrations .
docker run --rm --env-file /secure/path/migration.env safespace-migrations
docker build --target runtime -t safespace-web .
```

Le fichier de secrets reste hors du dépôt et de l'image. Accorder les privilèges
au rôle applicatif après toute création d'objets, avec des default privileges
définis **pour le rôle qui applique les migrations**, comme décrit dans
`database-row-level-security.md`. Vérifier la CI RLS sur la même chaîne de
migrations avant le déploiement. Le rôle propriétaire est volontairement réservé
aux migrations/restaurations ; l'image web ne doit jamais l'utiliser.

Les retries de l'outbox média s'exécutent dans la cible Docker séparée
`media-deletion-worker`, avec `MEDIA_DELETION_WORKER_DATABASE_URL` et un rôle
ne disposant d'aucun accès aux tables applicatives. Cette cible refuse les secrets
web, de session et `SYSTEM_DATABASE_URL`. Provisionner ce service indépendamment
du web ; voir `media-deletion-worker.md` pour les grants, modes et délais d'arrêt.
Le conteneur web ne constitue pas un ordonnanceur. Les éventuels autres jobs
administratifs privilégiés doivent eux aussi rester séparés des réplicas web.

## Disques, limites et réplication

La CI réalise un dump PostgreSQL logique puis le restaure dans une base jetable
distincte. Elle compare migrations, tables, index, extensions, activation RLS,
politiques et fonctions privées avant de détruire cette base. La restauration
tolère uniquement le réglage de session `transaction_timeout` ajouté par un
client PostgreSQL plus récent à destination d'un serveur plus ancien ; toute
autre erreur SQL reste fatale. Ce test prouve la restaurabilité du schéma courant ;
il ne remplace pas un exercice périodique à partir d’une sauvegarde réelle du
fournisseur ni la mesure du RPO/RTO de production.

Aucun volume persistant n'est nécessaire pour le web : les données durables sont
dans PostgreSQL et les preuves dans R2 privé. Prévoir des sauvegardes PostgreSQL,
tester leur restauration sur une infrastructure isolée et surveiller l'outbox.
Ne jamais stocker les preuves
dans `build/client` ni dans un volume servi publiquement.

Le transcodage utilise le répertoire temporaire système. Garder `/tmp` inscriptible
pour UID 1000, avec un quota adapté aux médias en cours et sans persistance entre
déploiements ; le reste du système de fichiers peut être en lecture seule.
Préférer un tmpfs borné si la RAM est dimensionnée pour cela. Limiter CPU/mémoire
par conteneur et le nombre de transcodages concurrents, puis tester de vrais
fichiers proches de la taille maximale : un upload peut atteindre 100 Mio, sans
compter buffers, trames décodées et sortie réencodée. Le serveur refuse les corps
HTTP de plus de 101 Mio ; la couche média applique ensuite ses plafonds plus fins.
Aligner la limite du proxy sur ce budget, jamais sur une taille illimitée.

Les sessions sont des cookies signés : plusieurs réplicas partagent le même
secret et n'ont pas besoin de sticky sessions. Le pool Prisma est propre à chaque
processus ; borner `connection_limit` dans `DATABASE_URL` en fonction du maximum
de réplicas, du worker et du quota PostgreSQL. Coolify/proxy doit conserver les
requêtes sur l'ancien réplica pendant le drainage. L'auto-scaling et les limites
de capacité restent une configuration d'exploitation à provisionner et tester,
pas un effet automatique du Dockerfile.

## Santé, sécurité HTTP et arrêt

Le healthcheck Docker appelle `GET /_health` : `200` avec le seul texte `ok`, sans
cookie ni donnée interne, et `Cache-Control: private, no-store`. Il devient actif
après la validation DB et le chargement du build. Ensuite c'est un test de
vivacité HTTP, pas une mesure de disponibilité PostgreSQL ou R2 : superviser ces
services séparément pour ne pas provoquer des redémarrages en cascade.

Seuls les fichiers de `build/client` sont servis en statique. Les dotfiles,
traversées de répertoire, source maps et liens symboliques sortant de ce dossier
ne sont pas exposés. Les assets fingerprintés sous `/assets/` sont publics,
`max-age=31536000, immutable` ; les autres fichiers publics doivent revalider.
HTML SSR, données loaders/API, erreurs, redirections et médias privés restent
`private, no-store`. Le cache du proxy/CDN ne doit jamais les rendre publics.
Les en-têtes CSP, anti-framing et `nosniff` sont aussi présents sur le serveur
Node ; les multiples `Set-Cookie` restent des en-têtes distincts.

`SIGTERM`/`SIGINT` arrêtent l'écoute, ferment les connexions inactives et laissent
finir les requêtes en cours. À l'échéance, leurs signaux sont annulés et les
connexions restantes fermées ; une fermeture forcée sort avec le code 1.
Configurer un délai d'arrêt Coolify/Docker supérieur à
`SHUTDOWN_TIMEOUT_MS` (par exemple 40 s pour un drainage de 30 s). Les logs du
transport et de l'entrée SSR ne contiennent pas les exceptions brutes, URL,
cookies ou contenu des rapports ; ils restent des événements techniques fixes.

## Validation avant bascule

```sh
npm run check
NODE_ENV=production DEPLOY_TARGET=node npm run build
# Avec les variables runtime privées déjà injectées dans l'environnement :
npm start
node server/healthcheck.mjs
```

Vérifier aussi le login HTTPS, la lecture d'un espace autorisé et le refus d'un
autre espace, un upload puis sa suppression R2, et un redéploiement avec requête
en cours. `npm run test:server` couvre les headers, cookies, chemins statiques,
origine canonique, plafonds HTTP et drainage sur un vrai socket loopback.
La CI exécute aussi `npm run db:verify-search-plans` sur 20 000 lignes
synthétiques par table et vérifie les plans des requêtes applicatives exactes.
Ce script exige `NODE_ENV=test`, une URL et un nom de base explicites ainsi que
`SEARCH_PERF_TEST_ALLOW_SETUP=1` ; il ne doit être lancé que sur une base jetable.
Son budget généreux détecte les régressions d'index, mais ne remplace ni un SLO
produit ni un test de charge concurrente sur l'environnement cible.
Le test RLS CI emploie un rôle non propriétaire sur PostgreSQL réel ; il ne
remplace pas la vérification des secrets/ACL de l'environnement de production.
Le script `npm run db:verify-restore` est destructif uniquement pour une base
dont le nom commence par `safespace_restore_` et exige quatre variables
`BACKUP_TEST_*` explicites ; ne jamais lui fournir l’URL de la base source comme
destination.
