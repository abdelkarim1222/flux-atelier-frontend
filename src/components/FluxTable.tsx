import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { monthlyData } from "../data/mockData";

export default function FluxChart() {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <h3 className="mb-5 text-lg font-semibold text-slate-800">
        Évolution des flux
      </h3>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={monthlyData}>
          <CartesianGrid strokeDasharray="3 3" />

          <XAxis dataKey="mois" />

          <YAxis />

          <Tooltip />

          <Line
            type="monotone"
            dataKey="flux"
            strokeWidth={3}
            dot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}