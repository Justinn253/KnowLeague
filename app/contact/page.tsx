import type { Metadata } from 'next';
import { Bug, Lightbulb, Mail, MessageSquareWarning } from 'lucide-react';
import { ContactUsWidget } from '@/components/contact-us-widget';
import { PublicContentCard, PublicContentSection, PublicPageShell, PublicProse } from '@/components/public-content-page';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Contact KnowLeague',
  description: 'Contact KnowLeague about feedback, bugs, feature ideas, account questions, or player reports.',
  path: '/contact',
  keywords: ['contact KnowLeague', 'KnowLeague support', 'report a KnowLeague bug'],
});

export default function ContactPage() {
  return (
    <PublicPageShell
      eyebrow="Contact KnowLeague"
      title="Tell us what needs attention."
      description="KnowLeague is an alpha service, so clear reports and thoughtful suggestions make a difference. Include the page or feature involved and what you expected to happen."
    >
      <PublicContentSection id="contact-options" title="Choose the easiest way to reach us">
        <div className="grid gap-4 md:grid-cols-2">
          <PublicContentCard
            title="Use the Help Center"
            accent="amber"
            icon={<MessageSquareWarning size={22} className="shrink-0 text-amber-200" aria-hidden="true" />}
          >
            <p>The in-app form supports feedback, bug reports, suggestions, and player reports. It can include the page context automatically so we can reproduce an issue more quickly.</p>
            <div className="pt-1"><ContactUsWidget variant="drawer" drawerPlacement="top-left" /></div>
          </PublicContentCard>
          <PublicContentCard
            title="Email us directly"
            accent="cyan"
            icon={<Mail size={22} className="shrink-0 text-cyan-200" aria-hidden="true" />}
          >
            <p>For a longer explanation or a question about privacy, data, or account access, email the support address.</p>
            <a href="mailto:knowleague-support@gmail.com" className="w-fit font-bold text-amber-200 transition hover:text-amber-100">knowleague-support@gmail.com</a>
          </PublicContentCard>
        </div>
      </PublicContentSection>

      <PublicContentSection id="what-to-send" eyebrow="Useful details" title="A little context helps us act on your message">
        <div className="grid gap-4 md:grid-cols-3">
          <PublicContentCard
            title="For a bug"
            accent="rose"
            icon={<Bug size={22} className="shrink-0 text-rose-200" aria-hidden="true" />}
          >
            <p>Tell us the route, device or browser, what you clicked, and what happened. Screenshots are welcome when they do not include private account details.</p>
          </PublicContentCard>
          <PublicContentCard
            title="For a suggestion"
            accent="emerald"
            icon={<Lightbulb size={22} className="shrink-0 text-emerald-200" aria-hidden="true" />}
          >
            <p>Describe the player problem you want solved. A small example of how you would use the feature is often more useful than a specific implementation request.</p>
          </PublicContentCard>
          <PublicContentCard
            title="For a player report"
            accent="violet"
            icon={<MessageSquareWarning size={22} className="shrink-0 text-violet-200" aria-hidden="true" />}
          >
            <p>Include the relevant username and a short description of the behavior. Do not send passwords, session tokens, payment details, or other secrets.</p>
          </PublicContentCard>
        </div>
      </PublicContentSection>

      <PublicContentSection id="support-boundaries" eyebrow="Support boundaries" title="What we can and cannot promise">
        <PublicProse>
          <p>We can investigate KnowLeague features, correct catalogue information, review reports, and explain how the app handles its data. Riot API availability, account privacy settings, third-party market data, and platform outages remain outside our control.</p>
          <p>Do not use KnowLeague support to share credentials or ask us to bypass Riot, Supabase, or account security controls. For data requests, include enough information for us to identify the relevant account without sending a password or access token.</p>
        </PublicProse>
      </PublicContentSection>
    </PublicPageShell>
  );
}
