import type { BreakGlassRecord, Ticket } from "@/lib/types";

// FAKE DATA for the UI-first phase (D-007). Names and tickets are invented.
// Ticket text is about the service. Health details live only in the break-glass record, which is sample text.

const agent = "Imran Khan";

export const mockTickets: Ticket[] = [
  {
    id: "T-2041",
    subject: "Paid twice for one booking",
    requester: "Meera V.",
    requesterRole: "patient",
    topic: "payment",
    priority: "high",
    status: "new",
    opened: "2026-10-02 16:20",
    dueBy: "2026-10-02 18:20",
    messages: [
      {
        from: "requester",
        name: "Meera V.",
        at: "2026-10-02 16:20",
        text: "I was charged twice for booking VC-2026-004281. The money left my account both times. Please refund one of them.",
      },
    ],
  },
  {
    id: "T-2040",
    subject: "Doctor did not join, no refund yet",
    requester: "Rahul D.",
    requesterRole: "patient",
    topic: "booking",
    priority: "high",
    status: "open",
    opened: "2026-10-02 11:05",
    dueBy: "2026-10-02 15:05",
    assignee: agent,
    messages: [
      {
        from: "requester",
        name: "Rahul D.",
        at: "2026-10-02 11:05",
        text: "My 10:30 appointment started and nobody joined for 20 minutes. I want my money back.",
      },
      {
        from: "agent",
        name: agent,
        at: "2026-10-02 11:40",
        text: "Sorry about that. I have asked the doctor's team what happened and flagged a refund for review.",
      },
    ],
  },
  {
    id: "T-2039",
    subject: "Prescription PDF will not open",
    requester: "Priya S.",
    requesterRole: "patient",
    topic: "records",
    priority: "normal",
    status: "open",
    opened: "2026-10-01 18:10",
    dueBy: "2026-10-02 18:10",
    assignee: agent,
    needsRecord: true,
    messages: [
      {
        from: "requester",
        name: "Priya S.",
        at: "2026-10-01 18:10",
        text: "The download button for my prescription shows a blank page. I need it for the pharmacy today.",
      },
    ],
  },
  {
    id: "T-2038",
    subject: "Cannot change my phone number",
    requester: "Karthik R.",
    requesterRole: "patient",
    topic: "technical",
    priority: "normal",
    status: "waiting",
    opened: "2026-10-01 09:30",
    dueBy: "2026-10-03 09:30",
    assignee: agent,
    messages: [
      {
        from: "requester",
        name: "Karthik R.",
        at: "2026-10-01 09:30",
        text: "The code for my new number never arrives.",
      },
      {
        from: "agent",
        name: agent,
        at: "2026-10-01 10:05",
        text: "Please check that the number has no spaces, then try once more and tell me the time you tried.",
      },
    ],
  },
  {
    id: "T-2037",
    subject: "Update to my consultation fee shows the old amount",
    requester: "Dr. Arjun Nair",
    requesterRole: "doctor",
    topic: "doctor",
    priority: "low",
    status: "new",
    opened: "2026-10-02 13:15",
    dueBy: "2026-10-04 13:15",
    messages: [
      {
        from: "requester",
        name: "Dr. Arjun Nair",
        at: "2026-10-02 13:15",
        text: "I changed my fee last week but patients still see the old amount on my profile.",
      },
    ],
  },
  {
    id: "T-2036",
    subject: "Want to see the invoice for my last visit",
    requester: "Sunita M.",
    requesterRole: "patient",
    topic: "payment",
    priority: "low",
    status: "solved",
    opened: "2026-09-29 15:00",
    dueBy: "2026-10-01 15:00",
    assignee: agent,
    messages: [
      {
        from: "requester",
        name: "Sunita M.",
        at: "2026-09-29 15:00",
        text: "Where can I download the invoice?",
      },
      {
        from: "agent",
        name: agent,
        at: "2026-09-29 15:20",
        text: "It is under Appointments, on the visit, as Download invoice. I have also emailed it to you.",
      },
    ],
  },
  {
    id: "T-2035",
    subject: "Video freezes on my phone",
    requester: "Farhan A.",
    requesterRole: "patient",
    topic: "technical",
    priority: "normal",
    status: "open",
    opened: "2026-10-02 09:50",
    dueBy: "2026-10-02 16:00",
    assignee: agent,
    messages: [
      {
        from: "requester",
        name: "Farhan A.",
        at: "2026-10-02 09:50",
        text: "The video keeps freezing but audio works. I am on mobile data.",
      },
    ],
  },
  {
    id: "T-2034",
    subject: "How do I delete my account?",
    requester: "Anita G.",
    requesterRole: "patient",
    topic: "other",
    priority: "low",
    status: "new",
    opened: "2026-10-02 08:00",
    dueBy: "2026-10-04 08:00",
    messages: [
      {
        from: "requester",
        name: "Anita G.",
        at: "2026-10-02 08:00",
        text: "I do not want to use the service any more. How do I remove my data?",
      },
    ],
  },
];

export const mockTemplates: Array<{ id: string; label: string; text: string }> = [
  {
    id: "refund",
    label: "Refund flagged",
    text: "I have flagged this for a refund review. You will get an update within [number to be confirmed] working days.",
  },
  {
    id: "info",
    label: "Ask for details",
    text: "Could you share the booking number and the time you saw the problem? That helps us look into it.",
  },
  {
    id: "data",
    label: "Data request",
    text: "You can ask for a copy or deletion of your data from Settings, under Privacy. I have also logged your request here.",
  },
];

// Sample health record shown only after break-glass. Invented text, not real patient data.
export const mockBreakGlassRecords: BreakGlassRecord[] = [
  {
    patientId: "u-1012",
    sections: [
      { id: "profile", title: "Profile", items: ["Age 34", "Blood group O+"] },
      { id: "allergies", title: "Allergies", items: ["Penicillin: rash"] },
      {
        id: "medicines",
        title: "Current medicines",
        items: ["Sample medicine A, once a day", "Sample medicine B, twice a day"],
      },
      {
        id: "documents",
        title: "Documents",
        items: ["Prescription, 28 Sep", "Blood test report, 14 Aug"],
      },
    ],
  },
];
