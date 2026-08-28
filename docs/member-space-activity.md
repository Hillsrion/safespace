# Dernière activité par espace

Le tableau d’administration affiche la dernière journée de consultation
enregistrée pour chaque membre et le nombre de membres actifs pendant les sept
derniers jours calendaires UTC, aujourd’hui inclus. Le compteur concerne tout
l’espace, indépendamment des filtres et de la pagination du tableau.

## Donnée minimale et signification

Une seule ligne `MemberSpaceActivity` existe par adhésion, avec uniquement
`userId`, `spaceId` et `lastActiveDay` (`DATE`). Elle ne conserve ni heure, IP,
URL, requête de recherche, contenu consulté ni historique d’événements. Aucun
rattrapage ne déduit l’activité de la date d’inscription ou d’une contribution
anonyme : l’absence de ligne s’affiche « Aucune activité enregistrée ».

La journée est enregistrée après chargement autorisé d’un fil explicitement
limité à un espace, de sa pagination, d’une fiche d’entité, de l’édition d’un
rapport ou de la gestion de l’espace. Le fil global et la simple lecture de la
liste des adhésions ne marquent aucun espace. Ce n’est pas une mesure exhaustive
du temps passé, de la présence en ligne ni de toutes les opérations API.

## Confidentialité et intégrité

La date est visible par le membre lui-même et les administrateurs effectifs de
l’espace (superadministrateurs compris). Les autres membres et modérateurs ne
peuvent pas lire les dates de leurs pairs, même par SQL direct avec le rôle web.
Un administrateur ne peut pas écrire au nom d’un autre membre.

L’écriture exige une adhésion réelle et une identité authentifiée concordante.
Un membre en lecture seule ou sous restriction peut enregistrer une visite ;
une suspension ou un départ empêche les suivantes. Le déclencheur impose le
jour UTC PostgreSQL et interdit de réaffecter une ligne à un autre membre ou
espace. L’insertion/mise à jour est atomique ; les visites répétées le même jour
ne réécrivent pas la ligne. Une panne de cet indicateur ne bloque pas la lecture
du contenu : seule une erreur technique sans identifiants est journalisée.

La suppression de l’adhésion (départ, exclusion, suppression du compte ou de
l’espace) efface la ligne par cascade. L’export personnel v5 inclut la date sous
la forme `YYYY-MM-DD`, y compris pendant une suspension, mais aucune date d’un
autre membre. La charte publique décrit cet usage.

## Déploiement et tests

Appliquer `20260828012000_member_space_activity` avec le rôle de migration,
puis appliquer les droits du rôle web aux nouvelles tables selon le guide RLS.
La migration ne crée pas de rôle ni de privilège nominatif. Ne pas donner les
droits propriétaire ou `BYPASSRLS` au serveur web. Le worker de suppression de
médias ne reçoit aucun droit sur cette table.

`scripts/verify-rls.ts` vérifie sur PostgreSQL réel les lectures par rôle,
l’absence de contexte, l’identité falsifiée, les visites concurrentes, la date
forcée, la non-réécriture journalière, l’export personnel après suspension et
l’effacement en cascade. Les tests d’interface vérifient la sélection explicite
d’un espace, l’absence de marquage global et les dates sans heure.
