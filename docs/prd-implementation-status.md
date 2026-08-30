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
Elle peuple aussi 20 000 rapports, entités et identifiants synthétiques, exécute
les requêtes de recherche applicatives avec `EXPLAIN ANALYZE`, puis 60 paires de
recherches avec 12 workers. Elle refuse une régression vers un balayage séquentiel
ou au-delà d'un budget CI de deux secondes. L'image web subit en plus 300 requêtes
HTTP avec une concurrence de 20 et un p95 borné à 2,5 secondes.
Ces contrôles ne sont pas une certification de sécurité ni une recette visuelle
complète dans un navigateur connecté à des services de production.

## Écarts à poursuivre

| Sujet | Situation et prochain critère de sortie |
| --- | --- |
| Filigranes — PRD « Media Management » | Réalisés côté serveur pour images/GIF/vidéos, comme dérivées privées bornées et vérifiées. L’original reste la preuve de référence ; aucun partage public ni filigrane CSS n’est introduit. L’audio reste inchangé : l’API refuse explicitement un filigrane visuel sur ce type. |
| Vérification des identifiants — PRD « Reporting System » | Normalisation, syntaxe, multi-identifiants et conflits sont contrôlés. La revue interne signifie uniquement « non examiné », « cohérent », « à clarifier » ou « obsolète », avec justification administrative ; elle est désormais utilisable, auditée et protégée contre la falsification du reviewer ou de l’heure. Aucune vérification externe d’existence ou de propriété n’est attestée. Les recherches via API Instagram restent futures selon le PRD. |
| Contrat API — section « API Routes » | `auth/me`, `users/current`, les collections/éléments de rapports et les lectures `reported-entities` par espace sont fournis sous le préfixe interne intentionnel `/resources/api`. Les frontières de listes rejettent les paramètres inconnus ou dupliqués au lieu d’en sélectionner silencieusement une valeur. L’interface crée, modifie, supprime et modère désormais les rapports uniquement par les routes portant le `spaceId` ; les anciennes routes sans périmètre d’espace ont été retirées. La file de signalements et la modération masque/réaffiche utilisent les routes administrateur du PRD, avec pagination stricte, contrôle du périmètre et motif facultatif audité. La liste, la création et la mise à jour des entités côté administration utilisent aussi `/admin/spaces/{spaceId}/reported-entities` ; les anciennes routes `entities` ont été retirées et la revue interne reste une extension administrateur isolée. La liste administrateur des membres est paginée, filtrable, sans cache et relit les droits dans la même transaction que les données ; invitation, changement de rôle et exclusion utilisent également les routes administrateur du PRD. L’invitation partage son service avec l’interface, stocke uniquement le condensat du jeton, expire les liens antérieurs et refuse désormais les administrateurs restreints ou suspendus. Les mutations de membres imposent méthodes exactes, périmètre d’espace transactionnel, contrôle du dernier administrateur et corps strict. Les listes d’entités membres sont paginées, exigent une appartenance effective et n’exposent ni revue interne ni rapport invisible ; le détail applique la même règle d’anonymat et de visibilité que le fil. Les preuves continuent d’être téléversées après la création du rapport : `mediaIds` n’accepte jamais de rattachement arbitraire. Le PRD n’impose pas explicitement de pré-upload ni de transaction distribuée avec R2 ; si un envoi tout-ou-rien devient un critère produit, il faudra des jetons temporaires à usage unique et une saga compensée. |
| Recherche et performance | Les résultats sont filtrés par les droits. Les requêtes exactes de publications, noms et identifiants partiels sont mesurées sur PostgreSQL réel avec 20 000 lignes par type ; la CI impose l’usage des index FTS/trigrammes, l’absence de balayage séquentiel et un budget de deux secondes. Elle exécute aussi 60 paires de recherches avec 12 workers. Il reste à fixer un SLO produit et valider latence/charge de bout en bout sur l’infrastructure de production ; ce garde-fou base de données n’est pas un test de capacité réel. |
| Exploitation réelle | La CI vérifie qu’un dump PostgreSQL se restaure dans une base jetable avec migrations, tables, index, extensions, RLS, politiques et fonctions privées intactes, y compris entre un client récent et un serveur plus ancien. Elle soumet l'image web à 300 requêtes concurrentes bornées. Le worker publie la profondeur, les éléments dus/loués, l'âge maximal et les tentatives de sa file sans identifiants, via sa quatrième fonction PostgreSQL bornée. Le smoke test loopback ne mesure toutefois ni rendu navigateur, ni média/R2, ni capacité de production. Il reste à brancher des alertes réelles, vérifier TLS, chiffrement et droits fournisseurs, restaurer une sauvegarde réelle avec RPO/RTO mesurés et tester une suppression sur le déploiement cible. |

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
