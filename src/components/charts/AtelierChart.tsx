import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { atelierData } from "../../data/mockData";

export default function AtelierChart() {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <h3 className="mb-5 text-lg font-semibold text-slate-800">
        Flux par atelier
      </h3>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={atelierData}>
          <CartesianGrid strokeDasharray="3 3" />

          <XAxis dataKey="atelier" />

          <YAxis />

          <Tooltip />

          <Bar
            dataKey="nombre"
            fill="#2563eb"
            radius={[5, 5, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}