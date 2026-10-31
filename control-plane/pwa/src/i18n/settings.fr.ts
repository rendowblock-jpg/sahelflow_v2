import type { Catalog } from "./types";

// W3b F6b: l’écran réglages / appareils. Le code PIN ne fait que verrouiller l’écran : aucun texte ne dit qu’il chiffre.
export const settingsFr: Catalog = {
  "settings.lastSync": "Dernière mise à jour {{time}}",
  "settings.lastSync.none": "Pas encore de mise à jour",
  "settings.pairedSince": "Associé depuis le {{date}}",
  "settings.pinNote": "Le code PIN ne fait que verrouiller l’écran. Il ne chiffre pas vos données.",
  "settings.offline.note": "Pas de connexion. Le verrou, la langue et le retrait de ce téléphone fonctionnent quand même.",
  "settings.error.load": "Impossible de charger les réglages.",
  "settings.error.wipe": "Ce téléphone n’a pas pu être retiré complètement. Fermez l’application et réessayez.",
  "settings.commands.title": "Commandes en cours",
  "settings.commands.empty": "Rien n’est en attente.",
  "settings.commands.state.queued": "En attente d’envoi",
  "settings.commands.state.sent": "Envoyée, en attente de votre PC",
  "settings.commands.state.unknown": "Pas sûr qu’elle ait été exécutée. Vérifiez à nouveau.",
  "settings.commands.retry": "Réessayer",
  "settings.commands.discard": "Abandonner",
};
