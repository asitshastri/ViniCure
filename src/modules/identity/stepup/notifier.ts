import type { EmailProvider, SmsProvider } from "../../../lib/adapters/types";

// Security notices to a patient (P2-18, D-019 rules 3, 4 and 6). They go out through the email
// and SMS adapters. A notice that cannot be sent never blocks the sign-in or the change it is
// about: the failure is reported (no personal data) and the action stands.

export interface SecurityNotifier {
  /** A sign-in from a device we do not know. `notMeLink` revokes everything when opened. */
  newDeviceSignIn(input: {
    email: string | null;
    notMeLink: string;
    device: string;
  }): Promise<void>;
  /** A recovery code was spent. */
  recoveryCodeUsed(input: { email: string | null; phone: string | null }): Promise<void>;
  /** The mobile number was changed. The old number is told, so a mistake or a theft is seen. */
  numberChanged(input: { email: string | null; oldPhone: string | null }): Promise<void>;
}

export class AdapterSecurityNotifier implements SecurityNotifier {
  constructor(
    private readonly email: EmailProvider,
    private readonly sms: SmsProvider,
    private readonly onFailure: (what: string) => void = () => undefined,
  ) {}

  private async safely(what: string, send: () => Promise<unknown>): Promise<void> {
    try {
      await send();
    } catch {
      this.onFailure(what);
    }
  }

  async newDeviceSignIn(input: { email: string | null; notMeLink: string; device: string }) {
    if (!input.email) return; // no other contact method: the device list shows it instead
    await this.safely("new_device_email", () =>
      this.email.send({
        to: input.email as string,
        templateKey: "security_new_device",
        variables: { link: input.notMeLink, device: input.device },
      }),
    );
  }

  async recoveryCodeUsed(input: { email: string | null; phone: string | null }) {
    if (input.email) {
      await this.safely("recovery_email", () =>
        this.email.send({
          to: input.email as string,
          templateKey: "security_recovery_code_used",
          variables: {},
        }),
      );
    }
    if (input.phone) {
      await this.safely("recovery_sms", () =>
        this.sms.sendTemplate({
          to: input.phone as string,
          templateKey: "security_recovery_code_used",
          variables: {},
        }),
      );
    }
  }

  async numberChanged(input: { email: string | null; oldPhone: string | null }) {
    if (input.email) {
      await this.safely("number_changed_email", () =>
        this.email.send({
          to: input.email as string,
          templateKey: "security_number_changed",
          variables: {},
        }),
      );
    }
    if (input.oldPhone) {
      await this.safely("number_changed_sms", () =>
        this.sms.sendTemplate({
          to: input.oldPhone as string,
          templateKey: "security_number_changed",
          variables: {},
        }),
      );
    }
  }
}
