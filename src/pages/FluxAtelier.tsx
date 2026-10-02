import { Search } from "lucide-react";
import { useState } from "react";

import { fluxData } from "../data/mockData";

export default function FluxAtelier() {
  const [search, setSearch] = useState("");

  const filteredData = fluxData.filter((item) =>
    `${item.ordre} ${item.immatriculation} ${item.marque} ${item.modele}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">
            Flux Atelier
          </h2>

          <p className="text-sm text-slate-500">
            Gestion des ordres et interventions
          </p>
        </div>

        <button className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700">
          + Nouvel ordre
        </button>
      </div>

      <div className="mb-5 rounded-xl border bg-white p-4">
        <div className="relative">
          <Search
            className="absolute left-3 top-2.5 text-slate-400"
            size={20}
          />

          <input
            type="text"
            placeholder="Rechercher un ordre, véhicule..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border py-2 pl-10 pr-4 outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="zebra-table w-full text-left">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-4">Ordre</th>
              <th className="px-5 py-4">Date</th>
              <th className="px-5 py-4">Véhicule</th>
              <th className="px-5 py-4">Atelier</th>
              <th className="px-5 py-4">Opération</th>
              <th className="px-5 py-4">Statut</th>
            </tr>
          </thead>

          <tbody>
            {filteredData.map((item) => (
              <tr
                key={item.id}
                className="border-t hover:bg-slate-50"
              >
                <td className="px-5 py-4 font-medium">
                  {item.ordre}
                </td>

                <td className="px-5 py-4">
                  {item.date}
                </td>

                <td className="px-5 py-4">
                  {item.marque} {item.modele}
                </td>

                <td className="px-5 py-4">
                  {item.atelier}
                </td>

                <td className="px-5 py-4">
                  {item.operation}
                </td>

                <td className="px-5 py-4">
                  {item.statut}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
