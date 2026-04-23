# FlowSuite™ Rebuild Brief

**Owner:** Kari Hoglund Kounkel LLC
**Repo:** `kari-kounkel/flowsuite`
**Supabase:** `keegxjuckohhtxllqxak`
**Production:** flowsuite.caresmn.com

This is the master rebuild doc. Ernie gets bite-sized pieces. Dates live with Kari, not Ernie.

---

## PART 1: THE CORE DECISIONS (Non-Negotiable)

### 1.1 Architecture Pattern: Strangler
- New code lives alongside old code in the **same repo**
- New pages replace old pages route-by-route
- Old code is deleted only after new code is proven
- **No migration weekend. No flag day. No data loss.**

### 1.2 User Experience: Role-First, Not Module-First
- Users log in and see **their dashboard**, not a module menu
- Modules (PeopleFlow, MoneyFlow, ScanFlow, PaperFlow, TaskFlow) exist on the backend as organizational concepts but are **invisible to end users**
- Navigation is by **action** ("File a complaint," "Request time off") or **role** ("Accounting view," "Manager view"), never by module

### 1.3 Multi-Role User System
- Every user has an **array of roles**, not a single role
- Users with 2+ roles see a **role switcher** (top-right dropdown: "Viewing as: [Role] ▾")
- **Admin-facing UI is role-based, not person-based.** Role types include:
  - Master Admin (cross-org access — Kari's seat)
  - Company Admin (single-org full access — Frank's seat, future owners)
  - Accountant
  - Manager
  - Employee
  - Sales
  - Support
  - Receptionist / custom roles as needed
- Role determines dashboard content, navigation options, and data visibility
- Labels always say the role ("Company Admin"), never the person's name ("Frank")

### 1.4 ONE Inbox Rule
- Every item that needs human attention lands in **ONE inbox per user**
- No module-specific task lists, no "HR inbox" separate from "PR requests"
- Sources of inbox items include: tasks, approvals, acknowledgments, discipline, injuries, requests, complaints, payroll items, deliveries, AP confirmations, anything requiring action
- Inbox is filterable by type, urgency, source
- Clicking an item takes the user to the right place to handle it
- **Completed items move to History, never deleted**

### 1.5 Employee Self-Service
- Employees **always see their own data**: paystubs, requests (pending + approved + denied), discipline records, acknowledgments, injuries, training status, time off balance
- "Admin-only view" is the **exception**, not the default
- If a record affects an employee, that employee can see it (unless legally privileged)

### 1.6 Org-Chart-Based Visibility
- Team list is organized by org chart
- Manager sees their direct reports
- Company Admin sees all within their org
- Master Admin sees across all orgs
- Employees see themselves
- Click-through on org chart respects permission levels

### 1.7 Branding Rules (Per-Org Theming)
- **Top-left:** "{Legal Entity Name}" + logged-in user name
  - Example: "IAZ dba Minuteman Press Uptown" / "Sarah Johnson"
- **Footer + Master Admin pages:** FlowSuite™ branding
- **Theming:** All colors, logos, entity names come from org config via the `C` prop
- **NO hardcoded org references anywhere** in component code
- Company Admin edits their own branding via the Company Admin Setup screen

### 1.8 User-Configurable Data Sources
- **Users decide how many AP lists, AR lists, sources they have.** Hardcoding a count defeats the product's purpose.
- Company Admin can add/rename/remove data source feeds
- Example sources they might configure: QBO, FLEX, Omega, IAZ, external CRM, manual uploads
- Each source: label, type (AP/AR/sales/expense/etc.), active status, visibility
- Default setup includes 2 AP + 2 AR; they can add more

### 1.9 Customization Request Access Point
- Every user role has a "Request a Feature / Customization" link in their profile menu
- Opens a form: what they want, priority, willingness to pay
- Lands in Master Admin inbox
- Turns support/requests into a **pricing channel**, not a support drain
- Tracks history per org

### 1.10 Code Rules (Non-Negotiable)
- **NO backticks in JSX** — string concatenation only
- **NO template literals** anywhere
- **`C` prop** for all theming
- **`gn()`** helper for all employee names
- **No hardcoded org_id** — always read from auth/session
- **Upload file from `C:\dev` before editing** — never build from memory
- **Per-tenant RLS** on every table from day one
- **UUID-based** foreign keys (no TEXT org refs)
- **No empty folders** — if it's created, it has content
- **Ask before scope changes** — don't "improve" things not in brief
- **If uncertain, stop and ask** — don't guess
- **Admin UI uses role labels**, never person names

---

## PART 2: THE ONE INBOX SPEC

Build this first. It's the heart of the role-based dashboard.

### 2.1 Data Model
Single `inbox_items` table:
- `id`, `org_id`, `user_id` (who needs to action this)
- `source_type` (discipline, injury, request, task, approval, ack, payroll_item, delivery, ap_confirmation, custom_request, etc.)
- `source_id` (FK to the actual record in its source table)
- `title`, `summary`, `urgency` (low/medium/high/critical)
- `created_at`, `due_at`, `completed_at`, `cancelled_at`
- `action_url` (where clicking sends them)
- `visible_to_roles` (array)
- `status` (open, in_progress, completed, cancelled)

### 2.2 How Items Land
When any module creates something needing attention, it inserts a row into `inbox_items`:
- New discipline record → inbox items for employee AND manager
- PR request submitted → inbox item for approver
- Injury reported → inbox item for HR
- Payroll pending review → inbox item for accountant
- Task assigned → inbox item for assignee
- Document needs acknowledgment → inbox item for employee

### 2.3 How Items Clear (History Rules)
- When source record is resolved, inbox item is marked `completed_at` and drops off active inbox
- **Completed items move to History view**, filterable by date range, type, source
- Items are **never deleted** — history is permanent audit trail
- Cancelled items go to history with reason

### 2.4 UI
- Dashboard section: "Your Inbox: {count} items"
- Sorted by urgency, then due date
- Each item shows: title, source, urgency badge, due date
- Click → go to source record
- Filters: type, urgency, age
- "View History" link → completed/cancelled items

---

## PART 3: THE COMPANY ADMIN SETUP SCREEN

New area. Every Company Admin (Frank at Minuteman, future clients) gets this. They cannot see other orgs, other companies' data, or Master Admin internals.

### 3.1 Branding & Identity
- Upload logo
- Set legal entity name (displayed top-left for all users in that org)
- Set display/short name
- Set primary, secondary, accent colors
- Set font family
- Live preview area showing how dashboard will look with these settings

### 3.2 Data Sources Configuration
- Add/rename/remove AP sources
- Add/rename/remove AR sources
- Add/rename/remove sales/revenue sources
- Add/rename/remove expense sources
- Each source: name, type, active/inactive, visibility rules

### 3.3 Roles & People
- View all users in org
- Assign/remove roles per user
- Create custom roles specific to their business
- Set org chart (who reports to whom)
- Invite new users

### 3.4 Resources
- Upload company-specific resources (policies, forms, links)
- Categorize
- Set employee/admin visibility per item

### 3.5 Customization Requests
- View history of requests their org has made
- See status of each
- Submit new request

### 3.6 Billing / License Info
- Current plan / license status
- Payment history (future)
- Upgrade options (future)

---

## PART 4: THE MASTER ADMIN SCREEN

Separate from Company Admin. Only Master Admin role sees this. Lives in the footer or behind a hidden route.

### 4.1 Cross-Org Dashboard
- List of all orgs
- Health indicators per org (active users, last login, open items)
- Quick switch to view any org as if inside it

### 4.2 Customization Request Inbox
- All incoming requests from all orgs
- Triage: accept, price, schedule, decline
- Pricing log per request

### 4.3 System-Level Settings
- Global role templates
- Global resource library (pushed to all orgs as default)
- Schema version, feature flags

### 4.4 Revenue View
- Per-org licensing status
- Aggregate revenue (future: Stripe integration)

---

## PART 5: THE HR BUNDLE

### 5.1 Discipline System (Preserve + Clean)
- Kari loves this — **do not redesign, just fix navigation**
- Moves from module submenu to dashboard action button + inbox integration
- When discipline is issued:
  - Inbox item for employee (acknowledge)
  - Inbox item for manager (track)
  - Policy reference attached (early: manual link; later: automatic pull from uploaded policy system)
  - Progressive tracking stays (1-year retirement)

### 5.2 Unified HR Actions
Replace module-specific submenus with dashboard action buttons:
- File Complaint → dashboard button
- Report Injury → dashboard button
- Report Incident → dashboard button
- Request Time Off → dashboard button
- Submit PR Request → dashboard button

All create inbox items for the right people.

### 5.3 Onboarding
- Checklist-driven
- Employee sees their own onboarding progress on dashboard
- Manager sees team onboarding status

### 5.4 Separations
- Current system works — port clean
- Employee acknowledgment step stays

### 5.5 Resources = ONE List
- Kill the duplicate list
- Add employee/admin toggle
- Add categories
- Searchable
- Company Admin manages list via Setup screen

---

## PART 6: THE FINANCIAL BUNDLE

### 6.1 Configurable AP Lists (Default Two)
- List 1: Accounting review
- List 2: Pay scheduling
- Company Admin can add more via Setup screen
- Both show: last reviewed date, pending payments, balance
- Status passes between them cleanly

### 6.2 AP Vendor Confirmation
- Button on every AP record: "Confirm amount with vendor"
- Opens modal: source of confirmation (email, statement, phone, in-person, other), date, notes
- Locks amount as "confirmed accurate as of {date}" until next review
- Audit trail of confirmations per vendor per record
- Creates inbox item if amount changes after confirmation

### 6.3 Cash Dashboard
- Keep current IAZ/Omega entity parsing
- Design-only (later build): "merged view" of multi-entity companies

### 6.4 Accountant Role Dashboard
- Inbox filtered to accounting items
- Quick links: AP, Payroll, Journal Entries, Cash Dashboard
- Accounting worksheet lives here, cleaner

### 6.5 Future Financial (Roadmap, Not in First Build)
- Budget from P&L percentages
- Unified JE builder (IIF + Recurring + Amortization)
- Unified cashflow calendar (AP + CC + other payments)
- P&L + Bal Sheet upload + parsing
- Amortization builder
- CC form rebuild with JotForm data import

---

## PART 7: BUILD ORDER (PHASES)

### Phase 1: Foundation
1. Create `/app/dashboard` route (role-aware)
2. Build multi-role system: `user_roles` table, auth helpers, role switcher UI
3. Build `inbox_items` table + insert triggers stubs
4. Build Inbox component (read + display + filter)
5. Build History view for cleared items
6. Build header with org branding + user name (reads from org config)
7. Build role-based navigation wrapper
8. Build Customization Request access point (profile menu link + form)

### Phase 2: Company Admin Setup Screen
9. Branding & Identity config (logo, colors, entity name, live preview)
10. Data Sources configuration (add/rename/remove AP/AR/etc.)
11. Roles & People management
12. Resources management
13. Customization Requests history view

### Phase 3: Employee Experience
14. Employee dashboard layout
15. My Paystubs view
16. My Requests (list + detail + submit form)
17. My Discipline (read-only list)
18. My Acknowledgments
19. My Injuries (list + submit)
20. My Time Off
21. Onboarding progress view
22. Inbox integration — every action above creates inbox items

### Phase 4: Manager + Company Admin
23. Team view (org chart)
24. Manager inbox (team approvals)
25. Discipline workflow (issue, track, close)
26. Company Admin unified HR views (all discipline, injuries, separations, onboarding)
27. Resources ONE list with employee/admin toggle

### Phase 5: Financial Bundle
28. Accountant role dashboard
29. Configurable AP lists rebuild
30. AP vendor confirmation button + audit trail
31. Cash dashboard cleanup
32. Payroll review inbox integration

### Phase 6: Master Admin
33. Cross-org dashboard
34. Customization request inbox (from all orgs)
35. System-level settings
36. Revenue view (basic)

### Phase 7: Polish + Demo Prep
37. Sample data seed
38. Theme check across all screens (Minuteman green/orange/white test)
39. Slide deck
40. Demo script
41. Test from each role POV

---

## PART 8: BRANDING / THEMING CONFIG

Every org gets a config record:
```
{
  org_id: "minuteman",
  legal_name: "IAZ dba Minuteman Press Uptown",
  display_name: "Minuteman Press Uptown",
  logo_url: "...",
  primary_color: "#16833E",    // Minuteman green
  secondary_color: "#F47920",  // Minuteman orange
  accent_color: "#FFFFFF",
  font_family: "..."
}
```

The `C` prop reads from this and applies everywhere. No org-specific CSS files. No hardcoded hex codes. Company Admin edits via Setup screen.

---

## PART 9: RULES FOR ERNIE

1. Upload file from `C:\dev` before editing — no building from memory
2. Commit after every logical unit — small commits, clear messages
3. No empty folders — if it's created, it has content
4. No template literals — string concatenation only
5. No backticks in JSX
6. Use `C` prop for theming, `gn()` for names
7. No hardcoded org_id — always from session
8. RLS on every new table from the moment it's created
9. Ask before scope changes — don't "improve" things not in brief
10. If uncertain, stop and ask — don't guess
11. Admin-facing UI uses role labels (Company Admin, Accountant, Manager), never person names
12. Build what's in the current phase only — don't jump ahead

---

## PART 10: SUCCESS CRITERIA

When the reveal happens, the team sees:
- Every person logs in and sees a dashboard relevant to them
- Nobody asks "where do I click for X?"
- Employees submit real requests and they land in the right inbox
- Manager issues a real discipline record and it lands in the employee's inbox
- Accountant sees payroll items waiting for review
- Branding looks like Minuteman Press, not FlowSuite
- Role switching works live (demonstrable multi-role power)
- Nobody says "that's what we had before"
- Team leaves the meeting wanting to USE it, not just admire it

**The win isn't "it's done." The win is "they want to live in it."**

---

## END OF BRIEF

Questions, scope changes, or additions go in the repo's `/docs/build-decisions.md` file, dated and initialed.

**Kari decides. Ernie builds. Monet architects.**
