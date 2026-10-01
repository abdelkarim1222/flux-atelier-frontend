import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Shield,
  Users,
  ClipboardList,
  UserPlus,
  KeyRound,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Lock,
  Search,
  Wrench,
  ShieldCheck,
  Plus,
  Check,
  Layers,
  Receipt,
  Eye,
  ArrowRightLeft,
  RotateCcw,
  SlidersHorizontal,
  FileText,
  ShoppingCart,
  Timer,
  MapPin,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { type RoleType, type RolePermissions, ROLES_META } from "../context/RoleContext";
import { type AuthorizedAccount } from "../config/accounts";
import { CANONICAL_TEAMS, parseAssignedTeams } from "../config/teams";

const VIEW_PERMISSIONS: { key: keyof RolePermissions; label: string; desc: string; icon: any }[] = [
  {
    key: "canViewDevis",
    label: "Voir et suivre les Devis",
    desc: "Onglet Devis & Estimations, relances clients et validations",
    icon: FileText,
  },
  {
    key: "canViewAttenteAchat",
    label: "Voir les Achats PDR (Pièces)",
    desc: "Onglet Pièces de Rechange (PDR) en attente magasin",
    icon: ShoppingCart,
  },
  {
    key: "canViewSuiviTemps",
    label: "Chronométrie & Calcul des Temps",
    desc: "Statistiques et KPIs de durée de réparation atelier",
    icon: Timer,
  },
  {
    key: "canViewEssai",
    label: "Page Contrôle & Essai",
    desc: "Page des véhicules en cours d'essai routier",
    icon: CheckCircle2,
  },
  {
    key: "canAddEntree",
    label: "Suivi des Entrées & Réception",
    desc: "Liste générale des entrées et création de nouveaux dossiers",
    icon: ClipboardList,
  },
  {
    key: "canViewFacturation",
    label: "Facturation & Caisse",
    desc: "Interface Facturation, validation paiement & bons de sortie",
    icon: Receipt,
  },
  {
    key: "canViewAllFacturation",
    label: "Tous les dossiers Facturation",
    desc: "Consulter toutes les lignes « En attente de paiement » et « Att Facture », quelle que soit l'équipe",
    icon: Receipt,
  },
  {
    key: "canViewMap",
    label: "Plan d'Atelier",
    desc: "Carte interactive des emplacements et stationnements",
    icon: MapPin,
  },
];

const ACTION_PERMISSIONS: { key: keyof RolePermissions; label: string; desc: string; icon: any }[] = [
  {
    key: "canManageEquipes",
    label: "Gérer l'équipe (Tableaux ÉQUIPE)",
    desc: "Accès au tableau des membres d'équipe et affectations d'atelier",
    icon: Users,
  },
  {
    key: "canEditAvancement",
    label: "Transférer véhicules & Avancement",
    desc: "Autorise « ↪ Envoyer équipe… » et le changement d'avancement (%)",
    icon: ArrowRightLeft,
  },
  {
    key: "canEditEtat",
    label: "Mettre « En cours » & Affecter Technicien",
    desc: "Autorise le bouton bleu « En cours » et le choix du mécanicien",
    icon: Wrench,
  },
  {
    key: "canEditEmplacement",
    label: "Modifier Emplacement de Parking",
    desc: "Autorise le changement manuel de place (P1, P2...)",
    icon: MapPin,
  },
  {
    key: "canEditChargement",
    label: "Gérer Tableaux de Chargement",
    desc: "Autorise la modification des listes de chargement atelier",
    icon: Layers,
  },
];

export default function GestionAccesView() {
  const { accounts, addAccount, updateAccount, deleteAccount, currentUser } = useAuth();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AuthorizedAccount | null>(null);

  // Form State
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<RoleType>("chef_equipe");
  const [formTeam, setFormTeam] = useState<string>("Daily1");
  const [formAdditionalTeams, setFormAdditionalTeams] = useState<string[]>([]);
  const [formCustomPermissions, setFormCustomPermissions] = useState<Partial<RolePermissions>>({});
  const [sessionCreatedCount, setSessionCreatedCount] = useState<number>(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Delete Confirmation State
  const [deletingAccount, setDeletingAccount] = useState<AuthorizedAccount | null>(null);

  // Open modal for new account with optional prefill
  const openCreateModal = (prefill?: {
    role?: RoleType;
    team?: string;
    name?: string;
    email?: string;
  }) => {
    const initialRole = prefill?.role || "chef_equipe";
    setEditingAccount(null);
    setFormName(prefill?.name || "");
    setFormEmail(prefill?.email || "");
    setFormPassword("");
    setFormRole(initialRole);
    setFormTeam(prefill?.team || "Daily1");
    setFormAdditionalTeams([]);
    // Par défaut pour Chef d'Équipe : les droits restent strictement conformes et inchangés
    setFormCustomPermissions({ ...ROLES_META[initialRole].permissions });
    setFormError(null);
    setFormSuccess(null);
    setIsModalOpen(true);
  };

  // Open modal for editing account
  const openEditModal = (acc: AuthorizedAccount) => {
    setEditingAccount(acc);
    setFormName(acc.name);
    setFormEmail(acc.email);
    setFormPassword("");
    setFormRole(acc.role);
    if (acc.role === "chef_equipe" || acc.role === "chef_atelier" || acc.role === "facturation") {
      const parsed = parseAssignedTeams(acc.assignedTeam);
      setFormTeam(parsed.primary);
      setFormAdditionalTeams(parsed.additional);
    } else {
      setFormTeam(acc.assignedTeam || "Daily1");
      setFormAdditionalTeams([]);
    }
    // Charger les droits personnalisés ou les droits standards du rôle
    setFormCustomPermissions({
      ...ROLES_META[acc.role].permissions,
      ...(acc.customPermissions || {}),
    });
    setFormError(null);
    setFormSuccess(null);
    setIsModalOpen(true);
  };

  const handleRoleChange = (newRole: RoleType) => {
    setFormRole(newRole);
    if (newRole !== "chef_equipe" && newRole !== "chef_atelier" && newRole !== "facturation") {
      setFormAdditionalTeams([]);
    }
    if (newRole === "reception") {
      if (formTeam !== "R18" && formTeam !== "R16") setFormTeam("R18");
    }
    // Préréglage automatique des droits standards du nouveau rôle (Chef d'Équipe reste standard)
    setFormCustomPermissions({ ...ROLES_META[newRole].permissions });
  };

  const toggleAdditionalTeam = (teamName: string) => {
    setFormAdditionalTeams((prev) =>
      prev.includes(teamName) ? prev.filter((t) => t !== teamName) : [...prev, teamName]
    );
  };

  const togglePermission = (key: keyof RolePermissions) => {
    setFormCustomPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const resetToRoleDefaults = () => {
    setFormCustomPermissions({ ...ROLES_META[formRole].permissions });
  };

  const isCustomized = useMemo(() => {
    const defaults = ROLES_META[formRole].permissions;
    return Object.keys(defaults).some((k) => {
      const key = k as keyof RolePermissions;
      if (key === "defaultTab") return false;
      return Boolean(formCustomPermissions[key]) !== Boolean(defaults[key]);
    });
  }, [formRole, formCustomPermissions]);

  // Generate random password
  const generateRandomPassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyz23456789";
    let pass = "";
    for (let i = 0; i < 8; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormPassword(pass);
  };

  // Handle Form Submit (keepOpen=true allows creating 6, 10 or more accounts in sequence)
  const handleFormSubmit = async (e: React.FormEvent, keepOpen = false) => {
    e.preventDefault();
    setFormError(null);

    const cleanName = formName.trim();
    const cleanEmail = formEmail.trim();
    const cleanPass = formPassword.trim();

    if (!cleanName) {
      setFormError("Le nom du collaborateur est obligatoire.");
      return;
    }
    if (!cleanEmail) {
      setFormError("L'identifiant ou l'adresse email est obligatoire.");
      return;
    }
    if (!cleanPass && !editingAccount) {
      setFormError("Le mot de passe est obligatoire.");
      return;
    }
    if (formRole === "reception" && !formTeam.trim()) {
      setFormError("Veuillez attribuer un centre de réception.");
      return;
    }

    let assignedTeamValue: string | undefined = undefined;
    if (formRole === "reception") {
      assignedTeamValue = formTeam;
    } else if (formRole === "chef_equipe" || formRole === "chef_atelier" || formRole === "facturation") {
      if (formTeam === "Toutes") {
        assignedTeamValue = "Toutes";
      } else {
        const cleanAdditional = formAdditionalTeams.filter((t) => t !== formTeam && t !== "Toutes");
        assignedTeamValue = cleanAdditional.length > 0 ? [formTeam, ...cleanAdditional].join(", ") : formTeam;
      }
    }

    if (editingAccount) {
      const res = await updateAccount(editingAccount.id, {
        name: cleanName,
        email: cleanEmail,
        ...(cleanPass ? { password: cleanPass } : {}),
        role: formRole,
        assignedTeam: assignedTeamValue,
        customPermissions: formCustomPermissions,
      });

      if (!res.success) {
        setFormError(res.error || "Erreur lors de la modification.");
        return;
      }
      setFormSuccess("Accès collaborateur mis à jour avec succès !");
      setTimeout(() => {
        setIsModalOpen(false);
        setFormSuccess(null);
      }, 1400);
    } else {
      const res = await addAccount({
        name: cleanName,
        email: cleanEmail,
        password: cleanPass,
        role: formRole,
        assignedTeam: assignedTeamValue,
        customPermissions: formCustomPermissions,
      });

      if (!res.success) {
        setFormError(res.error || "Erreur lors de la création.");
        return;
      }

      const newTotalInSession = sessionCreatedCount + 1;
      setSessionCreatedCount(newTotalInSession);

      if (keepOpen) {
        setFormSuccess(
          `✅ Compte n°${newTotalInSession} (${cleanName}) créé avec succès ! Saisissez le compte suivant sans fermer la fenêtre.`
        );
        // Reset fields for the next account
        setFormName("");
        setFormEmail("");
        setFormPassword("");
        setFormAdditionalTeams([]);
        setFormCustomPermissions({ ...ROLES_META[formRole].permissions });
        // Suggest next team if current was a canonical team
        const currentIdx = CANONICAL_TEAMS.indexOf(formTeam as any);
        if (currentIdx >= 0 && currentIdx < CANONICAL_TEAMS.length - 1) {
          setFormTeam(CANONICAL_TEAMS[currentIdx + 1]);
        }
      } else {
        setFormSuccess(
          `✅ Compte créé avec succès pour ${cleanName} ! Identifiant : "${cleanEmail}" • Mot de passe : "${cleanPass}". Connexion opérationnelle immédiatement !`
        );
        setTimeout(() => {
          setIsModalOpen(false);
          setFormSuccess(null);
        }, 1600);
      }
    }
  };

  // Handle Delete
  const handleDelete = async (acc: AuthorizedAccount) => {
    const res = await deleteAccount(acc.id);
    if (!res.success) {
      alert(res.error || "Impossible de supprimer ce compte.");
    }
    setDeletingAccount(null);
  };

  // Filtered Accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      const matchesSearch =
        acc.name.toLowerCase().includes(search.toLowerCase()) ||
        acc.email.toLowerCase().includes(search.toLowerCase()) ||
        (acc.assignedTeam && acc.assignedTeam.toLowerCase().includes(search.toLowerCase()));
      const matchesRole = roleFilter === "all" || acc.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [accounts, search, roleFilter]);

  // Statistics
  const stats = useMemo(() => {
    return {
      total: accounts.length,
      admin: accounts.filter((a) => a.role === "administration").length,
      atelier: accounts.filter((a) => a.role === "chef_atelier").length,
      reception: accounts.filter((a) => a.role === "reception").length,
      equipe: accounts.filter((a) => a.role === "chef_equipe").length,
      facturation: accounts.filter((a) => a.role === "facturation").length,
    };
  }, [accounts]);

  return (
    <div className="flex flex-col h-full bg-slate-900/10 backdrop-blur-xs p-4 lg:p-6 overflow-y-auto">
      {/* Header Card */}
      <div className="bg-white/92 backdrop-blur-md rounded-2xl p-5 border border-white/60 shadow-lg mb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-purple-600/25">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Gestion des Accès & Profils
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-purple-100 text-purple-800 border border-purple-200">
                  Réservé Administration & Chef d'Atelier
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Créez et gérez sans limite tous les comptes : Direction, Chef d'Atelier, Réception et les 7 Équipes Mécaniques ITALCAR.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => openCreateModal()}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 rounded-xl shadow-md shadow-purple-600/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Donner un nouvel accès</span>
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 pt-4 border-t border-slate-100">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-[10px] font-bold uppercase text-slate-400">Total Comptes</p>
            <p className="text-xl font-black text-slate-900 mt-0.5">{stats.total}</p>
          </div>
          <div className="p-3 bg-rose-50 rounded-xl border border-rose-100">
            <p className="text-[10px] font-bold uppercase text-rose-600">Administration</p>
            <p className="text-xl font-black text-rose-700 mt-0.5">{stats.admin}</p>
          </div>
          <div className="p-3 bg-purple-50 rounded-xl border border-purple-100">
            <p className="text-[10px] font-bold uppercase text-purple-600">Chef d'Atelier</p>
            <p className="text-xl font-black text-purple-700 mt-0.5">{stats.atelier}</p>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
            <p className="text-[10px] font-bold uppercase text-emerald-600">Réception</p>
            <p className="text-xl font-black text-emerald-700 mt-0.5">{stats.reception}</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-[10px] font-bold uppercase text-blue-600">Chefs d'Équipe</p>
            <p className="text-xl font-black text-blue-700 mt-0.5">{stats.equipe}</p>
          </div>
        </div>
      </div>

      {/* Quick Team Setup Card (1-clic pour les 7 équipes) */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 border border-indigo-800/40 shadow-xl mb-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center border border-indigo-400/30">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                <span>Configuration Rapide des 7 Équipes d'Atelier</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  {CANONICAL_TEAMS.filter((t) =>
                    accounts.some(
                      (a) =>
                        a.role === "chef_equipe" &&
                        (a.assignedTeam === t ||
                          (a.assignedTeam && a.assignedTeam.split(",").map((x) => x.trim()).includes(t)) ||
                          a.name.toLowerCase().includes(t.toLowerCase()))
                    )
                  ).length}
                  /7 configurées
                </span>
              </h2>
              <p className="text-[11px] text-indigo-200/80">
                Créez 6, 7, 10 ou autant de comptes que nécessaire. Cliquez sur une équipe pour créer ou gérer son accès en 1 clic :
              </p>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-indigo-300 bg-indigo-900/50 px-3 py-1 rounded-lg border border-indigo-700/50 self-start md:self-auto">
            ⚡ Création multiple rapide
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {CANONICAL_TEAMS.map((teamName) => {
            const teamAccount = accounts.find(
              (a) =>
                a.role === "chef_equipe" &&
                (a.assignedTeam === teamName ||
                  (a.assignedTeam && a.assignedTeam.split(",").map((x) => x.trim()).includes(teamName)) ||
                  a.name.toLowerCase().includes(teamName.toLowerCase()))
            );
            const isConfigured = !!teamAccount;

            return (
              <div
                key={teamName}
                className={`p-2.5 rounded-xl border transition-all flex flex-col justify-between ${
                  isConfigured
                    ? "bg-indigo-900/40 border-indigo-500/30 hover:border-indigo-400/50"
                    : "bg-slate-800/40 border-slate-700/50 hover:border-indigo-400/40 hover:bg-slate-800/70"
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-bold text-xs text-white truncate">
                    {teamName}
                  </span>
                  {isConfigured ? (
                    <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0" title="Compte configuré">
                      <Check size={10} />
                    </span>
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Non configuré" />
                  )}
                </div>

                <div className="text-[10px] text-slate-300 truncate mb-2">
                  {isConfigured ? teamAccount.name : "À configurer"}
                </div>

                {isConfigured ? (
                  <button
                    type="button"
                    onClick={() => openEditModal(teamAccount)}
                    className="w-full py-1 px-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/60 text-[10px] font-bold text-indigo-200 border border-indigo-500/40 transition-colors cursor-pointer text-center"
                  >
                    Gérer
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const cleanSlug = teamName.toLowerCase().replace(/[^a-z0-9]/g, "");
                      openCreateModal({
                        role: "chef_equipe",
                        team: teamName,
                        name: `Chef Équipe ${teamName}`,
                        email: `chef.${cleanSlug}@italcar.com`,
                      });
                    }}
                    className="w-full py-1 px-1.5 rounded-lg bg-emerald-600/40 hover:bg-emerald-600/80 text-[10px] font-extrabold text-emerald-200 border border-emerald-500/50 transition-colors cursor-pointer text-center flex items-center justify-center gap-1"
                  >
                    <Plus size={10} />
                    <span>Créer</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Rechercher par nom, email ou équipe..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white/95 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-purple-500 shadow-2xs"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs font-bold text-slate-700 mr-1 hidden sm:inline">Filtrer par rôle :</span>
          {[
            {
              id: "all" as const,
              label: "Tous",
              icon: <Users className="w-3.5 h-3.5" />,
              activeClass: "bg-slate-900 text-white border-slate-900 shadow-sm shadow-slate-900/25",
              inactiveClass: "bg-white/90 text-slate-700 hover:bg-slate-50 border-slate-200",
            },
            {
              id: "administration" as const,
              label: "Administration",
              icon: <ShieldCheck className="w-3.5 h-3.5" />,
              activeClass: "bg-rose-600 text-white border-rose-600 shadow-sm shadow-rose-600/30",
              inactiveClass: "bg-white/90 text-rose-700 hover:bg-rose-50/80 border-rose-200",
            },
            {
              id: "chef_atelier" as const,
              label: "Chef Atelier",
              icon: <Shield className="w-3.5 h-3.5" />,
              activeClass: "bg-purple-600 text-white border-purple-600 shadow-sm shadow-purple-600/30",
              inactiveClass: "bg-white/90 text-purple-700 hover:bg-purple-50/80 border-purple-200",
            },
            {
              id: "reception" as const,
              label: "Réception",
              icon: <ClipboardList className="w-3.5 h-3.5" />,
              activeClass: "bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/30",
              inactiveClass: "bg-white/90 text-emerald-700 hover:bg-emerald-50/80 border-emerald-200",
            },
            {
              id: "chef_equipe" as const,
              label: "Chef d'Équipe",
              icon: <Wrench className="w-3.5 h-3.5" />,
              activeClass: "bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-600/30",
              inactiveClass: "bg-white/90 text-blue-700 hover:bg-blue-50/80 border-blue-200",
            },
            {
              id: "facturation" as const,
              label: "Facturation",
              icon: <Receipt className="w-3.5 h-3.5" />,
              activeClass: "bg-amber-600 text-white border-amber-600 shadow-sm shadow-amber-600/30",
              inactiveClass: "bg-white/90 text-amber-700 hover:bg-amber-50/80 border-amber-200",
            },
          ].map((item) => {
            const isSelected = roleFilter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setRoleFilter(item.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer border ${
                  isSelected ? item.activeClass : item.inactiveClass
                }`}
              >
                <span className={isSelected ? "text-white" : ""}>{item.icon}</span>
                <span className={isSelected ? "text-white" : ""}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Accounts Table */}
      <div className="bg-white/92 backdrop-blur-md rounded-2xl border border-white/60 shadow-lg flex-1 flex flex-col min-h-[400px] overflow-hidden">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Collaborateur</th>
                <th className="py-3 px-4">Identifiant / Email</th>
                <th className="py-3 px-4">Rôle & Droits d'Accès</th>
                <th className="py-3 px-4">Mot de Passe</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <p className="font-semibold">Aucun compte ne correspond à votre recherche.</p>
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc) => {
                  const roleMeta = ROLES_META[acc.role];
                  const isCurrent =
                    currentUser?.id === acc.id ||
                    (currentUser?.email &&
                      currentUser.email.toLowerCase().trim() === acc.email.toLowerCase().trim());

                  return (
                    <tr key={acc.id} className="hover:bg-purple-50/30 transition-colors">
                      {/* Name & Avatar */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                            {acc.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              {acc.name}
                              {isCurrent && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-blue-100 text-blue-700">
                                  Vous
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {acc.role === "administration"
                                ? "Direction & Administration"
                                : acc.role === "chef_atelier"
                                ? "Direction Atelier"
                                : acc.role === "reception"
                                ? `Accueil & Réception (${acc.assignedTeam || "Centre non attribué"})`
                                : `Chef d'Équipe (${acc.assignedTeam || "Atelier"})`}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-700">
                        {acc.email}
                      </td>

                      {/* Role & Assigned Team */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${roleMeta.badgeBg}`}
                          >
                            {roleMeta.badgeText}
                          </span>
                          {(acc.role === "chef_equipe" || acc.role === "reception") && (
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
                                <Wrench className="w-2.5 h-2.5 text-blue-600" />
                                {acc.role === "reception" ? "Centre" : "Équipe"} : {parseAssignedTeams(acc.assignedTeam).primary}
                              </span>
                              {acc.role === "chef_equipe" && parseAssignedTeams(acc.assignedTeam).additional.map((extra) => (
                                <span
                                  key={extra}
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200"
                                  title={`Équipe additionnelle gérée : ${extra}`}
                                >
                                  +{extra}
                                </span>
                              ))}
                            </div>
                          )}
                          {acc.customPermissions && Object.keys(acc.customPermissions).length > 0 && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200"
                              title="Ce compte bénéficie de droits personnalisés"
                            >
                              <SlidersHorizontal className="w-2.5 h-2.5 text-purple-600" />
                              <span>Droits sur mesure</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Password */}
                      <td className="py-3.5 px-4">
                        <div className="inline-flex items-center gap-2 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                          <KeyRound className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-semibold text-slate-600 text-[11px]">
                            Empreinte sécurisée
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(acc)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                            title="Modifier les informations ou le mot de passe"
                          >
                            <Edit2 size={12} />
                            <span>Modifier</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeletingAccount(acc)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors cursor-pointer"
                            title="Révoquer cet accès"
                          >
                            <Trash2 size={12} />
                            <span>Supprimer</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create or Edit Account */}
      {isModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
            <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 relative my-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {editingAccount ? "Modifier l'Accès Collaborateur" : "Donner un Nouvel Accès (6, 10...)"}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {editingAccount
                      ? "Mettre à jour les droits, les pages accessibles et l'équipe affectée"
                      : "Créez autant de comptes que nécessaire avec les droits souhaités"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2 shrink-0">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2 shrink-0">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                <span>{formSuccess}</span>
              </div>
            )}

            <form onSubmit={(e) => handleFormSubmit(e, false)} className="space-y-4 overflow-y-auto pr-1 flex-1">
              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nom & Prénom du collaborateur *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: Ahmed Trabelsi ou Chef Daily 1"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-purple-500 focus:bg-white"
                />
              </div>

              {/* Email / Username */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Identifiant ou Adresse Email de connexion *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: trabelsi@italcar.com ou trabelsi"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-purple-500 focus:bg-white font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Le collaborateur pourra se connecter avec son email, son identifiant simple ou son nom.
                </p>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Rôle de base & Profil standard *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleRoleChange("administration")}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      formRole === "administration"
                        ? "bg-rose-50 border-rose-400 ring-2 ring-rose-400/20"
                        : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <ShieldCheck className="w-4 h-4 text-rose-600" />
                      <span className="text-xs font-bold text-slate-900">Administration</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">
                      Accès complet & configuration globale
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRoleChange("chef_atelier")}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      formRole === "chef_atelier"
                        ? "bg-purple-50 border-purple-400 ring-2 ring-purple-400/20"
                        : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Shield className="w-4 h-4 text-purple-600" />
                      <span className="text-xs font-bold text-slate-900">Chef d'Atelier</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">
                      Supervision globale & accès
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRoleChange("reception")}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      formRole === "reception"
                        ? "bg-emerald-50 border-emerald-400 ring-2 ring-emerald-400/20"
                        : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <ClipboardList className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-bold text-slate-900">Réception</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">
                      Suivi des entrées & création
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRoleChange("chef_equipe")}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      formRole === "chef_equipe"
                        ? "bg-blue-50 border-blue-400 ring-2 ring-blue-400/20"
                        : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Wrench className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold text-slate-900">Chef d'Équipe</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">
                      Tableaux chargement & affectation
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRoleChange("facturation")}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      formRole === "facturation"
                        ? "bg-amber-50 border-amber-400 ring-2 ring-amber-400/20"
                        : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Receipt className="w-4 h-4 text-amber-600" />
                      <span className="text-xs font-bold text-slate-900">Facturation</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">
                      Validation paiement, facturation & sortie
                    </p>
                  </button>
                </div>
              </div>

              {/* Équipe atelier ou centre Réception attribué */}
              {(formRole === "chef_equipe" || formRole === "chef_atelier" || formRole === "facturation" || formRole === "reception") && (
                <div className="p-3 bg-blue-50/80 rounded-2xl border border-blue-200/80 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-blue-600" />
                      <span>{formRole === "reception" ? "Centre de réception attribué *" : "Équipe d'Atelier Principale *"}</span>
                    </label>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-200/70 text-blue-800">
                      {formRole === "reception" ? "Accès réception" : "Équipe principale"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {(formRole === "reception" ? ["R18", "R16"] : CANONICAL_TEAMS).map((teamName) => {
                      const isSelected = formTeam === teamName;
                      return (
                        <button
                          key={teamName}
                          type="button"
                          onClick={() => {
                            setFormTeam(teamName);
                            setFormAdditionalTeams((prev) => prev.filter((t) => t !== teamName));
                          }}
                          className={`px-2 py-1.5 rounded-xl text-xs font-bold transition-all text-center border cursor-pointer ${
                            isSelected
                              ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                              : "bg-white text-slate-700 hover:bg-blue-100/50 border-blue-200/60"
                          }`}
                        >
                          {teamName}
                        </button>
                      );
                    })}
                    {formRole === "reception" && (
                      <button
                        type="button"
                        onClick={() => setFormTeam("")}
                        className={`px-2 py-1.5 rounded-xl text-xs font-bold transition-all text-center border cursor-pointer ${
                          formTeam !== "R18" && formTeam !== "R16"
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                            : "bg-white text-slate-700 hover:bg-indigo-100/50 border-indigo-200/60"
                        }`}
                      >
                        Autre centre
                      </button>
                    )}
                    {formRole === "chef_equipe" && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormTeam("Toutes");
                          setFormAdditionalTeams([]);
                        }}
                        className={`px-2 py-1.5 rounded-xl text-xs font-bold transition-all text-center border cursor-pointer ${
                          formTeam === "Toutes"
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                            : "bg-white text-slate-700 hover:bg-indigo-100/50 border-indigo-200/60"
                        }`}
                      >
                        Toutes
                      </button>
                    )}
                  </div>

                  {formRole === "reception" && formTeam !== "R18" && formTeam !== "R16" && (
                    <input
                      type="text"
                      autoFocus
                      placeholder="Code du centre, ex. R10"
                      value={formTeam}
                      onChange={(e) => setFormTeam(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 rounded-xl border border-blue-200 bg-white text-xs font-bold text-slate-800 uppercase focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  )}

                  {/* Équipes supplémentaires gérées (ex: Service Rapide) */}
                  {(formRole === "chef_equipe" || formRole === "chef_atelier" || formRole === "facturation") && formTeam !== "Toutes" && (
                    <div className="pt-2 border-t border-blue-200/70 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-blue-950 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Équipes supplémentaires gérées (ex: Service Rapide) :</span>
                        </span>
                        {formAdditionalTeams.length > 0 && (
                          <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full border border-indigo-200">
                            +{formAdditionalTeams.length} équipe{formAdditionalTeams.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {CANONICAL_TEAMS.filter((t) => t !== formTeam).map((addTeam) => {
                          const isChecked = formAdditionalTeams.includes(addTeam);
                          return (
                            <button
                              key={addTeam}
                              type="button"
                              onClick={() => toggleAdditionalTeam(addTeam)}
                              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-1.5 transition-all cursor-pointer border ${
                                isChecked
                                  ? "bg-indigo-600 text-white border-indigo-600 shadow-xs font-bold"
                                  : "bg-white/95 text-slate-700 border-slate-200 hover:bg-indigo-50/70 hover:border-indigo-300"
                              }`}
                            >
                              <span className="truncate">{addTeam}</span>
                              {isChecked ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-white shrink-0" />
                              ) : (
                                <Plus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div className="text-[10px] text-indigo-900 bg-indigo-50/90 p-2.5 rounded-xl border border-indigo-200/80 leading-relaxed space-y-1">
                        <p>
                          💡 <strong>Gestion multi-équipes :</strong> Ce {formRole === "chef_atelier" ? "Chef d’Atelier" : formRole === "facturation" ? "service Facturation" : "Chef d’Équipe"} gérera simultanément{" "}
                          <strong className="text-blue-700 underline underline-offset-2">{formTeam}</strong>
                          {formAdditionalTeams.length > 0 ? (
                            <>
                              {" "}et <strong className="text-indigo-700 underline underline-offset-2">{formAdditionalTeams.join(", ")}</strong>.
                            </>
                          ) : (
                            <>. Cliquez sur une équipe additionnelle ci-dessus pour lui confier la gestion (ex: <em>Service Rapide</em>).</>
                          )}
                        </p>
                        <p className="text-slate-600">
                          Les ordres de réparation, véhicules et techniciens de ces équipes seront accessibles avec ce seul compte.
                        </p>
                      </div>
                    </div>
                  )}

                  {formRole === "reception" && (
                    <p className="text-[10px] text-blue-700 leading-tight">
                      Cet agent Réception sera lié au centre <strong>{formTeam || "à renseigner"}</strong>.
                    </p>
                  )}
                </div>
              )}

              {/* Section Personnalisation des Droits & Accès Granulaires */}
              <div className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/90 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-purple-600 shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-slate-900 block leading-tight">
                        Autorisations & Droits d'Accès
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Précisez les pages à regarder et les actions de transfert autorisées
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 self-start sm:self-center">
                    {isCustomized ? (
                      <button
                        type="button"
                        onClick={resetToRoleDefaults}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold text-purple-700 bg-purple-100 hover:bg-purple-200 border border-purple-300 transition-colors cursor-pointer"
                        title="Rétablir les permissions standards de ce rôle"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Rétablir par défaut</span>
                      </button>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                        Droits standards : {ROLES_META[formRole].badgeText}
                      </span>
                    )}
                  </div>
                </div>

                {/* 1. CE QU'IL PEUT REGARDER */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-blue-900 uppercase tracking-wide">
                    <Eye className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>1. Pages & Vues (Ce qu'il peut Regarder) :</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {VIEW_PERMISSIONS.map((perm) => {
                      const Icon = perm.icon;
                      const isChecked = Boolean(formCustomPermissions[perm.key]);
                      return (
                        <label
                          key={perm.key}
                          className={`flex items-start gap-2.5 p-2 rounded-xl border text-left cursor-pointer transition-all ${
                            isChecked
                              ? "bg-blue-50/70 border-blue-300 text-blue-950 shadow-2xs"
                              : "bg-white border-slate-200/80 text-slate-500 hover:bg-slate-100/60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => togglePermission(perm.key)}
                            className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0 cursor-pointer"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <Icon className={`w-3.5 h-3.5 shrink-0 ${isChecked ? "text-blue-600" : "text-slate-400"}`} />
                              <span className={`text-xs font-bold ${isChecked ? "text-slate-900" : "text-slate-600"}`}>
                                {perm.label}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                              {perm.desc}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* 2. CE QU'IL PEUT TRANSFÉRER OU MODIFIER */}
                <div className="space-y-1.5 pt-2 border-t border-slate-200/70">
                  <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-purple-900 uppercase tracking-wide">
                    <ArrowRightLeft className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span>2. Actions & Atelier (Ce qu'il peut Transférer ou Modifier) :</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {ACTION_PERMISSIONS.map((perm) => {
                      const Icon = perm.icon;
                      const isChecked = Boolean(formCustomPermissions[perm.key]);
                      return (
                        <label
                          key={perm.key}
                          className={`flex items-start gap-2.5 p-2 rounded-xl border text-left cursor-pointer transition-all ${
                            isChecked
                              ? "bg-purple-50/70 border-purple-300 text-purple-950 shadow-2xs"
                              : "bg-white border-slate-200/80 text-slate-500 hover:bg-slate-100/60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => togglePermission(perm.key)}
                            className="mt-0.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 shrink-0 cursor-pointer"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <Icon className={`w-3.5 h-3.5 shrink-0 ${isChecked ? "text-purple-600" : "text-slate-400"}`} />
                              <span className={`text-xs font-bold ${isChecked ? "text-slate-900" : "text-slate-600"}`}>
                                {perm.label}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                              {perm.desc}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    {editingAccount ? "Nouveau mot de passe (facultatif)" : "Mot de passe *"}
                  </label>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="text-[11px] font-bold text-purple-600 hover:text-purple-800 flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-purple-500" />
                    Générer automatique
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="password"
                    required={!editingAccount}
                    placeholder={editingAccount ? "Laisser vide pour conserver le mot de passe actuel" : "Saisissez un mot de passe"}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-purple-500 focus:bg-white"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Submit / Cancel Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-4 border-t border-slate-100">
                <div className="text-[11px] font-semibold text-slate-500">
                  {sessionCreatedCount > 0 && (
                    <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      {sessionCreatedCount} compte{sessionCreatedCount > 1 ? "s" : ""} créé{sessionCreatedCount > 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Fermer
                  </button>

                  {!editingAccount && (
                    <button
                      type="button"
                      onClick={(e) => handleFormSubmit(e, true)}
                      className="px-3.5 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5"
                      title="Enregistre ce compte et garde la fenêtre ouverte pour créer le prochain (6, 10...)"
                    >
                      <Plus size={13} />
                      <span>Créer & Ajouter un autre</span>
                    </button>
                  )}

                  <button
                    type="submit"
                    className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-xs font-extrabold text-white shadow-md shadow-purple-600/25 transition-all cursor-pointer"
                  >
                    {editingAccount ? "Enregistrer les modifications" : "Créer & Terminer"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {deletingAccount &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 text-center">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${
                  currentUser?.id === deletingAccount.id ||
                  (currentUser?.email &&
                    currentUser.email.toLowerCase().trim() ===
                      deletingAccount.email.toLowerCase().trim())
                    ? "bg-amber-100 text-amber-600"
                    : "bg-red-100 text-red-600"
                }`}
              >
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1">
                {currentUser?.id === deletingAccount.id ||
                (currentUser?.email &&
                  currentUser.email.toLowerCase().trim() ===
                    deletingAccount.email.toLowerCase().trim())
                  ? "Supprimer votre propre compte ?"
                  : `Révoquer l'accès de ${deletingAccount.name} ?`}
              </h3>
              <p className="text-xs text-slate-500 mb-3 font-mono">
                {deletingAccount.email}
              </p>
              <p
                className={`text-xs p-3 rounded-xl mb-5 font-semibold text-left ${
                  currentUser?.id === deletingAccount.id ||
                  (currentUser?.email &&
                    currentUser.email.toLowerCase().trim() ===
                      deletingAccount.email.toLowerCase().trim())
                    ? "bg-amber-50 text-amber-900 border border-amber-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                {currentUser?.id === deletingAccount.id ||
                (currentUser?.email &&
                  currentUser.email.toLowerCase().trim() ===
                    deletingAccount.email.toLowerCase().trim())
                  ? "⚠️ Attention : vous supprimez le compte avec lequel vous êtes actuellement connecté. Si vous confirmez, vous serez immédiatement déconnecté de l'application."
                  : "Ce collaborateur ne pourra plus se connecter à l'application. Cette action supprime définitivement cet accès."}
              </p>
              <div className="flex items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setDeletingAccount(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer flex-1"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(deletingAccount)}
                  className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold text-white shadow-md shadow-red-600/25 cursor-pointer flex-1"
                >
                  Oui, supprimer
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
