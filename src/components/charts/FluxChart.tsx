import { fluxData } from "../../data/mockData";

export default function FluxTable() {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="border-b p-5">
        <h3 className="text-lg font-semibold text-slate-800">
          Derniers flux atelier
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="zebra-table w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-5 py-4">Date</th>
              <th className="px-5 py-4">Ordre</th>
              <th className="px-5 py-4">Véhicule</th>
              <th className="px-5 py-4">Atelier</th>
              <th className="px-5 py-4">Opération</th>
              <th className="px-5 py-4">Montant</th>
              <th className="px-5 py-4">Statut</th>
            </tr>
          </thead>

          <tbody>
            {fluxData.map((flux) => (
              <tr
                key={flux.id}
                className="border-t hover:bg-slate-50"
              >
                <td className="px-5 py-4">
                  {flux.date}
                </td>

                <td className="px-5 py-4 font-medium">
                  {flux.ordre}
                </td>

                <td className="px-5 py-4">
                  <div>
                    <p className="font-medium">
                      {flux.marque} {flux.modele}
                    </p>

                    <p className="text-xs text-slate-500">
                      {flux.immatriculation}
                    </p>
                  </div>
                </td>

                <td className="px-5 py-4">
                  {flux.atelier}
                </td>

                <td className="px-5 py-4">
                  {flux.operation}
                </td>

                <td className="px-5 py-4 font-medium">
                  {flux.montant.toLocaleString()} DT
                </td>

                <td className="px-5 py-4">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      flux.statut === "Livré" || flux.statut === "A livré"
                        ? "bg-green-100 text-green-700"
                        : flux.statut === "En cours"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {flux.statut}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
