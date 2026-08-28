export const COMMUNITY_POLICY_VERSION = "2026-08-28";

/** Public product rules: deliberately contains no community or member data. */
export function CommunityPolicy() {
  return (
    <article className="space-y-6 text-sm leading-6">
      <header>
        <h1 className="text-2xl font-semibold">Charte de conduite et règles de publication</h1>
        <p className="text-muted-foreground">Version du {COMMUNITY_POLICY_VERSION}</p>
      </header>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Un espace d’entraide confidentiel</h2>
        <p>SafeSpace permet de partager des expériences pour aider les membres à prendre leurs propres décisions de sécurité. Un signalement est un témoignage, pas une preuve de culpabilité. La plateforme ne sert ni à organiser une mise au pilori, ni à enquêter à la place des autorités.</p>
        <p>Respectez les personnes, leurs limites et leur droit de ne pas répondre. Les menaces, le harcèlement, les représailles, la discrimination et les appels à contacter ou cibler une personne sont interdits.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Publier avec précision et de bonne foi</h2>
        <p>Distinguez ce que vous avez vécu, ce qui vous a été rapporté et ce que vous ne pouvez pas vérifier. Indiquez le contexte utile sans ajouter de détails personnels inutiles. Ne fabriquez pas de preuves, n’usurpez pas d’identité et corrigez les erreurs dont vous avez connaissance.</p>
        <p>Un statut « vérifié » décrit une étape de modération interne, pas une certification juridique ni une garantie d’exactitude. Choisissez une gravité adaptée et utilisez la visibilité réservée à la modération pour les éléments particulièrement sensibles.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Protéger les identités et les preuves</h2>
        <p>Ne publiez pas d’adresse privée, de numéro de téléphone, de document d’identité ou de données de tiers sans nécessité. Les images intimes non consenties et les contenus d’exploitation sexuelle sont interdits. Masquez les visages, noms, notifications et autres identifiants non nécessaires avant de joindre un fichier.</p>
        <p>Le traitement des fichiers retire les métadonnées prises en charge, mais ne masque pas ce qui est visible ou audible. Le mode anonyme masque l’auteur dans les vues de contenu ; il ne garantit pas une anonymité absolue face à l’exploitation technique de la plateforme ou aux indices présents dans le témoignage.</p>
        <p>Ne partagez pas votre compte ni votre invitation. Ne copiez, capturez ou redistribuez pas les contenus d’un espace en dehors de celui-ci. Le contrôle d’accès ne peut pas empêcher toutes les captures effectuées par un membre autorisé.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Signalements, modération et recours</h2>
        <p>Utilisez l’action de signalement d’une publication pour attirer l’attention de la modération sur une erreur, un risque pour la vie privée ou une violation de cette charte. Évitez de republier les détails sensibles dans le motif.</p>
        <p>La modération peut masquer, corriger ou supprimer un contenu, et appliquer un avertissement, une restriction ou une suspension selon la situation. Une mesure de protection urgente peut précéder la revue. Les décisions qui vous concernent et les recours disponibles se consultent dans « Mon compte ».</p>
        <p>Un désaccord de bonne foi n’est pas un motif de représailles. En cas de conflit d’intérêts avec la modération d’un espace, demandez l’examen d’un autre administrateur ou d’un super-administrateur par votre canal de contact habituel.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Garder le contrôle de ses données</h2>
        <p>La dernière journée de consultation authentifiée d’un espace est conservée pour ses administrateurs, au jour UTC uniquement : aucune heure, adresse IP ou liste de pages n’est enregistrée dans cet indicateur. Il est propre à chaque espace, inclus dans votre export et supprimé quand votre adhésion à cet espace prend fin.</p>
        <p>Dans « Mon compte », vous pouvez exporter vos données, quitter un espace ou demander la suppression de votre compte. Les options de suppression ou d’anonymisation des contributions sont présentées avant confirmation. L’anonymisation du lien d’auteur ne retire pas les identifiants que vous auriez écrits dans le texte : vérifiez vos publications avant de choisir de les conserver.</p>
        <p>SafeSpace n’est pas un service d’urgence et les signalements ne sont pas surveillés en permanence. En cas de danger immédiat, utilisez les services d’urgence ou une personne de confiance adaptés à votre situation.</p>
      </section>
    </article>
  );
}
