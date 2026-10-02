import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Shield, ClipboardList, Users, ShieldCheck, Receipt, Award } from "lucide-react";
import { useRole, ROLES_META, type RoleType } from "../context/RoleContext";

export default function RoleSwitcher() {
  const { role, roleInfo, setRole } = useRole();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getRoleIcon = (id: RoleType) => {
    switch (id) {
      case "administration":
        return <ShieldCheck className="w-4 h-4 text-rose-600" />;
      case "chef_atelier":
        return <Shield className="w-4 h-4 text-purple-600" />;
      case "reception":
        return <ClipboardList className="w-4 h-4 text-emerald-600" />;
      case "chef_equipe":
        return <Users className="w-4 h-4 text-blue-600" />;
      case "facturation":
        return <Receipt className="w-4 h-4 text-amber-600" />;
      case "garantie":
        return <Award className="w-4 h-4 text-teal-600" />;
    }
  };

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 shadow-sm transition-all text-xs font-semibold text-slate-700"
        title="Changer de profil d'accès"
      >
        <div className="flex items-center gap-1.5">
          {getRoleIcon(role)}
          <span className="font-bold text-slate-900">{roleInfo.title}</span>
        </div>
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${roleInfo.badgeBg}`}
        >
          {roleInfo.badgeText}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 origin-top-right rounded-xl bg-white p-1.5 shadow-2xl ring-1 ring-black/10 focus:outline-none z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-2 border-b border-slate-100 mb-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Profils & Droits d'accès
            </p>
          </div>

          <div className="space-y-1">
            {(Object.keys(ROLES_META) as RoleType[]).map((roleId) => {
              const info = ROLES_META[roleId];
              const isSelected = role === roleId;

              return (
                <button
                  key={roleId}
                  type="button"
                  onClick={() => {
                    setRole(roleId);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-start gap-3 p-2.5 rounded-lg text-left transition-colors ${
                    isSelected
                      ? "bg-slate-50 border border-slate-200"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <div className="mt-0.5 p-1 rounded-md bg-white border border-slate-200 shadow-xs">
                    {getRoleIcon(roleId)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">
                        {info.title}
                      </span>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-blue-600" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                      {info.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
