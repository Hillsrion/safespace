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

La CI exécute les tests applicatifs, serveur et PostgreSQL réel, construit les
images web/migration/worker et teste leur démarrage avec des droits limités.
Ces contrôles ne sont pas une certification de sécurité ni une recette visuelle
complète dans un navigateur connecté à des services de production.

## Écarts à poursuivre

| Sujet | Situation et prochain critère de sortie |
| --- | --- |
| Filigranes — PRD « Media Management » | Absents. Prévoir un vrai rendu serveur, conserver l’intégrité de la preuve et les contrôles privés ; un texte CSS ne protège pas le fichier. Aucun partage public ne doit être introduit implicitement. |
| Vérification des identifiants — PRD « Reporting System » | Normalisation, syntaxe, multi-identifiants et conflits sont contrôlés ; aucune vérification externe d’existence ou de propriété n’est attestée. Définir explicitement ce que signifie une revue interne d’identifiant. Les recherches via API Instagram sont classées futures par le PRD. |
| Contrat API — section « API Routes » | Les workflows actuels utilisent des routes différentes de plusieurs chemins proposés. Le préfixe `/resources/api` est intentionnel et partagé par les clients. Il reste à fournir ou formaliser la correspondance pour `auth/me`, `users/current`, les collections de posts par espace et les listes d’entités accessibles aux simples membres. Ne pas confondre différence de chemin et défaut d’autorisation. |
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
