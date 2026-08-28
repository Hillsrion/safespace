# Brouillons et reprise des actions de modération

Les mesures disciplinaires, réponses aux appels et revues sensibles proposent
des modèles de texte modifiables. Un clic les ajoute au brouillon existant,
sans décider ni envoyer. Les modèles demandent de décrire les éléments, limites
et motifs sans recopier les identités. Ils ne constituent pas des conclusions
automatiques sur la véracité d’une allégation.

L’interface refuse l’ajout si les 2 000 caractères seraient dépassés. La
validation partagée avec les actions serveur refuse les champs `[à compléter]`
restants. Une décision explicite et les contrôles d’accès habituels restent
nécessaires. Aucun email ni message externe n’est envoyé par ces modèles.

L’historique du membre est vidé dès un changement de sélection ; une génération
de requête et un signal d’annulation empêchent une réponse tardive de réafficher
le membre précédent. Les brouillons sont réinitialisés lors du changement de
membre ou d’espace. Les mutations concurrentes de mesure/révocation sont
désactivées dans l’interface. Une panne réseau libère les boutons et ne donne
pas de confirmation de réussite.

Tests : `member-governance-panel.test.tsx`, `moderation-flag-actions.test.tsx`,
`moderation-template-picker.test.tsx`, et tests des actions serveur existants.
