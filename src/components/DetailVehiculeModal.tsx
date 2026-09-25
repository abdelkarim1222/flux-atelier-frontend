import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Car,
  Wrench,
  Clock,
  MapPin,
  User,
  CheckCircle2,
  Package,
  PhoneCall,
  Printer,
  Pencil,
  Copy,
  Check,
  Sparkles,
  ShieldCheck,
  Truck,
  Activity,
} from "lucide-react";
import {
  searchVehicleByVin,
  type VinVehicleInfo,
} from "../services/googleSheets";

export interface VehiculeDetailData {
  id?: string;
  noOr?: string;
  cs?: string;
  chassis: string;
  nomClient: string;
  codeClient?: string;
  dateEntreeHeure?: string;
  dateEntree?: string;
  heureEntree?: string;
  marque?: string;
  modele?: string;
  categorie?: string;
  etat?: string;
  etatIntervention?: string;
  equipe?: string;
  matricule?: string;
  technicien?: string;
  nomTechnicien?: string;
  avancement?: string;
  dateFinRep?: string;
  emplacement?: string;
  // Références de lignes pour édition directe
  suiviRowNumber?: number;
  rowSuivi?: number;
  chargementRowNumber?: number;
  sheetRowNumber?: number;
  rowNumber?: number;
}

interface DetailVehiculeModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicule: VehiculeDetailData | null;
  onEdit?: (vehicule: VehiculeDetailData) => void;
  canEdit?: boolean;
}

// Fonction utilitaire pour extraire le pourcentage d'avancement
function parseAvancementPct(val?: string): number {
  if (!val) return 0;
  const clean = val.toLowerCase().trim();
  if (clean.includes("termin") || clean.includes("fini") || clean === "100%") return 100;
  const match = val.match(/\b(\d{1,3})\s*%/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num)) return Math.min(Math.max(num, 0), 100);
  }
  if (clean.includes("75")) return 75;
  if (clean.includes("50")) return 50;
  if (clean.includes("25")) return 25;
  if (clean.includes("cours")) return 40;
  if (clean.includes("attente")) return 10;
  return 0;
}

// Analyse de la condition générale du véhicule
function getConditionMeta(etatRaw?: string, avancementRaw?: string) {
  const etat = (etatRaw || "").toLowerCase().trim();
  const avancement = (avancementRaw || "").toLowerCase().trim();
  const isTermine = avancement.includes("termin") || avancement.includes("fini") || avancement.includes("100%");

  if (etat.includes("livr") || etat.includes("pret") || isTermine) {
    return {
      label: "Prêt / Livré",
      subLabel: "Travaux d'atelier achevés",
      color: "emerald",
      bgBadge: "bg-emerald-100 text-emerald-800 border-emerald-300",
      bgCard: "bg-gradient-to-br from-emerald-50 to-teal-50/50 border-emerald-200",
      icon: CheckCircle2,
      bannerText: "Ce véhicule a terminé l'ensemble de ses opérations en atelier et est prêt ou a été restitué au client.",
      stepIndex: 4,
    };
  }
  if (etat.includes("essai") || avancement.includes("essai")) {
    return {
      label: "Contrôle & Essai",
      subLabel: "Essai routier ou validation atelier",
      color: "purple",
      bgBadge: "bg-purple-100 text-purple-800 border-purple-300",
      bgCard: "bg-gradient-to-br from-purple-50 to-indigo-50/50 border-purple-200",
      icon: Activity,
      bannerText: "Le véhicule est en phase de test fonctionnel ou d'essai routier avant validation finale.",
      stepIndex: 3,
    };
  }
  if (etat.includes("achet") || avancement.includes("achet")) {
    return {
      label: "Attente Achat",
      subLabel: "Attente approvisionnement / pièces",
      color: "amber",
      bgBadge: "bg-amber-100 text-amber-800 border-amber-300",
      bgCard: "bg-gradient-to-br from-amber-50 to-orange-50/50 border-amber-200",
      icon: Package,
      bannerText: "L'intervention est en attente d'achat ou d'approvisionnement des pièces nécessaires.",
      stepIndex: 2,
    };
  }
  if (etat.includes("cours") || etat.includes("repar") || etat.includes("atelier")) {
    return {
      label: "En cours de travaux",
      subLabel: "Intervention active en atelier",
      color: "blue",
      bgBadge: "bg-blue-100 text-blue-800 border-blue-300",
      bgCard: "bg-gradient-to-br from-blue-50 to-indigo-50/50 border-blue-200",
      icon: Wrench,
      bannerText: "Le véhicule est actuellement en cours de démontage ou de réparation sur le poste assigné.",
      stepIndex: 2,
    };
  }
  if (etat.includes("pdr") || etat.includes("piece")) {
    return {
      label: "Attente Pièces (PDR)",
      subLabel: "Intervention suspendue pour pièces",
      color: "amber",
      bgBadge: "bg-amber-100 text-amber-800 border-amber-300",
      bgCard: "bg-gradient-to-br from-amber-50 to-orange-50/50 border-amber-200",
      icon: Package,
      bannerText: "La réparation est en attente de réception ou de validation de pièces détachées au magasin.",
      stepIndex: 2,
    };
  }
  if (etat.includes("client")) {
    return {
      label: "Attente Accord Client",
      subLabel: "Devis ou validation requise",
      color: "purple",
      bgBadge: "bg-purple-100 text-purple-800 border-purple-300",
      bgCard: "bg-gradient-to-br from-purple-50 to-pink-50/50 border-purple-200",
      icon: PhoneCall,
      bannerText: "En attente du retour, du devis complémentaire ou de la validation définitive du client.",
      stepIndex: 1,
    };
  }
  if (etat.includes("exterieur") || etat.includes("sous-trait")) {
    return {
      label: "Travaux Extérieurs",
      subLabel: "Prestation externe",
      color: "indigo",
      bgBadge: "bg-indigo-100 text-indigo-800 border-indigo-300",
      bgCard: "bg-gradient-to-br from-indigo-50 to-slate-50 border-indigo-200",
      icon: Truck,
      bannerText: "Le véhicule ou ses composants sont confiés à un intervenant extérieur (rectification, spécialiste...).",
      stepIndex: 2,
    };
  }

  return {
    label: "Attente Réparation",
    subLabel: "Véhicule stationné en attente",
    color: "amber",
    bgBadge: "bg-amber-100 text-amber-800 border-amber-300",
    bgCard: "bg-gradient-to-br from-amber-50 to-yellow-50/50 border-amber-200",
    icon: Clock,
    bannerText: "Le véhicule est réceptionné et stationné dans l'atelier, en attente de début des travaux.",
    stepIndex: 1,
  };
}

// Calcul de durée de séjour
function computeDureeSejour(dateStr?: string): string {
  if (!dateStr || dateStr === "-" || dateStr.includes("1899")) return "-";
  try {
    const match = dateStr.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (!match) return "-";
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    let year = parseInt(match[3], 10);
    if (year < 100) year += 2000;

    const entryDate = new Date(year, month, day);
    const now = new Date();
    const diffMs = now.getTime() - entryDate.getTime();
    if (diffMs < 0) return "Aujourd'hui";
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return "1 jour";
    return `${diffDays} jours`;
  } catch {
    return "-";
  }
}

export default function DetailVehiculeModal({
  isOpen,
  onClose,
  vehicule,
  onEdit,
  canEdit = true,
}: DetailVehiculeModalProps) {
  const [copiedVin, setCopiedVin] = useState(false);
  const [vinDetails, setVinDetails] = useState<VinVehicleInfo | null>(null);
  const [loadingVin, setLoadingVin] = useState(false);

  // Recherche automatique des caractéristiques complètes dans la base VIN Google Sheets
  useEffect(() => {
    let isCancelled = false;
    if (isOpen && vehicule?.chassis) {
      const cleanChassis = vehicule.chassis.trim().toUpperCase();
      if (cleanChassis.length >= 5) {
        setLoadingVin(true);
        searchVehicleByVin(cleanChassis)
          .then((res) => {
            if (!isCancelled) {
              setVinDetails(res);
            }
          })
          .catch(() => {
            if (!isCancelled) setVinDetails(null);
          })
          .finally(() => {
            if (!isCancelled) setLoadingVin(false);
          });
      } else {
        setVinDetails(null);
      }
    } else {
      setVinDetails(null);
    }
    return () => {
      isCancelled = true;
    };
  }, [isOpen, vehicule?.chassis]);

  // Fermeture Échap
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !vehicule) return null;

  const rawEtat = vehicule.etat || vehicule.etatIntervention || "Attente réparation";
  const rawAvancement = vehicule.avancement || "";
  const condition = getConditionMeta(rawEtat, rawAvancement);
  const ConditionIcon = condition.icon;
  const pct = parseAvancementPct(rawAvancement);
  const dureeSejour = computeDureeSejour(
    vehicule.dateEntreeHeure || vehicule.dateEntree
  );

  const handleCopyVin = () => {
    if (!vehicule.chassis) return;
    navigator.clipboard.writeText(vehicule.chassis);
    setCopiedVin(true);
    setTimeout(() => setCopiedVin(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  // Valeurs consolidées (entre le dossier et la fiche VIN de Google Sheets)
  const marqueAffichee =
    vehicule.marque || vinDetails?.marque || "IVECO";
  const modeleAffiche =
    vehicule.modele || vinDetails?.modele || "-";
  const immatAffichee = vinDetails?.immatriculation || "-";
  const versionAffichee = vinDetails?.numModeleVersion || "-";
  const descriptionAffichee =
    vinDetails?.descriptionSection ||
    vehicule.categorie ||
    "-";
  const dateMecAffichee = vinDetails?.dateMiseCirculation || "-";
  const dateVenteAffichee = vinDetails?.dateVente || "-";
  const dateLivraisonAffichee = vinDetails?.dateLivraison || "-";
  const couleurAffichee = vinDetails?.couleurCarrosserie
    ? `${vinDetails.couleurCarrosserie} ${vinDetails.codeCouleur ? `(${vinDetails.codeCouleur})` : ""}`.trim()
    : "-";
  const codeClientAffiche =
    vehicule.codeClient || vinDetails?.codeClient || "-";
  const nomClientAffiche =
    vehicule.nomClient || vinDetails?.nomClient || "Client non renseigné";
  const emplacementAffiche = vehicule.emplacement || "Non affecté";
  const dateEntreeAffichee =
    vehicule.dateEntreeHeure ||
    (vehicule.dateEntree ? `${vehicule.dateEntree} ${vehicule.heureEntree || ""}`.trim() : "-");
  const dateFinAffichee = vehicule.dateFinRep || "Non définie";
  const technicienAffiche =
    vehicule.nomTechnicien || vehicule.technicien || "-";
  const matriculeAffiche = vehicule.matricule || "-";
  const equipeAffichee = vehicule.equipe || "Non affectée";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-detail-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto print:p-0 print:bg-white"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh] my-auto animate-in zoom-in-95 duration-150 print:max-h-none print:shadow-none print:border-none"
      >
        {/* En-tête supérieur */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between shadow-xs shrink-0 print:bg-slate-900">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0 shadow-inner">
              <Car className="w-6 h-6 text-blue-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-blue-500/30 text-blue-200 border border-blue-400/40 uppercase tracking-wider">
                  {marqueAffichee}
                </span>
                <h2
                  id="modal-detail-title"
                  className="text-base font-bold tracking-tight text-white flex items-center gap-2"
                >
                  {modeleAffiche !== "-" ? `${marqueAffichee} ${modeleAffiche}` : marqueAffichee}
                </h2>
                {vehicule.noOr && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-white/15 text-white border border-white/20">
                    OR {vehicule.noOr}
                  </span>
                )}
                {vehicule.cs && (
                  <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                    {vehicule.cs}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>Client : <strong className="text-white">{nomClientAffiche}</strong></span>
                {codeClientAffiche !== "-" && (
                  <span className="text-slate-400 font-mono text-[11px]">({codeClientAffiche})</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 print:hidden">
            <button
              type="button"
              onClick={handlePrint}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              title="Imprimer la fiche véhicule"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              title="Fermer (Échap)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Corps du modal */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 print:p-2">
          {/* ========================================================= */}
          {/* BLOC 1 : CONDITION & ÉTAT OPÉRATIONNEL DE LA VOITURE       */}
          {/* ========================================================= */}
          <div className={`p-4 rounded-2xl border shadow-xs ${condition.bgCard}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${condition.bgBadge}`}>
                  <ConditionIcon className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    Condition & Statut Actuel
                  </div>
                  <div className="text-base font-black text-slate-900 flex items-center gap-2">
                    <span>{condition.label}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${condition.bgBadge}`}>
                      {rawEtat}
                    </span>
                  </div>
                </div>
              </div>

              {/* Emplacement atelier */}
              <div className="flex items-center gap-2 bg-white/90 border border-slate-200 px-3 py-1.5 rounded-xl shadow-2xs">
                <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <div className="text-[9px] font-bold uppercase text-slate-400">Emplacement</div>
                  <div className="text-xs font-black text-slate-800">{emplacementAffiche}</div>
                </div>
              </div>
            </div>

            {/* Description / Message de la condition */}
            <p className="text-xs text-slate-700 bg-white/70 p-2.5 rounded-xl border border-slate-200/70 mb-3.5 leading-relaxed">
              {condition.bannerText}
            </p>

            {/* Jauge d'avancement des travaux */}
            <div className="bg-white/90 p-3.5 rounded-xl border border-slate-200/80 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-blue-600" />
                  Avancement Réparation Atelier :
                  <span className="font-extrabold text-blue-900">
                    {rawAvancement || (pct > 0 ? `${pct}%` : "En attente")}
                  </span>
                </span>
                <span className="font-mono font-black text-xs text-slate-800">
                  {pct}%
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/80 p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    pct === 100
                      ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                      : pct >= 50
                      ? "bg-gradient-to-r from-blue-500 to-indigo-500"
                      : pct > 0
                      ? "bg-gradient-to-r from-amber-500 to-orange-500"
                      : "bg-slate-300"
                  }`}
                  style={{ width: `${Math.max(pct, 4)}%` }}
                />
              </div>

              {/* Étapes du flux */}
              <div className="grid grid-cols-4 gap-1 pt-1 text-[10px] text-center font-bold text-slate-500">
                <div className={`p-1 rounded ${pct >= 10 ? "text-emerald-700 bg-emerald-50" : ""}`}>
                  1. Réception
                </div>
                <div className={`p-1 rounded ${pct >= 25 ? "text-blue-700 bg-blue-50" : ""}`}>
                  2. Prise en charge
                </div>
                <div className={`p-1 rounded ${pct >= 75 ? "text-indigo-700 bg-indigo-50" : ""}`}>
                  3. Réparation
                </div>
                <div className={`p-1 rounded ${pct === 100 ? "text-emerald-700 bg-emerald-100 font-extrabold" : ""}`}>
                  4. Livré
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* BLOC 2 : GRILLE DE DÉTAILS DÉTAILLÉE                      */}
          {/* ========================================================= */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* CARTE 1 : IDENTIFICATION VÉHICULE & BASE VIN */}
            <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Car className="w-4 h-4 text-blue-600" />
                  Caractéristiques Véhicule (Base VIN)
                </h3>
                {vinDetails ? (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                    Synchronisé VIN
                  </span>
                ) : loadingVin ? (
                  <span className="text-[10px] text-slate-400 italic">Recherche VIN...</span>
                ) : null}
              </div>

              <div className="space-y-2.5 text-xs">
                {/* VIN (Châssis) avec bouton copier */}
                <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      N° Châssis (VIN)
                    </span>
                    <span className="font-mono font-bold text-slate-900 text-xs tracking-wider select-all">
                      {vehicule.chassis || "-"}
                    </span>
                  </div>
                  {vehicule.chassis && (
                    <button
                      type="button"
                      onClick={handleCopyVin}
                      className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-800 border border-slate-200 transition-colors cursor-pointer"
                      title="Copier le N° VIN"
                    >
                      {copiedVin ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Code marque
                    </span>
                    <strong className="text-slate-800 font-bold">{marqueAffichee}</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Code modèle
                    </span>
                    <strong className="text-slate-800 font-bold">{modeleAffiche}</strong>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      N° Modèle Version
                    </span>
                    <span className="font-mono text-slate-800 font-medium">{versionAffichee}</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      N° Immatriculation
                    </span>
                    <span className="font-mono font-bold text-blue-900">{immatAffichee}</span>
                  </div>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Description section analytique
                  </span>
                  <span className="text-slate-800 font-medium">{descriptionAffichee}</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Date de MEC
                    </span>
                    <span className="text-slate-700 font-mono">{dateMecAffichee}</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Date de vente
                    </span>
                    <span className="text-slate-700 font-mono">{dateVenteAffichee}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Date de livraison
                    </span>
                    <span className="text-slate-700 font-mono">{dateLivraisonAffichee}</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Couleur carrosserie
                    </span>
                    <span className="text-slate-700 font-medium">{couleurAffichee}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* CARTE 2 : ATELIER, ASSIGNATION & TEMPS */}
            <div className="space-y-4">
              {/* Assignation Technique */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Wrench className="w-4 h-4 text-indigo-600" />
                    Assignation & Équipe Atelier
                  </h3>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">
                        Équipe
                      </span>
                      <strong className="text-slate-800 font-bold">{equipeAffichee}</strong>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">
                        N° Matricule
                      </span>
                      <span className="font-mono font-bold text-slate-800">{matriculeAffiche}</span>
                    </div>
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Nom du Technicien en charge
                    </span>
                    <strong className="text-slate-900 font-bold text-xs">{technicienAffiche}</strong>
                  </div>
                </div>
              </div>

              {/* Suivi des Délais & Calendrier */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-emerald-600" />
                    Délais & Séjour Atelier
                  </h3>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">
                        Date & Heure d'entrée
                      </span>
                      <span className="font-mono text-slate-800 font-semibold">
                        {dateEntreeAffichee}
                      </span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">
                        Présence à l'Atelier
                      </span>
                      <strong className="text-emerald-700 font-bold font-mono">
                        {dureeSejour}
                      </strong>
                    </div>
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Date prévisionnelle fin des réparations
                    </span>
                    <span className="font-mono font-semibold text-slate-800">
                      {dateFinAffichee}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CARTE 3 : INFORMATIONS CLIENT */}
          <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <User className="w-4 h-4 text-blue-600" />
                Informations Dossier & Client
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 sm:col-span-2">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  Nom du Client / Raison Sociale
                </span>
                <strong className="text-slate-900 font-bold text-sm block">
                  {nomClientAffiche}
                </strong>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  N° Client (Code Client)
                </span>
                <span className="font-mono font-bold text-slate-800">
                  {codeClientAffiche}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Pied du modal avec actions */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-slate-400" />
            <span>Fiche technique atelier synchronisée avec Google Sheets</span>
          </div>

          <div className="flex items-center gap-2">
            {canEdit && onEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(vehicule);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-all cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Modifier le dossier</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Imprimer</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl transition-colors cursor-pointer shadow-xs"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
