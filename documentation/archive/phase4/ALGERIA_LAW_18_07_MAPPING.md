# Algeria Law 18-07 engineering control mapping

> **Status:** Phase 4 engineering mapping  
> **Jurisdictional source:** Algeria  
> **Legal boundary:** This is not legal advice, a filing, an ANPDP authorization, a qualified legal opinion or a compliance certification. A qualified Algerian privacy professional must review any external compliance claim and the facts of each deployment.

## Current legal source authority

The official ANPDP information notice states that Law No. 18-07 of 10 June 2018 on protection of natural persons in personal-data processing is **amended and supplemented by Law No. 25-11 of 24 July 2025**.

Primary official references:

- ANPDP French notice: <https://plaintes.anpdp.dz/notice.php>
- ANPDP Arabic notice: <https://plaintes.anpdp.dz/notice_ar.php>
- ANPDP controller portal: <https://portail.anpdp.dz/>
- ANPDP complaint/recourse portal: <https://plaintes.anpdp.dz/>
- Official Journal / Secrétariat Général du Gouvernement: <https://www.joradp.dz/HFR/Accueil.htm>
- Official Journal 2025 index: <https://www.joradp.dz/JRN/ZF2025.htm>

The official ANPDP notice describes personal data and controller concepts under Article 3, purpose-limited use, retention no longer than necessary, appropriate technical and organizational safeguards, and rights to information, access, rectification and opposition. The Arabic notice references Articles 32, 34, 35 and 36 for those rights.

## Engineering mapping

| Legal/control theme | SahelFlow Phase 4 control | Evidence boundary / residual action |
|---|---|---|
| Identify personal data and processing responsibility | Complete machine-readable model/field/file-store inventory; personal, confidential, secret, security and ephemeral classes | Deployment-specific controller/processor roles and notices require qualified review |
| Defined and limited purpose | Every model group and file store records purpose; secrets and backup/recovery material cannot be reused as diagnostics or analytics payloads | Product/legal owner must approve new purposes before classification changes |
| Data minimization | Credentials use dedicated secret authority; diagnostics allow only bounded IDs/counts/sizes/hashes/reason codes; runtime and sidecars receive explicit minimum environment | Independent review must check free-form JSON fields and provider payloads for excess collection |
| Retention limited to necessity | Retention classes cover seller records, installation security, operational security, recovery artifacts, public reference and ephemeral data; governed erase/delete commands exist | Exact accounting, tax, employment or dispute holds must be configured with qualified Algerian advice |
| Appropriate technical and organizational security | Purpose-separated HKDF keys, random per-shop keys, contextual AES-GCM, blind-index separation, DPAPI local root, encrypted authenticated backups, independent kit, replay protection and fail-closed corruption | Penetration testing and operational access-control procedures remain separate evidence |
| Information right | Privacy inventory and export describe data categories, purposes, locations, backup behavior and exclusions | Seller-facing privacy notice and contact channel must be approved for each deployment |
| Access right | Recent-reauthenticated governed JSON export returns customer/order/conversation/audit/AI subject and business data through the protected client | Identity verification and request-scoping process require operator policy |
| Rectification right | Existing authenticated customer/order/conversation management paths permit correction while preserving business/audit facts | Legal/accounting records may require correction-by-supplement rather than destructive overwrite |
| Opposition right | Governed erase and shop deletion provide technical mechanisms to stop local processing, subject to legitimate record holds | Operator must determine legitimate grounds and communicate any refusal or restricted deletion |
| Confidentiality of credentials and recovery secrets | Credential values, key material and recovery codes are excluded from privacy export and diagnostics; one-time code is never persisted in receipts | Seller remains responsible for independent kit/code custody |
| Integrity and availability | All-shop online snapshots, authenticated manifests, replacement restore, rescue generation, compensation and migration convergence | Disaster-recovery frequency and off-device custody remain operational decisions |
| Accountability | Trusted actor, exact target, recent reauthentication, replay-protected native command, immutable/non-PII receipts, exact-head SBOM/VEX and review evidence | External records of processing, ANPDP declarations/authorizations and DPO obligations require legal assessment |
| Complaint/recourse | Documentation points to the official ANPDP complaint portal | SahelFlow does not submit complaints or represent the controller |

## Data-subject and seller workflow

1. Authenticate the requester through the operator's approved identity process.
2. Use the protected export endpoint to inspect relevant data without exposing credentials, keys or recovery secrets.
3. Rectify data through the normal trusted business workflow where possible.
4. Evaluate legal/business holds before erase. The application does not infer Algerian accounting or dispute-retention periods.
5. Execute privacy erase, reset or governed shop deletion with recent owner reauthentication and exact target confirmation.
6. Explain that encrypted backups and recovery kits are separate artifacts; delete them explicitly when their purpose ends.
7. Retain the non-PII operation receipt and any legally required decision record outside free-form customer data.

## Prohibited claims

Do not state that SahelFlow, a source commit, an MSI or a seller is “Law 18-07 compliant,” “ANPDP approved” or legally certified based only on this mapping. Such a statement requires current qualified legal review, deployment facts, required filings/authorizations, organizational procedures and exact installed evidence.

## Review trigger

Re-review this mapping whenever Algeria amends the law or implementing rules, ANPDP publishes new binding guidance, SahelFlow changes processing purposes/locations, cloud transport is introduced, a new provider receives personal data, or retention/export/deletion behavior changes.
