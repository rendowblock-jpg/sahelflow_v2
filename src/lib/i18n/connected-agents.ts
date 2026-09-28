/**
 * Connected agents copy (FD-063, MCP-13).
 *
 * Trilingual strings for the Agents workspace surface that manages external
 * MCP agents: the grants a seller issues, what each agent may do and what it
 * recently did. Kept beside the other Agents copy modules; parity across the
 * three locales is enforced by the `satisfies` clauses below.
 */
export type ConnectedAgentsLocale = "en" | "fr" | "ar";

type Params = Record<string, string | number>;

const EN = {
  railTitle: "Connected agents",
  railHint: "External AI over MCP",
  title: "Connected agents",
  description:
    "Let external AI agents such as Claude Desktop work in this shop with only the tools you grant. Every sensitive change still waits for your approval.",
  connect: "Connect an agent",
  agentsSection: "Agents",
  activitySection: "Recent activity",
  activityDescription:
    "What connected agents did here. Call details stay sealed in the audit log.",
  emptyAgentsTitle: "No agent connected yet",
  emptyAgentsDescription:
    "Connect Claude Desktop or another MCP client and choose exactly which tools it may use.",
  emptyActivity: "No agent activity yet. Calls appear here as soon as an agent works.",
  statusActive: "Active",
  statusRevoked: "Revoked",
  lastActive: "Last active {time}",
  neverConnected: "Not connected yet",
  toolCount: "Tools: {count}",
  keyHint: "Key ends in {hint}",
  revoke: "Revoke",
  revokeTitle: "Revoke {name}?",
  revokeDescription:
    "The agent loses access on its very next request. To reconnect it later, create a new key.",
  revokeConfirm: "Revoke access",
  revoked: "{name} no longer has access",
  dialogTitle: "Connect an agent",
  dialogDescription:
    "Name the agent and choose what it may do. It can never do more than you can.",
  nameLabel: "Agent name",
  namePlaceholder: "e.g. Claude Desktop",
  toolsLabel: "Allowed tools",
  toolsSelected: "{count} selected",
  presetReadOnly: "Read only",
  presetAll: "Everything",
  presetClear: "Clear",
  badgeRead: "Reads",
  badgeApproval: "Needs approval",
  badgeExternal: "External",
  create: "Create key",
  creating: "Creating…",
  cancel: "Cancel",
  secretTitle: "Copy this key now",
  secretDescription:
    "Give it to your agent's SahelFlow connection as SAHELFLOW_AGENT_GRANT. For your security it will not be shown again.",
  copy: "Copy key",
  copied: "Copied",
  done: "Done",
  outcomeSucceeded: "Completed",
  outcomeProposed: "Awaiting approval",
  outcomeFailed: "Failed",
  outcomeDenied: "Denied",
  outcomeRateLimited: "Rate limited",
  openReview: "Review",
  unknownAgent: "Removed agent",
  loadFailed: "Connected agents are unavailable right now.",
  retry: "Retry",
  readOnlyNotice: "You can see connected agents, but only the shop owner can connect or revoke them.",
  configTitle: "Claude Desktop configuration",
  configDescription:
    "Add this under mcpServers in claude_desktop_config.json, then restart Claude Desktop. Other MCP clients take the same command and variable.",
  copyConfig: "Copy configuration",
  agentRequest: "Agent request · {tool}",
  actionFailed: "That didn't work. Try again.",
  limitReached: "Revoke an agent before connecting another.",
  durationMs: "{ms} ms",
} as const;

type Copy = { readonly [Key in keyof typeof EN]: string };

const FR = {
  railTitle: "Agents connectés",
  railHint: "IA externes via MCP",
  title: "Agents connectés",
  description:
    "Laissez des agents IA externes comme Claude Desktop travailler dans cette boutique avec uniquement les outils que vous accordez. Chaque changement sensible attend toujours votre validation.",
  connect: "Connecter un agent",
  agentsSection: "Agents",
  activitySection: "Activité récente",
  activityDescription:
    "Ce que les agents connectés ont fait ici. Le détail des appels reste scellé dans le journal d'audit.",
  emptyAgentsTitle: "Aucun agent connecté",
  emptyAgentsDescription:
    "Connectez Claude Desktop ou un autre client MCP et choisissez précisément les outils qu'il peut utiliser.",
  emptyActivity:
    "Aucune activité pour l'instant. Les appels apparaissent ici dès qu'un agent travaille.",
  statusActive: "Actif",
  statusRevoked: "Révoqué",
  lastActive: "Actif {time}",
  neverConnected: "Pas encore connecté",
  toolCount: "Outils : {count}",
  keyHint: "Clé se terminant par {hint}",
  revoke: "Révoquer",
  revokeTitle: "Révoquer {name} ?",
  revokeDescription:
    "L'agent perd l'accès dès sa prochaine requête. Pour le reconnecter plus tard, créez une nouvelle clé.",
  revokeConfirm: "Révoquer l'accès",
  revoked: "{name} n'a plus accès",
  dialogTitle: "Connecter un agent",
  dialogDescription:
    "Nommez l'agent et choisissez ce qu'il peut faire. Il ne pourra jamais faire plus que vous.",
  nameLabel: "Nom de l'agent",
  namePlaceholder: "ex. Claude Desktop",
  toolsLabel: "Outils autorisés",
  toolsSelected: "{count} sélectionné(s)",
  presetReadOnly: "Lecture seule",
  presetAll: "Tout",
  presetClear: "Effacer",
  badgeRead: "Lecture",
  badgeApproval: "Validation requise",
  badgeExternal: "Externe",
  create: "Créer la clé",
  creating: "Création…",
  cancel: "Annuler",
  secretTitle: "Copiez cette clé maintenant",
  secretDescription:
    "Donnez-la à la connexion SahelFlow de votre agent en tant que SAHELFLOW_AGENT_GRANT. Pour votre sécurité, elle ne sera plus affichée.",
  copy: "Copier la clé",
  copied: "Copiée",
  done: "Terminé",
  outcomeSucceeded: "Effectué",
  outcomeProposed: "En attente de validation",
  outcomeFailed: "Échec",
  outcomeDenied: "Refusé",
  outcomeRateLimited: "Limite atteinte",
  openReview: "Examiner",
  unknownAgent: "Agent supprimé",
  loadFailed: "Les agents connectés sont indisponibles pour le moment.",
  retry: "Réessayer",
  readOnlyNotice:
    "Vous pouvez voir les agents connectés, mais seul le propriétaire de la boutique peut les connecter ou les révoquer.",
  configTitle: "Configuration Claude Desktop",
  configDescription:
    "Ajoutez ceci sous mcpServers dans claude_desktop_config.json, puis redémarrez Claude Desktop. Les autres clients MCP utilisent la même commande et la même variable.",
  copyConfig: "Copier la configuration",
  agentRequest: "Demande d'agent · {tool}",
  actionFailed: "L'opération a échoué. Réessayez.",
  limitReached: "Révoquez un agent avant d'en connecter un autre.",
  durationMs: "{ms} ms",
} as const satisfies Copy;

const AR = {
  railTitle: "الوكلاء المتصلون",
  railHint: "ذكاء خارجي عبر MCP",
  title: "الوكلاء المتصلون",
  description:
    "اسمح لوكلاء الذكاء الاصطناعي الخارجيين مثل Claude Desktop بالعمل في هذا المتجر بالأدوات التي تمنحها فقط. كل تغيير حساس ينتظر موافقتك دائمًا.",
  connect: "ربط وكيل",
  agentsSection: "الوكلاء",
  activitySection: "النشاط الأخير",
  activityDescription:
    "ما قام به الوكلاء المتصلون هنا. تفاصيل الاستدعاءات تبقى محفوظة في سجل التدقيق.",
  emptyAgentsTitle: "لا يوجد وكيل متصل بعد",
  emptyAgentsDescription:
    "اربط Claude Desktop أو أي عميل MCP آخر واختر بدقة الأدوات التي يمكنه استخدامها.",
  emptyActivity: "لا يوجد نشاط بعد. تظهر الاستدعاءات هنا فور بدء أي وكيل بالعمل.",
  statusActive: "نشط",
  statusRevoked: "ملغى",
  lastActive: "آخر نشاط {time}",
  neverConnected: "لم يتصل بعد",
  toolCount: "الأدوات: {count}",
  keyHint: "المفتاح ينتهي بـ {hint}",
  revoke: "إلغاء الوصول",
  revokeTitle: "إلغاء وصول {name}؟",
  revokeDescription:
    "يفقد الوكيل وصوله عند طلبه التالي مباشرة. لإعادة ربطه لاحقًا، أنشئ مفتاحًا جديدًا.",
  revokeConfirm: "إلغاء الوصول",
  revoked: "لم يعد لدى {name} أي وصول",
  dialogTitle: "ربط وكيل",
  dialogDescription: "سمِّ الوكيل واختر ما يمكنه فعله. لن يتمكن أبدًا من فعل أكثر مما تستطيع أنت.",
  nameLabel: "اسم الوكيل",
  namePlaceholder: "مثال: Claude Desktop",
  toolsLabel: "الأدوات المسموح بها",
  toolsSelected: "المحدد: {count}",
  presetReadOnly: "قراءة فقط",
  presetAll: "الكل",
  presetClear: "مسح",
  badgeRead: "قراءة",
  badgeApproval: "يتطلب موافقة",
  badgeExternal: "خارجي",
  create: "إنشاء المفتاح",
  creating: "جارٍ الإنشاء…",
  cancel: "إلغاء",
  secretTitle: "انسخ هذا المفتاح الآن",
  secretDescription:
    "أضِفه إلى اتصال SahelFlow لدى وكيلك باسم SAHELFLOW_AGENT_GRANT. حفاظًا على أمانك لن يُعرض مرة أخرى.",
  copy: "نسخ المفتاح",
  copied: "تم النسخ",
  done: "تم",
  outcomeSucceeded: "مكتمل",
  outcomeProposed: "بانتظار الموافقة",
  outcomeFailed: "فشل",
  outcomeDenied: "مرفوض",
  outcomeRateLimited: "تجاوز الحد",
  openReview: "مراجعة",
  unknownAgent: "وكيل محذوف",
  loadFailed: "الوكلاء المتصلون غير متاحين حاليًا.",
  retry: "إعادة المحاولة",
  readOnlyNotice: "يمكنك رؤية الوكلاء المتصلين، لكن ربطهم أو إلغاء وصولهم متاح لمالك المتجر فقط.",
  configTitle: "إعداد Claude Desktop",
  configDescription:
    "أضِف هذا ضمن mcpServers في ملف claude_desktop_config.json ثم أعد تشغيل Claude Desktop. عملاء MCP الآخرون يستخدمون الأمر والمتغير نفسيهما.",
  copyConfig: "نسخ الإعداد",
  agentRequest: "طلب وكيل · {tool}",
  actionFailed: "لم تنجح العملية. حاول مرة أخرى.",
  limitReached: "ألغِ وصول أحد الوكلاء قبل ربط وكيل آخر.",
  durationMs: "{ms} ms",
} as const satisfies Copy;

const COPY: Record<ConnectedAgentsLocale, Copy> = { en: EN, fr: FR, ar: AR };

export type ConnectedAgentsCopyKey = keyof typeof EN;

export function getConnectedAgentsCopy(
  locale: ConnectedAgentsLocale,
  key: ConnectedAgentsCopyKey,
  params?: Params,
): string {
  const template = COPY[locale]?.[key] ?? EN[key];
  if (!params) return template;
  // Interpolated values (agent names, times) are seller data: in Arabic each
  // one is a single first-strong isolate so a Latin name keeps its word order.
  const isolate = locale === "ar";
  let value: string = template;
  for (const [name, replacement] of Object.entries(params)) {
    const text = String(replacement);
    value = value.replaceAll(`{${name}}`, isolate ? `\u2068${text}\u2069` : text);
  }
  return value;
}
