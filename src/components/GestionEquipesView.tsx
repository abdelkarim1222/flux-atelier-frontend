import { useState, useMemo, useEffect } from "react";
import {
  Table,
  Calculator,
  ChevronDown,
  UserPlus,
  Edit2,
  Trash2,
  Search,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Lock,
  X,
  HardHat,
  Crown,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  type EquipeMember,
  DEFAULT_EQUIPE_MAPPINGS,
  getCustomEquipeMembers,
  saveCustomEquipeMembers,
  resetCustomEquipeMembers,
  fetchEquipeSheetData,
  normalizePersonName,
  getMemberTeams,
} from "../services/database";

import {
  CANONICAL_TEAMS,
  normalizeTeamName,
  getCustomTeams,
  addCustomTeam,
  removeCustomTeam,
} from "../config/teams";

// Layout columns réparties en trois colonnes
const COLUMN_1_TEAMS = ["Daily1", "Service Rapide"];
const COLUMN_2_TEAMS = ["Daily2", "Lourd"];
const COLUMN_3_TEAMS = ["Changan", "Carrosserie", "Elictrique"];

const PRESET_POSTES = [
  "CHEF EQUIPE",
  "MECANICIEN",
  "ELECTRICIEN",
  "TOLLIER",
  "PEINTRE",
  "APPRENTI",
];

export default function GestionEquipesView() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === "administration";
  const isChefAtelier = currentUser?.role === "chef_atelier";
  const canView = isAdmin || isChefAtelier;

  const [members, setMembers] = useState<EquipeMember[]>(() => {
    const custom = getCustomEquipeMembers();
    return custom && custom.length > 0 ? custom : DEFAULT_EQUIPE_MAPPINGS;
  });

  const [customTeams, setCustomTeams] = useState<string[]>(() => getCustomTeams());

  const [search, setSearch] = useState("");
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>("all");

  // Modal State for Member Add/Edit
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<EquipeMember | null>(null);
  const [formTeam, setFormTeam] = useState("Daily1");
  const [formMatricule, setFormMatricule] = useState("");
  const [formNom, setFormNom] = useState("");
  const [formPoste, setFormPoste] = useState("MECANICIEN");
  const [formTravailleSamedi, setFormTravailleSamedi] = useState(false);
  const [formEquipesSupplementaires, setFormEquipesSupplementaires] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Modal State for New Team
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamError, setNewTeamError] = useState<string | null>(null);

  // Delete State
  const [deletingMember, setDeletingMember] = useState<EquipeMember | null>(null);

  // Chargement initial des équipes depuis PostgreSQL ou le cache local
  useEffect(() => {
    const custom = getCustomEquipeMembers();
    if (!custom) {
      fetchEquipeSheetData()
        .then((res) => {
          if (res.members && res.members.length > 0) {
            setMembers(res.members);
          }
        })
        .catch(() => {});
    }
  }, []);

  // Écouter les mises à jour externes ou synchronisations
  useEffect(() => {
    const handleUpdate = () => {
      const custom = getCustomEquipeMembers();
      if (custom && custom.length > 0) {
        setMembers(custom);
      }
      setCustomTeams(getCustomTeams());
    };
    window.addEventListener("flux_equipes_updated", handleUpdate);
    window.addEventListener("flux_teams_updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("flux_equipes_updated", handleUpdate);
      window.removeEventListener("flux_teams_updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  // Save to localStorage whenever members change
  const persistMembers = (updated: EquipeMember[]) => {
    setMembers(updated);
    saveCustomEquipeMembers(updated);
  };

  const handleResetTeams = async () => {
    if (
      window.confirm(
        "Voulez-vous réinitialiser les tableaux aux 7 équipes d'origine de PostgreSQL (Daily1, Daily2, Changan, Service Rapide, Lourd, Carrosserie, Elictrique) ?"
    )
    ) {
      try {
        await resetCustomEquipeMembers();
        setCustomTeams([]);
        setMembers(DEFAULT_EQUIPE_MAPPINGS);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Impossible de réinitialiser les équipes dans PostgreSQL.");
      }
    }
  };

  // Open modal for creating a new member
  const openCreateModal = (targetTeam?: string) => {
    if (!isAdmin) return;
    setEditingMember(null);
    setFormTeam(targetTeam || (selectedTeamFilter !== "all" ? selectedTeamFilter : "Daily1"));
    setFormMatricule("");
    setFormNom("");
    setFormPoste("MECANICIEN");
    setFormTravailleSamedi(false);
    setFormEquipesSupplementaires([]);
    setFormError(null);
    setFormSuccess(null);
    setIsMemberModalOpen(true);
  };

  // Open modal for editing a member
  const openEditModal = (member: EquipeMember) => {
    if (!isAdmin) return;
    setEditingMember(member);
    setFormTeam(member.team);
    setFormMatricule(member.matricule || "");
    setFormNom(member.name);
    setFormPoste(member.poste || "MECANICIEN");
    setFormTravailleSamedi(member.travailleSamedi === true);
    setFormEquipesSupplementaires(member.equipesSupplementaires || []);
    setFormError(null);
    setFormSuccess(null);
    setIsMemberModalOpen(true);
  };

  // Handle Form Submit for Member
  const handleMemberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setFormError("Action réservée au profil Administration.");
      return;
    }

    const cleanNom = formNom.trim();
    const cleanMat = formMatricule.trim();
    const cleanTeam = formTeam.trim() || "Daily1";
    const cleanPoste = formPoste.trim() || "MECANICIEN";

    if (!cleanNom) {
      setFormError("Veuillez renseigner le nom complet du collaborateur.");
      return;
    }

    const newMemberData: EquipeMember = {
      name: cleanNom,
      matricule: cleanMat,
      team: cleanTeam,
      poste: cleanPoste,
      travailleSamedi: formTravailleSamedi,
      equipesSupplementaires: formEquipesSupplementaires.filter((team) => team !== cleanTeam),
    };

    if (editingMember) {
      const updated = members.map((m) => {
        const isSameMat = Boolean(editingMember.matricule && m.matricule && m.matricule.trim() === editingMember.matricule.trim());
        const isSameName = normalizePersonName(m.name) === normalizePersonName(editingMember.name);
        const isSameTeam = normalizeTeamName(m.team) === normalizeTeamName(editingMember.team);
        return (isSameMat || (isSameName && isSameTeam)) ? newMemberData : m;
      });
      persistMembers(updated);
      setFormSuccess("Membre mis à jour avec succès !");
    } else {
      const updated = [...members, newMemberData];
      persistMembers(updated);
      setFormSuccess("Nouveau collaborateur ajouté à l'équipe avec succès !");
    }

    setTimeout(() => {
      setIsMemberModalOpen(false);
      setFormSuccess(null);
    }, 900);
  };

  // Handle Create New Team
  const handleCreateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTeam = newTeamName.trim();
    if (!cleanTeam) {
      setNewTeamError("Veuillez saisir un nom d'équipe.");
      return;
    }

    const exists = allTeams.some((t) => t.toLowerCase() === cleanTeam.toLowerCase());
    if (exists) {
      setNewTeamError("Cette équipe existe déjà.");
      return;
    }

    // Persister la nouvelle équipe immédiatement
    const updatedTeams = addCustomTeam(cleanTeam);
    setCustomTeams(updatedTeams);

    setIsTeamModalOpen(false);
    setNewTeamName("");
    setNewTeamError(null);

    // Ouvrir le formulaire pour ajouter le 1er collaborateur dans cette nouvelle équipe
    openCreateModal(cleanTeam);
  };

  // Handle Delete Member
  const handleDeleteMember = () => {
    if (!isAdmin || !deletingMember) return;
    const updated = members.filter((m) => {
      const isSameMat = Boolean(deletingMember.matricule && m.matricule && m.matricule.trim() === deletingMember.matricule.trim());
      const isSameName = normalizePersonName(m.name) === normalizePersonName(deletingMember.name);
      const isSameTeam = normalizeTeamName(m.team) === normalizeTeamName(deletingMember.team);
      return !(isSameMat || (isSameName && isSameTeam));
    });
    persistMembers(updated);
    setDeletingMember(null);
  };

  // All unique teams (Canoniques + Personnalisées + Équipes des membres)
  const allTeams = useMemo(() => {
    const set = new Set<string>(CANONICAL_TEAMS);
    customTeams.forEach((t) => {
      if (t && t.trim()) set.add(t.trim());
    });
    members.forEach((m) => {
      getMemberTeams(m).forEach((team) => set.add(team));
    });
    // JMC est une compétence atelier utilisable sans créer une nouvelle fiche technicien.
    set.add("JMC");
    return Array.from(set);
  }, [members, customTeams]);

  // Statistics
  const stats = useMemo(() => {
    const chefs = members.filter((m) => m.poste.toUpperCase().includes("CHEF"));
    return {
      totalMembers: members.length,
      totalChefs: chefs.length,
      totalTeams: allTeams.length,
    };
  }, [members, allTeams]);

  // Group teams into 3 columns réparties en colonnes
  const columns = useMemo(() => {
    const col1: string[] = [];
    const col2: string[] = [];
    const col3: string[] = [];

    allTeams.forEach((team) => {
      if (COLUMN_1_TEAMS.includes(team)) {
        col1.push(team);
      } else if (COLUMN_2_TEAMS.includes(team)) {
        col2.push(team);
      } else if (COLUMN_3_TEAMS.includes(team)) {
        col3.push(team);
      } else {
        // Extra custom team: place into the shortest column
        if (col1.length <= col2.length && col1.length <= col3.length) {
          col1.push(team);
        } else if (col2.length <= col3.length) {
          col2.push(team);
        } else {
          col3.push(team);
        }
      }
    });

    // Ensure canonical ordering within columns
    const sortInCol = (arr: string[], reference: string[]) => {
      arr.sort((a, b) => {
        const idxA = reference.indexOf(a);
        const idxB = reference.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
      });
    };

    sortInCol(col1, COLUMN_1_TEAMS);
    sortInCol(col2, COLUMN_2_TEAMS);
    sortInCol(col3, COLUMN_3_TEAMS);

    return [col1, col2, col3];
  }, [allTeams]);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-900/10 backdrop-blur-xs">
        <div className="w-16 h-16 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 mb-4 shadow-sm">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-900 mb-2">Accès Restreint</h2>
        <p className="text-sm text-slate-600 max-w-md mb-6 leading-relaxed">
          La consultation et la gestion des tableaux d'équipes et techniciens est réservée aux profils <strong>Administration</strong> et <strong>Chef d'Atelier</strong>.
        </p>
      </div>
    );
  }

  // Render a Single Team Table comme la maquette
  const renderTeamTable = (teamName: string) => {
    const teamMembers = members.filter(
      (m) => getMemberTeams(m).some((team) => team.toLowerCase() === teamName.toLowerCase())
    );

    const query = search.trim().toLowerCase();

    return (
      <div
        key={teamName}
        className="bg-white rounded-xl border border-slate-300 shadow-md overflow-hidden flex flex-col transition-all hover:shadow-lg"
      >
        {/* Navy Blue Header Banner réparties en colonnes screenshot */}
        <div className="bg-[#0b3c70] text-white px-3 py-2 flex items-center justify-between border-b border-[#082a50]">
          <div className="flex items-center gap-2">
            {/* Sheet / Table Icon Badge */}
            <div className="flex items-center gap-1 bg-white/20 px-1.5 py-0.5 rounded text-white text-[11px] font-bold shadow-xs">
              <Table size={13} className="text-blue-200" />
              <Calculator size={11} className="text-blue-100" />
            </div>
            {/* Centered Team Name */}
            <h3 className="font-black text-sm tracking-wider text-white uppercase drop-shadow-xs">
              {teamName}
            </h3>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-extrabold bg-white/20 text-white px-2 py-0.5 rounded-full">
              {teamMembers.length} {teamMembers.length > 1 ? "membres" : "membre"}
            </span>
            <button
              type="button"
              onClick={() => openCreateModal(teamName)}
              className="p-1 rounded bg-white/15 hover:bg-white/30 text-white transition-colors cursor-pointer"
              title={`Ajouter un technicien à ${teamName}`}
            >
              <Plus size={13} />
            </button>
            {!CANONICAL_TEAMS.some((c) => c.toLowerCase() === teamName.toLowerCase()) && teamMembers.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Supprimer l'équipe vide "${teamName}" ?`)) {
                    const updated = removeCustomTeam(teamName);
                    setCustomTeams(updated);
                  }
                }}
                className="p-1 rounded bg-white/15 hover:bg-red-500/80 text-white transition-colors cursor-pointer"
                title={`Supprimer l'équipe ${teamName}`}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Table Container */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#e7edf6] text-slate-700 text-[11px] font-extrabold border-b border-slate-300 select-none">
                <th className="py-2 px-3 border-r border-slate-300 w-[26%] text-center">
                  <div className="flex items-center justify-center gap-1">
                    <span>N°Matricule</span>
                    <ChevronDown size={11} className="text-slate-500" />
                  </div>
                </th>
                <th className="py-2 px-3 border-r border-slate-300 w-[46%]">
                  <div className="flex items-center justify-between">
                    <span>NOM DE Technicien</span>
                    <ChevronDown size={11} className="text-slate-500" />
                  </div>
                </th>
                <th className="py-2 px-3 w-[28%]">
                  <div className="flex items-center justify-between">
                    <span>Poste</span>
                    <ChevronDown size={11} className="text-slate-500" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {teamMembers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-slate-400 italic text-xs">
                    Aucun collaborateur enregistré dans cette équipe.
                  </td>
                </tr>
              ) : (
                teamMembers.map((member, idx) => {
                  const isChef = member.poste.toUpperCase().includes("CHEF");
                  const isMatch =
                    query &&
                    (member.name.toLowerCase().includes(query) ||
                      member.matricule.toLowerCase().includes(query) ||
                      member.poste.toLowerCase().includes(query));

                  return (
                    <tr
                      key={`${member.matricule}_${member.name}_${idx}`}
                      className={`group transition-colors ${
                        isMatch
                          ? "bg-amber-100 font-bold"
                          : isChef
                          ? "bg-blue-50/40 hover:bg-blue-50"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      {/* Matricule */}
                      <td className="py-2 px-2.5 border-r border-slate-200 font-mono font-extrabold text-slate-800 text-center text-xs">
                        {member.matricule || "-"}
                      </td>

                      {/* NOM DE Technicien */}
                      <td className="py-2 px-3 border-r border-slate-200 font-bold text-slate-900 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <span className="block truncate">{member.name}</span>
                            {member.equipesSupplementaires && member.equipesSupplementaires.length > 0 && (
                              <span className="block truncate text-[9px] font-semibold text-blue-600">
                                Aussi : {member.equipesSupplementaires.join(", ")}
                              </span>
                            )}
                          </div>
                          {/* Actions on hover */}
                          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity shrink-0 ml-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(member)}
                              className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-200 transition-colors cursor-pointer"
                              title="Modifier"
                            >
                              <Edit2 size={11} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingMember(member)}
                              className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors cursor-pointer"
                              title="Supprimer"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Poste */}
                      <td className="py-2 px-3 text-xs">
                        {isChef ? (
                          <div className="flex items-center gap-1 text-blue-900 font-black text-[11px] uppercase tracking-tight">
                            <Crown size={11} className="text-amber-500 fill-amber-500" />
                            <span>CHEF EQUIPE</span>
                          </div>
                        ) : (
                          <span className="font-semibold text-slate-700 text-[11px] uppercase">
                            {member.poste || "MECANICIEN"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Quick Add Row */}
        <div className="p-1.5 bg-slate-50/80 border-t border-slate-200 text-center">
          <button
            type="button"
            onClick={() => openCreateModal(teamName)}
            className="w-full py-1 px-2 rounded-lg text-[11px] font-bold text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1 cursor-pointer border border-dashed border-slate-200 hover:border-blue-300"
          >
            <Plus size={12} />
            <span>Ajouter dans {teamName}</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/10 backdrop-blur-xs p-4 lg:p-6 overflow-y-auto">
      {/* Top Header Card */}
      <div className="bg-white/95 backdrop-blur-md rounded-2xl p-4 lg:p-5 border border-white/60 shadow-lg mb-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-700 to-indigo-900 flex items-center justify-center text-white shadow-md shadow-blue-700/25">
              <Table className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  Gestion des Équipes & Techniciens
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
                  <ShieldCheck size={12} />
                  Équipes atelier
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Organisez les collaborateurs par équipe, matricule et fonction.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsTeamModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nouvelle Équipe</span>
            </button>

            <button
              type="button"
              onClick={() => openCreateModal()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-600/20 transition-all cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Ajouter un Technicien</span>
            </button>

            <button
              type="button"
              onClick={handleResetTeams}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all cursor-pointer"
              title="Revenir aux équipes configurées par défaut"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Réinitialiser les équipes</span>
            </button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
            <button
              type="button"
              onClick={() => setSelectedTeamFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedTeamFilter === "all"
                  ? "bg-[#0b3c70] text-white shadow-2xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Toutes ({stats.totalTeams})
            </button>
            {allTeams.map((t) => {
              const count = members.filter((m) => m.team.toLowerCase() === t.toLowerCase()).length;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSelectedTeamFilter(t)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedTeamFilter === t
                      ? "bg-[#0b3c70] text-white shadow-2xs"
                      : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  {t} ({count})
                </button>
              );
            })}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filtrer matricule, nom, poste..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* 3-Column Layout Matching the PostgreSQL Screenshot */}
      {selectedTeamFilter !== "all" ? (
        // When filtered by a single team
        <div className="max-w-xl mx-auto w-full">
          {renderTeamTable(selectedTeamFilter)}
        </div>
      ) : (
        // Full 3 Columns Grid par équipe
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
          {/* Column 1: Daily1, Service Rapide */}
          <div className="flex flex-col gap-5">
            {columns[0].map((t) => renderTeamTable(t))}
          </div>

          {/* Column 2: Daily2, Lourd */}
          <div className="flex flex-col gap-5">
            {columns[1].map((t) => renderTeamTable(t))}
          </div>

          {/* Column 3: Changan, Carrosserie, Elictrique */}
          <div className="flex flex-col gap-5">
            {columns[2].map((t) => renderTeamTable(t))}
          </div>
        </div>
      )}

      {/* Add / Edit Member Modal */}
      {isMemberModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-[#0b3c70] text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center border border-white/20">
                  <HardHat className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">
                    {editingMember ? "Modifier le Technicien" : "Ajouter un Technicien"}
                  </h3>
                  <p className="text-xs text-blue-200 font-medium">Tableaux ÉQUIPE (PostgreSQL)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMemberModalOpen(false)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                <span>{formSuccess}</span>
              </div>
            )}

            <form onSubmit={handleMemberSubmit} className="p-6 space-y-4">
              {/* Équipe */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tableau Équipe de rattachement *
                </label>
                <select
                  value={formTeam}
                  onChange={(e) => setFormTeam(e.target.value)}
                  className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {allTeams.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  {!allTeams.some((t) => t.toLowerCase() === formTeam.toLowerCase()) && formTeam && (
                    <option value={formTeam}>
                      {formTeam}
                    </option>
                  )}
                </select>
              </div>

              {/* N° Matricule */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  N° Matricule (ex: 8701, 1214)
                </label>
                <input
                  type="text"
                  placeholder="ex: 8701"
                  value={formMatricule}
                  onChange={(e) => setFormMatricule(e.target.value)}
                  className="w-full text-xs font-mono font-bold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* NOM DE Technicien */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  NOM DE Technicien (Nom & Prénom) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: WAJIH TOUIL"
                  value={formNom}
                  onChange={(e) => setFormNom(e.target.value)}
                  className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Poste */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Poste / Rôle technique *
                </label>
                <select
                  value={formPoste}
                  onChange={(e) => setFormPoste(e.target.value)}
                  className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {PRESET_POSTES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formTravailleSamedi}
                  onChange={(e) => setFormTravailleSamedi(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Travaille le samedi (08:00 à 12:30)
              </label>

              <div>
                <p className="mb-1.5 text-xs font-bold text-slate-700">Équipes / spécialités supplémentaires</p>
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {allTeams.filter((team) => team !== formTeam).map((team) => (
                    <label key={team} className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formEquipesSupplementaires.includes(team)}
                        onChange={(e) => setFormEquipesSupplementaires((current) =>
                          e.target.checked ? [...current, team] : current.filter((value) => value !== team)
                        )}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      {team}
                    </label>
                  ))}
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsMemberModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#0b3c70] hover:bg-[#082a50] rounded-xl shadow-md transition-all cursor-pointer"
                >
                  {editingMember ? "Enregistrer" : "Ajouter le technicien"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Team Modal */}
      {isTeamModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 bg-[#0b3c70] text-white">
              <h3 className="text-sm font-black tracking-tight">Ajouter un nouveau Tableau Équipe</h3>
              <button
                type="button"
                onClick={() => setIsTeamModalOpen(false)}
                className="p-1 text-white/80 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {newTeamError && (
              <div className="mx-5 mt-3 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{newTeamError}</span>
              </div>
            )}

            <form onSubmit={handleCreateTeam} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nom de l'équipe (ex: Daily3, Pneumatique)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nom de l'équipe..."
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsTeamModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-[#0b3c70] hover:bg-[#082a50] rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Créer l'équipe
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-black text-slate-900 mb-1">Confirmer la suppression</h3>
            <p className="text-xs text-slate-500 mb-4">
              Voulez-vous retirer <strong>{deletingMember.name}</strong> ({deletingMember.matricule}) de l'équipe{" "}
              <strong>{deletingMember.team}</strong> ?
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setDeletingMember(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleDeleteMember}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm transition-all cursor-pointer"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
