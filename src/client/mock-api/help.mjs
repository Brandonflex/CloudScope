// Curated explanations for the fictional preview. These are not a language
// model or live documentation; keep claims aligned with the deployed demo.
const topics = [
  {
    matches: (q) => /\b(?:is|are|what|explain|using|use)\b/.test(q) && /\b(?:real|live|actual|synthetic|fictional|demo)\b/.test(q) && /\b(?:data|estate|inventory|preview|cloud|account|resources)\b/.test(q) && (!/\b(?:how many|which|list|show|count|my)\b/.test(q) || /\b(?:real|live|actual)\b/.test(q)) || /^(?:is this|is it) (?:real|live)$/.test(q),
    answer: '**This preview uses fictional demo data.** Its Azure and AWS resources, costs and findings do not come from your accounts. It has no persistent changes or realtime updates.\n\nFor real data, an operator must deploy the backend and a protected identity-aware gateway; this preview cannot connect your accounts.',
    suggestedQuestions: ['How do I connect real cloud accounts?', 'What can CloudScope do?', 'How do I get started?']
  },
  {
    matches: (q) => /\b(?:connect|link|integrat|setup|set up|configure|onboard|access)\w*\b/.test(q) && /\b(?:azure|aws|accounts?|credentials?|real data|live data|cloud)\b/.test(q),
    answer: '**Connecting real cloud accounts requires a separate deployment.** An operator must deploy the .NET backend, configure the cloud providers and place the application behind an identity-aware gateway with backend network isolation. This Vercel preview cannot connect to your accounts.\n\nDo not paste credentials or secrets into this chat. The deployment and security guides in the repository describe the required safeguards.',
    suggestedQuestions: ['Is this real data?', 'How is access protected?', 'What does discovery do?']
  },
  {
    matches: (q) => /\b(?:secur|security|protect|access control|authentication|authorization|privacy|permissions?|who can access)\w*\b/.test(q) && /\b(?:cloudscope|platform|preview|app|data|access|protected|security|permissions?|authentication|privacy)\b/.test(q) || /^(?:how is access protected|who can access this|is this secure)$/.test(q),
    answer: '**Access protection is an operator responsibility.** Keep Vercel Deployment Protection enabled for this demo. For real data, use a trusted identity-aware gateway, restrict direct backend access and configure the gateway secret; the shared secret alone does not authenticate individual users.\n\nThe preview is not a production backend. Never paste credentials or sensitive information into the chat.',
    suggestedQuestions: ['How do I connect real cloud accounts?', 'Is this real data?', 'What are the responsibilities of CloudScope?']
  },
  {
    matches: (q) => /\b(?:limitations?|what can(?:not| t)|what can you not|what can t you|can (?:it|you|cloudscope) (?:fix|delete|change|modify)|does (?:it|cloudscope) (?:fix|delete|change|modify)|automatically (?:fix|delete|change|modify))\b/.test(q),
    answer: '**Know the limits:** this preview uses fictional data, has no live notifications or persistent changes, and cannot connect to your accounts. Its assistant is rule-based, does not remember conversation context, and cannot answer every question.\n\nIt does not make infrastructure changes. Recommendations and findings should be checked by a qualified person before any action.',
    suggestedQuestions: ['Is this real data?', 'What are the responsibilities of CloudScope?', 'How do I connect real cloud accounts?']
  },
  {
    matches: (q) => /\b(?:responsibilit\w*|purpose|capabilit\w*|features|what can (?:you|cloudscope|this|the platform) do|how can (?:you|cloudscope|this|the platform) help(?: me)?|how does cloudscope work|what does (?:cloudscope|the platform|this platform) do|who is (?:this|cloudscope) for|what is cloud ?s(?:c)?ope|what is (?:the|this) platform(?: about)?|tell me about (?:cloud ?s(?:c)?ope|the platform)|explain cloudscope|describe cloudscope)\b/.test(q),
    answer: 'CloudScope is a **multi-cloud infrastructure intelligence platform** for exploring resources, dependencies, costs and compliance across Azure and AWS. It helps teams understand their estate, investigate potential risk and identify possible savings.\n\nCloudScope presents information and recommendations; people remain responsible for validating findings, securing access and deciding whether to make changes. This preview uses fictional demo data and a rule-based query engine, not a general-purpose AI assistant.',
    suggestedQuestions: ['How do I get started?', 'What does discovery do?', 'Is this real data?'],
    relatedPage: { label: 'Open dashboard', path: '/dashboard' }
  },
  {
    matches: (q) => /^(?:hi|hello|hey|help|start|how do i get started|how can i get started|how do i use (?:this|cloudscope)|how can i use (?:this|cloudscope)|how do i navigate|what can i ask(?: you)?|how do i use the (?:assistant|chat)|how does (?:this|the chat|the assistant) work)$/.test(q),
    answer: '**Start with the Dashboard** for a summary, then use Resources to inspect an item, Infrastructure graph to explore dependencies, Cost intelligence for spending and Compliance for findings.\n\nAsk a complete question, such as “What are my top 5 most expensive resources?” or “What is the blast radius of vm-app-01?”. The demo assistant answers supported topics using rules; it does not remember conversational context or answer every question.',
    suggestedQuestions: ['What can CloudScope do?', 'What are my top 5 most expensive resources?', 'What is the blast radius of vm-app-01?'],
    relatedPage: { label: 'Open dashboard', path: '/dashboard' }
  },
  {
    matches: (q) => /\b(?:discovery|discover|scanning cloud|scan cloud)\b/.test(q) && /\b(?:what|how|explain|mean|does|work|use)\b/.test(q),
    answer: '**Discovery** collects and normalises information about cloud resources and their relationships for the inventory and graph. In a real deployment, an operator configures the providers and their permissions.\n\nIn this preview, discovery uses the bundled fictional estate; it does not scan your accounts or persist changes.',
    suggestedQuestions: ['Is this real data?', 'How do I connect real cloud accounts?', 'How many resources are there?'],
    relatedPage: { label: 'Explore resources', path: '/resources' }
  },
  {
    matches: (q) => /^(?:what is|what does|explain|define|how does|tell me about) (?:a |the |cloudscope )?(?:resource|resources|inventory|dashboard|resource inventory)(?: mean| work| do)?$/.test(q),
    answer: '**Resources** are the cloud assets in the inventory, such as virtual machines, networks and databases. The Dashboard summarises the estate; Resources lets you inspect individual items and their properties. The items in this preview are fictional.',
    suggestedQuestions: ['How many resources are there?', 'What does discovery do?', 'Is this real data?'],
    relatedPage: { label: 'Explore resources', path: '/resources' }
  },
  {
    matches: (q) => (/\b(?:realtime|real time|live updates?|signalr)\b/.test(q) || /^(?:why does it say offline|what does offline mean)$/.test(q)) && /\b(?:what|why|how|mean|available|does|off|offline)\b/.test(q),
    answer: '**Realtime updates** notify the app about events such as discoveries and scans. “Realtime off” in this preview means those live notifications are unavailable; it does not necessarily mean the demo API is offline. The preview has no SignalR connection.',
    suggestedQuestions: ['Is this real data?', 'What does discovery do?', 'How do I get started?']
  },
  {
    matches: (q) => /^(?:what is|what does|explain|define|how does|how do|tell me about) (?:a |the |cloudscope )?(?:blast radius|dependencies|dependency|infrastructure graph|the graph|graph)(?: mean| work| do)?$/.test(q),
    answer: '**The infrastructure graph** shows resources and their relationships. A **blast radius** estimates which resources may be affected if a named resource fails, by traversing relevant dependency links. It is a guide for investigation, not a guarantee of impact.\n\nTry asking about a specific resource, or inspect the graph.',
    suggestedQuestions: ['What is the blast radius of vm-app-01?', 'How many resources are there?', 'What does discovery do?'],
    relatedPage: { label: 'Open infrastructure graph', path: '/graph' }
  },
  {
    matches: (q) => /^(?:what is|what does|explain|define|how does|tell me about) (?:a |the |cloudscope )?(?:compliance|compliance scanning|compliance scan|compliance violations?|policy|policies|cis|soc 2|hipaa|gdpr)(?: mean| work| do)?$/.test(q),
    answer: '**Compliance** compares resource properties with configured policy checks and reports findings by framework and severity. A finding indicates a rule did not pass; it is not proof of a breach or of full regulatory compliance. Review each result and its remediation before acting. Preview findings are fictional.',
    suggestedQuestions: ['Show my critical compliance violations', 'Are there any CIS compliance violations?', 'Is this real data?'],
    relatedPage: { label: 'Open compliance', path: '/compliance' }
  },
  {
    matches: (q) => /^(?:what is|what does|explain|define|how does|tell me about) (?:a |the |cloudscope )?(?:cost intelligence|costs?|cost anomalies|cost anomaly|anomalies|anomaly|forecasts?|cost forecast|recommendations?|rightsizing|right sizing)(?: mean| work| do)?$/.test(q),
    answer: '**Cost intelligence** helps explore estimated spending, trends, anomalies, forecasts and potential savings. An anomaly is an unusual deviation, not necessarily an error; a forecast and recommendation are estimates, not guarantees. Review usage and pricing before making changes. Preview costs are fictional.',
    suggestedQuestions: ['What are my top 5 most expensive resources?', 'Which resource costs are anomalous?', 'Where can I save money?'],
    relatedPage: { label: 'Open cost intelligence', path: '/costs' }
  },
  {
    matches: (q) => /^(?:what is|what does|explain|define|how does|tell me about) (?:a |the )?(?:iac|infrastructure as code|terraform|bicep|drift)(?: mean| work| do)?$/.test(q),
    answer: '**Infrastructure as code (IaC)** manages infrastructure through versioned definitions, such as Terraform or Bicep. CloudScope can identify resources marked as not managed by IaC for further review; that flag alone does not prove configuration drift. The preview uses fictional data.',
    suggestedQuestions: ['Which resources are not managed by IaC?', 'How many resources are there?', 'Is this real data?'],
    relatedPage: { label: 'Explore resources', path: '/resources' }
  }
];

export function findHelp(normalizedQuestion) {
  return topics.find((topic) => topic.matches(normalizedQuestion)) ?? null;
}
