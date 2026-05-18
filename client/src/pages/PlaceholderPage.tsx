interface Props {
  title: string;
  body?: string;
}

export function PlaceholderPage({ title, body }: Props) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-slate-500 text-sm">
        {body ?? 'Wire this page up against the API in the next step.'}
      </p>
    </div>
  );
}
