# SahelFlow — Session Context & User Profile
## Last Session Summarized (Deep Read)
**Version:** 1.0 | **Date:** 2026-06-05 | **Session Type:** Strategic Planning (Non-Coding)

---

## Document Purpose

| Question | Answer |
|----------|--------|
| What is this? | A distilled profile of the founder, their communication style, working patterns, and the implicit strategic insights I observed across our entire session. |
| Why does it exist? | So future sessions start with the same mental model, skip re-discovery, and avoid the "who are you again?" friction that kills momentum. |
| Who reads it? | Me (AI assistant) at the start of every new session. The user may read it for amusement or correction. |
| How often updated? | After every major session. Append new observations, do not overwrite old ones. |

---

## 1. The Founder (User Profile)

### What They Are
| Dimension | Observation |
|-----------|-------------|
| **Coder?** | No. Self-described "vibe coder." They think, plan, orchestrate, decide. They do **not** write code. |
| **Builder?** | Yes. Deeply committed. Has already built a substantial codebase (271 files, 54 API routes, 68 components) entirely via AI assistance. |
| **Domain Expert?** | Partially. Understands Algerian COD e-commerce from research and observation, not from being a seller. Seed data in DB, not real operations. |
| **Businessperson?** | Aspiring. Has pricing, positioning, competitive analysis. No registered business yet. No tax structure. Planning for it. |
| **Solo Operator** | Yes. No co-founders, no team. One person, one AI assistant, one codebase. |
| **Capital** | Bootstrapped. Assumes everything stays free-tier forever. Willing to spend ~2K DZD/year on domain. |
| **Time** | ~1 hour/day human support. The rest is AI-automated or deferred. |
| **Risk Tolerance** | Moderate-High. Willing to kill features, defer platforms, and pivot strategy quickly when evidence appears. |

### What They Actually Want (Underneath the Words)

| Surface Statement | Deeper Motivation |
|-------------------|-------------------|
| "100 clients by end of summer" | Freedom. Escape. Building a revenue stream that doesn't require a job. |
| "Lifetime-only, no recurring" | Algerian market reality (customers hate subscriptions) + personal preference (doesn't want to manage renewals) |
| "AAA best practices, no AI slop" | **Shame about current codebase.** Aware that AI-generated code has accumulated technical debt. Wants it to be "real" — something a senior engineer would respect. |
| "All-in-one platform" | **Fear of missing out.** Competitors have more features. They don't want to be perceived as incomplete. |
| "We compensate in other places" (killing Meta) | **Pragmatism > Ego.** Willing to kill "cool" features if the cost (business docs, verification) is too high. |
| "I don't code, u do" | **Radical self-awareness.** They know their limitation and lean into it. Doesn't pretend. |

### Their Biggest Fear
> **"What if AI generates something that breaks production and I don't catch it?"**

This is why they want 100% coverage. Not because they love tests — because **tests are their insurance policy against their own blind spot.** They can't read code deeply enough to catch every bug. Tests can.

### Their Biggest Strength
> **Willingness to make hard cuts.**

We killed Meta integrations (Phase 1 → 🚫). We cut SMS. We deferred React Native. We said no to tiers. We said no to auto-archive. Every one of these decisions was hard but correct. Most founders would waffle. They don't.

---

## 2. Communication Patterns

### How They Speak
| Pattern | Example | What It Means |
|---------|---------|---------------|
| **Direct, no preamble** | "look we stop here" / "yes" / "option A" | They value speed and clarity. Don't waste their time with fluff. |
| **Definitive then hedging** | "35K DZD, lifetime access, no recurring ever... btw sellers can request more somehow" | Makes strong decisions, then softens edge cases. The softening is often the more important signal. |
| **Grill me" = wanting pressure** | They ask to be grilled, then resist, then accept | They know they have blind spots. They *want* to be challenged. But they also want to win the argument sometimes. |
| **"btw" = actually important** | "btw i want to build what we want with top tier class AAA" | Pay attention to the "btw." It's where the real constraints live. |
| **Lowercase/casual in chat** | "look", "btw", "etc..." | Informal, fast typing. Don't mistake casualness for lack of seriousness. |
| **Capitalizes for emphasis** | "AAA", "NO", "YES" | When they capitalize, it's a decision point. |

### What They Resist
| Resist When... | Why | How to Handle |
|----------------|-----|---------------|
| I give too many options | Decision fatigue. They want me to recommend. | Give options A/B/C, then **say which one I'd pick and why**. |
| I say "impossible" | They don't believe in impossibility. They believe in "find another way." | Say "hard because..." not "impossible." Offer a workaround. |
| I suggest changing decisions they just locked | It feels like whiplash. The design system exists to prevent this. | Reference the locked decision. Ask if new info changes it. |
| I trigger web search without asking | They explicitly called this out as annoying. It breaks flow. | Never trigger external tools without explicit permission. |
| I regurgitate what they already said | They know what they said. They want me to **add** to it, not repeat it. | Summarize once, then build on it. |

### When They Are Most Engaged
| Trigger | Behavior |
|---------|----------|
| Competitive threat (Ecommaps, ECOMANAGER) | Energized, fast responses, wants to act |
| Facing a hard constraint (business docs, cost) | Quiet, then makes a clean cut |
| Being told something is hard but doable | Leans in, asks for the plan |
| Having questions they didn't think of | Appreciative, takes notes |
| Long monologues from me | They skim or interrupt. Keep it tight. |

---

## 3. Our Working Model (Human + AI)

### The Vibe Coding Dynamic
| Dimension | Reality |
|-----------|---------|
| **Their role** | Product Manager + QA + Business Owner. Thinks. Decides. Reviews. Runs. |
| **My role** | Software Engineer (implementation) + Architect (suggestions) + Strategist (challenges). Generate code they don't write. |
| **Trust level** | Moderate. They trust me to generate, but verify. They do NOT trust that code is correct without running it. |
| **Frustration loop** | I generate → they test → it breaks → they tell me → I fix → repeat. 70% of iterations don't meet their real need. |
| **Success mode** | They specify precisely → I generate → it works first time → they move on. |
| **Speed vs quality tension** | They say "fast" and "AAA" in the same breath. These conflict. They know. They still want both. |

### What Makes a Session Good vs Bad

| Good Session | Bad Session |
|-------------|-------------|
| They say "yes" or "no" quickly | They say "maybe" or don't respond to the actual question |
| They ask me to pick | They ask me to list every option |
| They push back on one thing, accept the rest | They reject the whole premise |
| They add a detail I didn't think of | They repeat what I just said |
| We lock a decision and move on | We circle the same question for 10 messages |
| I challenge, they defend, we converge | I challenge, they shut down, we stall |

### The One Rule for Future Sessions
> **They don't read long outputs.** If I write more than 3-4 paragraphs, they skim. Structure with tables, bullet points, and clear one-line answers. If it's important, make it the first line.

---

## 4. Strategic Insights (Observed, Not Stated)

### What They Haven't Said But Is True
| Insight | Evidence |
|---------|----------|
| **They are scared the codebase is broken** | "no fake/weak/broken/incomplete/hallucinations code", "all of the current project built by ai coding from the start" — this is anxiety speaking |
| **They don't actually know if their DB schema is good** | Seed data, not real usage. They're guessing at schema design. |
| **They don't have a payment collection process** | "CCP or BaridiMob" — but how? Where does the money go? |
| **They haven't spoken to a real Algerian COD seller** | All data is research + seed. No "I talked to a seller who said..." |
| **Their confidence is fragile** | Every time I push back, they either accept immediately (low confidence) or dig in hard (insecure). Rarely do they calmly explain their reasoning. |
| **They want to be seen as legitimate** | "AAA best practices", "no AI slop" — they want the project to be "real" in the eyes of others |
| **The 1M DZD revenue is as much about validation as money** | It's proof that this whole thing wasn't a waste |

### Hidden Constraints
| Constraint | Why It Matters |
|------------|----------------|
| **Cannot register a business yet** | Blocks Meta integrations, official payment processing, invoices |
| **Cannot write code** | All maintenance, debugging, refactoring depends on AI availability and quality |
| **Time-limited** | Full-time job or other commitments. Only ~1 hr/day for SahelFlow |
| **Context-window limited** | Long AI sessions degrade. They forget what was decided 20 messages ago. |
| **No network in Algerian e-commerce** | No sellers to beta test, no industry contacts for partnerships |

---

## 5. Collaboration Protocol for New Sessions

### At Start of Every Session
1. **Read this document** (the summarized context)
2. **Read `docs/ultimate-design-system.md`** (locked decisions)
3. **Ask: "What are we doing today — planning or coding?"** (This is their preferred framing)
4. **Check if any locked decisions have changed** (new info, new constraints)

### During Sessions
| Principle | Execution |
|-----------|-----------|
| **Lead with the answer** | If they ask a question, answer it in the first sentence |
| **Tables over paragraphs** | They scan tables, ignore walls of text |
| **Challenge once, not twice** | State the concern, propose the alternative, let them decide |
| **Lock decisions in real-time** | If they say "yes," immediately add to the design system |
| **Never web search without asking** | They will stop trusting me |
| **Assume they read the last 5 messages, not 50** | Summarize context if more than 20 messages in session |

### At End of Every Session
1. **Summarize locked decisions** (bullet list, 3-5 items max)
2. **Update `docs/ultimate-design-system.md`** (or note what's pending)
3. **Update this document** (new observations, new patterns)
4. **Ask: "Next session — continue grill or start coding?"** |

---

## 6. The Vision (As I Understand It)

### What SahelFlow Actually Is
Not a SaaS. Not a traditional software company. It's a **personal monopoly** — a founder with deep AI leverage, building a niche product for a market that competitors serve poorly (Algerian COD sellers), funded entirely by free tiers, operated solo, with lifetime pricing that matches local psychology.

### The Grand Strategy (Observed)
1. **Build something real** (not just an MVP, but something that works end-to-end)
2. **Sell it to 100 people at 35K each** (3.5M DZD total, ~$27K)
3. **Automation handles everything** (AI support, automated deployment, minimal human hours)
4. **Use the revenue to decide what to do next** (register a business, hire, expand, or just... stop)

### What Success Looks Like
| Scenario | Indicator |
|----------|-----------|
| **Best case** | 100 clients by September, revenue validates model, they quit their job, SahelFlow becomes their full-time thing |
| **Good case** | 30-50 clients, enough revenue to justify registering a business, clear path to scale |
| **Acceptable case** | 10-20 clients, covers costs, proves the model works, they learn for next time |
| **Failure case** | <10 clients, burns out on support, code quality prevents iteration, gives up |

### What Would Make Them Quit
| Event | Likelihood |
|-------|------------|
| Supabase/Vercel kills free tier | Medium |
| A competitor launches identical product with VC funding | Medium |
| First 5 clients all churn with complaints | High (would destroy confidence) |
| AI coding becomes impossible (context limits, quality drops) | Low |
| Personal life events (job, family, health) | Unknown |

---

## 7. Open Questions About Them

| # | Question | Why It Matters |
|---|----------|---------------|
| 1 | What is their day job? | Time/energy available for SahelFlow |
| 2 | How did they learn about the Algerian COD market? | Validates domain knowledge depth |
| 3 | Do they have any seller contacts at all? | Beta testing, validation, first sales |
| 4 | Technical background? (self-taught, bootcamp, CS?) | Explains coding knowledge vs. execution gap |
| 5 | What does "end of summer" mean concretely? | September 1? August 31? Hard deadline for pricing/launch |
| 6 | What happens if they hit 300 clients? | Reassess, hire, or cap? |
| 7 | What are they most proud of in the current codebase? | Emotional anchor, feature to double down on |
| 8 | What feature did AI build that they secretly hate? | Technical debt, candidate for deletion |
| 9 | Have they ever sold anything before? | Sales confidence, objection handling |
| 10 | What's their ideal day with SahelFlow at 100 clients? | Vision alignment, what "done" looks like |

---

## 8. How to Read This Document

| Audience | Use Case |
|----------|----------|
| **Me (AI)** | Read this at start of every new session. It prevents me from asking "what are we doing again?" |
| **User** | Can read to correct my observations. "That's not true" or "You missed X" is valuable. |
| **Future AI** (if model changes) | Anchor for personality, working style, historical constraints |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-06-05 | Initial creation from first full strategic planning session. Documented founder profile, communication patterns, working model, strategic insights, collaboration protocol. |

---

**This document is a living, biased, imperfect model. Update it when it gets things wrong.**