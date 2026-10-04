import { generateRandomString, symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { randomInt } from "node:crypto";
import type { Auth } from "./auth";
import type { InvitationCrypto } from "./invitations";
import { passwordHasher } from "./password";

// Builds the secrets helpers the invitation flow needs from Better Auth's own key set-up, so
// what the invitation stores is exactly what the two-factor plugin reads at sign-in.

const CODE_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// Same shape as the two-factor plugin's own codes ("aB3dE-fG7hJ"), made here because the plugin
// does not export its generator.
function backupCode(): string {
  let code = "";
  for (let i = 0; i < 10; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

export function invitationCrypto(auth: Auth): InvitationCrypto {
  const secretConfig = async () => (await auth.$context).secretConfig;
  return {
    seal: async (plain) => symmetricEncrypt({ key: await secretConfig(), data: plain }),
    unseal: async (sealed) => symmetricDecrypt({ key: await secretConfig(), data: sealed }),
    newSecret: () => generateRandomString(32),
    newBackupCodes: async () => {
      const codes = Array.from({ length: 10 }, backupCode);
      // The plugin reads this as an encrypted JSON array (storeBackupCodes: "encrypted").
      const stored = await symmetricEncrypt({
        key: await secretConfig(),
        data: JSON.stringify(codes),
      });
      return { codes, stored };
    },
    hashPassword: (password) => passwordHasher.hash(password),
  };
}
