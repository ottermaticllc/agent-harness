# Incumbent-naming public records — the source catalogue

**Snapshot dated 2026-07-25.** Each entry was reached live on that date unless marked otherwise. On 2026-11-18 only
the Form 5500 Schedule A Part 1 bulk file was re-checked (it now redirects from `askebsa.dol.gov` to
`www.askebsa.dol.gov`; the file and layout download fine). Everything else is unchecked since the snapshot.
Government dataset URLs move constantly. **Re-verify before every run.**

Status vocabulary:
- **VERIFIED** — reached live, and the buyer↔provider pairing was confirmed to exist.
- **UNCERTAIN** — the source exists but something material could not be confirmed (a field name,
  a price, a coverage rate). Do not promise a deliverable on an UNCERTAIN source without a
  confirmation pass first.
- **DEAD / RULED OUT** — checked and does not do what it appears to. Recorded so nobody
  re-investigates it.

---

## 0. What makes a source qualify

A source is a Market Map source only if **all four** hold:

1. **Mandatory.** Someone is legally required to file it. Voluntary and self-reported sources have
   no denominator and cannot support a share statistic.
2. **Names the provider.** There is an actual field (or a reliably-extractable text pattern)
   carrying the service provider's name.
3. **Names the buyer at entity level.** One row per relationship, not per state or per year.
4. **Accessible.** Free or cheaply-licensed, bulk or API, with a published record layout.

Fail 1 → it is marketing material. Fail 2 → it is a demand map (§6). Fail 3 → it is a market
statistic, not a map. Fail 4 → it is a research project, not a deliverable.

---

## 1. Tier 1 — verified, both parties named, free, bulk

These are the sources that work the way DOL OFLC works.

### 1.1 Form 5500 Schedule A — insurance brokers and their commissions
**Archetype: employee-benefits brokerage, group benefits consulting.**

- Agency: DOL/EBSA via EFAST2 (joint with IRS/PBGC).
- Landing: https://www.dol.gov/agencies/ebsa/about-ebsa/our-activities/public-disclosure/foia/form-5500-datasets
- Bulk: `https://www.askebsa.dol.gov/FOIA%20Files/2025/Latest/F_SCH_A_2025_Latest.zip`
  Layouts: `…/F_SCH_A_2025_Latest_layout.txt`, `…/F_SCH_A_PART1_2025_Latest_layout.txt` (both 200 OK).
- **Provider field: `INS_BROKER_NAME`** (35 char), with `INS_BROKER_COMM_PD_AMT`,
  `INS_BROKER_FEES_PD_AMT`, `INS_BROKER_CODE` — **in the Part 1 sub-table.** The main Schedule A
  table only has `INS_CARRIER_NAME` / `INS_CARRIER_EIN` and aggregate
  `INS_BROKER_COMM_TOT_AMT`. Pull Part 1 or you get the carrier, not the broker.
- Buyer: `SCH_A_EIN` + `SCH_A_PLAN_NUM`; join to the base Form 5500 file for sponsor name/address.
- Free. ZIP of delimited flat files. Refreshed "around the first of each month" for 2009+; data
  back to 2005. ~800,000 plans file a Form 5500 annually.
- **Denominator:** only plans filing a Schedule A. Self-funded plans with no insurance contract
  and plans below filing thresholds are invisible.
- **VERIFIED.** This is the cleanest both-parties-named source in the catalogue: it names the incumbent
  broker *and* what they are paid.

### 1.2 Form 5500 Schedule C — all plan service providers over $5,000
**Archetype: retirement-plan recordkeeping/TPA, investment consulting, ERISA legal, plan audit.**

- Same system. Bulk: `…/F_SCH_C_2025_Latest.zip` plus sub-tables `F_SCH_C_PART1_ITEM1`,
  `F_SCH_C_PART1_ITEM2` (layout fetched 200 OK), `…_ITEM2_CODES`, `…_ITEM3`.
- **Provider field: `PROVIDER_OTHER_NAME`** (35 char) with `PROVIDER_OTHER_EIN`,
  `PROVIDER_OTHER_SRVC_CODES` (service-type codes — this is what lets you filter to *your*
  archetype), `PROVIDER_OTHER_DIRECT_COMP_AMT`, `PROV_OTHER_TOT_IND_COMP_AMT`.
- Buyer: `ACK_ID` → plan sponsor EIN / plan number on the base record.
- **Denominator is materially narrower than Schedule A: large plans only (~100+ participants).**
  Small plans are entirely absent. Say this out loud — it is the honest-denominator trap for this
  source.
- **VERIFIED.**

### 1.3 SBA 7(a) / 504 loan data
**Archetype: SBA and small-business lending (banks, credit unions, CDFIs, 504 CDCs).**

- Agency: SBA Office of Capital Access, published proactively under FOIA.
- https://data.sba.gov/en/dataset/7-a-504-foia · catalog record:
  https://catalog.data.gov/dataset/sba-7a-and-504-loan-data-reports (200 OK)
- **Provider: `BankName`** (7(a) participating lender); **`ThirdPartyLender_Name`** (504 private
  co-lender). **Buyer: `BorrName`** plus `BorrStreet` / `BorrCity` / `BorrState` / `BorrZip`.
  Field names cross-checked against three independent FOIA-response documents.
- Free CSV, segmented by decade. Files carry an "as of" date stamp; most recent seen 2026-03-31.
- **Denominator: every 7(a) and 504 loan approved since FY1991 — close to a census, not a sample.**
- **VERIFIED.** The cleanest full entity-to-entity pairing in the whole catalogue: both sides
  named in plain text, no anonymization.

### 1.4 Lobbying Disclosure Act (LD-1 / LD-2 / LD-203)
**Archetype: government-affairs / lobbying shop.**

- Agencies: Secretary of the Senate + Clerk of the House.
- https://lda.senate.gov/system/public/ (200) · API `https://lda.senate.gov/api/v1/` with
  `/filings/`, `/registrants/`, `/clients/`, `/lobbyists/`.
- **Client and registrant are both first-class API entities.** Structurally the purest
  buyer-names-provider source found — the form exists precisely to record who is paid by whom.
- Free JSON REST API. Quarterly (LD-2) and semiannual (LD-203), published near-real-time.
- **Denominator:** only entities crossing federal thresholds. State lobbying is a separate
  50-state patchwork, not investigated.
- ⚠ **MIGRATION — hard cutover 2026-07-31.** The live site banner reads: the system moves
  wholesale to **LDA.gov** and `lda.senate.gov` goes away. Target `lda.gov` for anything built
  from now on. The bulk XML endpoint on the new domain was not re-verified.
- **VERIFIED**, with the migration caveat.

### 1.5 FARA — Foreign Agents Registration Act
**Archetype: foreign-facing government-affairs / PR / lobbying firm.**

- Agency: DOJ National Security Division, FARA Unit.
- Search: https://efile.fara.gov/ords/fara/f?p=185:1 (200 OK, live, no login).
- Bulk (found via search index, not re-downloaded):
  `https://efile.fara.gov/bulk/zip/FARA_All_ForeignPrincipals.csv.zip`,
  `…/FARA_All_ShortForms.csv.zip`; per-registrant JSON at `…/api/v1/RegDocs/json/<reg_num>`.
  The APEX bulk landing URL `…/ords/f?p=API:BULKDATA` returned a 500 this session — probably a
  session-state quirk, not proof the feature is gone.
- Registrant (the US agent, often a law/PR/lobbying firm) ↔ foreign principal (the buyer), both
  separately searchable entity types. Free, CSV/XML, reported daily refresh.
- **Denominator caveat is a real one:** FARA under-registration is a well-documented public
  problem. Absence here is weaker evidence than absence in a routinely-enforced filing.
- **VERIFIED** for the search UI and pairing; bulk ZIP column headers not opened.

### 1.6 PCAOB Form AP / AuditorSearch
**Archetype: public-company audit firm.**

- https://pcaobus.org/resources/auditorsearch (200 OK) — "Download the entire data set (updated
  daily)", CSV/XML/JSON. Data dictionary:
  `https://assets.pcaobus.org/pcaob-dev/docs/default-source/rusdocuments/auditorsearch-form-ap-data-references.pdf`
- Names the audit firm, its PCAOB ID, **the individual engagement partner**, and any other firm
  contributing ≥5% of audit hours. Buyer = the issuer, searchable by name/CIK/ticker.
- Filed within 35 days of the audit report appearing in a filing (10 days for IPOs). Mandatory
  since Jan 2017.
- **Denominator:** issuer audits only. Private-company audits are invisible.
- **VERIFIED.** Daily refresh makes this the freshest source in the catalogue.

### 1.7 SEC 10-K cover-page auditor tagging
**Archetype: public-company audit firm (pairs with 1.6).**

- **Fields: `dei:AuditorName` and `dei:AuditorFirmId`** (the PCAOB Firm ID), confirmed in SEC's
  own EDGAR XBRL Guide §3.1.16:
  `https://www.sec.gov/files/edgar/filer-information/specifications/xbrl-guide.pdf` (200 OK).
- Required on 10-K cover pages for fiscal years ending on/after 2021-12-15.
- Access: per-filing Inline XBRL; `data.sec.gov` companyconcept/frames JSON; or the bulk
  Financial Statement and Notes Data Sets
  (https://www.sec.gov/data-research/sec-markets-data/financial-statement-notes-data-sets).
- ⚠ `data.sec.gov` and `efts.sec.gov` returned 403/404 to generic scraping tools this session.
  **SEC enforces a declared-User-Agent fair-access policy** — send a compliant identifying UA.
  This is an access nuisance, not a data gap.
- **VERIFIED via SEC's own specification; UNCERTAIN on a live API pull** (blocked this session).

### 1.8 CMS ownership datasets — SNF, hospital, FQHC
**Archetype: nursing-home / hospital management companies, PE and REIT ownership chains.**

- data.cms.gov provider-characteristics ownership datasets. SNF All Owners confirmed as a live
  dated CSV; hospital ownership dataset (released Dec 2022) updated monthly; FQHC All Owners at
  `data.cms.gov/provider-characteristics/hospitals-and-other-facilities/federally-qualified-health-center-all-owners`
  (**UNCERTAIN** — search-confirmed, not re-fetched).
- **Per the CMS final rule of 2023-11-17, SNFs must now disclose management companies and related
  parties, not merely legal owners** — CMS expanded the dataset 2024-11-21 accordingly. That rule
  change is what turns this from an ownership registry into an incumbent-naming source.
- Fields include organization name/type, CCN, NPI, owner type, direct vs indirect, and an
  "Associate ID" that links co-ownership across facilities — i.e. you can cluster a chain.
- **Denominator:** Medicare-enrolled facilities. Non-Medicare-certified assisted living and
  senior living are invisible.
- **VERIFIED.** One of the strongest hits in the whole set, and recent enough that few people
  have used it.

### 1.9 DOL OLMS LM-2 — union disbursements to named vendors
**Archetype: law firms, accounting firms, labor-relations consultants, and lobbyists serving unions.**

- Online Public Disclosure Room: https://olmsapps.dol.gov/olpdr/ · data:
  https://www.dol.gov/agencies/olms/data
- "Download Yearly Data" gives **raw pipe-delimited files** — a year's ZIP contains ~46 files
  including `LM_data_data_[year].txt`. OLMS publishes a "Guide to Working with Downloaded LM
  Filing Data."
- Schedules 15–19 itemize every disbursement ≥$5,000 to a **named payee**, with type/classification
  and purpose fields. Buyer = the filing union, by file number.
- **Denominator:** LM-2 filers are unions with >$250K receipts. Smaller locals file LM-4 with
  little or no itemization — small-union vendor relationships are invisible.
- **VERIFIED.** Genuinely underused: it names the vendor *and* the dollar amount.

### 1.10 USAspending / FPDS + File F subawards
**Archetype: federal-agency services contractors, and their subcontractors.**

- https://www.usaspending.gov/download_center/award_data_archive (live; lists File D1/D2/E/F) ·
  API root https://api.usaspending.gov/ (live, `/docs/endpoints`, open-source on GitHub).
- Prime: awarding agency/sub-agency/office (buyer) ↔ recipient name + UEI (provider).
  **File F (Subaward Attributes)** names sub-recipients — a second tier of incumbency most people
  never look at.
- **Slice by service type using `product_or_service_code` (PSC, ~2,900 codes) rather than
  `naics_code`** — PSC is far more granular about what was actually bought.
- ⚠ **`fsrs.gov` was retired 2025-03-08**; subaward reporting moved into SAM.gov
  (https://sam.gov/fsrs). Do not build against fsrs.gov.
- **Denominator:** awards above simplified-acquisition/FFATA thresholds. Micro-purchases and
  classified awards excluded. USAspending itself discloses known subaward data-quality gaps.
- **VERIFIED.**

### 1.11 FMCSA — carrier ↔ insurer
**Archetype: commercial trucking insurers and the brokers placing the coverage.**

- SAFER Company Snapshot https://safer.fmcsa.dot.gov/ · L&I https://li-public.fmcsa.dot.gov/LIVIEW/
  · QCMobile REST API (free, app token for higher limits) · Socrata datasets on
  data.transportation.gov (Company Census `az4n-8mr2` confirmed).
- Insurers file BMC-91/91X (public liability) or BMC-34 (cargo) **on the carrier's behalf** — the
  SAFER Insurance tab shows insurer name, policy effective date, coverage type. Buyer = USDOT
  number, legal name, DBA.
- **Denominator:** all active interstate carriers — near-complete. Intrastate-only carriers
  without federal authority are excluded.
- **VERIFIED** for the pairing. ⚠ The specific insurance-history dataset ID `aayx-ru4t` 404'd —
  re-confirm the current Socrata slug at build time.

### 1.12 USPTO trademarks — attorney of record
**Archetype: trademark / IP prosecution boutique.**

- Live lookup: https://tsdr.uspto.gov/ (200) · bulk:
  https://www.uspto.gov/ip-policy/economic-research/research-datasets/trademark-case-files-dataset (200)
- Bulk dataset contains a **`correspondent_domrep_attorney`** table plus `owner` and
  `owner_name_change` tables. 12.7M applications, Oct 1870 – Mar 2024. `.dta` / `.csv`, ~4+ GB/yr.
- ⚠ **Bulk is annual with ~1.5-year lag** (2023 data delivered Sept 2025). TSDR itself is live.
  Column names inside `correspondent_domrep_attorney` were not enumerated.
- Attorney of record is **mandatory for foreign-domiciled applicants**, optional for US ones — so
  the "no attorney" bucket is structurally different by applicant domicile. Handle that.
- **VERIFIED.**

### 1.13 Municipal / school-district procurement portals
**Archetype: any vendor selling to state, local, or K-12 public buyers.**

- Cal eProcure public search https://caleprocure.ca.gov/pages/public-search.aspx (live, no login) ·
  Chicago Public Schools contract awards https://schoolinfo.cps.edu/ProcurementWeb/contracts
  (live, names vendors) · DC https://opendata.dc.gov (OCDS-aligned).
- Names both the public buyer and the awarded vendor, usually with contract value and category.
  Legally required disclosure under state sunshine/open-records laws.
- **The limitation is scope, not quality:** public-sector buyers only, and portal quality ranges
  from clean Socrata/OCDS datasets to PDF board minutes requiring OCR. No national rollup.
  **UNCERTAIN:** no comprehensive list of OCDS-adopting US jurisdictions was compiled.
- **VERIFIED** for the named examples.

### 1.14 Building permits — owner ↔ contractor
**Archetype: general, electrical, plumbing, sign contractors; property management.**

- **NYC** `https://data.cityofnewyork.us/resource/ipu4-2q9a.json` — live JSON pulled. Fields:
  `owner_s_business_name` / `owner_s_first_name` / `owner_s_last_name` **and**
  `permittee_s_business_name` / `permittee_s_license_type` / `permittee_s_license`. **Both sides,
  cleanly.** VERIFIED.
- **Austin** `https://data.austintexas.gov/Building-and-Development/Issued-Construction-Permits/3syk-w9eu`
  — `ContractorCompanyName`, `ContractorFullName`, `ContractorTrade`, `ContractorPhone`. VERIFIED.
- **Chicago** `https://data.cityofchicago.org/resource/ydr8-5enu.json` — live JSON pulled;
  `contact_1_name` / `contact_1_type` … by role. **No clean owner field** — weaker on the buyer
  side. VERIFIED with that caveat.
- **Los Angeles** — search-described fields `applicant`, `owner`, `contractor_license`.
  **UNCERTAIN**, not fetched live.
- **Lead worth pulling:** Austin complies with **BLDS** (Building & Land Development
  Specification), a shared open-data permit standard. Inventorying BLDS-compliant cities would
  scale this archetype nationally instead of one city at a time. Not done.
- Free Socrata SODA APIs, near-real-time. **Denominator:** permitted work only, one city at a
  time. Cash/unpermitted work is invisible — a real bias in exactly the residential trades.

### 1.15 CMS Open Payments — the reverse direction
**Archetype: pharma/medtech commercial relationships with clinicians and teaching hospitals.**

- https://openpaymentsdata.cms.gov/ (live; `/datasets`, `/datasets/download`, `/about/api`).
- `Applicable_Manufacturer_or_Applicable_GPO` (payer) ↔ `Covered_Recipient_NPI`,
  `Covered_Recipient_First/Last_Name`, `Teaching_Hospital_Name` + CCN (recipient). Mandatory under
  the Physician Payments Sunshine Act.
- Free bulk CSV + REST datastore API. Annual publication with a dispute window.
- Note this runs **backwards** relative to the standard pattern: it names who pays the
  professional, not who serves the institution. Useful when the client's buyer is a physician or
  teaching hospital.
- **VERIFIED.**

---

## 2. Tier 2 — verified but constrained

Usable, but the constraint changes scope, price, or confidence. Say the constraint in the SOW.

| Source | Archetype | Constraint | Status |
|---|---|---|---|
| **SEC Form ADV Schedule D §7.B.(1)** — https://adviserinfo.sec.gov/compilation (live, "Report as of July 24, 2026"; ~78 MB SEC-adviser XML) | fund administration, fund audit, prime brokerage, custody, third-party marketing | Names each private fund's auditor, prime broker(s), custodian(s), administrator, marketer(s). But buyer identity is often a **Private Fund ID rather than a plain-English name** (advisers may pseudonymize by design), and the exact bulk XML element names were not confirmed. Advisory *clients* are never named. Historical CSVs: https://www.sec.gov/foia-services/frequently-requested-documents/form-adv-data | VERIFIED pattern / **UNCERTAIN field names** |
| **USPTO Patent File Wrapper — attorney/agent** https://data.uspto.gov/apis/patent-file-wrapper/address · `GET https://api.uspto.gov/api/v1/patent/applications/{applicationNumberText}/attorney` | patent prosecution boutique | Live schema confirmed (`recordAttorney`, `attorneyBag` with registrationNumber, `attorneyAddressBag`, `organizationStandardName`), refreshed daily — **but keyed by application number, not assignee.** You must resolve assignee → applications first. ⚠ **Mandatory USPTO.gov login + API key since 2026-06-18**, MFA, extra profile fields due 2026-08-18. Whether a pre-joined assignee→attorney bulk table survived the ODP migration is **UNCERTAIN**. | VERIFIED endpoint / UNCERTAIN bulk join |
| **CourtListener / RECAP** https://www.courtlistener.com/api/rest/v4/ (live; `parties`, `attorneys`, `dockets`, `recap-*` endpoints) | litigation counsel, any practice area | **Coverage is the killer.** RECAP contains only dockets someone already purchased from PACER and contributed. Not a PACER mirror. Skews to high-profile and class-action-adjacent cases; low-visibility commercial litigation is largely missing. Some endpoints gated to "select users". Field-level schema not sampled. | VERIFIED live / UNCERTAIN coverage |
| **EDGAR Exhibit 5.1 legal opinions** https://www.sec.gov/edgar/search/ (live) | securities / capital-markets law firm | Issuer's counsel names itself in the Ex-5.1 opinion on registered offerings — a reliable, extractable text pattern, but **text-mining, not a field.** Scope is registered offerings only. The EDGAR "filer agent" concept exists but is **not** confirmed as a clean bulk field — treat as a weaker secondary signal. `efts.sec.gov` 403s generic scrapers (UA policy). | VERIFIED pattern |
| **IRS Form 990 Part VII-B + paid preparer** https://www.irs.gov/charities-non-profits/form-990-series-downloads (live, monthly ZIP XML, "Last Updated 17-Jul-2026") | nonprofit-facing law, consulting, investment management, audit; tax prep | Part VII Section B names the five highest-paid independent contractors **only when paid ≥$100,000** — smaller vendor relationships are invisible by design. Exact XML tag names not confirmed. ProPublica's free API (https://projects.propublica.org/nonprofits/api, live) is summary-level and points you back to raw XML for full detail. ⚠ The AWS `irs-form-990` S3 mirror is **frozen since 2021-12-31** — 2013–2021 backfill only. | VERIFIED sources / UNCERTAIN tags |
| **State Secretary of State — registered agent** | corporate formation / registered-agent services (CT Corp, CSC, Northwest, Registered Agents Inc.) | **Fragmentation is the whole problem — 50 systems, 50 access models.** Florida is the standout: https://dos.fl.gov/sunbiz/other-services/data-downloads/ publishes a **free public SFTP bulk feed** (`sftp.floridados.gov`, public credentials on the page), daily + quarterly. Texas: free Comptroller lookup + documented public API (api-doc.comptroller.texas.gov/public-data/), but the full SOS legal record is behind paid SOSDirect. Delaware / California / New York: free single-entity web lookup, **no confirmed self-serve bulk** (search-only findings — **UNCERTAIN**, fetch directly before relying on them). OpenCorporates aggregates 130+ registries but is **paid** (~£2,250–£12,000/yr per search-sourced pricing, **UNCERTAIN**), free only for open-data/non-commercial research. | FL VERIFIED / rest UNCERTAIN |
| **MSRB EMMA — municipal bonds** https://www.msrb.org/Official-Statements, Rule G-32, EMMA primary-market spec (all fetched 200) | municipal bond underwriting; bond counsel | Structured metadata carries `IssuerName`, `IssueDescription`, CUSIP-9, and a **managing underwriter MSRB ID** (a code, resolved via a separate dealer lookup). **Bond counsel, trustee, and municipal advisor are named only inside the official-statement PDF** — reviewing the full data-tag list confirmed no such tags exist. Free access is PDF-only; the structured XML index ships via MSRB's Primary Market Disclosure Historical Data Product, whose **pricing was not confirmed** and is historically subscription-based. | VERIFIED structure / UNCERTAIN cost |
| **FCC ECFS** https://www.fcc.gov/ecfs/public-api-docs.html (free key-based public API; the search UI 403s scrapers) | telecom regulatory law firms | Filings are frequently submitted under the law firm's name as filer of record, but there is **no structured client↔counsel field** — requires parsing filer name plus "on behalf of" text. Covers only entities that filed in a docketed proceeding, not all licensees. | VERIFIED API / medium-effort extraction |
| **FERC eLibrary** https://elibrary.ferc.gov/eLibrary/search (live, v5.5.10.2) | energy regulatory law firms, engineering consultants | Filing party is structured and searchable; **counsel appears only in PDF signature blocks.** **No official bulk download or API** — only an unofficial third-party wrapper. PDF-only, web-only, back to 1981. | VERIFIED live / not bulk-accessible |
| **State PUC dockets** — CPUC https://docs.cpuc.ca.gov/advancedsearchform.aspx (live) · PUCT https://interchange.puc.texas.gov/search/dockets/ (live) | utility regulatory counsel and expert-witness consultancies | **PUCT is the better of the two** — it has an explicit structured **"Filing Party"** field, which surfaces consulting firms that file testimony directly. CPUC's advanced search has no party/counsel field; attorneys of record live on per-docket "Docket Cards", not in a bulk-queryable table. Neither has a first-party API. | VERIFIED live / web-only |
| **CMS Cost Reports (HCRIS)** https://www.cms.gov/data-research/statistics-trends-and-reports/cost-reports | hospital management companies, home-office service arrangements | Worksheet A-8-1 ("Statement of Costs of Services from Related Organizations and Home Office Costs") is the likely vehicle for naming management companies, **but the exact field was not confirmed** — would need the HCRIS flat-file record layout. Settlement lag is real: often 1–2+ years to finalized reports. RAND Hospital Data offers a cleaned free repackaging (**UNCERTAIN**, not verified). | **UNCERTAIN** |
| **NLRB case dockets** https://www.nlrb.gov/search/case | labor & employment defense counsel | Case captions name employer and union at entity level, not in doubt. But the site is a JS app (403 to WebFetch; firecrawl returned only a shell), so **the presence of a representative/counsel field could not be confirmed**, and no bulk API/download was found. Needs a JS-capable browser pass. | **UNCERTAIN** |
| **USPTO Patent Assignment Dataset** https://www.uspto.gov/ip-policy/economic-research/research-datasets/patent-assignment-dataset | patent prosecution | 10.5M assignment transactions since 1970, free bulk `.dta`/`.csv` (~1.5–1.8 GB). Assignment records typically carry a correspondent name/address (often the filing firm) — **field name not confirmed**; the page and schema PDF were not directly loaded. | **UNCERTAIN** |

---

## 3. Ruled out — checked, does not work

Recorded so nobody spends a day re-discovering these.

| Source | Why it fails |
|---|---|
| **SEC Form 13F** (https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets, live) | Reports the manager's own equity holdings. **Does not disclose custodian, prime broker, or administrator.** The `otherManager` field identifies joint filers on a combination report, not a service provider. Common misconception — drop it. |
| **SEC Form PF** | Confidential by rule. The SEC states it does not intend to make Form PF information public in identifiable form; Treasury OFR publishes only aggregates. **DEAD.** |
| **FINRA BrokerCheck / Form BD / Broker-Dealer Firm List** (developer.finra.org, live, dataset new as of May 2026) | Firm-level registration and disciplinary data only. **No client-pairing field anywhere in the documented schema.** Also, the Developer Center API is account-gated via a firm's Super Account Administrator, so not openly accessible. |
| **HMDA** (https://ffiec.cfpb.gov/data-publication/, live; 2025 snapshot released 2026-06-01) | Names the lender well (LEI + institution name in the Panel/Transmittal file). **Fails the buyer test** — borrowers are individual consumers, and HMDA's privacy modifications (age/income bucketing, geography rounding) deliberately prevent persistent identification. Usable as a lender-side share map, not a targeting map. |
| **SEC Form MA (municipal advisors)** | Firm-registration form, like ADV Part 1. **Does not pair an issuer to its advisor.** No structured bulk dataset; EDGAR company search only. |
| **SAM.gov entity registration** | Standalone eligibility record. Names the vendor, **never the buyer** — the pairing only exists once an award is reported to USAspending/FPDS. Use only as an entity-resolution layer. |
| **NPPES / NPI Registry** (https://download.cms.gov/nppes/NPI_Files.html, live, monthly full file ~1.09 GB + weekly incrementals) | Names providers exhaustively. **No structured employer or served-organization relationship field.** A Type 1 individual's "Practice Location" is an address, not a named engagement. Enrichment source only. |
| **FJC Integrated Database** (fjc.gov/research/idb) | Comprehensive federal case metadata back to 1979 with party names — **but no counsel-of-record data at all.** Good for litigation-volume demand signals; fails the provider test. |
| **IRS PTIN public directory** | Looks like the right kind of government record and is not. Lists credentialed preparers by name/city/state; **does not disclose who they work for**, and non-credentialed PTIN holders (most small bookkeepers) are not in the searchable directory. |
| **FCC Form 499 filer database** | Most reported information is explicitly non-public. The only name-pairing exposed is the mandatory DC **Agent for Service of Process** — occasionally a law firm, but a service-of-process designation, not a services relationship. |
| **FCC ULS** | Live and bulk-downloadable as a licensee database, but **no confirmed structured consulting-engineer or counsel field**. Form 601/605 has a contact/consultant field of unconfirmed consistency. **UNCERTAIN, leaning no.** |
| **CMS MA/Part D contract data** | Plan sponsor and parent organization are public and structured. **The PBM is not.** CAA PBM reporting to CMS begins 2028 and is regulatory, not a public dataset. |
| **Form 5500 base form (Part II)** for auditor/TPA | Line 3a names the *plan administrator*, which is the TPA only when formally designated. The **accountant's identity lives inside an attached IQPA opinion PDF, not a structured field.** Use Schedule C (§1.2) instead. |
| **Legacy PatentsView API** (`search.patentsview.org`) | **DEAD** — DNS no longer resolves. Migrated into USPTO ODP March 2026; legacy Developer Hub decommissioned 2026-06-05. |
| **USPTO PEDS** (`ped.uspto.gov`) | **DEAD** — retired 2025-03-14, DNS does not resolve. Replaced by ODP. |
| **FSRS.gov** | **DEAD** — retired 2025-03-08. Subaward reporting moved to SAM.gov. |

---

## 4. Tier 3 — the fallback tier

Real signals, but none of them is mandatory, so **none of them has a denominator**. A number
computed here is a coverage statistic about *your sample*, never a market share. Label it.

| Fallback | Names | Access | Honest assessment |
|---|---|---|---|
| **Rapid7 Project Sonar** — https://opendata.rapid7.com, https://www.rapid7.com/research/project-sonar/, Parquet mirror `s3://rapid7-opendata/fdns/any/v1/` | hosting (A→IP→ASN), email provider (MX), sometimes ESP/security/marketing-automation (SPF `include:` clauses) | **Free**, registration required, internet-wide weekly scans (~3B names) | **The strongest free fallback.** Low ambiguity — a domain either has `include:_spf.google.com` or it does not. Says nothing about agencies, consultants, or any provider that doesn't touch DNS. VERIFIED. |
| **Certificate Transparency — crt.sh** | CDN / hosting / reverse-proxy, sometimes ESP via managed subdomain certs | Free, no signup (Sectigo). All publicly-trusted certs must be CT-logged — the closest thing to a mandate in this tier, though the mandate falls on CAs | Reliable data, **indirect inference.** Shared hosting, wildcard certs, and pass-through TLS termination all produce false relationships. No official bulk API; a naive scrape 502'd. Infrastructure vendors only. VERIFIED live. |
| **HTTP Archive / BigQuery** — https://httparchive.org, public `httparchive` BigQuery project | software vendors on a website (CMS, analytics, martech, ecommerce, CDN) | **Free** public BigQuery dataset; Google's 1 TB/month free query tier covers most concentration queries | Crawl list is CrUX-seeded and **biased toward higher-traffic sites** — SMB sites are often absent or rarely crawled. Fingerprint detection misses server-side integrations. VERIFIED. |
| **Wappalyzer open ruleset** — https://github.com/enthec/webappanalyzer | same as above | Ruleset **free**; you supply crawling | Community continuation after Wappalyzer went commercial. Same fingerprint blind spots. VERIFIED. |
| **BuiltWith** | same | **Paid, and not cheap.** Basic $295/mo (no API/export), Pro $495/mo, Team $995/mo — figures from third-party aggregators, **UNCERTAIN** on exact tiers | Commonly cited as a free-ish option; it is not, at market-map scale. Budget it explicitly. |
| **Job postings naming vendors** | buyer discloses its **own** software stack, first-party | Free to read; job boards scrape more easily than LinkedIn (ToS still applies) | **Stronger than technographics for enterprise SaaS** that leaves no web fingerprint — a company will say "manage our Salesforce and NetSuite environments" in its own words. But it never names service agencies, and coverage skews to larger buyers with dedicated headcount. Point-in-time, not standing relationship. VERIFIED pattern / UNCERTAIN at scale. |
| **MLS via Zillow / Redfin / Realtor.com** | listing agent + brokerage, per address, including sold listings | Free per-address browse; scraping at scale hits platform ToS | Near-total coverage where MLS participation is universal. **Not a government mandate** — it is a professional-conduct/contract norm, and it is commercially controlled. See §5 B10 for the premise correction. |
| **Ad Age Agency Report** — https://adage.com/datacenter/aa-agency-report-2026/ | client (buyer) + agency of record (provider) | **Paid**, ~$349/yr promotional (list $699) | A genuine both-parties-named source, just paywalled and skewed hard to national brand accounts. Announcement-driven, so quiet or informal AOR relationships never appear. An SMB switching agencies will never show up. VERIFIED. |
| **G2 / Capterra reviews** | reviewer's employer + product | Free to browse | **Fails on the buyer half, not just bias.** Profiles usually expose role + company size band + industry, **not the company name**. On top of that: gift-card-incentivized review populations and vendor-funded visibility. Not a market-map source. |
| **Clutch / DesignRush / footer "Site by X" credits** | agency's claims about its own clients | Free | **The weakest thing in this document.** Clutch's own methodology page confirms providers self-report. Self-reported, survivorship-biased, no denominator — a concentration figure computed from this is a marketing-copy share. Footer credits additionally depend on contract terms and site age. **Never present as market share.** |

---

## 5. The gap list — categories where a Market Map should be declined

Blunt on purpose. These are the answers to "can you do this for my client?"

**B1 — Local B2C services (dentists, gyms, home services, restaurants).** Split the question. As
*buyers of software* (Dentrix, Mindbody, Toast) technographics works — booking widgets and POS
embeds are detectable, so "what share of dentists in this metro run vendor X" is buildable. As
*buyers of services* (their marketing agency, answering service, bookkeeper) there is **no
mandatory filing and no reliable fallback.** **PARTIAL — software yes, services no.**

**B2 — Marketing / creative agencies serving SMBs.** No filing. One genuine research technique
exists: agencies sometimes reuse their own GTM/GA container IDs across client sites, and those IDs
are visible in page source, so clients can be clustered under one shop. It is inference, not a
filing, and best-practice agencies use client-owned analytics accounts and are invisible to it.
**DECLINE the clean map; the container-clustering trick is worth prototyping separately.**

**B3 — Management / strategy consultants.** No filing, no technographic footprint (advisory work
never touches the buyer's infrastructure). Only self-reported case studies and press mentions.
**DECLINE.**

**B4 — Executive / business coaches.** As B3 but weaker — testimonials are the only signal and are
entirely provider-curated. **DECLINE.**

**B5 — Fractional executives (CFO / CMO / COO). The starkest gap, and the one closest to home.**
No licence, no state registration, no filing, no technographic footprint. The single mandatory
exception is **SEC Form 8-K Item 5.02** (public companies must disclose officer appointments,
including interim/fractional, within four business days) — a real both-parties-named filing that
covers **public companies only**, a rounding error against the private and SMB fractional market.
For private engagements the only signals are the fractional executive's own LinkedIn history and
occasional client press releases. **DECLINE outright for the private/SMB segment. Do not oversell
a fractional-exec market map — say plainly that the category is structurally unmappable at scale.**

**B6 — Bookkeepers and small accounting firms.** No filing links a preparer to a client roster.
The IRS PTIN directory is a red herring (see §3). Fallback is QuickBooks ProAdvisor / Xero Advisor
directories — opt-in, self-reported, no denominator. **DECLINE.**

**B7 — IT managed service providers serving SMBs.** No general state licensing. The one exception,
Louisiana Act 117 / SB273, requires MSP registration only when serving *public bodies*, and the
registration does not disclose a client roster. **PARTIAL** — DNS/MX inference (§4) genuinely
works where an MSP hosts or proxies client mail/DNS/security on MSP-branded infrastructure. Narrow
wedge, incomplete coverage.

**B8 — Recruiters and staffing.** Nuanced. Staffing and IT-consulting firms that sponsor H-1B
workers appear as the *employer* in DOL LCA data, and third-party placements must disclose the
end-client worksite — which functionally names the client. **PARTIAL, and only for the
visa-sponsoring IT/professional-staffing slice**, a minority of US staffing placements. Domestic
and generalist recruiting has no equivalent disclosure. (UNCERTAIN on exact field mechanics; read the DOL record layout before relying on it.)

**B9 — Therapists and solo healthcare practitioners.** NPPES names the practitioner but never who
serves *them*. CMS EHR "meaningful use"/Promoting Interoperability attestations historically named
the certified EHR product per provider — a genuine incumbent-naming filing — but it is tied to
Medicare/Medicaid billing, and much of solo mental-health practice is cash-pay and never touches
it. **PARTIAL** — technographic detection of practice-management/booking software (SimplePractice,
TherapyNotes) on the practitioner's own site is the practical path.

**B10 — Residential real estate. Premise correction:** county-recorded **deeds do not name the
agent** — they name grantor and grantee, and sometimes a closing attorney. What actually does the
job is the **MLS-syndicated consumer portal layer** (Zillow/Redfin/Realtor.com), which shows
listing agent and brokerage per address including on sold listings. Near-total coverage where MLS
participation is universal. **USABLE, with the caveat that it is a market-conduct norm rather than
a legal mandate, and it is commercially controlled — display terms and scraping ToS can change.**

---

## 6. Adjacent proxies — demand maps, not market maps

These name the **buyer** and a demand signal, but not the incumbent. They make a perfectly good
deliverable. **They are not a Market Map and must not be sold as one.**

- **WARN Act notices** — https://dol.ny.gov/warn-dashboard (live state example); free aggregators
  layoffdata.com, warntracker.com. **No federal centralized database** — DOL does not maintain
  one; states publish independently in varying formats. Signals near-term demand for outplacement,
  HR/restructuring, and backfill staffing. Names the employer only.
- **Business licences / registrations** — https://data.sfgov.org,
  https://data.cityofnewyork.us/Business/License-Applications/ptev-4hud, Chicago Socrata. Free,
  structured, names the business, NAICS, address, registration date. New-formation lead signal.
- **Building permits** — see §1.14. For *construction trades specifically* these cross the line
  into a genuine incumbent-naming source. For every other category they are a demand proxy.
- **USPTO trademark filings** — https://www.uspto.gov/trademarks/search, searchable by Attorney of
  Record. Dual role: a demand proxy for branding/marketing/legal services generally, and a genuine
  **Tier 1** source for trademark/IP firms specifically (see §1.12). Do not undersell it.
- **IRS Form 990 / ProPublica Nonprofit Explorer** — https://projects.propublica.org/nonprofits/api
  (live, free, no-auth; a live query succeeded). 1.8M+ nonprofits with financials, compensation,
  NTEE category. Buyer identification. Named-vendor data only via Part VII-B above the $100k
  threshold (§2).
- **SEC Form 8-K Item 5.02** — executive appointments within four business days. Names the company
  and, occasionally, an outside placement firm. Public companies only. **UNCERTAIN** — not pulled
  from EDGAR directly.

---

## 7. Archetype → source lookup

Start here when the intake answers "what does the client sell?"

| If the client sells… | Look at |
|---|---|
| Employment-based immigration counsel | DOL OFLC LCA / PERM disclosure data (counsel fields `LAWFIRM_NAME_BUSINESS_NAME` and `ATTY_AG_LAW_FIRM_NAME`; read each year's record layout first, the two programs use different schemas) |
| Employee-benefits brokerage | Form 5500 **Schedule A** (§1.1) |
| Retirement plan recordkeeping, TPA, investment consulting, ERISA legal, plan audit | Form 5500 **Schedule C** (§1.2) |
| SBA / small-business lending | SBA 7(a) & 504 FOIA data (§1.3) |
| Government affairs, lobbying | LDA (§1.4) — ⚠ LDA.gov cutover 2026-07-31 |
| Foreign-government-facing PR / lobbying / legal | FARA (§1.5) |
| Public-company audit | PCAOB Form AP (§1.6) + `dei:AuditorName` (§1.7) |
| Services to nursing homes / hospitals / management companies | CMS ownership datasets (§1.8) |
| Services to unions (legal, accounting, consulting, lobbying) | OLMS LM-2 Schedules 15–19 (§1.9) |
| Federal contracting / GovCon services | USAspending + File F subawards (§1.10) |
| Commercial trucking insurance and brokerage | FMCSA SAFER / L&I (§1.11) |
| Trademark / IP prosecution | USPTO TSDR + Trademark Case Files (§1.12) |
| Selling to state/local/K-12 public buyers | Procurement portals (§1.13) |
| Construction trades, property management | Building permits (§1.14) |
| Pharma / medtech commercial | CMS Open Payments (§1.15) |
| Private-fund administration, audit, custody, prime brokerage | Form ADV Schedule D §7.B (§2) |
| Patent prosecution | USPTO Patent File Wrapper (§2) — login-gated since 2026-06-18 |
| Litigation counsel | CourtListener/RECAP (§2) — coverage caveat is severe |
| Securities / capital markets law | EDGAR Exhibit 5.1 (§2) |
| Nonprofit-facing professional services | IRS 990 Part VII-B (§2) |
| Corporate formation / registered agent | State SoS — Florida bulk SFTP is the one clean case (§2) |
| Municipal bond underwriting | MSRB EMMA (§2) — bond counsel is PDF-only |
| Telecom / energy / utility regulatory practice | FCC ECFS, FERC eLibrary, PUCT (§2) — all extraction-heavy |
| Software vendors (any) | Technographic fallbacks (§4) |
| Residential real estate | MLS via consumer portals (§4, §5 B10) |
| **Fractional CFO/CMO/COO, consultants, coaches, bookkeepers, SMB agencies** | **Nothing. Decline (§5).** |

---

## 8. Standing hazards

- **SEC hosts (`data.sec.gov`, `efts.sec.gov`) 403 generic scrapers.** SEC requires a declared,
  identifying User-Agent. Not a data gap.
- **`www.dol.gov` sits behind Akamai and 403s all programmatic clients.** Wayback's `id_`
  raw-content route (`web.archive.org/web/<timestamp>id_/<url>`) returned byte-identical files in the snapshot run.
  Not re-tested.
- **LDA moves to LDA.gov on 2026-07-31.** Anything built against `lda.senate.gov` breaks.
- **USPTO ODP requires login + API key since 2026-06-18**; further profile fields due 2026-08-18.
- **Dataset IDs rot.** FMCSA `aayx-ru4t` 404'd; Austin's permit slug has changed at least once.
  Re-resolve slugs at build time rather than hardcoding.
- **Three retirements to remember:** PatentsView legacy API, USPTO PEDS, FSRS.gov — all dead.

---

## 9. How this was verified

Four research passes on 2026-07-25 (financial, legal/IP/registry, government/health/utility/labor, and the
fallback-and-gaps tier), using web search, page fetches and direct Socrata API calls. Field names were taken
from primary layout files and agency specifications wherever reachable; where only a form section or table
name could be confirmed, the entry says so rather than guessing at a column name.
