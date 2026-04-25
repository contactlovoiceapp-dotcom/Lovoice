/**
 * Single source of truth for all French UI strings.
 * Editing copy? This is the only file you need to touch.
 * Dynamic strings are exposed as functions: `(name: string) => string`.
 */

export const COPY = {
  common: {
    continue: 'Continuer',
    cancel: 'Annuler',
    back: 'Retour',
    close: 'Fermer',
    save: 'Sauvegarder',
    later: 'Plus tard',
    optional: '(Facultatif)',
    appName: 'LOVoice',
  },

  a11y: {
    record: 'Enregistrer',
    stopRecording: "Arrêter l'enregistrement",
    play: 'Lecture',
    pause: 'Mettre en pause',
    deleteVoice: 'Supprimer le vocal',
    closeFilters: 'Fermer les filtres',
    applyFilters: 'Appliquer les filtres',
  },

  splash: {
    tagline: 'Bienvenue',
  },

  home: {
    headline: 'Trouve ta ',
    headlineAccent: 'Voix',
    subtitle: 'Écoute. Rencontre. Vibre.',
    values: [
      {
        emoji: '🎧',
        title: 'La voix avant tout',
        desc: "Ici, on écoute avant de regarder. Ta voix, ton énergie, c'est ce qui compte.",
      },
      {
        emoji: '🛡️',
        title: 'Un espace safe',
        desc: "Bienveillance et respect sont les règles d'or. Zéro tolérance pour les comportements toxiques.",
      },
      {
        emoji: '💜',
        title: "L'authenticité",
        desc: "Ici, pas de photo à perfectionner. Juste ta voix et ce qu'elle dit de toi.",
      },
    ] as const,
    acceptCheckbox:
      "Je m'engage à respecter les valeurs de bienveillance de la communauté Lovoice et j'accepte les ",
    acceptCguLink: 'CGU',
    signUp: 'Créer un compte',
    logIn: 'Se connecter',
  },

  phone: {
    title: 'Ton numéro',
    subtitle: "Nous t'enverrons un code pour vérifier ton compte.",
    prefix: '+33',
    placeholder: '6 12 34 56 78',
    sendCode: 'Recevoir le code',
    codeTitle: 'Code de vérification',
    codeSubtitle: (phone: string) => `Saisis le code envoyé au +33 ${phone}`,
    codePlaceholder: '0000',
    verify: 'Vérifier',
  },

  record: {
    title: 'Ta ',
    titleAccent: 'Voix',
    subtitle: 'Zéro pression. Juste ta voix.',
    maxDuration: '/ 1:30',
    restart: 'Recommencer',
    recorded: 'Voix enregistrée !',
    hint: 'Une intro, une pensée, un délire... Parle librement. (1m30 max)',
    needInspiration: "Besoin d'inspiration ?",
    skip: "Passer pour l'instant",
    inspirationTitle: 'Idée de voix',
    inspirationNext: 'Une autre idée',
    inspirationQuestions: [
      'Dis-moi ton talent le plus inutile mais incroyable...',
      'Quel est ton plus gros plaisir coupable ?',
      'Raconte-moi ta pire honte en cuisine...',
      'Si tu devais manger un seul plat pour le reste de ta vie ?',
      "Quel est le dernier film qui t'a fait pleurer ?",
    ] as const,
  },

  moods: {
    sunset: 'Joyeux',
    chill: 'Zen',
    electric: 'Curieux',
    midnight: 'Mystère',
  },

  gender: {
    label: 'Je suis',
    placeholder: 'Sélectionner',
    interestedInLabel: 'Je veux rencontrer',
    interestedInHint: 'Choisis au moins une option.',
    interestedInFemale: 'Femme',
    interestedInMale: 'Homme',
    interestedInOther: 'Autre',
    female: 'Une femme',
    male: 'Un homme',
    other: 'Autre',
  },

  profile: {
    title: 'Ton Profil',
    voiceCard: 'Ton vocal',
    voiceTimestamp: "À l'instant",
    catchphraseLabel: 'Titre de ton vocal ',
    catchphraseHint: 'Une phrase courte pour teaser ton vocal.',
    catchphrasePlaceholder: 'Ex: Ma pire honte en cuisine ...',
    moodLabel: 'Ton mood',
    infoLabel: 'Tes infos',
    preferencesLabel: 'Tes préférences',
    nameLabel: 'Prénom',
    namePlaceholder: 'Alex',
    ageLabel: 'Âge',
    agePlaceholder: '28',
    cityLabel: 'Ville',
    cityPlaceholder: 'Paris',
    emojisLabel: 'Tes 3 Emojis ',
    submitOnboarding: 'Valider mon profil',
  },

  feed: {
    autoplay: 'Autoplay',
    loading: 'Recherche de voix...',
    loadMore: 'Découvrir plus de voix',
    emptyTitle: 'Plus de voix !',
    emptyBody:
      'Tu as écouté toutes les voix du coin. Élargis tes filtres ou reviens plus tard.',
    editFilters: 'Modifier mes filtres',
    fallbackPrompt: 'Écoute ma voix…',
  },

  actions: {
    reply: 'Répondre',
  },

  replyModal: {
    title: 'Un seul message.',
    body: (name: string) =>
      `Envoie un vocal à ${name}. ${name} l'écoute et décide de te répondre, ou non. Un seul message, pour que chacun reste libre.`,
    cta: 'Enregistrer ma réponse',
  },

  reportModal: {
    title: (name: string) => `Signaler ${name}`,
    placeholder: 'Pourquoi signales-tu ce profil ?',
    warning:
      'Le signalement supprimera ce profil de ton fil et enverra un mail à la modération.',
    submit: 'Envoyer le signalement',
  },

  lockedModal: {
    title: 'Prêt·e à les entendre ?',
    body: 'Enregistre ta voix pour débloquer les autres vocaux. 30 secondes. Juste toi.',
    cta: 'Enregistrer ma Voix',
  },

  nav: {
    discover: 'Écoute',
    likes: 'Likes',
    messages: 'Messages',
  },

  likesScreen: {
    title: 'Mes Likes',
    subtitle: 'Tes voix préférées. Réponds-leur quand tu veux.',
    emptyTitle: 'Aucun like',
    emptyBody: "Découvre de nouvelles Voix et like celles qui te plaisent !",
    howItWorks: 'Comment ça marche ?',
    bullets: [
      'Like les vocaux qui te plaisent.',
      'Retrouve tous tes likes ici.',
      'Réponds quand tu te sens inspiré·e — pas de pression.',
    ] as const,
  },

  likeToast: {
    firstLike: (name: string) =>
      `Ajouté à tes Likes — ${name} recevra une notification.`,
  },

  messagesScreen: {
    title: 'Messages',
    searchPlaceholder: 'Rechercher...',
    emptyTitle: 'Pas encore de messages',
    emptyBody: 'Ta prochaine conversation commence ici.',
    icebreakersTitle: 'Icebreakers',
    icebreakers: [
      "\u201CJ\u2019ai adoré ton énergie sur ton vocal !\u201D",
      "\u201CTa pire honte m\u2019a fait mourir de rire 😂\u201D",
      "\u201CC\u2019est quoi le dernier son que tu as écouté ?\u201D",
    ] as const,
  },

  filters: {
    title: 'Filtres',
    newVoices: 'Nouvelles voix',
    newProfiles: 'Nouveaux profils',
    ageRange: "Tranche d'âge",
    ageUnit: 'ans',
    ageMin: 'Âge minimum',
    ageMax: 'Âge maximum',
    location: 'Localisation',
    apply: 'Appliquer les filtres',
  },
} as const;
