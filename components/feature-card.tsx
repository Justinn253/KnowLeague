type FeatureCardProps = {
  title: string;
  description: string;
};

export function FeatureCard({ title, description }: FeatureCardProps) {
  return (
    <article className="rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-glow backdrop-blur-xl transition hover:-translate-y-1 hover:shadow-xl">
      <h3 className="text-xl font-semibold text-white">{title}</h3>
      <p className="mt-3 text-slate-300">{description}</p>
    </article>
  );
}
