import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Plus,
  Car,
  User,
  Calendar,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Search,
  Check,
  Clock,
  Users,
  Wrench,
} from "lucide-react";
import {
  ajouterNouvelleEntree,
  fetchDatabaseFluxData,
  isDatabaseWriteConfigured,
  searchVehicleByVin,
  type VinVehicleInfo,
} from "../services/database";
import { getAllDestinationTeams, type DestinationTeam } from "../config/teams";
import NouveauVinModal from "./NouveauVinModal";
import { useAuth } from "../context/AuthContext";

interface NouvelleEntreeModalProps {
  isOpen: boolean;
  historique?: boolean;
  onClose: () => void;
  onSuccess: (newEntry?: {
    noOr: string;
    cs: string;
    chassis: string;
    immatriculation?: string;
    codeClient?: string;
    nomClient?: string;
    dateEntreeHeure: string;
    marque?: string;
    modele?: string;
    categorie?: string;
    equipe?: string;
  }) => void;
}

export default function NouvelleEntreeModal({
  isOpen,
  historique = false,
  onClose,
  onSuccess,
}: NouvelleEntreeModalProps) {
  const { currentUser } = useAuth();
  const assignedReceptionCs = currentUser?.role === "reception" && /^R\d+$/i.test(currentUser.assignedTeam || "")
    ? currentUser.assignedTeam!.toUpperCase()
    : "";
  const getNowFormatted = (withSeconds = false) => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    return withSeconds
      ? `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`
      : `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  };

  const [isAutoTime, setIsAutoTime] = useState(true);

  const [formData, setFormData] = useState({
    noOr: "",
    cs: "R10",
    chassis: "",
    immatriculation: "",
    codeClient: "",
    nomClient: "",
    dateEntreeHeure: getNowFormatted(false),
    marque: "IVECO",
    modele: "",
    categorie: "",
    equipe: "Daily" as DestinationTeam | string,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isVinModalOpen, setIsVinModalOpen] = useState(false);

  // État de recherche automatique VIN
  const [vinLookupStatus, setVinLookupStatus] = useState<
    "idle" | "searching" | "found" | "not_found"
  >("idle");
  const [foundVinDetails, setFoundVinDetails] = useState<VinVehicleInfo | null>(
    null
  );
  const lastSearchedVin = useRef<string>("");

  // Réinitialisation du formulaire à chaque ouverture
  useEffect(() => {
    if (isOpen) {
      setIsAutoTime(!historique);
      setFormData({
        noOr: "",
        cs: assignedReceptionCs || "R10",
        chassis: "",
        immatriculation: "",
        codeClient: "",
        nomClient: "",
        dateEntreeHeure: getNowFormatted(false),
        marque: "IVECO",
        modele: "",
        categorie: "",
        equipe: "Daily",
      });
      setError("");
      setSuccess(false);
      setVinLookupStatus("idle");
      setFoundVinDetails(null);
      lastSearchedVin.current = "";
    }
  }, [isOpen, assignedReceptionCs, historique]);

  // Horloge en direct tant que le modal est ouvert et que le mode automatique est actif
  useEffect(() => {
    if (!isOpen || !isAutoTime || historique) return;
    const interval = setInterval(() => {
      setFormData((prev) => ({
        ...prev,
        dateEntreeHeure: getNowFormatted(false),
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, isAutoTime, historique]);

  // Fermeture par la touche Échap
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onClose]);

  // Fonction de recherche VIN dans PostgreSQL
  const performVinLookup = async (chassisQuery: string) => {
    const clean = chassisQuery.trim().toUpperCase();
    if (clean.length < 5) {
      setVinLookupStatus("idle");
      return;
    }
    if (clean === lastSearchedVin.current) return;
    lastSearchedVin.current = clean;

    try {
      setVinLookupStatus("searching");
      const info = await searchVehicleByVin(clean);
      if (info) {
        setFormData((prev) => {
          let suggestedTeam = prev.equipe;
          const brand = (info.marque || "").toUpperCase();
          const model = (info.modele || "").toUpperCase();
          const cat = (info.categorie || "").toUpperCase();
          if (brand.includes("CHANGAN")) {
            suggestedTeam = "Changan";
          } else if (model.includes("DAILY") || cat.includes("DAILY")) {
            suggestedTeam = "Daily";
          } else if (
            model.includes("EUROCARGO") ||
            model.includes("STRALIS") ||
            model.includes("TRAKKER") ||
            cat.includes("LOURD")
          ) {
            suggestedTeam = "Lourd";
          }

          return {
            ...prev,
            chassis: info.chassis || clean,
            immatriculation: info.immatriculation || prev.immatriculation,
            nomClient: info.nomClient || prev.nomClient,
            codeClient: info.codeClient || prev.codeClient,
            marque: info.marque || prev.marque,
            modele: info.modele || prev.modele,
            categorie: info.categorie || prev.categorie,
            equipe: suggestedTeam,
          };
        });
        setFoundVinDetails(info);
        setVinLookupStatus("found");
      } else {
        setFoundVinDetails(null);
        setVinLookupStatus("not_found");
      }
    } catch {
      setVinLookupStatus("not_found");
    }
  };

  // Détection automatique dès que l'utilisateur tape ou colle un N° Châssis
  useEffect(() => {
    const clean = formData.chassis.trim();
    if (clean.length < 6) {
      if (vinLookupStatus !== "idle") setVinLookupStatus("idle");
      return;
    }

    const timer = setTimeout(() => {
      performVinLookup(clean);
    }, 600);

    return () => clearTimeout(timer);
  }, [formData.chassis]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const cleanNoOr = formData.noOr.trim();
    if (!cleanNoOr) {
      setError("Le N° OR est obligatoire.");
      return;
    }
    if (!formData.chassis.trim()) {
      setError("Le N° de Châssis (VIN) est obligatoire.");
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
      // Contrôle d'unicité du N° OR (les autres champs peuvent être identiques, mais le N° OR doit être unique)
      const existingVehicles = await fetchDatabaseFluxData().catch(() => []);
      const orConflict = existingVehicles.some((v) => {
        const vNo = String(v.no || v.ordre || (v as unknown as { numeroOR?: string }).numeroOR || "").trim();
        return vNo.toLowerCase() === cleanNoOr.toLowerCase();
      });
      if (orConflict) {
        setError(`Le N° OR « ${cleanNoOr} » existe déjà. Un nouvel Ordre de Réparation doit obligatoirement avoir un numéro unique.`);
        setLoading(false);
        return;
      }
      // Calculer l'horodatage exact et automatique au moment précis de l'enregistrement
      const submissionDate = historique ? formData.dateEntreeHeure.trim() : getNowFormatted(true);

      const newEntryPayload = {
        ...formData,
        noOr: formData.noOr.trim(),
        cs: assignedReceptionCs || formData.cs.trim() || "R18",
        chassis: formData.chassis.trim().toUpperCase(),
        immatriculation: formData.immatriculation.trim().toUpperCase(),
        marque: formData.marque.trim() || "IVECO",
        nomClient: formData.nomClient.trim() || "Client non renseigné",
        dateEntreeHeure: submissionDate,
        modele: formData.modele.trim() || "-",
        categorie: formData.categorie.trim() || "-",
        equipe: (formData.equipe || "Daily").trim(),
        historique,
      };

      await ajouterNouvelleEntree(newEntryPayload);
      setSuccess(true);
      onSuccess(newEntryPayload);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 600);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erreur lors de l'enregistrement de l'entrée dans PostgreSQL."
      );
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-nouvelle-entree-title"
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
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-emerald-700 via-teal-700 to-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white/10 text-emerald-300 shadow-xs">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h3
                id="modal-nouvelle-entree-title"
                className="text-base font-bold text-white flex items-center gap-2"
              >
                {historique ? "Ajouter un Véhicule Historique" : "Nouvelle Entrée Véhicule (Réception)"}
                <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-400/20 text-emerald-200 border border-emerald-400/30 px-2 py-0.5 rounded-full font-semibold">
                  <Sparkles className="w-3 h-3 text-emerald-300" />
                  Auto-Lookup Parc & VIN
                </span>
              </h3>
              <p className="text-xs text-emerald-100/80">
                Récupère automatiquement l'Immatriculation, Client, Marque, Modèle et Catégorie depuis le Parc véhicules & engins
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

        {/* Modal Body (Scrollable if height exceeds screen) */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 overflow-y-auto space-y-4 flex-1">
            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold shadow-xs">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>
                  Véhicule enregistré avec succès dans PostgreSQL (Suivi & Tableaux de chargement) !
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* N° OR */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  N° OR <span className="text-rose-500 font-bold">*</span>
                </label>
                <div className="relative">
                  <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="ex: CS26-019999"
                    value={formData.noOr}
                    onChange={(e) =>
                      setFormData({ ...formData, noOr: e.target.value })
                    }
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Centre Service CS */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Centre Service (CS) <span className="text-rose-500 font-bold">*</span>
                </label>
                <select
                  value={formData.cs}
                  disabled={Boolean(assignedReceptionCs)}
                  onChange={(e) =>
                    setFormData({ ...formData, cs: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
                >
                  <option value="R10">R10</option>
                  <option value="R09">R09</option>
                  <option value="R18">R18</option>
                  <option value="R16">R16</option>
                </select>
                {assignedReceptionCs && <p className="mt-1 text-[10px] font-semibold text-emerald-700">Centre attribué automatiquement à votre compte Réception.</p>}
              </div>

              {/* N° Châssis (VIN) avec recherche auto */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    N° Châssis (VIN) <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Saisissez au moins 6 caractères pour pré-remplir les données
                  </span>
                </div>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    required
                    placeholder="ex: ZCFCA50A5S5661103 (ou les 7 derniers chiffres)"
                    value={formData.chassis}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        chassis: e.target.value.toUpperCase(),
                      })
                    }
                    className="w-full pl-3 pr-28 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-900 uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono tracking-wider"
                  />

                  {/* Bouton ou statut de recherche dans l'input */}
                  <div className="absolute right-1.5 flex items-center gap-1">
                    {vinLookupStatus === "searching" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                        Recherche VIN...
                      </span>
                    ) : vinLookupStatus === "found" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                        Trouvé
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => performVinLookup(formData.chassis)}
                        disabled={formData.chassis.trim().length < 3}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-40 cursor-pointer"
                        title="Rechercher dans le Parc véhicules & engins"
                      >
                        <Search className="w-3 h-3 text-slate-500" />
                        Rechercher
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Immatriculation */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Immatriculation
                  </label>
                  {formData.immatriculation && vinLookupStatus === "found" ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                      Auto-rempli
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-500">
                      Auto-rempli / Optionnel
                    </span>
                  )}
                </div>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    placeholder="ex: RS215545 ou 123456-A-78"
                    value={formData.immatriculation}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        immatriculation: e.target.value.toUpperCase(),
                      })
                    }
                    className="w-full pl-3 pr-24 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-900 uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono tracking-wider"
                  />
                  <div className="absolute right-1.5 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => performVinLookup(formData.immatriculation)}
                      disabled={formData.immatriculation.trim().length < 3 || vinLookupStatus === "searching"}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-40 cursor-pointer"
                      title="Rechercher par immatriculation dans le Parc"
                    >
                      <Search className="w-3 h-3 text-slate-500" />
                      Rechercher
                    </button>
                  </div>
                </div>
              </div>

              {/* Notification dynamique de l'onglet VIN */}
              {vinLookupStatus === "found" && (
                <div className="md:col-span-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-2 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      <strong>Véhicule identifié dans {foundVinDetails?.source === "inventory" ? "le Parc véhicules & engins" : "la base VIN"} :</strong>{" "}
                      {foundVinDetails?.marque} {foundVinDetails?.modele}
                      {foundVinDetails?.immatriculation
                        ? ` • Immat: ${foundVinDetails.immatriculation}`
                        : ""}
                      {foundVinDetails?.nomClient
                        ? ` • ${foundVinDetails.nomClient}`
                        : ""}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold bg-emerald-200/80 text-emerald-900 px-2 py-0.5 rounded-md shrink-0">
                    {foundVinDetails?.source === "inventory" ? "Parc Véhicules" : "Base VIN"}
                  </span>
                </div>
              )}

              {vinLookupStatus === "not_found" && (
                <div className="md:col-span-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-2 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      Véhicule non répertorié dans le Parc véhicules & engins ni dans la base VIN. Les informations client et véhicule seront ajoutées par la Direction dans la base VIN.
                    </span>
                  </div>
                </div>
              )}

              {/* Date Entrée et Heure - Gérée Automatiquement */}
              <div className="md:col-span-2 bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-emerald-600" />
                    <span>Date & Heure d'entrée</span>
                  </label>
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                    <Sparkles className="w-3 h-3 text-emerald-600 animate-pulse" />
                    Automatique (Temps réel)
                  </span>
                </div>
                <div className="relative">
                  <Clock className="w-4 h-4 text-emerald-600 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    readOnly={!historique}
                    onChange={historique ? (e) => setFormData({ ...formData, dateEntreeHeure: e.target.value }) : undefined}
                    value={formData.dateEntreeHeure}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-emerald-300 bg-white text-xs font-mono font-black text-emerald-950 shadow-2xs focus:outline-none"
                    title="Date et heure actuelles générées automatiquement à la seconde exacte"
                  />
                </div>
                <p className="text-[10.5px] text-emerald-700 font-medium flex items-center gap-1">
                  <span>✨</span>
                  <span>
                    {historique ? "Saisissez la date et l'heure historiques au format JJ/MM/AAAA HH:MM." : "La date et l'heure sont gérées automatiquement à la seconde exacte lors de l'enregistrement en tête de tableau."}
                  </span>
                </p>
              </div>

              {/* Nom Client */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nom du Client (Optionnel)
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="ex: STE CEPTUNES..."
                    value={formData.nomClient}
                    readOnly={!historique}
                    onChange={historique ? (e) => setFormData({ ...formData, nomClient: e.target.value }) : undefined}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-500 cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Code Client */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Code Client (Optionnel)
                </label>
                <input
                  type="text"
                  placeholder="ex: C000042621"
                  value={formData.codeClient}
                  readOnly={!historique}
                  onChange={historique ? (e) => setFormData({ ...formData, codeClient: e.target.value }) : undefined}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-500 cursor-not-allowed font-mono"
                />
              </div>

              {/* Marque */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Marque
                </label>
                <select
                  value={formData.marque}
                    disabled={!historique}
                    onChange={historique ? (e) => setFormData({ ...formData, marque: e.target.value }) : undefined}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-500 cursor-not-allowed font-semibold"
                >
                  <option value="IVECO">IVECO</option>
                  <option value="FIAT">FIAT</option>
                  <option value="CHANGAN">CHANGAN</option>
                  <option value="JMC">JMC</option>
                  <option value="AUTRE">AUTRE</option>
                  {!["IVECO", "FIAT", "CHANGAN", "JMC", "AUTRE"].includes(
                    formData.marque
                  ) && (
                    <option value={formData.marque}>{formData.marque}</option>
                  )}
                </select>
              </div>

              {/* Modèle */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Modèle (Optionnel)
                </label>
                <input
                  type="text"
                  placeholder="ex: 50C15, ML150, NEW STAR..."
                  value={formData.modele}
                  readOnly={!historique}
                  onChange={historique ? (e) => setFormData({ ...formData, modele: e.target.value }) : undefined}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-500 cursor-not-allowed"
                />
              </div>

              {/* Catégorie / Description */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Catégorie / Description (Optionnel)
                </label>
                <input
                  type="text"
                  placeholder="ex: DAILY 50C15 E4 EMP 4350 CLIMATISE"
                  value={formData.categorie}
                  readOnly={!historique}
                  onChange={historique ? (e) => setFormData({ ...formData, categorie: e.target.value }) : undefined}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-500 cursor-not-allowed"
                />
              </div>

              {/* Destination / Pour qui ? (Atelier cible pour le chargement) */}
              <div className="md:col-span-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-emerald-600" />
                    <span>Pour qui ? (Atelier de destination) <span className="text-rose-500 font-bold">*</span></span>
                  </label>
                  <span className="text-[10.5px] text-slate-500 font-medium hidden sm:inline">
                    Visible en Attente Réparation par le Chef d'équipe concerné
                  </span>
                </div>

                {/* Boutons de sélection rapide */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {getAllDestinationTeams().map((team) => {
                    const isSelected = formData.equipe === team;
                    return (
                      <button
                        key={team}
                        type="button"
                        onClick={() => setFormData({ ...formData, equipe: team })}
                        className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/30 scale-[1.02]"
                            : "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-100/70"
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          {team === "Daily" && <Wrench className="w-3 h-3" />}
                          {team}
                        </span>
                        <span
                          className={`text-[9.5px] font-medium mt-0.5 ${
                            isSelected ? "text-emerald-100" : "text-slate-400"
                          }`}
                        >
                          {team === "Daily"
                            ? "Daily1 & Daily2"
                            : `${team}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Modal Footer (Fixed at bottom) */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
            <span className="text-[11px] text-slate-500 hidden sm:inline">
              <span className="text-rose-500 font-bold">*</span> N° OR et N° Châssis obligatoires
            </span>

            <div className="flex items-center gap-3 ml-auto">
              <button
                type="button"
                disabled={loading}
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                Annuler
              </button>

              <button
                type="submit"
                disabled={loading || success}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Enregistrement en cours...</span>
                  </>
                ) : success ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Ajouté !</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Créer l'entrée</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Modal d'ajout direct dans la base VIN */}
      <NouveauVinModal
        isOpen={isVinModalOpen}
        onClose={() => setIsVinModalOpen(false)}
        initialChassis={formData.chassis}
        onSuccess={(addedChassis) => {
          setFormData((prev) => ({ ...prev, chassis: addedChassis }));
          performVinLookup(addedChassis);
        }}
      />
    </div>,
    document.body
  );
}
