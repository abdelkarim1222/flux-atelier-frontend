interface Props {
  onChange?: (value: string) => void;
}

export default function Filters({ onChange }: Props) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 rounded-xl border bg-white p-5 md:grid-cols-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600">
          Période
        </label>

        <select
          onChange={(e) => onChange?.(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 outline-none focus:border-blue-500"
        >
          <option value="month">Ce mois</option>
          <option value="year">Cette année</option>
          <option value="all">Toutes</option>
        </select>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600">
          Atelier
        </label>

        <select className="w-full rounded-lg border px-3 py-2 outline-none focus:border-blue-500">
          <option>Tous les ateliers</option>
          <option>Mécanique</option>
          <option>Carrosserie</option>
          <option>Électricité</option>
          <option>Diagnostic</option>
        </select>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600">
          Marque
        </label>

        <select className="w-full rounded-lg border px-3 py-2 outline-none focus:border-blue-500">
          <option>Toutes les marques</option>
          <option>IVECO</option>
          <option>FIAT</option>
        </select>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600">
          Statut
        </label>

        <select className="w-full rounded-lg border px-3 py-2 outline-none focus:border-blue-500">
          <option>Tous</option>
          <option>Livré</option>
          <option>En cours</option>
          <option>Attente Client</option>
          <option>Attente Réparation</option>
          <option>Travaux Exterieurs</option>
        </select>
      </div>
    </div>
  );
}
