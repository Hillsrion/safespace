# Organisation des preuves privées

Le formulaire d’édition permet de classer une preuve (photo, conversation,
document, enregistrement, autre, non classée), d’ajouter une légende de 280
caractères et de déplacer une pièce vers le haut ou le bas. La classification
est descriptive : elle ne constitue pas une vérification de son authenticité.
Le type de fichier reste déterminé par la validation des octets téléversés.

## Autorisations et confidentialité

Un Editor actif peut modifier ses propres pièces sur son propre rapport actif.
Les modérateurs et administrateurs peuvent intervenir dans leur périmètre.
Réordonner un rapport contenant une pièce téléversée par un autre membre exige
un rôle de modération. Les restrictions, suspensions et règles de visibilité
restent applicables à chaque requête et à chaque transaction PostgreSQL.

Les légendes restent du texte brut dans l’interface. Les réponses ne donnent
ni identité du téléverseur ni clé de stockage. Les images restent floutées par
défaut ; les téléchargements passent par le contrôle d’accès privé existant.
La vue du fil, les fiches des entités et la revue sensible utilisent les mêmes
catégories et le même ordre. L’export personnel JSON v4 inclut ces métadonnées
uniquement pour les pièces du membre, même après perte d’accès à l’espace.

## Concurrence et audit

`PATCH /resources/api/media/:mediaId` accepte `expectedRevision`, puis au moins
un champ parmi `evidenceCategory`, `caption` et `orderedMediaIds`. L’ordre doit
contenir exactement les pièces du rapport, sans doublon. Les changements sont
atomiques et une révision périmée renvoie 409. Les tentatives concurrentes ne
peuvent pas écraser silencieusement une classification plus récente.

Toute modification réelle invalide la revue sensible via les déclencheurs
existants. Une réorganisation de plusieurs lignes peut avancer la révision de
plus d’une unité. Une requête sans changement ne crée ni révision ni audit.
Les audits ne contiennent pas les légendes et détachent l’identité de l’auteur
anonyme. Leurs insertions n’exigent pas de relire une ligne d’audit inaccessible
à cet auteur : aucun assouplissement des règles de lecture n’est nécessaire.

Le formulaire conserve le brouillon sur erreur et ignore les réponses tardives
après rechargement. Les modifications de preuves se valident explicitement,
séparément du texte du rapport ; il faut enregistrer le texte avant de quitter.

## Migration et vérification

Les migrations ajoutent les champs, un index d’ordre, des contraintes de valeur
et l’action d’audit, puis mettent à jour l’export personnel. Le classement initial
reprend la date d’ajout et l’identifiant. Cette reprise déclenche prudemment
l’invalidation des revues des rapports contenant déjà des preuves. Le rang est
une clé d’ordre, pas un compteur : les suppressions peuvent laisser des trous ;
la limite de dix fichiers reste contrôlée indépendamment au téléversement.

Les tests PostgreSQL de `scripts/verify-rls.ts` couvrent les écritures anonymes,
le réordonnancement complet, les permissions, le conflit de deux transactions,
l’export après suspension/retrait d’accès et l’absence de données tierces.
Les tests d’interface couvrent le brouillon après 409, les réponses tardives,
la conservation des permissions locales et l’ordre retourné par le serveur.

Les filigranes ne sont pas inclus dans ce lot. Il ne constitue pas une preuve
de configuration sécurisée du stockage distant ou du déploiement de production.
