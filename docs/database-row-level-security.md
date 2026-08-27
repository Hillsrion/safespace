# PostgreSQL row-level security

SafeSpace applique une deuxième frontière d'autorisation dans PostgreSQL. Les
filtres Prisma restent nécessaires pour les règles métier et la minimisation des
données, tandis que les policies RLS empêchent un accès accidentel à un autre
espace.

## Deux identités de base de données

La protection n'est effective que si le serveur web n'est ni propriétaire des
tables, ni titulaire de `BYPASSRLS`. Le propriétaire reste réservé aux
migrations/restaurations. Exemple à adapter et à exécuter par l'administrateur
de la base (les mots de passe ne doivent pas être committés) :

```sql
CREATE ROLE safespace_app LOGIN PASSWORD 'replace-me'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

GRANT CONNECT ON DATABASE safespace TO safespace_app;
GRANT USAGE ON SCHEMA public, safespace_private TO safespace_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO safespace_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA safespace_private
  TO safespace_app;
```

La valeur `DATABASE_URL` du serveur web pointe vers `safespace_app`. La valeur
`SYSTEM_DATABASE_URL` pointe vers le propriétaire des tables (ou vers un rôle
`BYPASSRLS`) et n'est disponible que pendant `prisma migrate`, le seed et les
jobs d'administration. Le seed vérifie ce privilège avant toute suppression.
Avec PostgreSQL, le propriétaire contourne RLS tant que `FORCE ROW LEVEL
SECURITY` n'est pas activé ; la migration n'utilise donc volontairement pas
`FORCE`, afin de conserver une voie opérationnelle distincte pour migrations et
restaurations.

Lors de nouveaux objets créés par une migration, le propriétaire doit aussi
accorder les droits au rôle applicatif :

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO safespace_app;
```

## Contexte applicatif

`app/db/contextual-client.server.ts` encapsule toutes les opérations du client
Prisma partagé. Chaque requête isolée s'exécute dans une transaction courte ;
les transactions callback existantes sont conservées. Avant le premier accès,
le client exécute des `set_config(..., true)`, équivalents à `SET LOCAL`, pour :

- l'identifiant utilisateur ;
- le statut super-administrateur relu en base à chaque requête HTTP ;
- le mode étroit `authentication` ou `registration` ;
- l'e-mail de connexion/inscription et les candidats du jeton d'invitation.

La portée transactionnelle est impérative avec le pool Prisma : un `SET` de
session pourrait transmettre l'identité d'une requête à la suivante. Une
opération sans contexte lève `MissingDbContextError` avant d'atteindre la base.
La forme tableau de `$transaction` est interdite ; utiliser exclusivement la
forme callback, déjà utilisée par SafeSpace.

Les modes publics ne sont pas des bypass : `authentication` ne peut lire que
l'utilisateur dont l'e-mail normalisé correspond au contexte et
`registration` ne peut utiliser que les invitations correspondant au jeton de
la requête. Les policies valident également l'e-mail et l'espace lors de la
création de l'adhésion.

## Vérification du déploiement

Après `prisma migrate deploy` avec le rôle propriétaire, se connecter avec
`DATABASE_URL` et vérifier :

```sql
SELECT current_user,
       rolsuper,
       rolbypassrls
FROM pg_roles
WHERE rolname = current_user;

SELECT relname, relrowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('User', 'Space', 'UserSpaceMembership', 'Invite',
                  'ReportedEntity', 'ReportedEntityHandle', 'Post', 'Media',
                  'PostFlag', 'AuditLog', 'SavedSearch', 'MediaDeletionJob',
                  'ModerationAppeal', 'DisciplinaryAction')
ORDER BY relname;
```

`rolsuper` et `rolbypassrls` doivent être faux et `relrowsecurity` vrai pour
toutes les tables. Sans contexte, `SELECT count(*) FROM "Post"` doit retourner
zéro.
Une connexion propriétaire n'est pas un test valide de RLS.

Tout nouveau chemin serveur qui interroge Prisma doit soit appeler
`getCurrentUser`/`requireUser` avant l'accès, soit utiliser explicitement
`runWithDbContext` pour un flux public borné. Les jobs système ne doivent pas
inventer un utilisateur : ils emploient `SYSTEM_DATABASE_URL` et leur accès
doit rester hors du processus web.

`MediaDeletionJob` est une outbox durable sans clés étrangères. Les opérations
immédiates du serveur web sont bornées par `requestedByUserId` et `spaceId` ;
les retries planifiés et les anciennes lignes sans propriétaire exigent le rôle
privilégié fourni par `SYSTEM_DATABASE_URL`. Un worker construit ce client avec
`createSystemPrismaClient` depuis `app/db/system-client.server.ts`, puis le passe
explicitement aux services concernés et le déconnecte à la fin du job.

## Test d'intégration PostgreSQL en CI

La CI déploie **toutes** les migrations sur PostgreSQL 16, puis exécute
`scripts/verify-rls.ts`. Le script vérifie aussi les checksums enregistrés dans
`_prisma_migrations` : une base ancienne, y compris sans
`20260827013000_keep_own_discipline_visible`, ne peut pas produire un faux succès.

Pour le reproduire sur une base **jetable et déjà migrée**, avec les dépendances
du projet et le client Prisma généré :

```sh
NODE_ENV=test \
RLS_TEST_ALLOW_SETUP=1 \
RLS_TEST_ADMIN_DATABASE_URL='postgresql://postgres:password@127.0.0.1:5432/safespace_test' \
yarn tsx scripts/verify-rls.ts
```

Cette URL administrative doit être celle d'un superutilisateur de la base de
test, jamais celle d'une base de production. Elle sert à préparer les fixtures,
accorder les privilèges et observer le résultat final. Le script ne retombe pas
implicitement sur `DATABASE_URL`. Les requêtes testées utilisent une connexion
distincte avec un rôle `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
NOBYPASSRLS`, non propriétaire de chaque table. Le contexte est installé par le
véritable client Prisma applicatif ; les refus SQL directs sont aussi vérifiés.

Les assertions couvrent l'absence de contexte, l'isolation entre espaces, les
posts/médias admin-only ou masqués, les écritures autorisées/interdites, les sanctions
actives/indéfinies/expirées/révoquées, la gouvernance et la visibilité de sa propre
sanction pendant une suspension. Le retrait de ses propres contributions reste
possible sous restriction via le workflow dédié ; les suppressions SQL directes
et la modération des contributions d'autrui sont refusées. `leaveSpace` est testé
sous restriction et suspension,
avec les deux choix suppression/anonymisation et un stockage injecté pour
vérifier le passage par l'outbox sans appeler R2, y compris pour un administrateur
suspendu. La primitive de retrait est testée sans identité, avec une identité
inexistante, une policy invalide et un espace tiers. Le dernier administrateur
actif ne peut pas partir au profit d'administrateurs suspendus.
L'observation finale utilise le propriétaire afin de détecter les lignes
toujours présentes mais cachées par RLS.
Le test vérifie enfin que le pool Prisma n'a conservé aucune identité.

Les mutations SQL d'autorisation sont annulées individuellement ; les workflows
de départ sont validés après commit. Les fixtures portent des UUID et préfixes
uniques ; elles sont supprimées à la fin, comme le rôle
temporaire et ses droits. Une interruption forcée peut laisser ces éléments dans
la base jetable : jeter la base est alors préférable à tout nettoyage global.
Ce test ne remplace ni la vérification des rôles/secrets réellement déployés, ni
les tests du stockage R2 et du point d'entrée HTTP d'authentification.
