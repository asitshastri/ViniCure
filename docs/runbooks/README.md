# Runbooks

Step-by-step instructions for the people running ViniCure when something happens. A runbook is written when the thing it covers exists, tested by doing it once, and dated. Planned ones, with the task that creates each:

| Runbook | Written in |
|---|---|
| Restore the database from a backup (point in time, and from the other region) | P3-04, P11 restore drill |
| Roll back a bad deploy | P3-12 |
| Rotate a secret (database, auth secret, provider keys, the Google client secret) | P3-09 |
| A security incident and the CERT-In reporting clock | P9-11 |
| A recycled-number complaint and support-assisted recovery of a patient (D-019) | P9, after the human answers the question in TODO |
| Queue backlog and dead letters | P8 |
| Provider outage (SMS, email, payments, video) | P8, P5, P6 |
| Break-glass review | P9 |

Until a runbook exists, the design notes in `docs/backend-architecture.md` and `docs/adr/` are the only guidance.
