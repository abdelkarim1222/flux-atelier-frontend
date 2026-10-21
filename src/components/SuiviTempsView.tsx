import { useState, useEffect, useMemo, useRef } from "react";
import {
  Timer,
  Clock,
  Wrench,
  Package,
  FileSignature,
  Calendar,
  Filter,
  Search,
  RefreshCcw,
  Car,
  AlertCircle,
  Hourglass,
  CheckCircle2,
  Calculator,
  Gauge,
} from "lucide-react";
import {
  fetchDatabaseFluxData,
  fetchSuiviEntreesData,
  type SuiviEntree,
} from "../services/database";
import type { Flux } from "../data/mockData";
import {
  formatMinutes,
  getWorkshopWorkingMillisecondsBetween,
  parseDateTimestamp,
  type VehicleTimeCalculation,
} from "../services/timeTracking";
import { buildChronoTimeCalculations } from "../services/chronoCalculations";
import ChronoTimelineModal from "./ChronoTimelineModal";

interface SuiviTempsViewProps {
  userTeam?: string;
}

type PhaseEquipe = {
  key: "" | "1" | "2";
  equipe: string;
  priseEnCharge: string;
  technicien: string;
  dateFinPrevue: string;
  attenteRep: string;
  attentePieces: string;
  attenteDevis: string;
  reaffecte: string;
  essai: string;
};

const valueOrDash = (value: unknown) => {
  const text = String(value || "").trim();
  return text && text !== "-" && text !== "NA" ? text : "-";
};

/**
 * Les transferts conservent l'équipe quittée dans equipe1 puis equipe2 ;
 * l'équipe courante est la dernière phase. L'ordre affiché est donc bien :
 * Daily → Électrique → Carrosserie, même après plusieurs VR.
 */
function getPhasesEquipe(source: Flux | undefined, item: VehicleTimeCalculation): PhaseEquipe[] {
  const raw = (source || {}) as Flux & Record<string, unknown>;
  const phase = (key: "" | "1" | "2", equipe: unknown, fallback = false): PhaseEquipe => ({
    key,
    equipe: valueOrDash(equipe),
    priseEnCharge: valueOrDash(raw[`datePriseEnCharge${key}`] || raw[`dateDebut${key}`] || (fallback ? item.datePriseEnChargeEquipe : "")),
    technicien: valueOrDash(raw[`nomTechnicien${key}`] || raw[`technicien${key}`] || (fallback ? raw.nomTechnicien || raw.technicien : "")),
    dateFinPrevue: valueOrDash(raw[`dateFin${key}`] || raw[`dateFinRep${key}`] || (fallback ? item.dateFinReparation : "")),
    attenteRep: valueOrDash(raw[`dateAttenteRep${key}`] || (fallback ? raw.dateEntree || item.dateEntreeReception : "")),
    attentePieces: valueOrDash(raw[`dateAttentePieces${key}`] || (fallback ? raw.dateDemande : "")),
    attenteDevis: valueOrDash(raw[`dateAttenteDevis${key}`] || (fallback ? raw.dateDevis : "")),
    reaffecte: valueOrDash(raw[`dateReaffecte${key}`] || (fallback ? raw.dateReaffectation : "")),
    essai: valueOrDash(raw[`dateEssai${key}`] || (fallback ? raw.dateDebutEssai : "")),
  });

  const history: PhaseEquipe[] = [];
  if (valueOrDash(raw.equipe1) !== "-") history.push(phase("1", raw.equipe1));
  if (valueOrDash(raw.equipe2) !== "-") history.push(phase("2", raw.equipe2));
  history.push(phase("", raw.equipe || item.equipe, true));

  // Sans transfert, « equipe » est la seule phase. Avec transfert, les
  // snapshots historique précèdent toujours l'équipe courante.
  return history.slice(0, 3);
}

export default function SuiviTempsView({ userTeam }: SuiviTempsViewProps = {}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Flux[]>([]);
  const [suiviList, setSuiviList] = useState<SuiviEntree[]>([]);

  // Filtres
  const [search, setSearch] = useState("");
  const [selectedEquipe, setSelectedEquipe] = useState<string>(() => {
    return userTeam || "Toutes";
  });
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>("Toutes");
  const [customDate, setCustomDate] = useState<string>("");
  const [selectedEtat, setSelectedEtat] = useState<string>("Tous");

  // Modal Chrono
  const [selectedVehicleForChrono, setSelectedVehicleForChrono] = useState<any | null>(null);
  const [isChronoModalOpen, setIsChronoModalOpen] = useState(false);

  // Horloge temps réel (tick chaque seconde) pour les chronos d'attente achat
  const [now, setNow] = useState(() => Date.now());
  const nowRef = useRef(now);
  useEffect(() => {
    const id = setInterval(() => {
      nowRef.current = Date.now();
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);
  // Les durées des attentes en cours sont affichées en minutes : on recalcule
  // les colonnes au changement de minute, tout en gardant la seconde précise
  // pour les compteurs d'achat déjà visibles dans l'écran.
  const clockMinute = Math.floor(now / 60_000);

  /** Formate une durée en ms en "Xh Ym Zs" ou "Ym Zs" */
  const formatElapsed = (ms: number): string => {
    if (ms <= 0) return "0s";
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
    return `${m}m ${String(s).padStart(2, "0")}s`;
  };

  // Synchronisation des données
  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [fluxRows, suiviRows] = await Promise.all([
        fetchDatabaseFluxData().catch(() => [] as Flux[]),
        fetchSuiviEntreesData().catch(() => [] as SuiviEntree[]),
      ]);
      setVehicles(fluxRows);
      setSuiviList(suiviRows);
    } catch (err) {
      if (!silent) {
        setError(
          err instanceof Error
            ? err.message
            : "Erreur lors du chargement des données de temps."
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, []);

  // Écouter les mises à jour locales de time tracking
  useEffect(() => {
    const handleUpdate = () => {
      // Force re-render en clonant le state
      setVehicles((prev) => [...prev]);
    };
    window.addEventListener("vehicle_time_tracking_updated", handleUpdate);
    return () => window.removeEventListener("vehicle_time_tracking_updated", handleUpdate);
  }, []);

  // Fusion et calcul unifié des temps par véhicule
  const timeCalculations = useMemo<VehicleTimeCalculation[]>(() => {
    return buildChronoTimeCalculations(vehicles, suiviList);
  }, [vehicles, suiviList, clockMinute]);

  const sourceVehicleByKey = useMemo(() => {
    const map = new Map<string, Flux>();
    vehicles.forEach((vehicle) => {
      [vehicle.ordre, vehicle.no, vehicle.chassis].forEach((value) => {
        const key = String(value || "").trim().toUpperCase();
        if (key) map.set(key, vehicle);
      });
    });
    return map;
  }, [vehicles]);

  // Liste des équipes uniques pour le filtre
  const equipes = useMemo(() => {
    const list = Array.from(
      new Set(timeCalculations.map((c) => c.equipe).filter(Boolean))
    ).sort();
    return ["Toutes", ...list];
  }, [timeCalculations]);

  // Données filtrées
  const filteredCalculations = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = new Date();
    const todayStr = `${String(today.getDate()).padStart(2, "0")}/${String(
      today.getMonth() + 1
    ).padStart(2, "0")}/${today.getFullYear()}`;

    return timeCalculations.filter((item) => {
      // Filtre Équipe
      if (selectedEquipe !== "Toutes" && item.equipe !== selectedEquipe) {
        return false;
      }

      // Filtre État
      if (selectedEtat !== "Tous") {
        const e = item.etat.toLowerCase();
        if (selectedEtat === "En cours" && !e.includes("cours")) return false;
        if (selectedEtat === "Attente" && !e.includes("attente")) return false;
        if (selectedEtat === "Terminé" && !e.includes("termin") && !e.includes("livr")) return false;
      }

      // Filtre Date
      if (selectedDateFilter === "Aujourd'hui") {
        if (!item.dateEntreeReception?.includes(todayStr)) return false;
      } else if (selectedDateFilter === "Personnalisée" && customDate) {
        // customDate format YYYY-MM-DD -> DD/MM/YYYY
        const parts = customDate.split("-");
        if (parts.length === 3) {
          const formattedCustom = `${parts[2]}/${parts[1]}/${parts[0]}`;
          if (!item.dateEntreeReception?.includes(formattedCustom)) return false;
        }
      }

      // Filtre Recherche
      if (q) {
        const haystack = [
          item.noOr,
          item.chassis,
          item.immatriculation,
          item.client,
          item.equipe,
          item.etat,
          item.dateEntreeReception,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    }).sort((a, b) => {
      // Les dernières entrées restent en haut, y compris après un filtre ou une actualisation.
      const dateA = parseDateTimestamp(a.dateEntreeReception);
      const dateB = parseDateTimestamp(b.dateEntreeReception);
      if (dateA !== dateB) return dateB - dateA;
      return b.vehicleKey.localeCompare(a.vehicleKey, undefined, { numeric: true });
    });
  }, [
    timeCalculations,
    search,
    selectedEquipe,
    selectedEtat,
    selectedDateFilter,
    customDate,
  ]);

  // Statistiques agrégées
  const stats = useMemo(() => {
    const count = filteredCalculations.length;
    if (count === 0) {
      return {
        count: 0,
        avgAttenteRep: "0 min",
        avgTravail: "0 min",
        avgPieces: "0 min",
        avgDevis: "0 min",
      };
    }

    let sumAttenteRep = 0;
    let sumTravail = 0;
    let sumPieces = 0;
    let sumDevis = 0;
    let sumReaffecte = 0;
    let sumEssai = 0;
    let sumRestant = 0;
    let countEnCours = 0;

    filteredCalculations.forEach((item) => {
      sumAttenteRep += item.tempsAttenteReparationMin;
      sumTravail += item.tempsTravailEffectifMin;
      sumPieces += item.tempsAttentePiecesMin;
      sumDevis += item.tempsAttenteDevisMin;
      sumReaffecte += item.tempsReaffecteMin;
      sumEssai += item.tempsEssaiMin;
      if (item.resteTravailStatut !== "termine") {
        sumRestant += item.tempsRestantEstimeMin;
        countEnCours++;
      }
    });

    return {
      count,
      countEnCours,
      avgAttenteRep: formatMinutes(Math.round(sumAttenteRep / count)),
      avgTravail: formatMinutes(Math.round(sumTravail / count)),
      avgPieces: formatMinutes(Math.round(sumPieces / count)),
      avgDevis: formatMinutes(Math.round(sumDevis / count)),
      avgReaffecte: formatMinutes(Math.round(sumReaffecte / count)),
      avgEssai: formatMinutes(Math.round(sumEssai / count)),
      totalRestantFormat: formatMinutes(sumRestant),
    };
  }, [filteredCalculations]);

  const handleOpenChrono = (item: VehicleTimeCalculation) => {
    setSelectedVehicleForChrono(item);
    setIsChronoModalOpen(true);
  };

  return (
    <div className="flex flex-col h-auto min-h-full bg-slate-900/10 p-3 overflow-visible md:h-[calc(100vh-56px)] md:overflow-y-auto md:p-6">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-xs text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => loadData(false)}
            className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-800 font-bold rounded-lg cursor-pointer"
          >
            Réessayer
          </button>
        </div>
      )}
      
      {/* Header Card */}
      <div className="bg-white/95 backdrop-blur-md rounded-2xl p-5 border border-white/60 shadow-lg mb-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-700 flex items-center justify-center text-white shadow-md shadow-indigo-500/25 shrink-0">
              <Timer className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center flex-wrap gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Chronométrie & Calcul des Temps Atelier
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  Administration & Chef d'Atelier
                </span>
                {userTeam && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-blue-100 text-blue-800 border border-blue-200">
                    Équipe: {userTeam}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Vue automatique des données provenant du suivi des entrées, des achats, devis, réaffectations et essais.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => loadData(false)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Actualiser
            </button>
          </div>
        </div>

        {/* KPIs Strips */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4 pt-4 border-t border-slate-100">
          <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-200/60 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
              <Car className="w-4 h-4" />
            </div>
            <div>
              <div className="text-base font-black text-slate-900">{stats.count}</div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Véhicules analysés
              </div>
            </div>
          </div>

          <div className="bg-amber-50/70 rounded-xl p-3 border border-amber-200/60 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-base font-black text-amber-900">{stats.avgAttenteRep}</div>
              <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                Attente Rép. Moy.
              </div>
            </div>
          </div>

          <div className="bg-blue-50/80 rounded-xl p-3 border border-blue-200/60 flex items-center gap-3 shadow-2xs">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <div className="text-base font-black text-blue-900">{stats.avgTravail}</div>
              <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                Travail Net Moyen
              </div>
            </div>
          </div>

          <div className="bg-indigo-50/80 rounded-xl p-3 border border-indigo-200/60 flex items-center gap-3 shadow-2xs">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <Hourglass className="w-4 h-4" />
            </div>
            <div>
              <div className="text-base font-black text-indigo-900">{stats.totalRestantFormat}</div>
              <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                Reste à travailler total
              </div>
            </div>
          </div>

          <div className="bg-orange-50/70 rounded-xl p-3 border border-orange-200/60 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <div className="text-base font-black text-orange-900">{stats.avgPieces}</div>
              <div className="text-[10px] font-bold text-orange-700 uppercase tracking-wider">
                Attente Pièces Moy.
              </div>
            </div>
          </div>

          <div className="bg-purple-50/70 rounded-xl p-3 border border-purple-200/60 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
              <FileSignature className="w-4 h-4" />
            </div>
            <div>
              <div className="text-base font-black text-purple-900">{stats.avgDevis}</div>
              <div className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">
                Attente Devis Moy.
              </div>
            </div>
          </div>

          <div className="bg-fuchsia-50/70 rounded-xl p-3 border border-fuchsia-200/60 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-fuchsia-100 text-fuchsia-700 flex items-center justify-center shrink-0">
              <RefreshCcw className="w-4 h-4" />
            </div>
            <div>
              <div className="text-base font-black text-fuchsia-900">{stats.avgReaffecte}</div>
              <div className="text-[10px] font-bold text-fuchsia-700 uppercase tracking-wider">
                Réaffecté Moy.
              </div>
            </div>
          </div>

          <div className="bg-violet-50/70 rounded-xl p-3 border border-violet-200/60 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
              <Gauge className="w-4 h-4" />
            </div>
            <div>
              <div className="text-base font-black text-violet-900">{stats.avgEssai}</div>
              <div className="text-[10px] font-bold text-violet-700 uppercase tracking-wider">
                Essai Moy.
              </div>
            </div>
          </div>
        </div>

        {/* Bannière Formule Mathématique Réelle */}
        <div className="mt-3.5 p-3 bg-gradient-to-r from-blue-50/90 via-indigo-50/90 to-purple-50/90 rounded-xl border border-indigo-200/70 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center flex-wrap gap-2">
            <span className="p-1 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center">
              <Calculator className="w-3.5 h-3.5" />
            </span>
            <span className="font-bold text-indigo-950">
              Formule de calcul atelier :
            </span>
            <span className="font-mono font-bold text-slate-800 bg-white/95 px-2.5 py-1 rounded-lg border border-indigo-200 shadow-2xs">
              Travail Net = Temps Entrée-Sortie - (Attente Rép + Attente Pièces + Attente Devis + Technicien réaffecté + Essai)
            </span>
          </div>
          <div className="text-[11px] text-indigo-800 font-semibold italic">
            Exemple : 6h - (30min [Rép] + 15min [Pièces] + 3h [Devis] + 30min [Réaff] + 15min [Essai]) = 1h 30min
          </div>
          <div className="flex items-center gap-1.5 text-indigo-800 font-semibold text-[11px] bg-white/60 px-2 py-0.5 rounded-md border border-indigo-100">
            <Hourglass className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>Reste dans le travail = Temps restant estimé pour achever le véhicule</span>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-100">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher par N° OR, Châssis, Immatriculation, Client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* Filtre Équipe */}
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedEquipe}
                onChange={(e) => setSelectedEquipe(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
              >
                {equipes.map((eq) => (
                  <option key={eq} value={eq}>
                    {eq === "Toutes" ? "Toutes les équipes" : `Équipe: ${eq}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtre Date */}
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedDateFilter}
                onChange={(e) => setSelectedDateFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
              >
                <option value="Toutes">Toutes les dates</option>
                <option value="Aujourd'hui">Aujourd'hui</option>
                <option value="Personnalisée">Choisir une date...</option>
              </select>
            </div>

            {selectedDateFilter === "Personnalisée" && (
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
              />
            )}

            {/* Filtre État */}
            <select
              value={selectedEtat}
              onChange={(e) => setSelectedEtat(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
            >
              <option value="Tous">Tous les états</option>
              <option value="En cours">En cours</option>
              <option value="Attente">En attente</option>
              <option value="Terminé">Terminé / Livré</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-white/60 shadow-lg flex-1 flex flex-col min-h-[460px] overflow-hidden">
        <div className="overflow-x-auto flex-1">
          <table className="w-full min-w-[4400px] text-left border-collapse text-xs">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <th className="px-3 py-3">N° OR</th>
                <th className="px-3 py-3">N° Immatriculation</th>
                <th className="min-w-[160px] px-3 py-3">Client</th>
                <th className="px-3 py-3">Date entrée & heure</th>
                {["", " 1", " 2"].flatMap((suffix) => [
                  <th key={`new-team-${suffix}`} className="bg-blue-50 px-3 py-3">Équipe{suffix}</th>,
                  <th key={`new-start-${suffix}`} className="px-3 py-3">Prise en charge{suffix}</th>,
                  <th key={`new-tech-${suffix}`} className="px-3 py-3">Nom de technicien{suffix}</th>,
                  <th key={`new-end-${suffix}`} className="bg-emerald-50 px-3 py-3 text-emerald-800">Date fin prév.{suffix}</th>,
                  <th key={`new-rep-${suffix}`} className="bg-amber-50 px-3 py-3 text-amber-800">Attente rép.{suffix} (date/heure)</th>,
                  <th key={`new-pieces-${suffix}`} className="bg-orange-50 px-3 py-3 text-orange-800">Attente pièces{suffix} (date/heure)</th>,
                  <th key={`new-devis-${suffix}`} className="bg-purple-50 px-3 py-3 text-purple-800">Attente devis{suffix} (date/heure)</th>,
                  <th key={`new-reaff-${suffix}`} className="bg-fuchsia-50 px-3 py-3 text-fuchsia-800">Réaffecté{suffix} (date/heure)</th>,
                  <th key={`new-essai-${suffix}`} className="bg-violet-50 px-3 py-3 text-violet-800">Essai{suffix} (date/heure)</th>,
                ])}
                <th className="bg-blue-100 px-3 py-3 text-blue-900">Travail net</th>
                <th className="bg-indigo-100 px-3 py-3 text-indigo-900">Reste dans le travail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && timeCalculations.length === 0 ? (
                <tr><td colSpan={33} className="py-16 text-center text-slate-400">Calcul et synchronisation des temps d'atelier…</td></tr>
              ) : filteredCalculations.length === 0 ? (
                <tr><td colSpan={33} className="py-16 text-center text-slate-400">Aucun véhicule trouvé pour ces critères.</td></tr>
              ) : filteredCalculations.map((item, index) => {
                const source = sourceVehicleByKey.get(String(item.noOr || "").trim().toUpperCase())
                  || sourceVehicleByKey.get(String(item.chassis || "").trim().toUpperCase());
                const phases = getPhasesEquipe(source, item);
                return (
                  <tr key={`phases-${item.vehicleKey}-${index}`} className="cursor-pointer hover:bg-slate-50" onClick={() => handleOpenChrono(item)}>
                    <td className="px-3 py-3 font-mono font-bold text-slate-900">{item.noOr}</td>
                    <td className="px-3 py-3 font-mono">{item.immatriculation || "-"}</td>
                    <td className="px-3 py-3 font-bold text-slate-800">{item.client}</td>
                    <td className="px-3 py-3 font-mono text-[11px]">{item.dateEntreeReception || "-"}</td>
                    {[0, 1, 2].map((phaseIndex) => {
                      const phase = phases[phaseIndex] || {
                        equipe: "-", priseEnCharge: "-", technicien: "-", dateFinPrevue: "-", attenteRep: "-", attentePieces: "-", attenteDevis: "-", reaffecte: "-", essai: "-",
                      };
                      return (
                        <>
                          <td key={`team-${phaseIndex}`} className="bg-blue-50/40 px-3 py-3 font-bold text-blue-800">{phase.equipe}</td>
                          <td key={`start-${phaseIndex}`} className="px-3 py-3 font-mono text-[11px]">{phase.priseEnCharge}</td>
                          <td key={`tech-${phaseIndex}`} className="px-3 py-3 font-semibold">{phase.technicien}</td>
                          <td key={`end-${phaseIndex}`} className="bg-emerald-50/40 px-3 py-3 font-mono text-[11px] text-emerald-800">{phase.dateFinPrevue}</td>
                          <td key={`rep-${phaseIndex}`} className="bg-amber-50/40 px-3 py-3 font-mono text-[11px] text-amber-800">{phase.attenteRep}</td>
                          <td key={`pieces-${phaseIndex}`} className="bg-orange-50/40 px-3 py-3 font-mono text-[11px] text-orange-800">{phase.attentePieces}</td>
                          <td key={`devis-${phaseIndex}`} className="bg-purple-50/40 px-3 py-3 font-mono text-[11px] text-purple-800">{phase.attenteDevis}</td>
                          <td key={`reaff-${phaseIndex}`} className="bg-fuchsia-50/40 px-3 py-3 font-mono text-[11px] text-fuchsia-800">{phase.reaffecte}</td>
                          <td key={`essai-${phaseIndex}`} className="bg-violet-50/40 px-3 py-3 font-mono text-[11px] text-violet-800">{phase.essai}</td>
                        </>
                      );
                    })}
                    <td className="bg-blue-50 px-3 py-3 font-mono font-black text-blue-900">{item.tempsTravailEffectifFormat}</td>
                    <td className="bg-indigo-50 px-3 py-3 font-mono font-black text-indigo-900">{item.tempsRestantEstimeFormat}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="hidden">
          <table className="zebra-table w-full min-w-[4400px] text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px] select-none sticky top-0 z-10 backdrop-blur-md">
                <th className="py-3 px-3.5 whitespace-nowrap">N° OR</th>
                <th className="py-3 px-3.5 whitespace-nowrap">N° Immatriculation</th>
                <th className="py-3 px-4 min-w-[160px]">Client</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Date Entrée & Heure</th>
                {["", " 1", " 2"].flatMap((suffix) => [
                  <th key={`team-${suffix}`} className="py-3 px-3.5 whitespace-nowrap bg-blue-50/50">Équipe{suffix}</th>,
                  <th key={`start-${suffix}`} className="py-3 px-3.5 whitespace-nowrap">Prise en charge{suffix}</th>,
                  <th key={`tech-${suffix}`} className="py-3 px-3.5 whitespace-nowrap">Nom de technicien{suffix}</th>,
                  <th key={`end-${suffix}`} className="py-3 px-3.5 whitespace-nowrap text-emerald-800 bg-emerald-50/60">Date fin prév.{suffix}</th>,
                  <th key={`rep-${suffix}`} className="py-3 px-3.5 whitespace-nowrap text-amber-700 bg-amber-50/50">Attente rép.{suffix} (date/heure)</th>,
                  <th key={`pieces-${suffix}`} className="py-3 px-3.5 whitespace-nowrap text-orange-700 bg-orange-50/50">Attente pièces{suffix} (date/heure)</th>,
                  <th key={`devis-${suffix}`} className="py-3 px-3.5 whitespace-nowrap text-purple-700 bg-purple-50/50">Attente devis{suffix} (date/heure)</th>,
                  <th key={`reaff-${suffix}`} className="py-3 px-3.5 whitespace-nowrap text-fuchsia-700 bg-fuchsia-50/50">Réaffecté{suffix} (date/heure)</th>,
                  <th key={`essai-${suffix}`} className="py-3 px-3.5 whitespace-nowrap text-violet-700 bg-violet-50/50">Essai{suffix} (date/heure)</th>,
                ])}
                <th className="py-3 px-3.5 whitespace-nowrap text-blue-800 font-black bg-blue-100/60 border-l border-r border-blue-200">
                  <div>🛠️ Travail Net</div>
                  <div className="text-[9px] font-semibold text-blue-600 normal-case">Entrée/Sortie - Attentes</div>
                </th>
                <th className="py-3 px-3.5 whitespace-nowrap text-indigo-900 font-black bg-indigo-100/60 border-r border-indigo-200">
                  <div>⏳ Reste dans le travail</div>
                  <div className="text-[9px] font-semibold text-indigo-600 normal-case">Temps restant estimé</div>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading && timeCalculations.length === 0 ? (
                <tr>
                  <td colSpan={18} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCcw className="w-7 h-7 animate-spin text-indigo-600" />
                      <p className="font-semibold text-slate-700 text-sm">
                        Calcul et synchronisation des temps d'atelier en cours...
                      </p>
                    </div>
                  </td>
                </tr>
              ) : filteredCalculations.length === 0 ? (
                <tr>
                  <td colSpan={18} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Car className="w-8 h-8 text-slate-300" />
                      <p className="font-bold text-slate-700 text-sm">
                        Aucun véhicule trouvé pour ces critères de date et d'équipe.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCalculations.map((item, index) => {
                  const currentAvancement = item.avancement.toLowerCase();
                  const isActiveWork =
                    (currentAvancement.includes("en cours") || item.avancementPct > 0) &&
                    !currentAvancement.includes("attente") &&
                    !currentAvancement.includes("devis") &&
                    !currentAvancement.includes("essai") &&
                    !currentAvancement.includes("réaffect");
                  const workStartedAt = parseDateTimestamp(item.datePriseEnChargeEquipe);
                  const liveWorkElapsed = isActiveWork && workStartedAt > 0
                    ? getWorkshopWorkingMillisecondsBetween(workStartedAt, nowRef.current)
                    : 0;
                  return (
                    <tr
                      key={`${item.vehicleKey}-${index}`}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => handleOpenChrono(item)}
                    >
                      {/* N° OR */}
                      <td className="py-3 px-3.5 font-bold text-slate-900 whitespace-nowrap">
                        <span className="font-mono text-xs">{item.noOr}</span>
                      </td>

                      {/* N° Châssis */}
                      <td className="py-3 px-3.5 font-mono text-slate-700 tracking-tight text-[11px] whitespace-nowrap">
                        {item.chassis}
                      </td>

                      {/* N° Immatriculation */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        {item.immatriculation && item.immatriculation !== "-" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded font-mono font-bold text-[11px] bg-slate-100 text-slate-800 border border-slate-200">
                            {item.immatriculation}
                          </span>
                        ) : (
                          <span className="text-slate-300 italic text-[11px]">-</span>
                        )}
                      </td>

                      {/* Client */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 truncate max-w-[170px]">
                          {item.client}
                        </div>
                      </td>

                      {/* Équipe */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {item.equipe}
                        </span>
                      </td>

                      {/* Date Entrée Réception */}
                      <td className="py-3 px-3.5 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                        {item.dateEntreeReception}
                      </td>

                      {/* Date Fin Prévue de réparation */}
                      <td className="py-3 px-3.5 font-mono text-[11px] text-emerald-800 whitespace-nowrap bg-emerald-50/40">
                        {item.dateFinReparation && item.dateFinReparation !== "En cours" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 border border-emerald-200 font-bold">
                            <Calendar className="w-3 h-3 text-emerald-600" />
                            {item.dateFinReparation}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">À définir</span>
                        )}
                      </td>

                      {/* Prise en Charge Atelier */}
                      <td className="py-3 px-3.5 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                        {item.datePriseEnChargeEquipe}
                      </td>

                      {/* Tout le temps (Séjour total) */}
                      <td className="py-3 px-3.5 font-mono font-extrabold text-xs text-slate-900 whitespace-nowrap bg-slate-50/50">
                        {item.tempsPresenceTotalFormat}
                      </td>

                      {/* Attente Réparation */}
                      <td className="py-3 px-3.5 whitespace-nowrap bg-amber-50/40">
                        <span className="inline-flex items-center gap-1 font-mono font-bold text-[11px] text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md border border-amber-200">
                          <Clock className="w-3 h-3 text-amber-600" />
                          {item.tempsAttenteReparationFormat}
                        </span>
                      </td>

                      {/* Attente Pièces */}
                      <td className="py-3 px-3.5 whitespace-nowrap bg-orange-50/40">
                        {item.achatsEnCours.length > 0 ? (
                          <div className="flex flex-col gap-1.5">
                            {item.achatsEnCours.map((achat) => {
                              const elapsed = achat.dateDemandeTs > 0
                                ? getWorkshopWorkingMillisecondsBetween(achat.dateDemandeTs, nowRef.current)
                                : 0;
                              return (
                                <div key={achat.id} className="flex flex-col gap-0.5">
                                  <span className="inline-flex items-center gap-1 font-mono font-bold text-[10px] text-orange-800 bg-orange-100 px-2 py-0.5 rounded-md border border-orange-300 whitespace-nowrap">
                                    <Package className="w-3 h-3 text-orange-600 shrink-0" />
                                    {achat.designation.length > 18
                                      ? achat.designation.slice(0, 18) + "…"
                                      : achat.designation}
                                  </span>
                                  <span className="text-[10px] text-orange-600 font-mono pl-1">
                                    📅 {achat.dateDemandeStr || "Date inconnue"}
                                  </span>
                                  {elapsed > 0 && (
                                    <span className="text-[10px] font-bold font-mono text-red-600 pl-1 animate-pulse">
                                      ⏱️ {formatElapsed(elapsed)} en attente
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                            {item.tempsAttentePiecesMin > 0 && (
                              <span className="text-[10px] text-orange-500 font-mono pl-1">
                                Total calculé : {item.tempsAttentePiecesFormat}
                              </span>
                            )}
                          </div>
                        ) : item.tempsAttentePiecesMin > 0 ? (
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-[11px] text-orange-800 bg-orange-100 px-2 py-0.5 rounded-md border border-orange-200">
                            <Package className="w-3 h-3 text-orange-600" />
                            {item.tempsAttentePiecesFormat}
                          </span>
                        ) : item.isAttentePiecesActive ? (
                          <span className="inline-flex items-center gap-1 font-bold text-[11px] text-orange-800 bg-orange-100 px-2 py-0.5 rounded-md border border-orange-300">
                            <Package className="w-3 h-3 text-orange-600" />
                            Attente PDR en cours
                          </span>
                        ) : (
                          <span className="text-slate-300 text-[11px] font-mono">0 min</span>
                        )}
                      </td>

                      {/* Attente Devis */}
                      <td className="py-3 px-3.5 whitespace-nowrap bg-purple-50/40">
                        {item.tempsAttenteDevisMin > 0 ? (
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-[11px] text-purple-800 bg-purple-100 px-2 py-0.5 rounded-md border border-purple-200">
                            <FileSignature className="w-3 h-3 text-purple-600" />
                            {item.tempsAttenteDevisFormat}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-[11px] font-mono">0 min</span>
                        )}
                      </td>

                      {/* Technicien réaffecté */}
                      <td className="py-3 px-3.5 whitespace-nowrap bg-fuchsia-50/40">
                        {item.tempsReaffecteMin > 0 ? (
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-[11px] text-fuchsia-800 bg-fuchsia-100 px-2 py-0.5 rounded-md border border-fuchsia-200">
                            <RefreshCcw className="w-3 h-3 text-fuchsia-600" />
                            {item.tempsReaffecteFormat}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-[11px] font-mono">0 min</span>
                        )}
                      </td>

                      {/* Essai Routier */}
                      <td className="py-3 px-3.5 whitespace-nowrap bg-violet-50/40">
                        {item.tempsEssaiMin > 0 ? (
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-[11px] text-violet-800 bg-violet-100 px-2 py-0.5 rounded-md border border-violet-200">
                            <Gauge className="w-3 h-3 text-violet-600" />
                            {item.tempsEssaiFormat}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-[11px] font-mono">0 min</span>
                        )}
                      </td>

                      {/* Travail Net Actif (Tout le temps - Attentes) */}
                      <td
                        className="py-3 px-3.5 whitespace-nowrap bg-blue-50/60 border-l border-r border-blue-100"
                        title={item.formuleCalcul}
                      >
                        <div className="flex flex-col">
                          <span className="inline-flex items-center gap-1 font-mono font-black text-xs text-blue-900 bg-blue-100 px-2.5 py-0.5 rounded-md border border-blue-300 shadow-2xs w-fit">
                            <Wrench className="w-3 h-3 text-blue-700" />
                            {item.tempsTravailEffectifFormat}
                          </span>
                          <span className="text-[10px] text-blue-700/80 font-mono mt-0.5 truncate max-w-[130px]">
                            Total - {item.totalAttentesFormat}
                          </span>
                        </div>
                      </td>

                      {/* ⏳ Reste dans le travail */}
                      <td className="py-3 px-3.5 whitespace-nowrap bg-indigo-50/40 border-r border-indigo-100">
                        {item.resteTravailStatut === "termine" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            0 min (Terminé)
                          </span>
                        ) : item.resteTravailStatut === "depasse" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            {item.tempsRestantEstimeFormat}
                          </span>
                        ) : item.resteTravailStatut === "a_demarrer" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            À démarrer
                          </span>
                        ) : (
                          <div className="flex flex-col items-start gap-1">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-black bg-indigo-100 text-indigo-900 border border-indigo-300 shadow-2xs">
                              <Hourglass className="w-3 h-3 text-indigo-600 shrink-0" />
                              {item.tempsRestantEstimeFormat}
                            </span>
                            {liveWorkElapsed > 0 && (
                              <span className="text-[10px] font-mono font-bold text-emerald-700 whitespace-nowrap">
                                {item.datePriseEnChargeEquipe} • {formatElapsed(liveWorkElapsed)} en travail
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Avancement */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <div className="flex flex-col gap-1 min-w-[90px]">
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                            <span>{item.avancement}</span>
                            <span className="text-[10px] text-slate-400">{item.avancementPct}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${item.avancementPct}%` }}
                              className={`h-full rounded-full transition-all ${
                                item.avancementPct >= 100
                                  ? "bg-emerald-500"
                                  : item.avancementPct >= 50
                                  ? "bg-blue-600"
                                  : "bg-amber-500"
                              }`}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Actions Chrono */}
                      <td
                        className="py-3 px-3.5 whitespace-nowrap text-center sticky right-0 bg-white group-hover:bg-slate-50 transition-colors shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handleOpenChrono(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 transition-all shadow-xs cursor-pointer"
                        >
                          <Timer className="w-3.5 h-3.5" />
                          <span>Détails & Pauses</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {/* Modal de Décomposition Chronologique Pas-à-Pas */}
      {selectedVehicleForChrono && (
        <ChronoTimelineModal
          isOpen={isChronoModalOpen}
          onClose={() => {
            setIsChronoModalOpen(false);
            setSelectedVehicleForChrono(null);
          }}
          vehicle={selectedVehicleForChrono}
          onUpdated={() => loadData(true)}
        />
      )}

    </div>
  );
}
