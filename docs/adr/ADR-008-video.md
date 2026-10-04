# ADR-008: Video

Status: provider accepted (2026-10-02, human). Media-encryption decision (P6-11) proposed 2026-10-05, waiting for the human. Provider pilot (P6-10) not run yet: it needs people, phones and Indian mobile networks.

## Decision

1. **Provider:** Agora behind the `VideoProvider` adapter (`src/lib/adapters/types.ts`). Unchanged.
2. **Media encryption (proposed):** turn on Agora's built-in channel encryption, mode `AES_256_GCM2`, with **a new key and salt for every consultation**, made on our server and given only to the two people who pass the join checks. Do not build end-to-end encryption now. Details and the reasons are in "Media encryption" below. Implementation is a new task (DISCOVERED, "P6-12"), to be done when the real Agora client is wired, and it needs a real project to verify.
3. **Pilot:** a protocol is written below. The human runs it (P6-10).

## Context

Video goes through the `VideoProvider` adapter so the provider can change. What exists today (Phase 6):

- Agora has no "create a room" call, so a room is a random 32-character name we make and keep. A token is built on our server (`agora-token`, no network call) for one room and one numeric user id, lasting one hour, renewed through our own API (P6-02, P6-04).
- The server checks, in order, assignment, payment, the join window, consent and the state of the consultation before any token is built (P6-03, P6-05). P6-09 attacks all of it through the real route handlers (`src/security/video.test.ts`, 39 cases, mutation-checked).
- Recording is built behind `FEATURE_RECORDING`, off by default, with consent from both people for the one consultation (P6-08).

**Accepted limit, by design.** A token already handed out keeps working at the provider until it expires, one hour at most. Ending a consultation stops renewals and revokes the seat in our books; it cannot recall a token. That is why tokens are short. Encryption (below) narrows the exposure further, because a leaked token alone would not let anyone decode the media.

## Media encryption (P6-11)

### What the provider does without our help

From Agora's security documentation (read 2026-10-05, see Sources): network traffic is protected by Agora's own transmission protocol, TLS and WSS. Agora says it keeps audio and video in cache for about 10 seconds during transmission and releases it right after the call, and that it does not store streams unless a recording is asked for. Channel encryption is **optional**: the application has to switch it on.

The vendor also lists ISO 27001, 27017, 27018, 27701, SOC 2, and "HIPAA, GDPR, CCPA, COPPA compliance". Our legal basis is Indian law (DPDP Act, Telemedicine Practice Guidelines, CERT-In), and those claims are not a legal opinion about it. They are noted and not relied on. Agora also offers network geofencing to restrict traffic to regions, India among them. Whether that satisfies a legal requirement for health data is **not verified** and is a question for the human and counsel (see open points).

### Options

| Option | What it is | Who can read the media | Cost and risk |
|---|---|---|---|
| A. Provider default | TLS and Agora's protocol in transit, nothing at the content level | The provider's relay servers can read it at the content level while it passes through (my reading of the vendor's description of the default: it caches the media for about 10 seconds) | Nothing to build. Weakest for health data; the vendor leaves the choice to the application |
| B. Built-in channel encryption, `AES_256_GCM2` | Our server makes a 32-byte hex key and a 32-byte base64 salt; both people's SDKs get them before joining and encrypt every frame with them. All people in a channel must use the same mode, key and salt; the vendor advises a new key each time | Only the two endpoints. For the native SDKs the vendor states the keys are never sent to Agora. For the Web SDK (4.5.0 and later, PBKDF2 for the key) the same statement is **not verified** | Small: a key per consultation, a new field in the join answer, one SDK call. A wrong or missing key gives a black screen or silence, so it must be tested on every browser we support |
| C. End-to-end encryption (Agora lists it as beta) | Frames encrypted on the sender's device, decrypted on the receiver's, keys supplied by the app | Only the endpoints | Beta; I could not load the vendor page that would confirm platform support and limits, so **nothing is verified**. Because both people would still get the key from our server, it would not protect against us any better than B |

### Why B

- The risk that matters for patients is the relay and anyone who gets hold of a token, not our own server (which already holds the clinical records and decides every join). B removes the first two at low cost. C would add complexity and a beta dependency without a different trust model, since in both cases our server hands out the key.
- Keys are per consultation, so one leaked key exposes one visit, never the others. The key is stored encrypted with the same envelope encryption as other clinical secrets, only the two participants receive it, and it is never logged (the P6-09 static guard on log lines extends to it).
- Renewing a token does not change the key. Joining twice gives the same key. A new consultation gets a new one.

### Recording and encryption

Agora's cloud recording accepts the channel key (`decryptionMode`, `AES_128_GCM2` or `AES_256_GCM2`, with key and salt) so it can record an encrypted channel. That means the recording service, a provider component, sees the media in the clear while it records. This cannot be avoided with cloud recording, and recording already needs both people's agreement for that consultation (P6-08). The file lands in our private Mumbai bucket as a normal mp4. Recording is a separate, consented exception, not a hole in the default.

### What is not verified, and where it will be

These need a real Agora project and real devices, and go with the Agora Questions already queued (P6-02) and with the pilot:

- The Web SDK on the browsers we support, **Safari on iPhone** and low-end Android: does `aes-256-gcm2` work, what does it cost in CPU and battery, does audio-only fallback keep working?
- Behaviour on reconnect and on token renewal with encryption on (the key stays the same; the SDK must not drop out).
- That the Web SDK also keeps the key from Agora's servers (the vendor statement was for the native SDKs).
- Whether network geofencing to India is available on the plan, and what it does to call quality.

## Provider comparison (P6-10): protocol for the human pilot

Not run. It needs an Agora project, an account with the alternative, real phones and real networks. What I prepared is the plan, so the human (or a tester) can run it in a day and fill the table.

**Candidates.** Agora (current) and one alternative. The architecture document names 100ms and LiveKit. LiveKit can be self-hosted, which changes where media flows and who sees it; 100ms is a managed service. Pick one; the adapter work for it is a token builder and a `createRoom`, as for Agora.

**Scenarios, each on both providers, same devices, same time of day, 10 calls per cell:**

| Scenario | Why |
|---|---|
| Good 4G (Jio or Airtel) and home Wi-Fi | The easy case: baseline |
| Weak 4G, one bar, indoors | The common real case |
| Throttled to 256 kbps down and up | Forces audio-only fallback |
| Wi-Fi to mobile handover mid-call | Reconnect behaviour |
| Low-end Android (2 GB) with Chrome, and iPhone with Safari | Where encryption and the SDK are most likely to fail |
| Each of the above with encryption on (Option B) | Cost of the decision above |

**Measure per call:** joined or not, seconds from tap to first remote frame, seconds frozen in a 5-minute call, audio dropouts, whether it fell back to audio and recovered, whether it survived a handover, CPU and battery drop over the call, and what the provider's own dashboard says about the call.

**Also collect, from each vendor's pages and sales answers:** price per 1000 minutes at our expected volume, where media is processed and whether India routing can be pinned, what is kept after the call, whether it signs a data processing agreement we can give counsel, and its answer on recording and encryption together.

**Decision rule (proposal for the human).** Keep Agora unless the alternative is clearly better on join success and frozen time on the weak-network rows, or is meaningfully cheaper at launch volume with equal results. A tie keeps Agora, because switching costs a new adapter, a new client and a new round of this pilot.

**Result table (to fill in):**

| Scenario | Agora joined / 10 | Agora frozen s | Alternative joined / 10 | Alternative frozen s | Notes |
|---|---|---|---|---|---|
| _not run_ | | | | | |

## Revisit when

- The pilot shows another provider is clearly better (see the decision rule).
- Counsel says health video must stay inside India and the provider cannot pin it there.
- Agora's end-to-end encryption leaves beta and either removes the key from our server or recording stops needing the key.
- A video security test (`src/security/video.test.ts`) or a real incident shows the join checks are not enough.

## Consequences and open points

- Written from the decision table in `docs/architecture.md` section 13 (task P0-12), extended in P6-09, P6-10 and P6-11.
- **Encryption is proposed, not built.** Until task P6-12 lands, calls are protected in transit only (Option A). No real patient call should happen before it, so it is a launch blocker, listed in the DISCOVERED table.
- **Human:** confirm Option B, and say whether counsel must review where Agora processes the media (geofencing to India).
- **Human:** run or schedule the pilot, and say which alternative to test.

## Sources

- [Agora: Secure channel encryption](https://docs.agora.io/en/realtime-media/rtc/build/secure-and-protect-channels/media-stream-encryption) (modes `AES_128_GCM2`, `AES_256_GCM2`, key and salt made by the server, same for all users in the channel)
- [Agora: Video Calling security](https://docs.agora.io/en/video-calling/reference/security) (default protection, 10 second cache, certifications, geofencing, keys not sent to Agora in the native SDK)
- [Agora: Cloud Recording security](https://docs.agora.io/en/cloud-recording/reference/security) (recording of encrypted channels, `decryptionMode`)
- [Agora: Secure channel encryption for the Web SDK](https://docs.agora.io/en/Video/channel_encryption_web_ng?platform=Web) (Web SDK 4.5.0 modes `aes-128-gcm2` and `aes-256-gcm2`, PBKDF2)
