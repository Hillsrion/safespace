# État d’implémentation face au PRD

Point de reprise du 28 août 2026. Le projet **n’est pas encore terminé selon
l’ensemble du PRD**. Ce document distingue les fonctionnalités implémentées,
les écarts de contrat et ce qui doit être vérifié sur l’environnement réel.

## Lots réalisés et testés

- Invitations privées, rôles effectifs par espace et discipline ; les droits
  PostgreSQL restent contrôlés avec un rôle web non propriétaire sans BYPASSRLS.
- Création, édition, retrait et export des contributions, avec anonymat des
  réponses et des audits. Les écritures anonymes ne tentent plus de relire un
  audit inaccessible à l’auteur.
- Reconstruction et retrait des métadonnées des médias pris en charge,
  stockage privé, proxy authentifié, floutage des aperçus et suppression
  différée par worker isolé.
- Classification, légendes, ordre et export des preuves ; conflits de révision
  refusés et brouillons conservés. Voir [organisation des preuves](evidence-organization.md).
- Revue sensible à trois niveaux indépendants avec invalidation après changement
  de contenu, files de modération paginées, recours et modèles de communication.
- Gestion des espaces, membres et entités ; annonces globales privées et
  auditées ; dernière activité quotidienne des membres, minimisée par espace.
  Voir [activité des membres](member-space-activity.md).
- Recherche et filtres, raccourci clavier, persistance des recherches sauvegardées.
  Cette persistance ne constitue pas un système de livraison d’alertes.
- Contrat API du compte (`/auth/me`, lecture/mise à jour/suppression de
  `users/current`) et collection de rapports par espace : pagination bornée,
  filtres, périmètre de l’URL contrôlé, anonymat et méthodes de mutation
  strictes. La suppression de compte conserve la confirmation renforcée et le
  choix explicite du devenir des contributions.

La CI exécute les tests applicatifs, serveur et PostgreSQL réel, construit les
images web/migration/worker et teste leur démarrage avec des droits limités.
Ces contrôles ne sont pas une certification de sécurité ni une recette visuelle
complète dans un navigateur connecté à des services de production.

## Écarts à poursuivre

| Sujet | Situation et prochain critère de sortie |
| --- | --- |
| Filigranes — PRD « Media Management » | Absents. Prévoir un vrai rendu serveur, conserver l’intégrité de la preuve et les contrôles privés ; un texte CSS ne protège pas le fichier. Aucun partage public ne doit être introduit implicitement. |
| Vérification des identifiants — PRD « Reporting System » | Normalisation, syntaxe, multi-identifiants et conflits sont contrôlés ; aucune vérification externe d’existence ou de propriété n’est attestée. Définir explicitement ce que signifie une revue interne d’identifiant. Les recherches via API Instagram sont classées futures par le PRD. |
| Contrat API — section « API Routes » | `auth/me`, `users/current` et les collections/éléments de rapports par espace sont maintenant fournis (`users/current` et les rapports restent sous le préfixe interne intentionnel `/resources/api`). Les preuves continuent d’être téléversées après la création du rapport : `mediaIds` n’accepte jamais de rattachement arbitraire. Il reste à formaliser les listes d’entités accessibles aux simples membres et, si un envoi atomique rapport+preuves est requis, à concevoir des jetons de téléversement temporaires plutôt que des identifiants réutilisables. |
| Recherche et performance | Les résultats sont filtrés par les droits, mais les objectifs de latence/charge et l’usage réel des index doivent être mesurés ; la seule présence d’un index n’en est pas la preuve. |
| Exploitation réelle | Vérifier TLS, chiffrement et droits des fournisseurs, sauvegarde/restauration, observabilité, charge et traitement effectif des suppressions sur le déploiement cible. Les tests locaux et les images CI ne prouvent pas cette configuration. |

## Ambiguïté explicite du PRD

Les recherches sauvegardées et alertes par identifiant figurent à la fois dans
les capacités de recherche (ligne 121) et dans les évolutions futures (ligne
930). Les notifications email sont limitées aux invitations dans la section
Communication ; le centre de notifications et les emails étendus y sont futurs.
Ne pas annoncer les alertes comme livrées, ni activer un envoi externe à partir
d’une simple préférence stockée. Leur priorité et leur canal demandent un choix
produit explicite avant la livraison.

Autres éléments explicitement futurs dans le PRD : 2FA, historique de versions,
détection automatisée et vérification Instagram avancée. Ils ne doivent pas être
silencieusement présentés comme réalisés ni mélangés aux tests de sécurité existants.
