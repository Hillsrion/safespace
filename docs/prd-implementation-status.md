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
  `users/current`), lecture minimisée d’un espace selon l’appartenance effective
  et collection de rapports par espace : pagination bornée, filtres, périmètre
  de l’URL contrôlé, anonymat et méthodes de mutation strictes. La suppression
  de compte conserve la confirmation renforcée et le choix explicite du devenir
  des contributions.
- Option de filigrane visuel pour les images, animations et vidéos : une
  dérivée privée « SafeSpace - CONFIDENTIEL » est entièrement décodée et
  réencodée à la demande, sans modifier l’original canonique ni son empreinte.
  Elle conserve les mêmes autorisations et n’accepte pas les requêtes partielles.
- Revue interne des identifiants par les administrateurs d’espace : statuts
  explicites, justification bornée, provenance et horodatage imposés par
  PostgreSQL, journal d’audit sans contenu de la note. Les données de revue sont
  isolées des identifiants lisibles par les membres dans une relation protégée
  par une RLS réservée aux administrateurs. Cette revue est présentée comme une
  qualification interne et jamais comme une preuve d’existence ou de propriété
  du compte externe.

La CI exécute les tests applicatifs, serveur et PostgreSQL réel, construit les
images web/migration/worker et teste leur démarrage avec des droits limités.
Ces contrôles ne sont pas une certification de sécurité ni une recette visuelle
complète dans un navigateur connecté à des services de production.

## Écarts à poursuivre

| Sujet | Situation et prochain critère de sortie |
| --- | --- |
| Filigranes — PRD « Media Management » | Réalisés côté serveur pour images/GIF/vidéos, comme dérivées privées bornées et vérifiées. L’original reste la preuve de référence ; aucun partage public ni filigrane CSS n’est introduit. L’audio reste inchangé : l’API refuse explicitement un filigrane visuel sur ce type. |
| Vérification des identifiants — PRD « Reporting System » | Normalisation, syntaxe, multi-identifiants et conflits sont contrôlés. La revue interne signifie uniquement « non examiné », « cohérent », « à clarifier » ou « obsolète », avec justification administrative ; elle est désormais utilisable, auditée et protégée contre la falsification du reviewer ou de l’heure. Aucune vérification externe d’existence ou de propriété n’est attestée. Les recherches via API Instagram restent futures selon le PRD. |
| Contrat API — section « API Routes » | `auth/me`, `users/current`, les collections/éléments de rapports et les lectures `reported-entities` par espace sont fournis sous le préfixe interne intentionnel `/resources/api`. Les listes d’entités sont paginées, exigent une appartenance effective et n’exposent ni revue interne ni rapport invisible ; le détail applique la même règle d’anonymat et de visibilité que le fil. Les preuves continuent d’être téléversées après la création du rapport : `mediaIds` n’accepte jamais de rattachement arbitraire. Le PRD n’impose pas explicitement de pré-upload ni de transaction distribuée avec R2 ; si un envoi tout-ou-rien devient un critère produit, il faudra des jetons temporaires à usage unique et une saga compensée. |
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
