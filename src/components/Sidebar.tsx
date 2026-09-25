import {
  BarChart3,
  Car,
  ClipboardList,
  LayoutDashboard,
  Settings,
  Wrench,
} from "lucide-react";

import { NavLink } from "react-router-dom";

const menu = [
  {
    name: "Dashboard",
    path: "/",
    icon: LayoutDashboard,
  },
  {
    name: "Flux Atelier",
    path: "/flux",
    icon: ClipboardList,
  },
  {
    name: "Véhicules",
    path: "/vehicules",
    icon: Car,
  },
  {
    name: "Statistiques",
    path: "/statistiques",
    icon: BarChart3,
  },
];

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-slate-900 text-white">
      <div className="flex h-20 items-center gap-3 border-b border-slate-700 px-6">
        <div className="rounded-lg bg-blue-600 p-2">
          <Wrench size={22} />
        </div>

        <div>
          <h1 className="font-bold">FLUX ATELIER</h1>
          <p className="text-xs text-slate-400">
            Gestion Atelier
          </p>
        </div>
      </div>

      <nav className="mt-6 px-3">
        {menu.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `mb-2 flex items-center gap-3 rounded-lg px-4 py-3 transition ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:bg-slate-800"
                }`
              }
            >
              <Icon size={20} />
              <span>{item.name}</span>
            </NavLink>
          );
        })}

        <div className="mt-8 border-t border-slate-700 pt-5">
          <button className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800">
            <Settings size={20} />
            Paramètres
          </button>
        </div>
      </nav>
    </aside>
  );
}