import type { ScreenshotAsset } from "../src/briefing/types";

export const exampleSourceNote = "Fictional customer profiles · Official Microsoft updates, 25 September–6 October 2026 · Sources checked 7 October 2026";

// Verified against Microsoft's original sources on 7 October 2026. These are
// curated demo inputs, not a live feed or evidence of a customer's entitlement.
const sources = [
  { title: "Microsoft 365 Copilot release notes — 6 October 2026", url: "https://learn.microsoft.com/en-us/microsoft-365/copilot/release-notes#october-06-2026" },
  { title: "What's new in Microsoft Copilot — September 2026", url: "https://techcommunity.microsoft.com/blog/microsoft-copilot-blog/what%E2%80%99s-new-in-microsoft-copilot--september-2026/4559107" },
  { title: "Introducing Copilot Home, Code and Autopilot — 25 September 2026", url: "https://blogs.microsoft.com/blog/2026/09/25/introducing-the-new-copilot-with-home-code-and-autopilot/" },
];

// Official September 2026 product illustrations from the roundup. These show
// Microsoft's demo interfaces, never the fictional customer's workspace.
const screenshots = [
  { id: "word-citations-sept2026", url: "https://techcommunity.microsoft.com/t5/s/gxcuf89792/images/bS00NTU5MTA3LU5uR2ZxVQ?image-dimensions=999x508&revision=7",
    alt: "Microsoft's September 2026 product illustration of citations in Copilot responses in Word. Official demo, not this customer's document.",
    sourceUrl: sources[1].url, animate: false },
  { id: "sharepoint-copilot-sept2026", url: "https://techcommunity.microsoft.com/t5/s/gxcuf89792/images/bS00NTU5MTA3LTNOQjZNbg?image-dimensions=999x560&revision=7",
    alt: "Microsoft's September 2026 product illustration of a SharePoint site with Copilot. Official demo, not this customer's site.",
    sourceUrl: sources[1].url, animate: false },
  { id: "copilot-authoritative-sources-sept2026", url: "https://techcommunity.microsoft.com/t5/s/gxcuf89792/images/bS00NTU5MTA3LXlNZjIzNQ?image-dimensions=999x562&revision=7",
    alt: "Microsoft's September 2026 illustration of authoritative SharePoint sources in the Microsoft 365 admin center. Official demo, not a customer configuration.",
    sourceUrl: sources[1].url, animate: false },
] satisfies ScreenshotAsset[];

const releaseDigest = `RECENT MICROSOFT RELEASES — CHECKED 7 OCTOBER 2026

6 October 2026 release notes (22 September–6 October), listed as generally available with gradual, platform-specific rollout, not proof of access in this customer's tenant: Copilot Search adds contextual chat on Windows and web. PowerPoint gains user-defined skills on Windows and document-name references to SharePoint/OneDrive files on Mac.
Source: ${sources[0].url}

Also in the 6 October 2026 release notes, generally available with gradual rollout: SharePoint Advanced Management reports item-level permissions granted to Everyone and Everyone except external users. Viva Insights adds Cowork adoption/impact metrics and credit-usage queries on web.
Source: ${sources[0].url}

30 September 2026 roundup, updated 1 October, generally available items that rolled out in September: Word responses can cite work and web sources. Copilot in SharePoint supports content organization, grounded questions and metadata autofill. Admins can designate up to 100 authoritative SharePoint sites for Copilot Search. Targeted Pulse surveys in the Copilot Dashboard use adoption-based audiences and aggregate reporting.
Source: ${sources[1].url}

The same 30 September 2026 roundup describes default Copilot Search in SharePoint/OneDrive as Frontier, not general availability. PowerPoint Brand Kit skills and background tasks are October rollout plans, not confirmed tenant access.
Source: ${sources[1].url}

25 September 2026 announcement: Home combines Chat and Cowork; Code supports building purpose-built solutions. Home/Code were entering Frontier rollout. Autopilot was expanding into private preview, and Today was planned for private preview in October. Keep these separate from generally available updates; the announcement alone does not confirm subsequent rollout completion.
Source: ${sources[2].url}`;

const editorialDirection = `COMMUNICATION BRIEF
This is Microsoft communicating relevant product updates directly to its customer, through an embedded briefings component. Address the customer as "you". Do not describe the component itself or tell a third-person story about the persona. Customer context below is explicitly fictional demo data, supplied for personalization; release facts and source links are real. Do not claim to have fetched usage, inspected files or connected to a tenant.

Lead with what changed at Microsoft and why this particular person should care. Choose two or three concrete updates using their goals, current product adoption and stated interests. Give each a named capability, the change, a specific everyday use and one useful next step. Recognize what they already use; distinguish getting more from an adopted product from trying something new. Put materially relevant availability or platform qualifications next to the feature. Explain one lower-priority update briefly only if that helps the customer focus.

Make the text a thoughtful customer article with a clear headline, useful sections and concrete examples. Let video show the relevant product changes and podcast hosts discuss their practical relevance. Keep all formats consistent about facts, status and customer context. Avoid a generic AI trends report, management experiment plan, sales hype or a list of every feature. Never promise savings, adoption gains, enabled integrations or access that the evidence does not establish. Prefer a modest action in the customer's existing workflow over a multi-week pilot. End with the most useful thing to try or check next.`;

export const examples = [
  {
    id: "customer-success",
    title: "Better customer conversations",
    description: "Maya uses Teams, Word and SharePoint. Show her the Microsoft updates that could make account preparation clearer and easier.",
    sources,
    screenshots,
    prompt: `${editorialDirection}

CUSTOMER: MAYA CHEN — CUSTOMER SUCCESS
Maya is VP of Customer Success at Northstar Metrics, a fictional Microsoft customer with 24 customer success managers. She has missed the last few weeks of Microsoft product news. This update is prepared as of 7 October 2026.

GOALS
Prepare for renewals with less time spent collecting and reconciling account material; enter customer conversations with a dependable summary; leave each meeting with clear commitments. Her fictional team currently spends about 90 minutes assembling a renewal pack. Reducing that burden is a goal, not a measured effect or guarantee of any Microsoft capability.

SUPPLIED PRODUCT ADOPTION
In this fictional profile, Maya uses Teams meetings and Outlook daily, keeps approved success plans in SharePoint, and edits account summaries in Word on Windows. She uses Copilot Chat a few times a week for draft summaries, but has not used citations in Word or Copilot in SharePoint. Her team prepares PowerPoint customer reviews manually. These are supplied demo adoption signals, not telemetry gathered by this app. The profile does not establish license coverage, rollout access or permission to every customer record.

INTERESTS AND FRICTION
She cares about finding the approved version, tracing a claim back to its source and communicating clearly to customers. She is less interested in building agents or apps. Account material is fragmented across documents and conversations; she often checks a summary against the source before sharing it. No real account records are provided. Any illustrative workflow must use a generic approved account plan, never pretend to summarize one of her actual customers.

CONTENT EMPHASIS
Consider Word's source citations and the new search-to-chat experience first, connecting each to her existing preparation habits. Copilot in SharePoint may also matter because that is where her approved plans already live. Explain the new capability before suggesting how to use it. A potential benefit is easier review, not proof that the summary is correct or that her preparation time will fall. If discussing Windows PowerPoint skills, explain the repeatable review task they could support without claiming she has configured them. Deprioritize Code and Autopilot for now, based on her interests and their announcement status. Keep human review of customer commitments explicit but brief.

${releaseDigest}`,
  },
  {
    id: "product-leadership",
    title: "Clearer product decisions",
    description: "Daniel already drafts with Copilot. Connect recent Microsoft releases to better launch briefs and less fragmented decision-making.",
    sources,
    screenshots,
    prompt: `${editorialDirection}

CUSTOMER: DANIEL OKAFOR — PRODUCT LEADERSHIP
Daniel is Head of Product at HarborWorks, a fictional Microsoft customer coordinating three product squads and a shared design team. He wants the Microsoft changes he missed over the last few weeks, selected for his role. Prepare the update as of 7 October 2026.

GOALS
Turn scattered research and decisions into a clear launch brief; keep the rationale behind scope choices easy to find; spend less time reformatting review decks. He wants faster preparation without trading away the quality of customer evidence. These are stated ambitions, not verified results, measured savings or Microsoft commitments.

SUPPLIED PRODUCT ADOPTION
Daniel uses Teams and SharePoint daily and Word and PowerPoint on Mac for planning and leadership reviews. He uses Copilot Chat most workdays to refine drafts. He has not tried the new search-to-chat flow or referencing SharePoint files by name when creating a PowerPoint presentation. His company has a small, separately approved Cowork evaluation group; Daniel is not in it. No actual tenant access or licensing inventory is included. Do not infer that new Frontier features are enabled from his current Copilot use.

INTERESTS AND FRICTION
He follows product design, clear storytelling and trustworthy research synthesis. He does not want a developer-tool roundup. His pain is returning from a meeting to multiple versions of a proposal and repeatedly rebuilding the same launch presentation from approved material. Customer interviews, product metrics and roadmap details are not supplied; do not invent findings from them.

CONTENT EMPHASIS
The Mac-specific PowerPoint update can connect directly to his current presentation workflow: explain that he can reference a SharePoint or OneDrive document by name when creating a presentation, subject to availability and access. Search-to-chat could help him continue from a found document into a question while retaining its search context. Word citations offer a reason to revisit source checking in his briefs. Distinguish these concrete updates from Home, Code and Autopilot announcements. Do not recommend Windows-only custom PowerPoint skills as something he can use on his Mac. Give a practical next step using an approved sample brief and explain what still deserves his review; do not turn the update into a governance project or a trial scorecard.

${releaseDigest}`,
  },
  {
    id: "it-adoption",
    title: "More value from Copilot",
    description: "Priya leads Microsoft adoption. Highlight the new controls and insights relevant to her team's rollout and support goals.",
    sources,
    screenshots,
    prompt: `${editorialDirection}

CUSTOMER: PRIYA NAIR — WORKPLACE ADOPTION
Priya leads workplace technology adoption at Cedar Bridge Group, a fictional Microsoft customer with 1,200 employees in the US and UK. She wants a relevant catch-up on Microsoft's recent releases as of 7 October 2026.

GOALS
Help more people use approved Copilot workflows repeatedly; keep support demand manageable; understand what employees find useful; make trusted internal knowledge easier to discover. A fictional 100-person adoption cohort has 35 weekly active users. That is supplied sample context, not a measurement collected here. An increase is her goal, never a forecast from the release news.

SUPPLIED PRODUCT ADOPTION
The company uses Teams, SharePoint and OneDrive broadly. Priya checks its Copilot Dashboard and works with an administrator on access and licensing. Her champions teach basic Copilot Chat tasks. A 20-person group is evaluating Cowork, but she has not used the newly expanded Cowork analytics or targeted Pulse surveys. The supplied context does not establish SharePoint Advanced Management entitlement, exact analytics roles, regional support or access to every new feature. No employee-level telemetry or tenant configuration is provided.

INTERESTS AND FRICTION
She is interested in adoption, understandable controls, discoverability of approved knowledge and responsible AI spending. She is less interested in decorative content generation. She currently collects feedback through a generic survey and hears that employees cannot tell which internal document is authoritative. Her administrator needs a clearer view of broadly shared content before expanding new workflows.

CONTENT EMPHASIS
Lead with one concrete recent update that helps her connect adoption activity to useful feedback: targeted Pulse surveys or the October 6 Cowork analytics expansion. Explain their distinct purpose rather than suggesting they measure the same thing. Authoritative SharePoint sources can connect to the problem of finding approved knowledge; distinguish this designation from granting access or certifying accuracy. The new item-level special-group permissions report is relevant to her administrator, but requires checking the stated SharePoint Advanced Management prerequisite. Prioritize what builds on existing adoption before introducing another product. Keep survey discussion at aggregate level; do not infer individual performance. Mention Frontier/private-preview changes only as items to watch. Finish with a small, specific check she can make with her administrator, not an assumed license purchase or organization-wide rollout.

${releaseDigest}`,
  },
];
