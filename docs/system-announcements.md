# Annonces système

Les comptes authentifiés voient les annonces actives dans le tableau de bord.
Les superadministrateurs les gèrent à `/dashboard/superadmin/announcements`
(création, modification, suppression, publication différée et expiration).
Un administrateur d’espace ne reçoit pas ces droits globaux.

Le texte brut est limité à 4 000 caractères. Les dates sont saisies en heure
locale, converties en ISO avec fuseau, puis comparées à UTC en base. La
publication est inclusive, l’expiration exclusive. Une expiration doit être
postérieure à la publication. L’API ne convertit pas silencieusement `null`,
booléens ou nombres en dates.

Routes privées : `GET /resources/api/announcements` pour les annonces actives ;
`GET/POST /resources/api/superadmin/announcements` pour la gestion ;
`PATCH/DELETE /resources/api/superadmin/announcements/:announcementId` pour
une annonce. Les mutations vérifient l’origine, la session et le statut global
actuel. Elles sont auditées dans la même transaction, sans recopier le contenu.
Les réponses ne contiennent aucune identité du créateur.

RLS limite les lectures ordinaires aux annonces actives et comptes existants ;
les superadministrateurs peuvent consulter aussi les annonces futures/expirées
dans leur gestion. Le créateur est fixé à l’insertion et ne peut pas être
réassigné. La suppression du compte détache sa référence par clé étrangère.
Accorder les droits au rôle web selon `database-row-level-security.md` après
migration ; aucun nom de rôle de déploiement n’est imposé par la migration.

« Masquer » mémorise uniquement l’identifiant et la version de l’annonce sur
l’appareil. Une modification la réaffiche. Si le stockage local est refusé,
le masquage reste possible en mémoire. Le texte et l’identité du compte ne sont
pas enregistrés dans ce stockage. Ce mécanisme ne constitue ni un accusé de
lecture serveur, ni une notification email, ni un centre de notifications.

Les tests couvrent les frontières API, le formulaire et les erreurs de date,
le masquage local et son indisponibilité. `scripts/verify-rls.ts` teste ces
permissions avec un rôle PostgreSQL non propriétaire, notamment les dates
avec décalage, les comptes absents et l’immutabilité du créateur.
