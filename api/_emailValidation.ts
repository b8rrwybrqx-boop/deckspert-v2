import { promises as dns } from "node:dns";

// Known disposable / throwaway email providers. Not exhaustive; covers the
// common abuse domains. Extend as needed.
const DISPOSABLE_DOMAINS = new Set<string>([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "guerrillamail.biz",
  "guerrillamail.org",
  "guerrillamail.de",
  "guerrillamailblock.com",
  "sharklasers.com",
  "grr.la",
  "spam4.me",
  "10minutemail.com",
  "10minutemail.net",
  "20minutemail.com",
  "temp-mail.org",
  "tempmail.com",
  "tempmail.net",
  "tempmailo.com",
  "tempr.email",
  "tempinbox.com",
  "tmail.io",
  "tmpmail.org",
  "throwawaymail.com",
  "throwaway.email",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
  "getnada.com",
  "nada.email",
  "mailnesia.com",
  "maildrop.cc",
  "dispostable.com",
  "fakeinbox.com",
  "fakemail.net",
  "trashmail.com",
  "trash-mail.com",
  "trashmail.de",
  "mytemp.email",
  "mohmal.com",
  "emailondeck.com",
  "mailcatch.com",
  "spamgourmet.com",
  "mintemail.com",
  "discard.email",
  "discardmail.com",
  "anonbox.net",
  "mvrht.com",
  "jetable.org",
  "mailexpire.com",
  "getairmail.com",
  "harakirimail.com",
  "incognitomail.com",
  "burnermail.io",
  "33mail.com",
  "moakt.com",
  "mailtothis.com",
  "inboxbear.com",
  "instantemailaddress.com",
  "emailtemporanea.net",
  "luxusmail.org",
  "wegwerfmail.de",
  "einrot.com",
  "tempail.com",
  "cuvox.de",
  "dayrep.com",
  "armyspy.com",
  "rhyta.com",
  "teleworm.us",
  "gustr.com",
  "superrito.com",
  "spambog.com",
  "mailde.de",
  "1secmail.com",
  "1secmail.org",
  "1secmail.net"
]);

export type EmailValidation = { valid: boolean; reason?: string };

const FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates that an email is well-formed, not from a known disposable provider,
 * and that its domain actually accepts mail (has MX records). Best-effort DNS:
 * a lookup failure is treated as an unverifiable (rejected) domain.
 */
export async function validateRealEmail(rawEmail: string): Promise<EmailValidation> {
  const email = rawEmail.trim().toLowerCase();

  if (!email || !FORMAT_RE.test(email)) {
    return { valid: false, reason: "Please enter a valid email address." };
  }

  const domain = email.slice(email.lastIndexOf("@") + 1);

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, reason: "Please use a permanent email address, not a temporary or disposable one." };
  }

  try {
    const mx = await dns.resolveMx(domain);
    const hasUsableMx = Array.isArray(mx) && mx.some((record) => record.exchange);
    if (!hasUsableMx) {
      return { valid: false, reason: "We couldn't verify that email domain. Please use a working email address." };
    }
  } catch {
    return { valid: false, reason: "We couldn't verify that email domain. Please double-check it and try again." };
  }

  return { valid: true };
}
