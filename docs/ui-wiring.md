# UI wiring plan (Phase F, task F-23)

Phase F built every screen on typed fake data. This file says what replaces each fake, in which task, and what must
change when it does. It is the checklist for the backend phases. The human reviews it before P2 starts.

## How the swap works

Screens never import from `src/mocks/`. They call functions in `src/lib/data/*`, which return the types in
`src/lib/types.ts` and take inputs checked by the Zod schemas in `src/lib/schemas/*`. To wire a feature:

1. Keep the function name and the types. Replace the body with a call to `/api/v1/...` (server components call the
   module directly, client components call the route).
2. Make the route use the same Zod schema for its input. Move the schema to the shared location the API uses and import
   it in both places, so the browser form and the server never disagree.
3. Delete the mock and its `PrototypeHint` box. Search for `PrototypeHint`, `MOCK_`, `?state=` and `?preview=` to find them.
4. Add the route to the access-control matrix test (P2-08) and to OpenAPI (P1-19).
5. Errors: every data function that can fail returns a result object (`{ status: "ok" | "..." }`). Keep that shape and
   map the API's problem-details error to it. The screens already render each status.

Common rules for every swap: pagination is cursor-based (the mock tables page by number; change `PageLinks` to cursor
links), money stays integer paise, times become UTC `timestamptz` and are formatted in India time in the screen, and
no response is a database row.

## Mock to endpoint table

"Data fn" is the function in `src/lib/data/` that wraps the mock. "Task" is the backend task that builds the endpoint.

### Public site

| Mock | Data fn | Replaced by | Task | Notes |
|---|---|---|---|---|
| `mocks/home.ts` specialties | `getHomeContent`, `getSpecialtiesWithCounts` | `GET /api/v1/specialties` (cached) | P4-03 | Counts come from the API. Names and blurbs are translated by slug in `src/i18n` until the API serves translations. |
| `mocks/home.ts` consultation types, `mocks/booking.ts` prices | `getHomeContent` | `GET /api/v1/doctors` fee fields, platform fee setting | P4-03, P5-03 | "From" prices must come from real fees, not constants. |
| `mocks/home.ts` stories | `getHomeContent`, `getAllStories` | CMS or content table with a consent flag | P10-06 | Only real, consented stories. Remove the "sample" notice. |
| `mocks/home.ts` FAQs, `mocks/content.ts` FAQ groups | `getFaqGroups` | Content table or static MDX | P10-06 | Legal review of answers. |
| `mocks/content.ts` articles | `listArticles`, `getArticle`, `getRelatedArticles`, `getArticleSlugs` | Static MDX or CMS | P10-06 | Add sitemap entries (P10-03). |
| `src/content/legal.ts`, `pages.ts` | `getLegalDoc`, `getPatientRights`, `getHowItWorks`, `getVerificationSteps`, `getGrievanceSteps` | Final texts from legal | P9-10, P10-06 | Every page carries a DRAFT banner until the human signs off. Remove the banner then. |
| `mocks/doctors.ts` | `searchDoctors`, `getDoctor`, `getDoctorIds`, `getDirectoryFacets` | `GET /api/v1/doctors`, `/doctors/:id`, `/doctors/:id/slots` | P4-03, P4-04 | Sort and filter come from an allow-list on the server (`schemas/doctors.ts` already lists them). Reviews: `GET /doctors/:id/reviews` (P4-10). |
| `SUPPORT` constants in `lib/data/support.ts` | `submitSupportRequest` | `POST /api/v1/support/requests` (add to the API list) | P9-08 | Rate limit and captcha. Not in `backend-architecture.md` yet: add it. |
| `mocks/auth.ts` | `requestPatientOtp`, `verifyPatientOtp`, `signInStaff`, `verifyStaffTotp`, `verifyStaffBackupCode`, `requestPasswordReset`, `submitNewPassword` | Better Auth routes and `/api/v1/staff/password-reset/*` | P2-02 to P2-06, P2-16 | Fixed test codes (`MOCK_CODES`) disappear. Sign-in must never reveal whether a number or email exists. |
| `mocks/auth.ts` doctor apply | `submitDoctorApplication` | `POST /api/v1/doctor-applications` | P4-02 | Captcha. |

### Patient

| Mock | Data fn | Replaced by | Task | Notes |
|---|---|---|---|---|
| `mocks/session.ts` | `getSession` | `GET /api/v1/me` plus the real session cookie | P2-02, P2-12 | The layouts must read the real session and redirect or 404. **Today anyone can open any panel.** Block deploy (P3-14) until done. |
| `mocks/booking.ts` family | `getFamilyMembers`, `getFamily` | `GET, POST /api/v1/patients` | P2-09 | Minors flag and guardian consent (P9-02). |
| `mocks/booking.ts` hold and pay | `holdSlot`, `payForBooking` | `POST /api/v1/appointments`, `/payments/orders`, `/payments/verify` | P4-05, P5-03, P5-04 | The server sets the amount. The 10-minute hold timer uses the server's expiry. The page must not be public. |
| `mocks/appointments.ts` | `getAppointments`, `getAppointment`, `cancelAppointment`, `rescheduleAppointment`, `reviewAppointment`, `refundFor` | `GET /api/v1/appointments`, `/appointments/:id`, `/cancel`, `/reschedule`, `/review` | P4-06, P4-10, P5-07 | `refundFor` becomes the server's refund rule. The refund policy is still **not verified** (Needs you). |
| `mocks/records.ts` | `listRecords`, `countByType`, `uploadRecord`, `deleteRecord`, `shareRecord`, `revokeShare`, `getShareTargets` | `/api/v1/patients/:id/documents/*` | P7-07 | Presigned upload, size and magic-byte check, ClamAV, then active. Client-side `validateFile` stays as a hint only. Sharing needs a grant table. |
| `mocks/profile.ts` profile and history | `getProfile`, `saveProfile`, `getHistory`, `saveSimple` | `GET, PATCH /api/v1/patients/:id`, `/conditions` | P2-09, P7-06 | Free-text clinical fields are encrypted again in the application. |
| `mocks/profile.ts` vitals | `getVitals` | `GET, POST /api/v1/patients/:id/vitals` | P7-06 | |
| `mocks/profile.ts` consents | `getConsents`, `setConsent` | `GET /consents/policies`, `POST /consents`, `DELETE /consents/:id` | P9-02 | Versioned consent text from legal. |
| `mocks/profile.ts` sessions | `getSessions`, `signOutSession` | `GET, DELETE /api/v1/sessions` | P2-10 | |
| `mocks/profile.ts` data requests | `requestDataExport`, `requestAccountDeletion`, `cancelAccountDeletion` | `POST, GET /api/v1/data-requests` | P2-11, P9-03, P9-04 | Retention exceptions need the human's rules. |
| `mocks/profile.ts` referral | `getReferral` | Referral endpoints behind a flag | P5-10 | |
| Prescription download links | in `appointments`, `records` mocks | `GET /api/v1/prescriptions/:id/download` (signed URL), `/rx/verify/:token` | P7-03 to P7-05 | |

### Consultation (call and console)

| Mock | Data fn | Replaced by | Task | Notes |
|---|---|---|---|---|
| `components/call/use-media-check`, fake network and call timers | (client only) | Agora SDK, `POST /consultations/:appointmentId/join`, `/token`, `/end` | P6-02 to P6-06 | The join page is reachable by URL today. The server must check assignment, payment, time window and consent before a token. Load the SDK only on this route. |
| `mocks/console.ts` patient context | `getConsultContext` | `GET /api/v1/consultations/:id` plus patient record reads | P6-07, P7-11 | Every read is written to the PHI access log. Doctors reach only assigned patients. |
| `mocks/console.ts` medicines | `searchMedicines`, `allergyConflicts` | Drug catalogue and interaction adapter | P7-03, P7-09 | The restricted-medicine list and dose limits are **not verified** (Needs you). Do not ship the mock list. |
| Notes autosave | `saveNotes` | `POST /api/v1/appointments/:id/notes` | P7-02 | Versioned, encrypted, doctor-only. |
| Prescription send | `sendPrescription` | `POST /api/v1/appointments/:id/prescriptions` | P7-03, P7-04 | Registration number and qualifications on the PDF. E-signature rules not verified. |

### Doctor

| Mock | Data fn | Replaced by | Task | Notes |
|---|---|---|---|---|
| `mocks/doctor.ts` consults, patients | `getDoctorConsults`, `getDoctorPatients`, `getTodayDate` | `GET /api/v1/doctor/appointments` | P4-08 | `MOCK_NOW` (2026-10-02 17:00 IST) and `START` constants go away; use the server clock. |
| `mocks/doctor.ts` availability, time off | `getAvailability`, `saveAvailability`, `getTimeOff`, `saveTimeOff`, `setAvailable` | `GET, PUT /doctor/availability`, `POST, DELETE /doctor/time-off` | P4-01, P4-04 | Weekly rules with exclusion constraints. |
| `mocks/doctor.ts` earnings | `getPayouts`, `getEarningLines` | `GET /api/v1/doctor/earnings` | P5-06, P5-09 | Platform fee and GST rules **not verified**. |
| `mocks/application.ts` | `getApplication`, `saveDraft`, `submitApplication`, `uploadDocument` | `GET, PATCH /doctor/profile`, `POST /doctor/kyc/uploads` and `/complete` | P4-02 | Scan states are real now (presign, upload, ClamAV, activate). A doctor can never set their own status. Accepted ID types and fee range **not verified**. |

### Admin

| Mock | Data fn | Replaced by | Task | Notes |
|---|---|---|---|---|
| `mocks/admin.ts` users, doctors | `queryUsers`, `queryDoctors` | `GET /api/v1/admin/users`, `/admin/doctors` | P9-08 | `parseTableQuery` allow-lists move into the SQL layer. Admin never receives clinical text. |
| `mocks/admin.ts` KYC | `getKyc`, `decideKyc` | `POST /admin/doctors/:id/approve`, `/reject`, `/suspend`; `GET /admin/doctors/:id/kyc/:fileId` | P4-02, P9-08 | Audited. Opening a document returns a short signed URL and is logged. Council register check recorded. |
| `mocks/admin.ts` appointments, attendance, KPIs, daily | `queryAppointments`, `queryAttendance`, `getKpis`, `getDaily` | `GET /admin/appointments` plus reporting queries | P9-08 | Aggregates in SQL, cached briefly. |
| `mocks/admin.ts` revenue, refunds | `getWeeklyRevenue`, `getRefunds`, `decideRefund` | `GET /admin/revenue`, `POST /admin/refunds` | P5-07, P9-08 | **Fresh sign-in required** (15 minutes). The mock password check becomes a real re-authentication. |
| `mocks/admin.ts` audit, PHI log | `queryAudit` | `GET /admin/audit-logs`, `/admin/phi-access-logs` | P1-17, P9-05 | Append-only. No edit or delete endpoint exists. |
| `mocks/admin.ts` data requests | `queryDataRequests`, `updateRequest` | `GET, POST /admin/data-requests` | P9-03, P9-04 | Legal-hold check is a server rule. |
| CSV exports (not built in Phase F) | n/a | `GET /admin/exports/:type` | P9-13 | Audited, rate limited. |

### Support

| Mock | Data fn | Replaced by | Task | Notes |
|---|---|---|---|---|
| `mocks/staff.ts` tickets, templates | `queryTickets`, `getTicket`, `getTemplates`, `sendReply` | New ticket endpoints (not in `backend-architecture.md` yet: add) | P9-08 | Decide ticket storage and whether replies go out by email or SMS. |
| `mocks/staff.ts` lookup | `lookupPatients`, `getPatients`, `getPatientName` | `GET /admin/users` with a support-safe projection | P9-08 | No health data. Phone shown masked. |
| `mocks/staff.ts` break-glass | `requestBreakGlass`, `getBreakGlassRecord` | `POST /api/v1/support/break-glass` | P9-06 | The grant is a database row checked on every record read, not a browser value. `components/staff/break-glass-store.ts` (sessionStorage) is deleted and the banner reads the grant from the server. Admin channel alert on start. |

## Things in the UI that are not mocks but must change

| Item | Where | Replace with | Task |
|---|---|---|---|
| Fake session and open panels | `lib/data/session.ts`, every panel layout | Real session, redirect or 404 by role | P2-02, P2-12, P2-08 |
| Prototype boxes and `?state=` switches | `PrototypeHint` in `components/auth/notice.tsx`, most pages | Delete | Each feature's UI task |
| `?preview=` state switch | `components/states/state-preview.tsx` | Delete; give each page real loading and failure paths | P10-05 |
| Language in a cookie | `src/i18n`, `vc-lang` | Language in the URL with `hreflang`; move all remaining copy and Zod messages into message files; native review of `hi.ts` and `gu.ts` | P10-02 |
| Chart colours | `components/admin/charts.tsx` | Keep. Validate a dark set when a dark theme exists. | P10-01 |
| `MOCK_NOW` clock | `mocks/doctors.ts` and helpers | Server time | P4-04 |
| Placeholders in legal text, "[number to be confirmed]" | `content/*`, support form, reply templates | Real values from the human | P9-10, P11-08 |
| Sample doctors, stories, article text | mocks | Real content | P10-06 |
| Registration number on every doctor surface | all doctor cards, prescriptions, receipts | Keep; add an automated check | P9-11 |

## Suggested order

1. P2: session, then patient and staff sign-in, profile and family. Panels stop being open.
2. P4: directory, slots, hold, appointments. Then P5 payments. Booking works end to end.
3. P6 and P7: join, console, notes, prescriptions, records. Delete the call and console mocks.
4. P8: notifications replace the reminder copy in the UI.
5. P9: consents, data requests, break-glass, admin and support consoles. Delete `mocks/admin.ts` and `mocks/staff.ts`.
6. P10: i18n, content, remove the prototype switches.

## Not verified (carried from Phase F, needs the human)

Refund policy and GST or invoice rules. Restricted-online medicines and dose limits. E-signature rules for prescriptions.
Accepted government photo ID types and the doctor fee range. Record retention periods. Break-glass limits and who is
alerted. Translation wording. See the Needs you table in `TODO.md`.
