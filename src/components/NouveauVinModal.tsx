import { useState, useEffect, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Car,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  User,
  Hash,
  FileText,
  Tag,
  Sparkles,
} from "lucide-react";
import {
  ajouterNouveauVin,
  isDatabaseWriteConfigured,
} from "../services/database";

interface NouveauVinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (chassis: string) => void;
  initialChassis?: string;
}

const MARQUES_OPTIONS = [
  "IVECO",
  "FIAT",
  "FIAT PRO",
  "CHANGAN",
  "JMC",
  "ALFA ROMEO",
  "JEEP",
  "AUTRE",
];

export default function NouveauVinModal({
  isOpen,
  onClose,
  onSuccess,
  initialChassis = "",
}: NouveauVinModalProps) {
  const getTodayDateStr = () => {
    const now = new Date();
    return `${String(now.getDate()).padStart(2, "0")}/${String(
      now.getMonth() + 1
    ).padStart(2, "0")}/${now.getFullYear()}`;
  };

  const [formData, setFormData] = useState({
    chassis: initialChassis,
    codeMarque: "IVECO",
    codeModele: "",
    numModeleVersion: "",
    descriptionSection: "",
    couleurCarrosserie: "",
    dateMiseCirculation: getTodayDateStr(),
    immatriculation: "",
    dateVente: getTodayDateStr(),
    dateLivraison: getTodayDateStr(),
    codeClient: "",
    nomClient: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (initialChassis && isOpen) {
      setFormData((prev) => ({
        ...prev,
        chassis: initialChassis.toUpperCase(),
      }));
    }
  }, [initialChassis, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    const cleanChassis = formData.chassis.trim().toUpperCase();
    if (!cleanChassis) {
      setError("Veuillez renseigner le N° de Châssis (VIN).");
      return;
    }
    if (cleanChassis.length < 5) {
      setError("Le N° de Châssis (VIN) doit comporter au moins 5 caractères.");
      return;
    }
    if (!formData.codeMarque.trim()) {
      setError("Veuillez sélectionner le Code marque du véhicule.");
      return;
    }

    if (!isDatabaseWriteConfigured()) {
      setError(
        "Le serveur PostgreSQL n'est pas disponible. Vérifiez sa configuration puis réessayez."
      );
      return;
    }

    try {
      setLoading(true);
      const res = await ajouterNouveauVin({
        chassis: cleanChassis,
        codeMarque: formData.codeMarque.trim(),
        codeModele: formData.codeModele.trim() || "-",
        numModeleVersion: formData.numModeleVersion.trim() || "-",
        descriptionSection: formData.descriptionSection.trim() || "-",
        couleurCarrosserie: formData.couleurCarrosserie.trim() || "-",
        dateMiseCirculation: formData.dateMiseCirculation.trim(),
        immatriculation: formData.immatriculation.trim().toUpperCase() || "-",
        dateVente: formData.dateVente.trim(),
        dateLivraison: formData.dateLivraison.trim(),
        codeClient: formData.codeClient.trim() || "-",
        nomClient: formData.nomClient.trim() || "Client non renseigné",
      });

      setSuccessMsg(
        res.message ||
          `Véhicule ${cleanChassis} (${formData.codeMarque}) enregistré avec succès dans la base VIN !`
      );

      setTimeout(() => {
        setSuccessMsg("");
        if (onSuccess) onSuccess(cleanChassis);
        onClose();
      }, 1400);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erreur lors de l'enregistrement du VIN dans PostgreSQL."
      );
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-nouveau-vin-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] my-auto animate-in zoom-in-95 duration-150"
      >
        {/* En-tête du modal */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-800 text-white flex items-center justify-between shadow-xs shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
              <Car className="w-5 h-5 text-blue-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="modal-nouveau-vin-title"
                  className="text-base font-bold tracking-tight text-white"
                >
                  Ajouter un Véhicule (Base VIN)
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/25 border border-emerald-400/40 text-emerald-100 rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-300" />
                  10 Champs
                </span>
              </div>
              <p className="text-xs text-blue-100/80 mt-0.5">
                Enregistrer cette fiche VIN dans PostgreSQL
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
            title="Fermer (Échap)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps du modal */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2.5 animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Section 1 : Véhicule & Modèle */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 space-y-3.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Car className="w-3.5 h-3.5 text-blue-600" />
              Identification Véhicule & Modèle
            </h3>

            {/* 1. VIN */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                VIN (N° de Châssis) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
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
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl font-mono uppercase tracking-wider font-bold text-blue-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
                <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* 2. Code marque */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Code marque <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.codeMarque}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, codeMarque: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                >
                  {MARQUES_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Code modèle */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Code modèle
                </label>
                <input
                  type="text"
                  placeholder="ex: 50C15, AD410, ML150, TIPO..."
                  value={formData.codeModele}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, codeModele: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* 4. N° modèle version */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  N° modèle version
                </label>
                <input
                  type="text"
                  placeholder="ex: IV-50C15-0004, IV-AD410-0005..."
                  value={formData.numModeleVersion}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      numModeleVersion: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono"
                />
              </div>

              {/* 5. Description section analytique modèle */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description section analytique modèle
                </label>
                <input
                  type="text"
                  placeholder="ex: DAILY 50C15 E4 EMP 3750, TRAKKER..."
                  value={formData.descriptionSection}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      descriptionSection: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>

              {/* Couleur carrosserie */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Couleur carrosserie
                </label>
                <input
                  type="text"
                  placeholder="ex: BLANC, GRIS CENDRON, BLEU..."
                  value={formData.couleurCarrosserie}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      couleurCarrosserie: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Section 2 : Immatriculation & Dates */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 space-y-3.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              Immatriculation & Dates
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 7. N° Immatriculation */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  N° Immatriculation
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="ex: 2875TU215"
                    value={formData.immatriculation}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        immatriculation: e.target.value.toUpperCase(),
                      }))
                    }
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-xl font-mono uppercase font-semibold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                  <Tag className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              {/* 6. Date de mise en circulation */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Date mise circulation
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="JJ/MM/AAAA"
                    value={formData.dateMiseCirculation}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        dateMiseCirculation: e.target.value,
                      }))
                    }
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                  <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              {/* 8. Date vente */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Date vente (Col AG)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="JJ/MM/AAAA"
                    value={formData.dateVente}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        dateVente: e.target.value,
                      }))
                    }
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                  <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              {/* Date de livraison */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Date livraison (Col AH)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="JJ/MM/AAAA"
                    value={formData.dateLivraison}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        dateLivraison: e.target.value,
                      }))
                    }
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                  <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>
            </div>
          </div>

          {/* Section 3 : Client */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 space-y-3.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-blue-600" />
              Informations Client
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 9. N° client */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  N° client (Code client)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="ex: C000058719"
                    value={formData.codeClient}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        codeClient: e.target.value,
                      }))
                    }
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                  <FileText className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              {/* 10. Nom du client */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nom du client
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="ex: MOHAMED RIAHI, STE CEPTUNES..."
                    value={formData.nomClient}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        nomClient: e.target.value,
                      }))
                    }
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-xl font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>
            </div>
          </div>

          {/* Pied du formulaire */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
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
                  <span>Enregistrement du VIN...</span>
                </>
              ) : (
                <>
                  <Car className="w-4 h-4" />
                  <span>Enregistrer dans l'onglet VIN</span>
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
