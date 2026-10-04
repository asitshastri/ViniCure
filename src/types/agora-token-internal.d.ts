// The token parser inside agora-token has no type declarations. Tests open tokens with it to check
// what is inside; the application only builds tokens (through the package's own typed builder).
declare module "agora-token/src/AccessToken2" {
  export class AccessToken2 {
    appId: Buffer | string;
    expire: number;
    services: unknown[];
    from_string(token: string): boolean;
  }
}
