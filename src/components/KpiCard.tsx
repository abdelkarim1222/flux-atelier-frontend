interface Props {
  title: string;
  value: string | number;
  variation?: string;
  icon: React.ReactNode;
}

export default function KpiCard({
  title,
  value,
  variation,
  icon,
}: Props) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">
            {title}
          </p>

          <h3 className="mt-2 text-3xl font-bold text-slate-800">
            {value}
          </h3>

          {variation && (
            <p className="mt-2 text-xs font-medium text-green-600">
              {variation}
            </p>
          )}
        </div>

        <div className="rounded-lg bg-blue-50 p-3 text-blue-600">
          {icon}
        </div>
      </div>
    </div>
  );
}