import { useState, useEffect, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Pencil,
  Car,
  User,
  Calendar,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Search,
  MapPin,
  Activity,
  Users,
} from "lucide-react";
import {
  modifierDossierEntree,
  isGoogleSheetWriteConfigured,
  searchVehicleByVin,
  type VinVehicleInfo,
} from "../services/googleSheets";
import { getAllDestinationTeams } from "../config/teams";
import type { UnifiedReceptionRow } from "./SuiviEntreesTable";

interface ModifierEntreeModalProps {
  isOpen: boolean;
  row: UnifiedReceptionRow | null;
  onClose: () => void;
  onSuccess: (updatedNoOr?: string) => void;
}

const CS_OPTIONS = ["R10", "R09", "R18", "R16"];

const ETAT_OPTIONS = [
  "Attente réparation",
  "En cours",
  "Attente accord",
  "Attente pièces",
  "Attente lavage",
  "Prêt / Fini",
  "Livraison au client",
  "Livré",
];

export default function ModifierEntreeModal({
  isOpen,
  row,
  onClose,
  onSuccess,
}: ModifierEntreeModalProps) {
  const [formData, setFormData] = useState({
    noOr: "",
    cs: "R10",
    chassis: "",
    codeClient: "",
    nomClient: "",
    dateEntreeHeure: "",
    marque: "IVECO",
    modele: "",
    categorie: "",
    etat: "Attente réparation",
    equipe: "Daily",
    emplacement: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isSearchingVin, setIsSearchingVin] = useState(false);
  const [vinLookupFound, setVinLookupFound] = useState<VinVehicleInfo | null>(null);

  // Sync form data when row changes or modal opens
  useEffect(() => {
    if (row && isOpen) {
      setFormData({
        noOr: row.noOr || "",
        cs: row.cs || "R10",
        chassis: row.chassis || "",
        codeClient: row.codeClient || "",
        nomClient: row.nomClient || "",
        dateEntreeHeure: row.dateEntreeHeure || "",
        marque: row.marque || "IVECO",
        modele: row.modele || "",
        categorie: row.categorie || "",
        etat: row.etat || "Attente réparation",
        equipe: row.equipe && row.equipe !== "-" ? row.equipe : "Daily",
        emplacement: row.emplacement || "",
      });
      setError("");
      setSuccess(false);
      setVinLookupFound(null);
    }
  }, [row, isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !loading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen || !row) return null;

  const handleManualVinLookup = async () => {
    const cleanChassis = formData.chassis.trim().toUpperCase();
    if (cleanChassis.length < 5) {
      setError("Veuillez saisir au moins 5 caractères du N° Châssis pour la recherche.");
      return;
    }

    try {
      setIsSearchingVin(true);
      setError("");
      const result = await searchVehicleByVin(cleanChassis);
      if (result) {
        setVinLookupFound(result);
        setFormData((prev) => ({
          ...prev,
          marque: result.marque || prev.marque,
          modele: result.modele || prev.modele,
          categorie: result.categorie || prev.categorie,
          codeClient: result.codeClient || prev.codeClient,
          nomClient: result.nomClient || prev.nomClient,
        }));
      } else {
        setError(`Châssis "${cleanChassis}" non trouvé dans l'onglet VIN.`);
      }
    } catch {
      setError("Erreur lors de la recherche dans l'onglet VIN.");
    } finally {
      setIsSearchingVin(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!formData.noOr.trim()) {
      setError("Le N° OR est obligatoire.");
      return;
    }
    if (!formData.chassis.trim()) {
      setError("Le N° de Châssis (VIN) est obligatoire.");
      return;
    }

    if (!isGoogleSheetWriteConfigured()) {
      setError(
        "L'URL d'écriture Google Sheets n'est pas configurée. Veuillez renseigner VITE_SHEET_WRITE_URL dans la synchronisation."
      );
      return;
    }

    try {
      setLoading(true);
      await modifierDossierEntree({
        noOr: formData.noOr.trim(),
        cs: formData.cs.trim(),
        chassis: formData.chassis.trim().toUpperCase(),
        codeClient: formData.codeClient.trim(),
        nomClient: formData.nomClient.trim() || "Client non renseigné",
        dateEntreeHeure: formData.dateEntreeHeure.trim() || row.dateEntreeHeure || "",
        marque: formData.marque.trim() || "IVECO",
        modele: formData.modele.trim() || "-",
        categorie: formData.categorie.trim() || "-",
        etat: formData.etat.trim(),
        equipe: formData.equipe.trim(),
        emplacement: formData.emplacement.trim(),
        origNo: row.noOr,
        origCs: row.cs,
        origChassis: row.chassis,
        rowSuivi: row.suiviRowNumber,
        rowNumber: row.chargementRowNumber,
      });

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onSuccess(formData.noOr.trim());
        onClose();
      }, 1000);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erreur lors de la modification du dossier dans Google Sheets."
      );
    } finally {
      setLoading(false);
    }
  };

  // Ensure current CS is available in options even if legacy
  const availableCs = Array.from(new Set([formData.cs, ...CS_OPTIONS])).filter(Boolean);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-modifier-entree-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] my-auto animate-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white/10 text-blue-200 shadow-xs">
              <Pencil className="w-5 h-5" />
            </div>
            <div>
              <h3
                id="modal-modifier-entree-title"
                className="text-base font-bold text-white flex items-center gap-2"
              >
                Modifier Dossier Entrée
                <span className="inline-flex items-center gap-1 text-[10px] bg-blue-400/20 text-blue-200 border border-blue-400/30 px-2 py-0.5 rounded-full font-mono font-bold">
                  OR: {row.noOr}
                </span>
              </h3>
              <p className="text-xs text-blue-100/80">
                Met à jour la ligne dans Google Sheets (Suivi des entrées & Tableaux de chargement)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
            title="Fermer (Échap)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 text-xs animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{error}</div>
            </div>
          )}

          {success && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 text-xs font-semibold animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>Dossier modifié avec succès dans Google Sheets ! Actualisation...</span>
            </div>
          )}

          {/* Section 1: Identification Dossier & CS */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              Identification Dossier
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* N° OR */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  N° OR <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: 19633"
                  value={formData.noOr}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, noOr: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono font-bold"
                />
              </div>

              {/* CS */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  CS (Conseiller Service)
                </label>
                <select
                  value={formData.cs}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, cs: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all bg-white font-bold text-blue-900"
                >
                  {availableCs.map((csVal) => (
                    <option key={csVal} value={csVal}>
                      {csVal}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date & Heure */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Date & Heure d'entrée
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="JJ/MM/AAAA HH:MM"
                    value={formData.dateEntreeHeure}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        dateEntreeHeure: e.target.value,
                      }))
                    }
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                  <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  La date d'origine reste fixe si non modifiée.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Châssis & Véhicule */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5 text-blue-600" />
                Véhicule & Châssis
              </h4>

              <button
                type="button"
                onClick={handleManualVinLookup}
                disabled={isSearchingVin || !formData.chassis.trim()}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-800 bg-blue-100/70 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                title="Rechercher les infos dans l'onglet VIN"
              >
                {isSearchingVin ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Search className="w-3 h-3" />
                )}
                Rechercher VIN
              </button>
            </div>

            {/* N° Châssis */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                N° de Châssis (VIN) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="ex: ZCFC65D0005936746"
                value={formData.chassis}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    chassis: e.target.value.toUpperCase(),
                  }))
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono uppercase tracking-wider font-semibold"
              />
            </div>

            {vinLookupFound && (
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-800 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  Données VIN synchronisées : <b>{vinLookupFound.marque}</b>{" "}
                  {vinLookupFound.modele} ({vinLookupFound.nomClient || "Client"})
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Marque */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Marque
                </label>
                <input
                  type="text"
                  placeholder="ex: IVECO"
                  value={formData.marque}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, marque: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>

              {/* Modèle */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Modèle
                </label>
                <input
                  type="text"
                  placeholder="ex: 50C15, ML150..."
                  value={formData.modele}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, modele: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>

              {/* Catégorie */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catégorie
                </label>
                <input
                  type="text"
                  placeholder="ex: DAILY, EUROCARGO..."
                  value={formData.categorie}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, categorie: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Client */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-blue-600" />
              Informations Client
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Nom Client */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nom du Client
                </label>
                <input
                  type="text"
                  placeholder="ex: STE CEPTUNES..."
                  value={formData.nomClient}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, nomClient: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800"
                />
              </div>

              {/* Code Client */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Code Client
                </label>
                <input
                  type="text"
                  placeholder="ex: C000042621"
                  value={formData.codeClient}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      codeClient: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Statut & Emplacement */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-blue-600" />
              Statut & Emplacement Atelier
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* État */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  État du véhicule
                </label>
                <select
                  value={formData.etat}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, etat: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all bg-white font-semibold text-slate-800"
                >
                  {ETAT_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              {/* Emplacement */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Emplacement
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="ex: L1, D3, J2, S11..."
                    value={formData.emplacement}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        emplacement: e.target.value,
                      }))
                    }
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono font-bold"
                  />
                  <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              {/* Destination / Pour qui ? */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-blue-600" />
                    <span>Pour qui ? (Atelier de destination)</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    Visible par le chef d'équipe en Attente Réparation
                  </span>
                </label>
                <select
                  value={formData.equipe}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, equipe: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all bg-white font-semibold text-slate-800"
                >
                  {getAllDestinationTeams().map((team) => (
                    <option key={team} value={team}>
                      {team} {team === "Daily" ? "(Daily1 & Daily2)" : ""}
                    </option>
                  ))}
                  {!getAllDestinationTeams().includes(formData.equipe) && formData.equipe && (
                    <option value={formData.equipe}>{formData.equipe}</option>
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Enregistrement...</span>
                </>
              ) : (
                <>
                  <Pencil className="w-4 h-4" />
                  <span>Enregistrer les modifications</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
