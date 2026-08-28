# Départ d’espace et suppression de compte

Les deux opérations nécessitent une requête du même origin et une session active.
Elles demandent également une confirmation textuelle non ambiguë. Un départ utilise
`LEAVE_SPACE`; une suppression de compte utilise `DELETE_ACCOUNT` et le mot de passe
actuel, vérifié dans la transaction qui effectue la suppression.

`contributionPolicy: "anonymize"` conserve les posts mais met `authorId` à `NULL` et
`isAnonymous` à `true`. `"delete"` les efface. Dans les deux cas, les médias envoyés
par l’utilisateur sont supprimés : `Media.uploaderId` est obligatoire et ne peut pas
être anonymisé sans migration de schéma. Les flags émis sont supprimés; les références
de résolution sont détachées.

Un utilisateur ne peut pas partir d’un espace dont il est le dernier `ADMIN`.
Une suppression de compte est aussi refusée tant que la personne est créatrice d’un
espace, dont la propriété doit être transférée. La propriété d’une entité signalée
est en revanche détachée (`SET NULL`) afin de ne pas bloquer la suppression ni révéler
l’auteur d’un rapport anonyme. Le refus sur les espaces évite de supprimer en cascade
des contributions appartenant à d’autres membres.

Le départ écrit un audit `user_leave`. La suppression écrit `account_delete`, puis
retire `actorUserId` afin de ne pas conserver l’identité de l’ancien compte.

## Retrait des données malgré une suspension

La fonction PostgreSQL `safespace_private.withdraw_own_contributions` est une
primitive `SECURITY DEFINER` limitée à l’identité du contexte authentifié. Elle
ne renvoie aucun contenu et ne peut modifier les contributions d’un tiers.
Elle retire/anonymise les posts propres, retire les médias envoyés, détache les
flags résolus et invalide les invitations émises dans la portée demandée. Les
objets à supprimer sont enregistrés dans l’outbox avant toute suppression SQL.

Les workflows l’appellent dans leur transaction après les contrôles de compte,
de mot de passe (suppression de compte) et du dernier administrateur. Le retrait
reste donc possible même si une suspension ou une exclusion empêche de lire les
posts via les requêtes ordinaires. Les écritures/modérations directes n’ont pas
ce privilège. Le garde-fou du dernier administrateur consulte également une
fonction bornée, pour ne pas compter à tort seulement les membres visibles sous
RLS. Au moins un autre administrateur actif doit subsister.

Les tests d’intégration observent le résultat avec le propriétaire de la base :
un post seulement caché par RLS ne peut pas être confondu avec un post supprimé
ou réellement anonymisé.

## Compte et export après perte d’accès

La page « Mon compte » lit les adhésions propres sans jointure obligatoire vers
les espaces : un espace masqué par RLS est affiché avec un libellé générique, et
le bouton de départ reste accessible. Cela ne permet pas de consulter son fil.

L’export JSON v4 (avec catégorie, légende et ordre des preuves) appelle `safespace_private.export_own_contributions()`, fonction
en lecture seule dérivant l’identité du contexte SQL, sans paramètre utilisateur.
Elle inclut les rapports dont la personne reste l’auteur, les métadonnées de ses
propres envois et ses flags, même après suspension/exclusion. Les clés de stockage,
octets des médias, identités des autres membres, destinataires et jetons des
invitations ne sont pas exportés. Les entités cibles sont référencées par ID :
l’export ne rouvre pas leurs fiches actuelles. Les noms d’espaces inaccessibles
restent `null`. Le profil, recherches sauvegardées, appels et sanctions propres
sont ajoutés avec des sélections explicites sous RLS ; les champs retournés par
la primitive sont validés strictement avant téléchargement. Les contributions
déjà anonymisées ne sont plus liées au compte et ne peuvent pas être récupérées.

## Limites de notification et de session

Le projet ne possède aujourd’hui qu’un service email pour les invitations. Ces
workflows n’envoient donc pas de confirmation par email et ne prétendent pas le faire.
La réponse efface le cookie de session courant et l’interface avertit explicitement
que les médias et signalements associés seront supprimés, même lorsque les rapports
sont anonymisés. Les autres cookies déjà émis ne sont
pas révocables de façon centralisée avec le stockage de session stateless actuel;
toutefois, après suppression du compte, `getCurrentUser` ne retrouve plus l’utilisateur
et refuse immédiatement ces sessions. Après départ, les contrôles de membership
refusent l’accès à l’espace quitté.
