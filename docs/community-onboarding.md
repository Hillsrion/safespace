# Charte et accueil après invitation

La route publique `/community-policy` ne consulte aucune donnée d’espace ou de
membre. Elle expose les règles produit de bonne foi, confidentialité,
minimisation des preuves, modération et recours. Le même contenu est lisible
dans le formulaire d’inscription avant acceptation, sans quitter le formulaire
ni perdre le jeton d’invitation. Un lien reste disponible dans « Mon compte ».

Le consentement reste obligatoire côté serveur et son horodatage est conservé
dans `User.codeOfConductAcceptedAt`. Les anciens horodatages ne prouvent pas
l’acceptation de cette version nouvellement publiée : aucune réacceptation ou
version de charte n’est fabriquée pour les comptes existants.

Après la création atomique du compte et de l’adhésion, le serveur redirige vers
`/dashboard/welcome?spaceId=…`, en utilisant exclusivement l’espace de
l’invitation validée. L’accueil relit les accès effectifs (suspension comprise),
explique les possibilités du rôle courant et conduit au fil de cet espace.
Une URL ancienne ou manipulée ne confère aucun accès supplémentaire.

Ces règles constituent une base de fonctionnement du produit, pas des CGU
juridiquement validées ni une attestation de conformité RGPD. Avant mise en
production, l’exploitant doit valider la charte, ses procédures humaines de
modération et recours, ses coordonnées de contact et sa politique de
conservation. Aucun délai de réponse ou anonymat absolu n’est promis.

Vérification : tests de refus sans consentement, invitation déjà consommée,
destination imposée par le serveur, minimisation des erreurs et des données
d’accueil, absence d’accès après révocation, consignes adaptées au rôle.
