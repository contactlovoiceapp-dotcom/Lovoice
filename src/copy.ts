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
    appName: 'Lovoice',
  },

  a11y: {
    record: 'Enregistrer',
    stopRecording: "Arrêter l'enregistrement",
    play: 'Lecture',
    pause: 'Mettre en pause',
    deleteVoice: 'Supprimer le vocal',
    retakeVoice: 'Refaire mon vocal',
    clearEmoji: 'Supprimer cet emoji',
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
    cguNotice: 'En me connectant, je m\'engage à respecter les valeurs de bienveillance de la communauté Lovoice et j\'accepte les ',
    cguLink: 'Conditions Générales',
    cta: 'Connexion',
  },

  phone: {
    title: 'Ton numéro',
    subtitle: "Nous t'enverrons un code pour vérifier ton compte.",
    sendCode: 'Recevoir le code',
    sendingCode: 'Envoi du code...',
    codeTitle: 'Code de vérification',
    codeSubtitle: (phone: string) => `Saisis le code envoyé au ${phone}`,
    codePlaceholder: '000000',
    verify: 'Vérifier',
    verifying: 'Vérification...',
    resendCode: 'Renvoyer le code',
    invalidCountry: 'Lovoice est disponible uniquement en France, Belgique et Suisse.',
    invalidPhone: 'Entre un numéro valide pour le pays sélectionné.',
    missingOtpParams: 'Le numéro à vérifier est manquant. Recommence depuis la saisie du téléphone.',
    authUnavailable: "La connexion est momentanément indisponible. Réessaie dans quelques instants.",
    profileSaveFailed: "Impossible d'enregistrer ton profil. Recommence l'onboarding depuis le début.",
  },

  record: {
    title: 'Ta ',
    titleAccent: 'Voix',
    subtitle: 'Zéro pression. Juste ta voix.',
    maxDuration: '/ 1:30',
    restart: 'Recommencer',
    recorded: 'Voix enregistrée !',
    hint: 'Parle comme à une personne, pas comme à un micro. 10 sec min, 1m30 max.',
    minimumDurationError: 'Ton vocal doit durer au moins 10 secondes.',
    idleStatus: 'Appuie pour commencer',
    recordingStatus: 'Appuie pour arrêter',
    recordedStatus: 'Écoute rapide avant de continuer',
    previewPlayingStatus: 'Lecture de ta voix',
    previewHint: 'Tu peux réécouter, recommencer ou continuer.',
    profileRefreshError: "Impossible de charger ton profil. Réessaie dans quelques instants.",
    minimumRemaining: (seconds: number) => `Encore ${seconds} sec minimum`,
    ctaRecord: 'Enregistre ta voix',
    ctaMinimumRemaining: (seconds: number) => `Encore ${seconds} sec`,
    ctaStopRecording: "Arrête l'enregistrement",
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
    catchphraseHint: 'Titre de ton vocal…',
    catchphraseEditHint: "N'hésite pas à teaser ton vocal.",
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
    signOutTitle: 'Déconnexion',
    signOutBody: 'Tu seras déconnecté·e de cet appareil. Tes données ne seront pas supprimées.',
    signOutCta: 'Se déconnecter',
    signOutConfirmTitle: 'Te déconnecter ?',
    signOutConfirmBody: 'Tu pourras te reconnecter avec ton numéro de téléphone.',
    signOutConfirmCta: 'Me déconnecter',
    signOutError: 'Impossible de te déconnecter pour le moment. Réessaie dans quelques instants.',

    editSectionInfo: 'Mes informations',
    editSectionPreferences: 'Je cherche',
    editSectionCity: 'Ma ville',
    editDisplayNameLabel: 'Prénom',
    editBirthdateLabel: 'Date de naissance',
    editGenderLabel: 'Je suis',
    editSaveChanges: 'Enregistrer les modifications',
    editSaving: 'Enregistrement...',
    editCityCurrentLabel: (city: string) => `Ville actuelle : ${city}`,
    editCityChangePrompt: 'Changer de ville',
    editCityChangeHint: 'Recherche une nouvelle ville puis sélectionne-la dans les résultats.',
    editSaveSuccess: 'Profil mis à jour.',
    recordVoiceAgain: 'Changer mon vocal',
    emojiPickerTitle: 'Choisis un emoji',
    emojiPickerInputPlaceholder: 'Entre un emoji manuellement',
    editErrors: {
      name_too_short: 'Ton prénom doit contenir au moins 2 caractères.',
      name_too_long: 'Ton prénom ne peut pas dépasser 30 caractères.',
      birthdate_invalid: 'Entre une date de naissance valide.',
      birthdate_underage: 'Tu dois avoir au moins 18 ans.',
      gender_required: 'Sélectionne ton genre.',
      looking_for_empty: 'Choisis au moins une option.',
      city_select_result: 'Sélectionne une ville dans les résultats si tu veux changer ta localisation.',
      save_failed: "Impossible d'enregistrer les modifications. Réessaie dans quelques instants.",
    },
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
    profile: 'Profil',
  },

  likesScreen: {
    title: 'Likes',
    subtitle: 'Retrouve les personnes qui aiment ta voix et celles que tu as likées.',
    receivedTab: 'Reçus',
    givenTab: 'Donnés',
    receivedBadge: 'A aimé ta voix',
    receivedAction: 'Découvrir son profil',
    givenEmptyTitle: 'Aucun like donné',
    givenEmptyBody: "Découvre de nouvelles Voix et like celles qui te plaisent !",
    receivedEmptyTitle: 'Aucun like reçu',
    receivedEmptyBody: 'Continue à faire entendre ta voix, les likes arriveront ici.',
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

  onboarding: {
    // Shared step indicator — "1 / 5"
    step: (current: number, total: number) => `${current} / ${total}`,

    name: {
      title: 'Comment tu t\'appelles ?',
      subtitle: "C'est le prénom qui apparaîtra sur ton profil.",
      placeholder: 'Ton prénom',
      errors: {
        too_short: 'Ton prénom doit contenir au moins 2 caractères.',
        too_long: 'Ton prénom ne peut pas dépasser 30 caractères.',
      },
    },

    birthdate: {
      title: 'Ta date de naissance',
      subtitle: 'Tu dois avoir au moins 18 ans pour rejoindre Lovoice.',
      placeholder: 'JJ / MM / AAAA',
      errors: {
        invalid_date: 'Entre une date valide.',
        underage: 'Tu dois avoir au moins 18 ans pour rejoindre Lovoice.',
      },
    },

    gender: {
      title: 'Tu es...',
      subtitle: 'Choisis le genre qui te correspond.',
      options: {
        female: 'Femme',
        male: 'Homme',
        nonbinary: 'Non-binaire',
        other: 'Autre',
      },
      errors: {
        invalid: 'Sélectionne un genre pour continuer.',
      },
    },

    lookingFor: {
      title: 'Tu cherches...',
      subtitle: 'Tu peux choisir plusieurs options.',
      options: {
        female: 'Femme',
        male: 'Homme',
        nonbinary: 'Non-binaire',
        other: 'Autre',
      },
      errors: {
        empty: 'Choisis au moins une option.',
        invalid_value: 'Une ou plusieurs options sont invalides.',
      },
    },

    city: {
      title: 'Tu vis où ?',
      subtitle: 'Tape le nom de ta ville ou de ton village, puis lance la recherche.',
      placeholder: 'Ex. Paris, Namur, Lausanne',
      searchCta: 'Rechercher',
      searching: 'Recherche...',
      selectResult: 'Choisis ta ville dans la liste.',
      selectedResult: 'Ville sélectionnée',
      noResults: 'Aucun résultat. Essaie un autre terme.',
      // Shown below the selected city to explain why we need coordinates.
      coordinatesHint: 'Tes coordonnées sont utilisées uniquement pour calculer les distances.',
      saving: 'Création de ton profil...',
      errors: {
        required: 'Indique ta ville pour continuer.',
        select_result: 'Sélectionne une ville dans les résultats.',
        query_too_short: 'Entre au moins 2 caractères avant de rechercher.',
        search_failed: 'La recherche est momentanément indisponible. Réessaie dans quelques instants.',
        wizard_incomplete: "Une étape précédente est manquante. Reprends l'onboarding depuis le début.",
        save_failed: "Impossible d'enregistrer ton profil. Réessaie dans quelques instants.",
      },
    },
  },
} as const;
