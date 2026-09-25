import { Bell, User } from "lucide-react";

export default function Header() {
  return (
    <header className="flex h-20 items-center justify-between border-b bg-white px-8">
      <div>
        <h2 className="text-xl font-bold text-slate-800">
          Dashboard
        </h2>

        <p className="text-sm text-slate-500">
          Vue générale de l'activité atelier
        </p>
      </div>

      <div className="flex items-center gap-5">
        <button className="relative text-slate-600">
          <Bell size={21} />

          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500" />
        </button>

        <div className="flex items-center gap-3">
          <div className="rounded-full bg-slate-200 p-2">
            <User size={20} />
          </div>

          <div>
            <p className="text-sm font-semibold">
              Administrateur
            </p>

            <p className="text-xs text-slate-500">
              Gestionnaire
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}