# Revue des allégations sensibles

La revue à trois niveaux du PRD est un workflow distinct des signalements et
des appels. Elle exprime une évaluation interne, jamais une vérité judiciaire.

## Déclenchement et visibilité

Une sensibilité `high` déclenche automatiquement la revue. Un modérateur ou
administrateur peut aussi classer un autre rapport depuis la file dédiée, avec
un motif de 10 à 2 000 caractères. Le classement est persistant : diminuer la
sensibilité ou tenter d’effacer `requiresSensitiveReview` ne le contourne pas.
La migration remet les anciens rapports `high` en attente, sans approbation
rétroactive. Elle ne modifie ni `active`/`hidden`, ni `isAdminOnly`.

La revue ne publie, ne masque et ne supprime aucun contenu. Les policies de
lecture existantes restent applicables. Aucun formulaire ou SQL applicatif ne
peut attribuer `verified` à un rapport sensible sans le parcours complet.

## Étapes et indépendance

1. Un membre ayant effectivement le rôle **MODERATOR** dans cet espace.
2. Un autre membre ayant effectivement le rôle **ADMIN** dans cet espace.
3. Un troisième utilisateur ayant le statut global **superadmin**.

Un rôle supérieur ne remplace pas automatiquement un rôle de niveau précédent.
Un superadmin peut intervenir au premier/deuxième niveau seulement s’il possède
aussi l’adhésion exacte requise, sans pouvoir intervenir deux fois. L’auteur est
toujours exclu, même si son rapport est anonyme. Les rôles sont relus en base à
chaque décision ; une restriction ou suspension active interdit la revue, y
compris pour un superadmin. L’expiration utilise explicitement UTC, comme les
`DateTime` Prisma, indépendamment du fuseau de la session PostgreSQL.

Chaque étape exige une justification et permet d’approuver ou de demander une
correction. Une correction ferme la révision courante : il faut modifier le
rapport ou ses preuves avant un nouveau parcours, sans effacer la décision.
Un espace sans les trois personnes indépendantes nécessaires reste en attente.

## Révision et concurrence

`Post.contentRevision` est géré par des triggers, pas par le navigateur. Texte,
cible, sensibilité, anonymat, accès admin-only, pièces jointes (ajout, édition,
suppression), nom de l’entité et handles invalident les approbations. Masquer ou
afficher un rapport n’est pas une approbation et ne change pas son contenu.

`SensitiveReviewRound` conserve les révisions remplacées ;
`SensitiveReviewDecision` conserve les décisions de chaque niveau. Les
contraintes uniques interdisent deux décisions par niveau ou par personne dans
un même round. Le service exige la révision et l’étape attendues et utilise une
transaction sérialisable. La décision et les triggers d’invalidation prennent le
même verrou du rapport : une modification concurrente est soit antérieure
(décision périmée refusée), soit postérieure (approbation invalidée).

Les autorisations historiques prouvent le rôle au moment de la décision ; une
mutation future de rôle ne réécrit pas l’historique. La suppression d’un reviewer
détache sa clé utilisateur et invalide la révision, faute de pouvoir démontrer
trois personnes encore distinctes.

## Confidentialité et retrait

La file ne sérialise aucun identifiant d’auteur/reviewer, uploader, nom de
fichier original, clé de stockage ou hash de preuve. Les médias sont lus par
l’endpoint privé existant, avec affichage sensible volontaire. Les notes doivent
expliquer la décision sans recopier des identités, coordonnées ou preuves.
L’audit enregistre l’acteur reviewer, la révision, l’étape et le résultat, pas le
texte du rapport ni la justification. Aucun snapshot de contenu n’est conservé.

Le retrait définitif d’auteur (`authorId = null`) produit un round `blocked` :
aucune validation ultérieure n’est possible, même par son ancien auteur devenu
modérateur. Aucune identité cachée n’est conservée pour permettre de le vérifier.
Les identités d’auteur ne peuvent pas être réassignées via un UPDATE générique.
Le retrait self-scoped reste disponible sous suspension ; supprimer un rapport
supprime ses rounds et décisions par cascade.

La suppression de compte détache aussi son identité des journaux avec
`detach_own_audit_identity()`, une primitive self-scoped : elle n’élargit pas
la lecture des journaux anonymes après la suppression de l’adhésion.

## Accès et exploitation

- Interface : `/dashboard/sensitive-reviews`, accessible depuis la navigation
  modération ; pagination et historique des dix dernières révisions.
- File JSON : `GET /resources/api/spaces/:spaceId/sensitive-reviews`.
- Classement motivé : `POST` sur la même route suivie de `/:postId`, corps
  `{ "revision": 1, "reason": "Motif suffisamment précis" }`.
- Décision : `PATCH` sur `/:postId`, corps
  `{ "revision": 2, "stage": 1, "outcome": "approve", "note": "Examen indépendant effectué" }`.
  Autre résultat accepté : `request_changes`.

Les mutations nécessitent une session authentifiée et la même origine. Les
réponses sont privées/non cachables. Les deux nouvelles tables ont RLS et
**aucune policy de mutation**, même pour le superadmin applicatif : seules les
primitives SQL bornées peuvent écrire. Le propriétaire de migration conserve
ses privilèges explicites d’administration/restauration et ne doit jamais être
le rôle du serveur web. Accorder les droits aux nouvelles tables après migration
(ou configurer les privilèges par défaut), comme dans le guide RLS.

## Vérification

`scripts/verify-rls.ts` appelle `scripts/verify-sensitive-review.ts` avec son rôle
PostgreSQL réellement non propriétaire et `NOBYPASSRLS`. Les scénarios couvrent
absence de contexte, SQL direct, ordre et distinction des reviewers, anonymat,
discipline active/expirée dans un fuseau non UTC, toutes les invalidations,
visibilité conservée, suppression réelle du compte reviewer et auteur détaché.
Trois tests concurrents utilisent un pool indépendant : décision doublée,
édition du texte contre validation finale et ajout de preuve contre validation.
Les fixtures et rôles sont supprimés à la fin ; ne cibler qu’une base jetable.

Les tests API/UI vérifient CSRF, JSON strict, révision attendue, permissions,
conflits, minimisation et classement distinct d’une approbation.

## Retour à l’auteur et export personnel

Le formulaire d’édition montre à l’auteur les demandes de correction de la
révision courante, sans identité de reviewer ni notes d’approbation internes.
La primitive `own_sensitive_review_feedback` vérifie à la fois l’identité de
l’auteur et l’accès actuel au rapport ; elle n’ouvre pas la file de modération.
Une modification effective ouvre une nouvelle révision et retire de cet écran
les anciennes demandes, conservées dans l’historique de modération.

L’export de compte (version 3) inclut les décisions rédigées par le compte,
même après perte de ses droits dans l’espace, sans notes des autres reviewers
ni texte du rapport. Les tests PostgreSQL couvrent ces deux frontières.
