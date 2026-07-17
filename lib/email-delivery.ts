import { getDualRateLimit } from '@/lib/abuse-controls';
import { EMAIL_DELIVERY_COOLDOWN_SECONDS } from '@/lib/email-delivery-policy';
import { enforceApiRateLimit } from '@/lib/rate-limit';

const emailDeliveryCooldownRateLimit = getDualRateLimit('emailDeliveryCooldown');
const emailDeliveryRateLimit = getDualRateLimit('emailDelivery');

/**
 * All routes that can cause an authentication email must use this guard. The
 * shared email key stops a signup retry, resend action, and password-reset
 * request from sending duplicate messages to the same inbox.
 */
export async function enforceEmailDeliveryProtection(request: Request, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const cooldownResponse = await enforceApiRateLimit(request, {
    scope: 'auth-email-delivery-cooldown',
    ip: emailDeliveryCooldownRateLimit.ip,
    subject: { id: normalizedEmail, ...emailDeliveryCooldownRateLimit.subject },
    errorMessage: `An email was sent recently. Please wait ${EMAIL_DELIVERY_COOLDOWN_SECONDS} seconds before trying again.`,
  });
  if (cooldownResponse) {
    return cooldownResponse;
  }

  return enforceApiRateLimit(request, {
    scope: 'auth-email-delivery',
    ip: emailDeliveryRateLimit.ip,
    subject: { id: normalizedEmail, ...emailDeliveryRateLimit.subject },
    errorMessage: 'Too many email delivery requests. Please wait before trying again.',
  });
}
