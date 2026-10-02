# ViniCure design notes

Task F-01 (also P0-16). Look and feel only. We use our own brand, copy and photos. Never copy a reference's logo, name, text or images.

Decisions: D-007 (UI first, mock data), D-008 (soft, trustworthy palette), D-009 (no neumorphism).

## 1. Direction

ViniCure is a telemedicine site for India. People open it when they are worried, often on a mid-range phone and a slow network. The design should feel calm, clear and safe. Not flashy.

- Soft surfaces, thin borders, lots of white space, one strong accent color.
- Large readable text, big touch targets, short sentences.
- Show trust signals where decisions happen: doctor registration number, "verified", "private", "encrypted".
- Mobile first. Doctors also use a tablet and a laptop during calls.
- Light theme first. Dark theme is a later task. Dark is only used for the call controls bar and the doctor's video dock.

## 2. References and what we take from each

Files are in `Frontend_Inspirations/` (screenshot names are timestamps, so they are listed by order and subject).

| Reference (subject) | Take | Do not take |
|---|---|---|
| Med24 landing (`145741`) | Big calm serif-style headline, one clear call to action, a product preview under the hero, a dark "services" band with a list on the right, stats row, "talk to people" section | The yellow and plum colors, the logo strip with fake brands, the English-only wording |
| Hummingbird doctor dashboard (`145822`) | Greeting header, four stat cards, chart plus quick actions plus recent activity layout, left sidebar with "Clinical" group, status chips in the table | The green, the brand, the patient photos |
| Doccure pharmacy home (`145905`) | Search bar in the header, rounded cards for categories ("shop by concern" becomes "find by symptom or specialty"), soft gradient hero | Pharmacy and cart. Not in scope (human did not pick it). |
| Individual Counselling call (`145933`) | Simple two-tile call layout, round avatar when video is off, recording badge, live caption bar, bottom control row with a red end button, right rail (info, people, chat, captions) | Purple gradients |
| SynthCare doctor dashboard (`150040`) | Schedule timeline, live prescription chat panel, kanban board of patients (in progress, upcoming, complete), medicine rows with morning, afternoon, evening tick marks and before or after meal | The blue-purple brand, the "AI Care" menu item |
| Doctor mobile dashboard (`152502`) | Availability toggle card at the top, two stat tiles, next consultation card with a big start button, today's queue list, bottom tab bar with five items | n/a, this is the closest to our intent |
| Injury photo screen (`152516`) | Camera or gallery tabs, quality hint on the preview, retake, crop, rotate, upload row, optional note, a privacy note, one full-width submit | n/a |
| Doctor tablet and desktop consult (`152632`, `152641`) | Video in the middle, patient card on the left or right (complaint, allergies in red, conditions, medication, vitals), prescription builder on the right, collapsible panels for files, notes and prescription, secure badge and connection quality | The product name "ClarityCare" |
| Doctor mobile consult and patient panel (`152704`) | Picture-in-picture self view, four quick buttons under the controls (patient, files, prescription, notes), stacked collapsible clinical cards | n/a |
| Patient files (`152716`) | Filter chips by file type, image grid with view, download and share, document rows with a file icon | n/a |
| Mobile viewport mock (`152810`) | Bottom sheet for the quick prescription with preset chips (dose, frequency, timing), 48px touch targets, patient-side upload flow | The "HIPAA compliant" badge. Indian law is our basis (CLAUDE.md), so we use our own wording. |

ViniCare (read-only reference at `../vinicare-reference`) gives the list of panels and fields:

| ViniCare route | Becomes |
|---|---|
| `/` (hero, about, core services) | F-05 home, but with proof and trust added |
| `/login`, `/patient/login`, `/patient/register`, `/doctor/register`, `/forgot-password`, `/change-password`, `/patient/verify-email` | F-06 (patients sign in by phone OTP, staff by email, password and TOTP, so the email verify page is not needed for patients) |
| `/doctors`, `/doctors/[id]`, `/book-consultation`, `/confirm-early` | F-07, F-08 |
| `/consultation/[sessionId]`, `/join` | F-15 |
| `/patient/dashboard`, `/appointments`, `/records`, `/medical-history`, `/health`, `/profile`, `/referral` | F-11, F-12, F-13 |
| `/doctor/dashboard`, `/calendar`, `/patients`, `/earnings` | F-14 |
| `/admin/dashboard`, `/users`, `/doctors`, `/kyc`, `/appointments`, `/revenue`, `/logs`, `/attendance`, `/patients` | F-18 |
| `/download-prescription` | F-16 preview and a public verify page (P7-05) |
| `/faq`, `/blog`, `/blog/[slug]`, `/support`, `/privacy-policy`, `/terms`, `/cookie-policy`, `/patient-rights` | F-09, F-10 |

New in ViniCure: support console and break-glass (F-19), health records vault with injury photo flow (F-12), trust and compliance section (F-09), patient stories (F-10), consent management and active sessions (F-13), PHI access log (F-18).

Known ViniCare problems we avoid in the UI: blue gradient hero with white text on a photo (contrast risk), role pages reachable by URL guessing (backend must enforce, UI is only for experience), email-based patient flow.

## 3. Color

Soft teal with slate neutrals. The contrast numbers are for text on white or on the stated surface and must stay at 4.5:1 or higher for normal text.

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--color-primary` | `#146C6C` | Buttons, links, active nav | 6.2:1 on white |
| `--color-primary-hover` | `#0F5A5A` | Hover and pressed | 8.0:1 |
| `--color-primary-soft` | `#E3F1F0` | Selected rows, chips, icon tiles | n/a |
| `--color-primary-tint` | `#F0F7F7` | Section backgrounds | n/a |
| `--color-ink` | `#12292B` | Headings and body | 15:1 |
| `--color-ink-muted` | `#4B6163` | Secondary text | 6.4:1 |
| `--color-ink-faint` | `#6B8083` | Placeholder and meta, 14px and up only | 4.6:1 |
| `--color-bg` | `#F6F9F9` | Page background | n/a |
| `--color-surface` | `#FFFFFF` | Cards | n/a |
| `--color-border` | `#DCE6E6` | Card and input borders | 1.3:1, so inputs also get a darker 3:1 border `#7E9496` |
| `--color-dock` | `#0C2A30` | Call controls bar, dark band | white text 14:1 |
| `--color-info` | `#2F6FB0` | Info chips, links in text | 5.2:1 |
| `--color-success` | `#1F7A4D` on `#E6F4EC` | Confirmed, verified | 5.0:1 |
| `--color-warning` | `#8A5300` on `#FFF4E0` | Pending, waiting | 5.4:1 |
| `--color-danger` | `#B3261E` on `#FDECEA` | Errors, allergies, end call | 5.9:1 |

Rules: color never carries meaning alone (add icon or text). Charts use teal, slate and amber, with patterns or direct labels. Values are final only after the F-03 contrast check passes in the browser.

## 4. Typography

- Headings: Figtree (600 and 700). Body and UI: Noto Sans (400, 500, 700). Noto Sans also has good Devanagari and Gujarati coverage for the later language switch. Loaded with `next/font`, `display: swap`, no external request at runtime.
- Scale: 12, 14, 16, 18, 20, 24, 32, 40, 56 px. Body 16px, line height 1.6. Hero 40px on mobile, 56px on desktop.
- Numbers in tables, fees and timers use tabular figures.
- Line length 60 to 75 characters on desktop.

## 5. Space, shape, motion

- Spacing steps of 4 px: 4, 8, 12, 16, 24, 32, 48, 64, 96. Container max width 1200 px (public) and fluid with a sidebar (panels). Side gutter 16 px on phones.
- Radius: 8 (inputs, chips), 12 (cards), 20 (hero blocks), full (avatars, pills).
- Shadow: one soft level for cards (`0 1px 2px rgba(18,41,43,.06), 0 4px 16px rgba(18,41,43,.06)`) and one for dialogs. Borders do most of the work.
- Motion: 150 to 250 ms, ease-out in, shorter out. Transform and opacity only. All motion off under `prefers-reduced-motion`. Max one or two animated things per view.
- Focus ring: 2px primary with 2px offset, always visible. Touch targets 44px or more (48px on doctor call controls).
- z-index scale: 0, 10, 20, 40, 100, 1000.

## 6. Components (F-03)

Button (primary, secondary, ghost, danger, icon), Input, Textarea, Select, Checkbox, Radio, Switch, OTP input, Search box, Card, Stat tile, Badge and status chip, Avatar, Tabs, Accordion, Dialog, Bottom sheet, Toast, Tooltip, Skeleton, Table with sort and pagination, Empty state, Stepper, Chart wrapper (line, bar, donut with text alternative), File tile, Upload progress, Timeline, Rating, Slot chip, Call control button, Logo.

Icons: one set, Phosphor (outline, 1.5 px stroke). No emoji as icons.

## 7. Layout patterns

- Public: top bar (logo, Find doctors, Specialties, How it works, For doctors, Sign in), sticky on scroll, footer with legal and grievance links.
- Panels: left sidebar from 1024 px (grouped menu, logout at the bottom), top bar with greeting, search and bell. Under 1024 px: top bar plus bottom tab bar (5 items max for patient and doctor). Admin keeps a collapsible sidebar.
- Call screens: full-height, dark dock for controls, side panels collapse into bottom sheets on phones.

## 8. Screen inventory

| Task | Screen | Main inspiration |
|---|---|---|
| F-05 | Home | Med24 (hero, services band, stats), Doccure (search, category cards) |
| F-06 | Patient OTP sign-in, staff sign-in, 2FA, forgot and change password | ViniCare login pages, own design |
| F-07 | Doctor directory, doctor profile | Doccure cards, ViniCare `/doctors` |
| F-08 | Slot picker, summary, checkout, success and failure | ViniCare `/book-consultation` |
| F-09 | How it works, specialties, verification, patient rights, legal pages | ViniCare legal pages |
| F-10 | Blog, FAQ, stories, support, about | ViniCare blog, faq, support |
| F-11 | Patient dashboard, appointments | Doctor mobile dashboard (mirrored for patients) |
| F-12 | Records vault, injury photo upload | Injury photo, patient files |
| F-13 | Profile, family, history, consents, sessions, referral | ViniCare `/patient/*` |
| F-14 | Doctor dashboard, calendar, patients, earnings | Hummingbird, doctor mobile dashboard, SynthCare kanban |
| F-15 | Patient lobby and live call | Individual Counselling call |
| F-16 | Doctor consult console (desktop, tablet, mobile) | ClarityCare screens, SynthCare prescription panel, quick Rx sheet |
| F-17 | Doctor onboarding and KYC status | ViniCare `/doctor/register`, `/admin/kyc` |
| F-18 | Admin console | Hummingbird, ViniCare `/admin/*` |
| F-19 | Support console and break-glass | New |
| F-20 to F-23 | States, accessibility pass, i18n, wiring plan | n/a |

## 9. Rules for UI code

- Mock data lives in `src/mocks/` and is typed with the same types the API will use. Components never import mocks directly: they go through `src/lib/data/`.
- No hard-coded hex in components. Use tokens.
- No `dangerouslySetInnerHTML`. No tokens or patient data in localStorage. No real names, phones or photos in mocks.
- Photos: use illustrations or neutral placeholders until licensed images are supplied (the reference photos are not ours to reuse).
- Every doctor card, profile and prescription preview shows the registration number.
- Every screen has loading, empty, error and success states (F-20).

## 10. Not verified

- Legal wording for consent, privacy, patient rights and grievance contact. Placeholder text only, marked "draft, pending legal review".
- Whether Hindi and Gujarati need Devanagari and Gujarati font subsets beyond Noto Sans. Check in F-22.
- Final logo. The human will replace it. Use `Frontend_Inspirations/logos/ViniCure_logo_no_background.png` for now.
