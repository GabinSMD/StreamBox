/* Registre des outils StreamBox : chaque outil overlay décrit ses champs de configuration.
 * Le configurateur (outil.html) lit ce registre pour générer le formulaire, l'URL et l'aperçu.
 */
(function () {
  const channel = { key: 'channel', label: 'Ta chaîne Twitch', type: 'text', default: '', placeholder: 'nom_de_ta_chaine', help: 'Le nom qui apparaît dans twitch.tv/…' };
  const font = { key: 'font', label: 'Police', type: 'select', default: 'Inter', options: ['Inter', 'Poppins', 'Montserrat', 'Nunito', 'Bebas Neue', 'Press Start 2P', 'Roboto Mono', 'Lilita One'] };
  const accent = { key: 'accent', label: 'Couleur principale', type: 'color', default: '#9b5cff' };
  const size = (d) => ({ key: 'size', label: 'Taille du texte (px)', type: 'number', default: d, min: 10, max: 60 });
  const emoteProviders = [
    { key: 'seventv', label: 'Emotes 7TV', type: 'checkbox', default: true },
    { key: 'bttv', label: 'Emotes BetterTTV', type: 'checkbox', default: true },
    { key: 'ffz', label: 'Emotes FrankerFaceZ', type: 'checkbox', default: true },
  ];

  window.SB_TOOLS = [
    {
      id: 'chat', icon: '💬', name: 'Chat en overlay', overlay: 'overlays/chat.html', size: [420, 640],
      tagline: 'Affiche ton chat Twitch sur le stream, avec les emotes 7TV, BTTV et FFZ.',
      replaces: ['StreamElements Chatbox', 'ChatIS', 'showmy.chat', 'CodingFreaks Chat Overlay'],
      fields: [
        channel,
        { key: 'theme', label: 'Thème', type: 'select', default: 'bulles', options: [['bulles', 'Bulles'], ['ombre', 'Texte avec ombre (en jeu)'], ['carte', 'Panneau'], ['neon', 'Néon'], ['clair', 'Clair']] },
        size(18), font, accent,
        { key: 'fade', label: 'Faire disparaître après (s, 0 = jamais)', type: 'number', default: 0, min: 0, max: 600 },
        { key: 'max', label: 'Messages affichés au maximum', type: 'number', default: 25, min: 1, max: 100 },
        { key: 'align', label: 'Alignement', type: 'select', default: 'left', options: [['left', 'Gauche'], ['right', 'Droite']] },
        { key: 'badges', label: 'Afficher les badges (streamer, modo, VIP, abo)', type: 'checkbox', default: true },
        { key: 'hidebots', label: 'Masquer les bots connus (Nightbot, StreamElements…)', type: 'checkbox', default: true },
        { key: 'hidecmd', label: 'Masquer les commandes (messages commençant par !)', type: 'checkbox', default: false },
        { key: 'bots', label: 'Autres comptes à masquer', type: 'text', default: '', placeholder: 'monbot, autrebot' },
        { key: 'anim', label: 'Animation d’apparition', type: 'checkbox', default: true },
        ...emoteProviders,
      ],
    },
    {
      id: 'alertes', icon: '🔔', name: 'Alertes', overlay: 'overlays/alertes.html', size: [800, 400],
      tagline: 'Abonnements, subs offerts, raids et bits, sans connecter ton compte.',
      replaces: ['Alertes StreamElements / Streamlabs (subs, raids, bits)'],
      commands: [['!testalerte', 'Lance une série d’alertes de test (modos)']],
      note: 'Les follows ne sont pas encore pris en charge : Twitch ne les envoie pas sur le chat. Ils viendront avec la connexion à un compte Twitch.',
      fields: [
        channel,
        { key: 'subs', label: 'Abonnements et réabonnements', type: 'checkbox', default: true },
        { key: 'gifts', label: 'Abonnements offerts', type: 'checkbox', default: true },
        { key: 'raids', label: 'Raids', type: 'checkbox', default: true },
        { key: 'bits', label: 'Bits', type: 'checkbox', default: true },
        { key: 'minbits', label: 'Bits minimum', type: 'number', default: 1, min: 1 },
        { key: 'minraid', label: 'Viewers minimum pour un raid', type: 'number', default: 1, min: 1 },
        { key: 'duration', label: 'Durée d’une alerte (s)', type: 'number', default: 7, min: 2, max: 30 },
        { key: 'sound', label: 'Jouer un son', type: 'checkbox', default: true },
        { key: 'volume', label: 'Volume (0 à 1)', type: 'number', default: 0.4, min: 0, max: 1, step: 0.05 },
        { key: 'tsub', label: 'Texte : abonnement', type: 'text', default: '{name} vient de s’abonner !' },
        { key: 'tresub', label: 'Texte : réabonnement', type: 'text', default: '{name} est abonné·e depuis {months} mois !' },
        { key: 'tgift', label: 'Texte : abonnements offerts', type: 'text', default: '{name} offre {count} abonnement(s) !' },
        { key: 'traid', label: 'Texte : raid', type: 'text', default: 'RAID ! {name} arrive avec {count} viewers !' },
        { key: 'tbits', label: 'Texte : bits', type: 'text', default: '{name} envoie {count} bits !' },
        { key: 'test', label: 'Commande de test', type: 'text', default: '!testalerte' },
        size(22), font, accent,
      ],
    },
    {
      id: 'sondage', icon: '📊', name: 'Sondage par le chat', overlay: 'overlays/sondage.html', size: [520, 420],
      tagline: 'Les viewers votent en tapant 1, 2, 3… Les résultats s’affichent en direct.',
      replaces: ['chat.vote', 'Kloot (sondages)'],
      commands: [
        ['!sondage Question ? | Choix A | Choix B', 'Lance un sondage (2 à 9 choix, Oui/Non par défaut)'],
        ['!sondage 90 Question ? | A | B', 'Même chose, avec une durée en secondes'],
        ['!sondage fin', 'Termine le sondage et montre le gagnant'],
        ['!sondage cacher', 'Masque le panneau'],
      ],
      fields: [
        channel,
        { key: 'cmd', label: 'Commande', type: 'text', default: '!sondage' },
        { key: 'duration', label: 'Durée par défaut (s)', type: 'number', default: 60, min: 5 },
        { key: 'linger', label: 'Garder les résultats affichés (s)', type: 'number', default: 15, min: 0 },
        size(20), font, accent,
      ],
    },
    {
      id: 'giveaway', icon: '🎁', name: 'Giveaway', overlay: 'overlays/giveaway.html', size: [520, 360],
      tagline: 'Les viewers s’inscrivent par mot-clé, puis tirage animé et équitable.',
      replaces: ['PickerSpin', 'Wheel of Item', 'Kloot (giveaways)', 'giveaways des bots'],
      commands: [
        ['!giveaway start', 'Ouvre les inscriptions (option : !giveaway start !motclé)'],
        ['!giveaway stop', 'Ferme les inscriptions'],
        ['!giveaway tirage', 'Tire un gagnant (relance pour un autre gagnant)'],
        ['!giveaway reset', 'Remet tout à zéro et masque le panneau'],
      ],
      note: 'Tirage par aléatoire cryptographique (Web Crypto). Les messages du gagnant s’affichent ensuite pour vérifier qu’il est bien présent.',
      fields: [
        channel,
        { key: 'title', label: 'Titre (le lot)', type: 'text', default: 'Giveaway', placeholder: 'Une clé Steam !' },
        { key: 'keyword', label: 'Mot-clé pour participer', type: 'text', default: '!participer' },
        { key: 'cmd', label: 'Commande de contrôle', type: 'text', default: '!giveaway' },
        { key: 'subonly', label: 'Réservé aux abonnés', type: 'checkbox', default: false },
        { key: 'subluck', label: 'Chances des abonnés (×)', type: 'number', default: 1, min: 1, max: 10 },
        size(20), font, accent,
      ],
    },
    {
      id: 'emotes', icon: '😂', name: 'Emotes à l’écran', overlay: 'overlays/emotes.html', size: [1920, 1080],
      tagline: '!showemote pour afficher une emote en grand, et pluie d’emotes en option.',
      replaces: ['Show Emote'],
      commands: [['!showemote Kappa', 'Affiche l’emote en grand à l’écran']],
      fields: [
        channel,
        { key: 'cmd', label: 'Commande', type: 'text', default: '!showemote' },
        { key: 'size', label: 'Taille de l’emote (px)', type: 'number', default: 200, min: 50, max: 800 },
        { key: 'duration', label: 'Durée d’affichage (s)', type: 'number', default: 5, min: 1, max: 20 },
        { key: 'cooldown', label: 'Délai entre deux utilisations par viewer (s)', type: 'number', default: 15, min: 0 },
        { key: 'modsonly', label: 'Réservé aux modos', type: 'checkbox', default: false },
        { key: 'rain', label: 'Pluie d’emotes (toutes les emotes du chat tombent)', type: 'checkbox', default: false },
        { key: 'rainmax', label: 'Emotes max par message (pluie)', type: 'number', default: 4, min: 1, max: 20 },
        { key: 'rainsize', label: 'Taille des emotes (pluie)', type: 'number', default: 80, min: 20, max: 300 },
        ...emoteProviders,
      ],
    },
    {
      id: 'minuteur', icon: '⏳', name: 'Écran « Ça commence bientôt »', overlay: 'overlays/minuteur.html', size: [1920, 1080],
      tagline: 'Compte à rebours avec ton titre, en carte ou en scène animée plein écran.',
      replaces: ['Ambiant Pixel Stream Packs (écrans d’attente)'],
      commands: [
        ['!timer 15', 'Règle le compte à rebours sur 15 minutes'],
        ['!timer +5 / !timer -2', 'Ajoute ou retire des minutes'],
        ['!timer pause / !timer reprendre', 'Met en pause ou relance'],
      ],
      fields: [
        { ...channel, label: 'Ta chaîne Twitch (optionnel, pour les commandes)', help: 'Facultatif : permet à tes modos de contrôler le minuteur depuis le chat.' },
        { key: 'style', label: 'Style', type: 'select', default: 'carte', options: [['carte', 'Carte'], ['texte', 'Texte seul'], ['scene', 'Scène animée plein écran']] },
        { key: 'mode', label: 'Mode', type: 'select', default: 'duree', options: [['duree', 'Durée (à partir de l’affichage)'], ['heure', 'Jusqu’à une heure précise']] },
        { key: 'minutes', label: 'Durée (minutes)', type: 'number', default: 10, min: 0, step: 0.5 },
        { key: 'heure', label: 'Heure cible (HH:MM)', type: 'text', default: '20:00' },
        { key: 'title', label: 'Titre', type: 'text', default: 'Le stream commence bientôt' },
        { key: 'subtitle', label: 'Sous-titre', type: 'text', default: '', placeholder: 'Ce soir : soirée Mario Kart avec vous !' },
        { key: 'end', label: 'Texte à la fin', type: 'text', default: 'C’est parti !' },
        { key: 'tsize', label: 'Taille du compteur (px)', type: 'number', default: 110, min: 30, max: 400 },
        { key: 'cmd', label: 'Commande', type: 'text', default: '!timer' },
        font, accent,
      ],
    },
  ];

  window.SB_PAGES = [
    { id: 'resizer', icon: '🖼️', name: 'Redimensionneur d’emotes', href: 'redimensionneur.html', tagline: 'Une image, et toutes les tailles d’emotes et de badges Twitch, Discord, 7TV, BTTV et FFZ en un clic. Tout reste sur ton ordinateur.', replaces: ['EmoteResizer', 'Emote Resizer', 'Twitch Emote Resizer'] },
    { id: 'calc', icon: '💰', name: 'Calculateur de revenus', href: 'calculateur.html', tagline: 'Estime ce que te rapportent tes abonnements et tes bits chaque mois.', replaces: ['calculateurs d’EmoteResizer'] },
    { id: 'annuaire', icon: '🧭', name: 'Annuaire des outils', href: 'annuaire.html', tagline: 'Les autres outils de la communauté (clips, bots, stats…), triés et commentés.', replaces: [] },
  ];
})();
