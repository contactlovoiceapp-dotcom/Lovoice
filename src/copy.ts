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
    resetFilters: 'Réinitialiser les filtres',
  },

  errorBoundary: {
    title: 'Oups, un imprévu',
    body: "Quelque chose n'a pas fonctionné. Tu peux réessayer.",
    retry: 'Réessayer',
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
    restart: 'Effacer et réenregistrer',
    recorded: 'Voix enregistrée !',
    hint: 'Parle comme à une personne, pas comme à un micro. 10 sec min, 1 min 30 max.',
    minimumDurationError: 'Ton vocal doit durer au moins 10 secondes.',
    idleStatus: 'Appuie pour commencer',
    recordingStatus: 'Appuie pour arrêter',
    recordedStatus: 'Appuie sur ▶ pour réécouter ta voix',
    previewPlayingStatus: 'Lecture de ta voix',
    uploadingStatus: 'Envoi de ta voix…',
    uploadErrorStatus: "Échec de l'envoi. Vérifie ta connexion.",
    uploadRateLimitStatus: 'Tu as envoyé trop de vocaux aujourd\'hui. Réessaie demain.',
    permissionDeniedStatus: "Lovoice a besoin d'accéder à ton micro pour enregistrer ta voix.",
    profileRefreshError: "Impossible de charger ton profil. Réessaie dans quelques instants.",
    minimumRemaining: (seconds: number) => `Encore ${seconds} sec minimum`,
    ctaRecord: 'Enregistre ta voix',
    ctaUploading: 'Envoi en cours…',
    ctaRetry: 'Réessayer',
    ctaOpenSettings: 'Ouvrir les réglages',
    ctaCancel: 'Annuler',
    ctaStopRecording: "Arrête l'enregistrement",
    ctaReRecord: 'Réenregistrer',
    ctaContinueWithoutVoice: 'Continuer sans vocal',
    silenceWarningStatus: "Ton enregistrement semble silencieux ou bruité.",
    silenceWarningHint: "On n'a pas détecté de voix. Parle un peu plus fort, ou plus près du micro.",
    needInspiration: "Besoin d'inspiration ?",
    skip: "Passer pour l'instant",
    inspirationNext: 'Une autre idée',
    inspirationQuestions: [
      'Raconte un moment sympa de ta journée.',
      'Qu’est-ce qui te fait sourire facilement ?',
      'Dis ton talent le plus inutile mais incroyable...',
      'Si tes proches devaient te décrire en trois mots, ils diraient quoi ?',
      'C’est quoi ton endroit préféré dans ta ville ?',
      'Une série ou un podcast que tu conseilles en ce moment ?',
      'Quelle est la conversation que tu pourrais avoir pendant des heures ?',
      'Quelle est ta musique du moment ?',
      'Tu as une journée complètement libre demain : tu fais quoi ?',
      'Si on devait retenir une seule chose sur toi... ce serait quoi ?',
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
    voiceMissingTitle: "Aucun vocal pour l'instant.",
    voiceMissingHint: 'Enregistre ta voix pour rejoindre les rencontres.',
    voiceMissingCta: 'Enregistrer ma voix',
    voicePlayUnavailable: 'Lecture indisponible',
    voicePlayError: 'Impossible de charger ton vocal. Réessaie dans un instant.',
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

    legalSectionTitle: 'Compte & confidentialité',
    termsLink: 'Conditions générales',
    privacyLink: 'Politique de confidentialité',
    exportDataCta: 'Exporter mes données',
    exportDataConfirmTitle: 'Demander l’export de tes données',
    exportDataConfirmBody:
      'Nous traiterons ta demande manuellement sous quelques jours ouvrés. Indique l’adresse e-mail où tu veux recevoir ton export (ce n’est pas un téléchargement instantané).',
    exportDataEmailLabel: 'Adresse e-mail',
    exportDataEmailPlaceholder: 'exemple@email.com',
    exportDataEmailInvalid: 'Entre une adresse e-mail valide.',
    exportDataConfirmCta: 'Envoyer la demande',
    exportDataSuccessTitle: 'Demande envoyée',
    exportDataSuccessBody:
      'Ton export est en file d’attente. Notre équipe te contactera ou t’enverra tes données dès que possible.',
    exportDataAlreadyPending:
      'Tu as déjà une demande d’export en cours. Patiente quelques jours ouvrés avant d’en refaire une.',
    exportDataError:
      'Impossible d’enregistrer ta demande pour le moment. Réessaie dans quelques instants.',

    deleteAccountCta: 'Supprimer mon compte',
    deleteAccountConfirmTitle: 'Supprimer ton compte ?',
    deleteAccountConfirmBody:
      'Cette action est définitive. Ton profil, ta voix, tes messages, tes likes et tes notifications seront supprimés. Les messages que tu as envoyés disparaîtront des conversations. Tu pourras créer un nouveau compte plus tard avec le même numéro.',
    deleteAccountConfirmCta: 'Supprimer définitivement',
    deleteAccountFinalTitle: 'Confirmer la suppression',
    deleteAccountFinalBody: 'Dernière étape : confirme que tu veux supprimer ton compte. Cette action ne peut pas être annulée.',
    deleteAccountFinalCta: 'Oui, supprimer',
    deleteAccountError: 'Impossible de supprimer ton compte pour le moment. Réessaie dans quelques instants.',

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
    deleteVoiceConfirmTitle: 'Supprimer ton vocal ?',
    deleteVoiceConfirmBody: "Ton vocal sera supprimé définitivement. Tu ne pourras plus écouter les vocaux des autres tant que tu n'en auras pas enregistré un nouveau.",
    deleteVoiceConfirmCta: 'Supprimer',
    deleteVoiceError: 'Impossible de supprimer ton vocal. Réessaie dans un instant.',
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
    resetSeen: 'Recommencer mon feed',
    resetConfirmTitle: 'Recommencer ton feed ?',
    resetConfirmBody:
      'Toutes les voix que tu as déjà entendues redeviendront disponibles. Ton historique de likes et de messages est conservé.',
    resetConfirmCta: 'Tout recommencer',
    resetError: 'La réinitialisation a échoué. Réessaie dans un instant.',
    loadError: 'Impossible de charger les voix. Réessaie.',
    retry: 'Réessayer',
    swipeHint: 'Glisse vers le bas pour découvrir d\'autres voix',
    swipeHintGotIt: 'Compris',
  },

  actions: {
    reply: 'Répondre',
    openConversation: 'Ouvrir la conversation',
  },

  replyVoiceModal: {
    title: 'Un seul message.',
    hint: (name: string) =>
      `Envoie ton vocal, à ${name} de faire le prochain pas.`,
    tapToRecord: 'Appuie pour enregistrer',
    tapToStop: 'Appuie pour terminer',
    tooShort: 'Trop court — continue un peu.',
    recordingError: 'Erreur d\'enregistrement. Réessaie.',
    preview: {
      reRecord: 'Réenregistrer',
      send: 'Envoyer',
      playA11y: 'Écouter le vocal',
      pauseA11y: 'Pause',
    },
    sending: 'Envoi en cours…',
    sentToast: (name: string) => `Vocal envoyé à ${name} ✓`,
    sendError: 'Échec de l\'envoi. Réessaie.',
  },

  actionsSheet: {
    title: (name: string) => `Que veux-tu faire avec ${name} ?`,
    report: 'Signaler ce profil',
    block: 'Bloquer ce profil',
  },

  reportSheet: {
    title: (name: string) => `Signaler ${name}`,
    subtitle: 'Choisis une raison.',
    reasons: {
      harassment: 'Harcèlement',
      hate: 'Discours haineux',
      inappropriate: 'Contenu inapproprié',
      spam: 'Spam ou arnaque',
      other: 'Autre',
    },
    freeTextPlaceholder: 'Donne-nous plus de contexte (facultatif)…',
    submit: 'Envoyer le signalement',
    submitting: 'Envoi…',
    error: 'Échec du signalement. Réessaie dans un instant.',
    rateLimitError: 'Tu as envoyé trop de signalements récemment. Réessaie plus tard.',
    successTitle: 'Signalement reçu',
    successBody:
      "Merci de protéger la communauté Lovoice. Ce profil est aussi bloqué : tu ne le verras plus dans Découvrir ni dans tes likes. Notre équipe examinera le signalement.",
    successCta: 'Compris',
  },

  rateLimit: {
    like: 'Tu as aimé trop de voix récemment. Réessaie dans un instant.',
    report: 'Tu as envoyé trop de signalements récemment. Réessaie plus tard.',
    uploadVoice: 'Tu as envoyé trop de vocaux aujourd\'hui. Réessaie demain.',
    uploadMessage: 'Tu as envoyé trop de vocaux récemment. Réessaie dans un instant.',
  },

  chat: {
    inbox: {
      title: 'Messages',
      emptyTitle: 'Pas encore de messages',
      emptyBody: 'Réponds à un vocal pour démarrer une conversation.',
      voicePreview: (mmss: string) => `🎤 Vocal · ${mmss}`,
      awaitingBadge: 'Vocal envoyé',
      voiceOnlyBadge: 'Mode vocal',
      unreadAria: (n: number) => `${n} message${n > 1 ? 's' : ''} non lu${n > 1 ? 's' : ''}`,
      errorTitle: 'Impossible de charger les conversations.',
      retry: 'Réessayer',
      openConversationHint: 'Ouvre la conversation',
      deletedAccountName: 'Compte supprimé',
      deletedAccountPreview: 'Conversation terminée',
      deletedAccountA11y: 'Compte supprimé, conversation indisponible',
    },
    conversation: {
      voiceOnlyCountdown: (h: number, m: number, s: number) =>
        `Mode chat dans ${h}h${m.toString().padStart(2, '0')}m${s.toString().padStart(2, '0')}s`,
      composerHintAwaiting: (name: string) => `En attente de la réponse de ${name}…`,
      composerHintInitial: 'Envoie un vocal — tu n\'as qu\'une chance.',
      composerHintRecipientReply: 'À ton tour — réponds avec un vocal.',
      composerHintEmptyDefensive: 'Cette conversation n\'est pas disponible.',
      composerHintVoiceOnly: (h: number, m: number, s: number) =>
        `Messagerie texte disponible dans ${h}h${m.toString().padStart(2, '0')}m${s.toString().padStart(2, '0')}s`,
      conversationInfoBanner: (name: string) =>
        `Si tu réponds à ${name}, ${name} pourra te répondre librement.`,
      sendError: {
        first_message_must_be_voice: 'Le premier message doit être un vocal.',
        reply_must_be_voice: 'Réponds avec un vocal pour démarrer la conversation.',
        not_initiator: 'Tu ne peux pas écrire en premier dans cette conversation.',
        awaiting_reply: (name: string) => `${name} doit répondre avant que tu puisses renvoyer un message.`,
        text_locked_24h: 'Tu pourras écrire 24 h après la première réponse.',
        blocked: 'Cette conversation n\'est plus disponible.',
        conversation_not_found: 'Cette conversation est introuvable.',
        not_a_participant: 'Tu ne fais pas partie de cette conversation.',
        update_forbidden: 'Action non autorisée.',
        empty_body: 'Écris quelque chose avant d\'envoyer.',
        rate_limit_exceeded: 'Tu as envoyé trop de vocaux récemment. Réessaie dans un instant.',
        network: 'Échec de l\'envoi. Réessaie dans un instant.',
        unknown: 'Une erreur est survenue. Réessaie dans un instant.',
      },
      status: {
        sending: 'Envoi…',
        sent: '✓ Envoyé',
        read: '✓✓ Lu',
        failedTap: 'Échec — toucher pour réessayer',
      },
      moreActions: 'Plus d\'options',
      back: 'Retour',
      sendCta: 'Envoyer',
      voiceCtaLabel: 'Enregistrer un vocal',
      inputPlaceholder: 'Écris ton message…',
      sendingLabel: 'Envoi…',
      failedLabel: 'Échec — toucher pour réessayer',
      cancelRecording: 'Annuler l\'enregistrement',
      sendVoice: 'Envoyer le vocal',
      recordingTooShort: 'Trop court — enregistre au moins 1 seconde.',
      recordingError: 'Échec de l\'enregistrement. Réessaie.',
      micPermissionDeniedTitle: 'Accès au micro requis',
      micPermissionDeniedMessage: 'Lovoice a besoin de ton micro pour enregistrer des vocaux. Ouvre les Réglages pour autoriser l\'accès.',
      micPermissionDeniedOpenSettings: 'Ouvrir les Réglages',
      micPermissionDeniedCancel: 'Annuler',
      voiceMessage: {
        playA11y: 'Lecture du message vocal',
        pauseA11y: 'Pause du message vocal',
        duration: (mmss: string) => `Durée : ${mmss}`,
        // Keys mirror ChatMessagePlayerErrorCode in chatMessagePlayer.ts.
        playErrors: {
          play_timeout: 'Le vocal met trop de temps à démarrer. Réessaie.',
          play_network: 'Impossible d\'accéder au vocal. Vérifie ta connexion.',
          play_load_failed: 'Impossible de charger le vocal. Réessaie.',
          play_unreadable: 'Ce vocal semble illisible ou endommagé. Réessaie.',
          play_failed: 'Impossible de lire ce vocal.',
        },
      },
      otherIsTyping: (name: string) => `${name} écrit…`,
      otherIsRecording: (name: string) => `${name} enregistre un vocal…`,
      startConversationError: 'Impossible de démarrer la conversation. Réessaie.',
    },
  },

  blockModal: {
    title: (name: string) => `Bloquer ${name} ?`,
    body: (name: string) =>
      `${name} ne pourra plus voir ta voix ni te contacter. Tu ne verras plus ses voix dans Découvrir.`,
    confirm: 'Bloquer',
    blocking: 'Blocage…',
    error: 'Échec du blocage. Réessaie dans un instant.',
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
    tapCardHint: 'Voir le profil',
    openProfileHint: 'Ouvre la fiche profil',
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

  memberProfilePreview: {
    error: 'Impossible de charger ce profil.',
    closeA11y: 'Fermer le profil',
  },

  likeToast: {
    firstLike: (name: string) =>
      `Ajouté à tes Likes — ${name} recevra une notification.`,
  },

  filters: {
    title: 'Filtres',
    ageRange: "Tranche d'âge",
    ageUnit: 'ans',
    ageMin: 'Âge minimum',
    ageMax: 'Âge maximum',
    distance: 'Distance maximum',
    distanceUnit: 'km',
    distanceUnlimitedLabel: 'Illimité',
    distanceUnlimitedSwitch: 'Sans limite de distance',
    apply: 'Appliquer',
    reset: 'Réinitialiser',
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
