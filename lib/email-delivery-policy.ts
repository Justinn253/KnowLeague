export const EMAIL_DELIVERY_COOLDOWN_MS = 60_000;
export const EMAIL_DELIVERY_COOLDOWN_SECONDS = EMAIL_DELIVERY_COOLDOWN_MS / 1_000;

export function getEmailDeliveryCooldownSeconds(
  cooldownEndsAt: number,
  now = Date.now(),
) {
  return Math.max(0, Math.ceil((cooldownEndsAt - now) / 1_000));
}
