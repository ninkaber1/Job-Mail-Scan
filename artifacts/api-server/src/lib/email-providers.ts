export interface ProviderConfig {
  host: string;
  port: number;
  secure: boolean;
}

export const IMAP_PROVIDERS: Record<string, ProviderConfig> = {
  gmail: { host: "imap.gmail.com", port: 993, secure: true },
  outlook: { host: "outlook.office365.com", port: 993, secure: true },
  yahoo: { host: "imap.mail.yahoo.com", port: 993, secure: true },
  hotmail: { host: "outlook.office365.com", port: 993, secure: true },
  icloud: { host: "imap.mail.me.com", port: 993, secure: true },
};

export function getProviderConfig(
  provider: string,
  customHost?: string | null,
  customPort?: number | null,
): ProviderConfig {
  if (provider === "custom") {
    if (!customHost || !customPort) {
      throw new Error("Custom provider requires imapHost and imapPort");
    }
    return { host: customHost, port: customPort, secure: true };
  }
  const config = IMAP_PROVIDERS[provider.toLowerCase()];
  if (!config) {
    throw new Error(
      `Unknown provider: ${provider}. Use gmail, outlook, yahoo, or custom.`,
    );
  }
  return config;
}

// Simple XOR obfuscation — keeps password out of plaintext in DB without real crypto overhead
export function obfuscate(text: string): string {
  const key = "jt-secret";
  return Buffer.from(
    text
      .split("")
      .map((c, i) => c.charCodeAt(0) ^ key.charCodeAt(i % key.length))
      .map((n) => String.fromCharCode(n))
      .join(""),
  ).toString("base64");
}

export function deobfuscate(encoded: string): string {
  const key = "jt-secret";
  const text = Buffer.from(encoded, "base64").toString();
  return text
    .split("")
    .map((c, i) => c.charCodeAt(0) ^ key.charCodeAt(i % key.length))
    .map((n) => String.fromCharCode(n))
    .join("");
}
