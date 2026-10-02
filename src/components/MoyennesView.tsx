import { useState, useEffect, useMemo } from "react";
import {
  BarChart3,
  Calendar,
  Download,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  Truck,
  Users,
  CheckCircle2,
  Table as TableIcon,
  RotateCcw,
  Info,
  ShieldAlert,
  Clock,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  Cell,
  Rectangle,
} from "recharts";
import { useRole } from "../context/RoleContext";
import {
  fetchMoyennesSheetData,
  updateDatabaseMoyennesPeriode,
  fetchDatabaseFluxData,
  DEFAULT_MOYENNES_DATA,
  type MoyennesSheetData,
} from "../services/database";
import type { Flux } from "../data/mockData";
import { calculateVehicleTimes, formatMinutes } from "../services/timeTracking";
import { isVehicleFinished, getActiveVehicleForTech } from "./AffecterTechnicienModal";

const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

const STANDARD_TEAMS = [
  "Daily1",
  "Daily2",
  "Changan",
  "Lourd",
  "Service Rapide",
  "Carrosserie",
  "Elictrique"
];

const STANDARD_MODELS = [
  "Eurocargo",
  "Daily",
  "S-Way",
  "IRISBUS",
  "Changan",
  "JMC"
];

const TEAM_COLORS: Record<string, string> = {
  "Daily1": "#1d4ed8",
  "Daily2": "#2563eb",
  "Changan": "#0284c7",
  "Lourd": "#ea580c",
  "Service Rapide": "#d97706",
  "Carrosserie": "#7c3aed",
  "Elictrique": "#059669",
};

const MODEL_COLORS: Record<string, string> = {
  "Eurocargo": "#1d4ed8",
  "Daily": "#059669",
  "S-Way": "#ea580c",
  "IRISBUS": "#d97706",
  "Changan": "#0284c7",
  "JMC": "#7c3aed",
};

const AVAILABLE_YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

interface MoyennesViewProps {
  /** Flux vehicles already loaded by Dashboard — avoids a second DB round-trip */
  vehicles?: Flux[];
}

export default function MoyennesView({ vehicles: vehiclesProp }: MoyennesViewProps = {}) {
  const { role, roleInfo } = useRole();
  const [sheetData, setSheetData] = useState<MoyennesSheetData>(DEFAULT_MOYENNES_DATA);
  // Internal vehicles state — seeded from prop when available, otherwise fetched from DB
  const [vehicles, setVehicles] = useState<Flux[]>(vehiclesProp ?? []);
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(9);
  const [hasInitializedPeriod, setHasInitializedPeriod] = useState<boolean>(false);
  const [loading, setLoading] = useState(!vehiclesProp); // skip loading if prop already provided
  const [refreshing, setRefreshing] = useState(false);
  const [syncingPeriod, setSyncingPeriod] = useState(false);
  const [viewMode, setViewMode] = useState<"sheet" | "techniciens" | "charts">("sheet");
  const [searchFilter, setSearchFilter] = useState("");
  const [notification, setNotification] = useState<string | null>(null);
  // Déclenche un nouveau calcul lorsque les attentes/interruptions sont modifiées dans Chronométrie.
  const [timeTrackingRevision, setTimeTrackingRevision] = useState(0);

  // Security check: only Administration and Chef d'Atelier can access
  const isAuthorized = role === "administration" || role === "chef_atelier";

  // Keep internal vehicles in sync when Dashboard updates the prop (live data)
  useEffect(() => {
    if (vehiclesProp && vehiclesProp.length > 0) {
      setVehicles(vehiclesProp);
    }
  }, [vehiclesProp]);

  const loadData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    try {
      // If vehicles are provided via prop, only fetch the moyennes sheet metadata
      if (vehiclesProp) {
        const fetchedMoyennes = await fetchMoyennesSheetData();
        setSheetData(fetchedMoyennes);
        if (!hasInitializedPeriod) {
          setSelectedYear(fetchedMoyennes.annee || 2026);
          setSelectedMonth(fetchedMoyennes.mois || 9);
          setHasInitializedPeriod(true);
        }
      } else {
        const [fetchedMoyennes, fetchedFlux] = await Promise.all([
          fetchMoyennesSheetData(),
          fetchDatabaseFluxData().catch(() => []),
        ]);
        setSheetData(fetchedMoyennes);
        setVehicles(fetchedFlux);
        if (!hasInitializedPeriod) {
          setSelectedYear(fetchedMoyennes.annee || 2026);
          setSelectedMonth(fetchedMoyennes.mois || 9);
          setHasInitializedPeriod(true);
        }
      }

      if (isManual) {
        showNotification("Données Moyennes actualisées avec succès depuis PostgreSQL !");
      }
    } catch (err) {
      console.error("Erreur lors du chargement des moyennes:", err);
      if (isManual) {
        showNotification("Erreur de connexion. Données en cache affichées.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const handleTimeTrackingUpdate = () => setTimeTrackingRevision((value) => value + 1);
    window.addEventListener("vehicle_time_tracking_updated", handleTimeTrackingUpdate);
    return () => window.removeEventListener("vehicle_time_tracking_updated", handleTimeTrackingUpdate);
  }, []);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  // Is the current view matching the active period configured in PostgreSQL?
  const isDatabasesPeriodActive =
    selectedYear === (sheetData.annee || 2026) &&
    selectedMonth === (sheetData.mois || 9);

  // Synchronize chosen period to cell B1 (Année) and B2 (Mois) in PostgreSQL
  const handleSyncDatabasesPeriod = async () => {
    setSyncingPeriod(true);
    try {
      const res = await updateDatabaseMoyennesPeriode(selectedYear, selectedMonth);
      showNotification(
        res.message ||
          `Période ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} définie dans PostgreSQL !`
      );
      await loadData(true);
    } catch (err) {
      console.error("Erreur mise à jour de la période PostgreSQL:", err);
      showNotification("Erreur lors de la synchronisation avec PostgreSQL.");
    } finally {
      setSyncingPeriod(false);
    }
  };

  // Helper: compute display data from live vehicles for a given year/month.
  // Uses dateEntree (Suivi des Entrées) as the primary date — counts vehicles
  // entered each day, regardless of whether the repair has started.
  const computeLiveData = (yr: number, mo: number): MoyennesSheetData => {
    // Exact number of days in the selected month (e.g. Sept = 30, Feb = 28/29)
    const daysInMonth = new Date(yr, mo, 0).getDate();

    const teamDays: Record<string, number[]> = {};
    const modelDays: Record<string, number[]> = {};
    const ensureTeam = (name: string) => {
      if (!teamDays[name]) teamDays[name] = Array(daysInMonth).fill(0);
    };
    const ensureModel = (name: string) => {
      if (!modelDays[name]) modelDays[name] = Array(daysInMonth).fill(0);
    };
    STANDARD_TEAMS.forEach(ensureTeam);
    STANDARD_MODELS.forEach(ensureModel);

    const codeToFamille = new Map<string, string>();
    (sheetData.correspondances || []).forEach((c) => {
      codeToFamille.set(c.codeModele.toUpperCase().trim(), c.famille.trim());
    });

    vehicles.forEach((veh) => {
      // Prioritize dateEntree (entry date from Suivi des Entrées). Strip time
      // component if present: "28/09/2026 08:30" → "28/09/2026"
      const rawDate = (veh.dateEntree || veh.date || "").trim().split(" ")[0];
      if (!rawDate || rawDate.includes("1899")) return;
      const match = rawDate.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
      if (!match) return;
      const d = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const y = parseInt(match[3], 10);
      if (y !== yr || m !== mo || d < 1 || d > daysInMonth) return;

      // ─── Tableau 1 : passages par équipe ──────────────────────────────────
      // A vehicle transferred between teams is counted once in every team it
      // passed through (e.g. Service Rapide → Daily counts 1 in both rows).
      const teamHistory = [veh.equipe1, veh.equipe2, veh.equipe3, veh.equipe]
        .flatMap((value) => String(value || "").split(","))
        .map((value) => value.trim())
        .filter((value) => value && value !== "-" && value.toLowerCase() !== "non affectée");
      const normalizedTeams = Array.from(new Set((teamHistory.length ? teamHistory : ["Daily1"])
        .map((rawTeam) => {
          const teamName = STANDARD_TEAMS.find(
            (team) => team.toLowerCase() === rawTeam.toLowerCase()
          );
          return teamName || (rawTeam.toLowerCase().includes("daily") ? "Daily1" : rawTeam);
        })));
      normalizedTeams.forEach((teamName) => {
        ensureTeam(teamName);
        teamDays[teamName][d - 1] += 1;
      });

      // ─── Tableau 2 : répartition par famille de modèles ───────────────────
      let modelFamille: string | undefined;
      const modUpper = (veh.modele || "").toUpperCase().trim();
      if (codeToFamille.has(modUpper)) {
        modelFamille = codeToFamille.get(modUpper);
      } else {
        const fullDesc = `${veh.modele || ""} ${veh.atelier || ""}`.toUpperCase();
        if (fullDesc.includes("EUROCARGO") || fullDesc.includes("ML")) modelFamille = "Eurocargo";
        else if (fullDesc.includes("DAILY")) modelFamille = "Daily";
        else if (fullDesc.includes("SWAY") || fullDesc.includes("S-WAY") || fullDesc.includes("AS440") || fullDesc.includes("AT4") || fullDesc.includes("AT7") || fullDesc.includes("AS4") || fullDesc.includes("AD")) modelFamille = "S-Way";
        else if (fullDesc.includes("CHANGAN") || fullDesc.includes("HUNTER") || fullDesc.includes("STAR") || fullDesc.includes("CS35") || fullDesc.includes("GRAND AVENUE")) modelFamille = "Changan";
        else if (fullDesc.includes("IRISBUS") || fullDesc.includes("BUS") || fullDesc.includes("IV-AUTRES")) modelFamille = "IRISBUS";
        else if (fullDesc.includes("JMC") || fullDesc.includes("VIGUS")) modelFamille = "JMC";
      }
      // Every entry must be represented in the model total, even when its
      // code has not yet been assigned to a family in the correspondence list.
      const resolvedFamille = modelFamille || "Non classé";
      ensureModel(resolvedFamille);
      modelDays[resolvedFamille][d - 1] += 1;
    });

    // Active days = days where at least one vehicle entered
    let activeDaysCount = 0;
    for (let dayIdx = 0; dayIdx < daysInMonth; dayIdx++) {
      const sumDay = Object.values(teamDays).reduce((acc, days) => acc + days[dayIdx], 0);
      if (sumDay > 0) activeDaysCount++;
    }

    const baseEquipesRows = Object.keys(teamDays).map((name) => {
      const days = teamDays[name];
      const total = days.reduce((a, b) => a + b, 0);
      return { name, days, total, moyenne: activeDaysCount > 0 ? total / activeDaysCount : 0 };
    });

    // La ligne Daily est une synthèse automatique : Daily1 + Daily2.
    // Elle est affichée dans le tableau sans être ajoutée au total général,
    // afin d'éviter de compter les mêmes véhicules deux fois.
    const dailyDays = Array.from({ length: daysInMonth }, (_, index) =>
      (teamDays.Daily1?.[index] || 0) + (teamDays.Daily2?.[index] || 0)
    );
    const dailyTotal = dailyDays.reduce((sum, value) => sum + value, 0);
    const dailyRow = {
      name: "Daily",
      days: dailyDays,
      total: dailyTotal,
      moyenne: activeDaysCount > 0 ? dailyTotal / activeDaysCount : 0,
    };
    // Daily1 et Daily2 restent utilisées dans le calcul, mais ne sont plus affichées
    // séparément : le tableau présente uniquement leur synthèse « Daily ».
    const equipesRows = [
      dailyRow,
      ...baseEquipesRows.filter(
        (row) =>
          row.name !== "Daily1" &&
          row.name !== "Daily2" &&
          row.name !== "Daily" &&
          !row.name.includes(",")
      ),
    ];
    const equipesTotalDays = Array.from({ length: daysInMonth }, (_, i) =>
      Object.values(teamDays).reduce((acc, days) => acc + days[i], 0)
    );
    const equipesTotalVal = equipesTotalDays.reduce((a, b) => a + b, 0);

    const modelesRows = Object.keys(modelDays).map((name) => {
      const days = modelDays[name];
      const total = days.reduce((a, b) => a + b, 0);
      return { name, days, total, moyenne: activeDaysCount > 0 ? total / activeDaysCount : 0 };
    });
    const modelesTotalDays = Array.from({ length: daysInMonth }, (_, i) =>
      Object.values(modelDays).reduce((acc, days) => acc + days[i], 0)
    );
    const modelesTotalVal = modelesTotalDays.reduce((a, b) => a + b, 0);

    return {
      annee: yr,
      mois: mo,
      equipes: equipesRows,
      equipesTotal: {
        name: "Total", days: equipesTotalDays, total: equipesTotalVal,
        moyenne: activeDaysCount > 0 ? equipesTotalVal / activeDaysCount : 0, isTotal: true,
      },
      modeles: modelesRows,
      modelesTotal: {
        name: "Total", days: modelesTotalDays, total: modelesTotalVal,
        moyenne: activeDaysCount > 0 ? modelesTotalVal / activeDaysCount : 0, isTotal: true,
      },
      correspondances: sheetData.correspondances || DEFAULT_MOYENNES_DATA.correspondances,
      lastUpdated: new Date().toISOString(),
    };
  };

  // Always compute from live vehicles (Suivi des Entrées + Avancement Atelier)
  const displayData = useMemo<MoyennesSheetData>(
    () => computeLiveData(selectedYear, selectedMonth),
    [selectedYear, selectedMonth, sheetData, vehicles, timeTrackingRevision]
  );

  // Days list: 1 to N where N = exact days in the selected month
  const daysInSelectedMonth = useMemo(
    () => new Date(selectedYear, selectedMonth, 0).getDate(),
    [selectedYear, selectedMonth]
  );
  const daysList = useMemo(
    () => Array.from({ length: daysInSelectedMonth }, (_, i) => i + 1),
    [daysInSelectedMonth]
  );

  // Compute active days (days where total > 0 across teams)
  const activeDays = useMemo(() => {
    const list: number[] = [];
    if (!displayData.equipesTotal) return list;
    displayData.equipesTotal.days.forEach((val, idx) => {
      if (val > 0) list.push(idx + 1);
    });
    return list;
  }, [displayData.equipesTotal]);

  // Top Team & Top Model
  const topTeam = useMemo(() => {
    if (!displayData.equipes.length) return null;
    return [...displayData.equipes].sort((a, b) => b.total - a.total)[0];
  }, [displayData.equipes]);

  const topModel = useMemo(() => {
    if (!displayData.modeles.length) return null;
    return [...displayData.modeles].sort((a, b) => b.total - a.total)[0];
  }, [displayData.modeles]);

  // Chart data: Teams comparison
  const teamsChartData = useMemo(() => {
    return displayData.equipes.map((eq) => ({
      name: eq.name,
      total: eq.total,
      moyenne: eq.moyenne,
      color: TEAM_COLORS[eq.name] || "#64748b",
    }));
  }, [displayData.equipes]);

  // Chart data: Models comparison
  const modelsChartData = useMemo(() => {
    return displayData.modeles.map((mod) => ({
      name: mod.name,
      total: mod.total,
      moyenne: mod.moyenne,
      color: MODEL_COLORS[mod.name] || "#64748b",
    }));
  }, [displayData.modeles]);

  // Totaux calculés pour affichage au-dessus des graphiques
  const totalVehiculesEquipes = useMemo(() => {
    return displayData.equipesTotal?.total ?? teamsChartData.reduce((acc, t) => acc + t.total, 0);
  }, [displayData.equipesTotal, teamsChartData]);

  const totalUnitesModeles = useMemo(() => {
    return displayData.modelesTotal?.total ?? modelsChartData.reduce((acc, m) => acc + m.total, 0);
  }, [displayData.modelesTotal, modelsChartData]);

  // Filtered correspondances
  const filteredCorrespondances = useMemo(() => {
    if (!searchFilter.trim()) return displayData.correspondances;
    const q = searchFilter.toLowerCase().trim();
    return displayData.correspondances.filter(
      (c) =>
        c.codeModele.toLowerCase().includes(q) ||
        c.famille.toLowerCase().includes(q)
    );
  }, [displayData.correspondances, searchFilter]);

  // 1. Same entry scope as the two yield tables: all workshop entries,
  // including warranty vehicles, selected by their entry date.
  const periodVehicles = useMemo(() => {
    return vehicles.filter((veh) => {
      const dStr = veh.dateEntree || veh.date || veh.dateDebutRep || "";
      if (!dStr || dStr.includes("1899")) return false;
      const match = dStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      // An invalid date cannot be placed in a daily yield column, so it must
      // not inflate the card above the tables.
      if (!match) return false;
      const m = parseInt(match[2], 10);
      const y = parseInt(match[3], 10);
      return y === selectedYear && m === selectedMonth;
    });
  }, [vehicles, selectedYear, selectedMonth]);

  // 2. Calcul des 8 indicateurs d'atelier pour la page Moyennes
  const atelierStats = useMemo(() => {
    const totalEntres = periodVehicles.length;
    let totalTermines = 0;
    let totalEnCours = 0;
    let sumDureeRepMin = 0;
    let countDureeRep = 0;
    let sumTravailNetMin = 0;

    const techMap = new Map<string, {
      matricule: string;
      name: string;
      equipe: string;
      total: number;
      termines: number;
      enCours: number;
      sumDureeNetMin: number;
      countDuree: number;
    }>();

    periodVehicles.forEach((veh) => {
      const isFin = isVehicleFinished(veh);
      if (isFin) {
        totalTermines++;
      } else {
        totalEnCours++;
      }

      const stats = calculateVehicleTimes(veh);
      if (stats.tempsTravailEffectifMin > 0) {
        sumTravailNetMin += stats.tempsTravailEffectifMin;
      }
      if (isFin && stats.tempsPresenceTotalMin > 0) {
        sumDureeRepMin += stats.tempsPresenceTotalMin;
        countDureeRep++;
      }

      // Ventilation par mécanicien
      const mat = (veh.technicien || "").trim();
      const nom = (veh.nomTechnicien || "").trim();
      if ((mat && mat !== "-") || (nom && nom !== "-")) {
        const key = mat && mat !== "-" ? mat : nom;
        const existing = techMap.get(key) || {
          matricule: mat && mat !== "-" ? mat : "-",
          name: nom && nom !== "-" ? nom : mat,
          equipe: veh.equipe || "-",
          total: 0,
          termines: 0,
          enCours: 0,
          sumDureeNetMin: 0,
          countDuree: 0,
        };
        existing.total++;
        if (isFin) {
          existing.termines++;
        } else {
          existing.enCours++;
        }
        if (stats.tempsTravailEffectifMin > 0) {
          existing.sumDureeNetMin += stats.tempsTravailEffectifMin;
          existing.countDuree++;
        }
        techMap.set(key, existing);
      }
    });

    const tauxTermines = totalEntres > 0 ? Math.round((totalTermines / totalEntres) * 100) : 0;
    const dureeMoyenneRepMin = countDureeRep > 0 ? Math.round(sumDureeRepMin / countDureeRep) : 0;
    const travailNetMoyenMin = totalTermines > 0 ? Math.round(sumTravailNetMin / totalTermines) : (totalEntres > 0 ? Math.round(sumTravailNetMin / totalEntres) : 0);

    const techniciensList = Array.from(techMap.values()).map((t) => {
      const avgNet = t.countDuree > 0 ? Math.round(t.sumDureeNetMin / t.countDuree) : 0;
      const activeCar = getActiveVehicleForTech(t.matricule, t.name, vehicles);
      return {
        ...t,
        avgNetMin: avgNet,
        avgNetFormat: formatMinutes(avgNet),
        activeCar,
        isOccupied: Boolean(activeCar),
      };
    }).sort((a, b) => b.total - a.total);

    return {
      totalEntres,
      totalTermines,
      totalEnCours,
      tauxTermines,
      dureeMoyenneRepMin,
      dureeMoyenneRepFormat: formatMinutes(dureeMoyenneRepMin),
      sumTravailNetMin,
      travailNetTotalFormat: formatMinutes(sumTravailNetMin),
      travailNetMoyenFormat: formatMinutes(travailNetMoyenMin),
      techniciensList,
    };
  }, [periodVehicles, vehicles, timeTrackingRevision]);

  // Daily workload: a vehicle is assigned to the day on which the technician
  // actually started work. When that timestamp is absent, use the repair start
  // date, then the entry date as a final fallback.
  const technicianDailyRows = useMemo(() => {
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const rows = new Map<string, { matricule: string; name: string; equipe: string; days: number[]; total: number }>();

    vehicles.forEach((veh) => {
      const matricule = (veh.technicien || "").trim();
      const name = (veh.nomTechnicien || "").trim();
      if ((!matricule || matricule === "-") && (!name || name === "-")) return;

      const rawDate = (veh.dateDebutTravail || veh.dateDebutRep || veh.dateEntree || veh.date || "").trim().split(" ")[0];
      const match = rawDate.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (!match) return;
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3]);
      if (year !== selectedYear || month !== selectedMonth || day < 1 || day > daysInMonth) return;

      const key = matricule && matricule !== "-" ? matricule : name;
      const existing = rows.get(key) || {
        matricule: matricule && matricule !== "-" ? matricule : "-",
        name: name && name !== "-" ? name : matricule,
        equipe: veh.equipe || "-",
        days: Array(daysInMonth).fill(0),
        total: 0,
      };
      existing.days[day - 1] += 1;
      existing.total += 1;
      rows.set(key, existing);
    });

    return Array.from(rows.values()).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [vehicles, selectedYear, selectedMonth, timeTrackingRevision]);

  // CSV Export handler
  const handleExportCSV = () => {
    let csvContent = `Tableau des Moyennes - ${MONTH_NAMES[(selectedMonth || 9) - 1]} ${selectedYear || 2026}\n\n`;

    csvContent += "EQUIPE," + daysList.join(",") + ",Total,Moyenne\n";
    displayData.equipes.forEach((eq) => {
      csvContent += `"${eq.name}",` + eq.days.join(",") + `,${eq.total},"${eq.moyenne.toFixed(2)}"\n`;
    });
    if (displayData.equipesTotal) {
      csvContent += `"Total",` + displayData.equipesTotal.days.join(",") + `,${displayData.equipesTotal.total},"${displayData.equipesTotal.moyenne.toFixed(2)}"\n`;
    }

    csvContent += "\n\nMODELE," + daysList.join(",") + ",Total,Moyenne\n";
    displayData.modeles.forEach((mod) => {
      csvContent += `"${mod.name}",` + mod.days.join(",") + `,${mod.total},"${mod.moyenne.toFixed(2)}"\n`;
    });
    if (displayData.modelesTotal) {
      csvContent += `"Total",` + displayData.modelesTotal.days.join(",") + `,${displayData.modelesTotal.total},"${displayData.modelesTotal.moyenne.toFixed(2)}"\n`;
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `moyennes_atelier_${selectedYear}_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification("Export CSV téléchargé !");
  };

  // If unauthorized role
  if (!isAuthorized) {
    return (
      <div className="p-8 max-w-xl mx-auto my-12 bg-white rounded-2xl border border-rose-200 shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert size={26} />
        </div>
        <h2 className="text-lg font-black text-slate-900 mb-2">Accès Réservé</h2>
        <p className="text-sm text-slate-600 mb-4">
          La page <strong>Moyennes & Rendement Journalier</strong> est strictement réservée à la <strong>Direction / Administration</strong> et au <strong>Chef d'Atelier</strong>.
        </p>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
          Votre rôle actuel : <span className="font-bold text-rose-600">{roleInfo.title}</span>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-16 max-w-xl mx-auto my-12 bg-white rounded-2xl border border-slate-200 shadow-sm text-center">
        <RefreshCw size={28} className="animate-spin text-blue-700 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-800 mb-1">Chargement des tableaux Moyennes...</h3>
        <p className="text-xs text-slate-500">Connexion à PostgreSQL (source PostgreSQL)</p>
      </div>
    );
  }

  const isDataEmpty = (displayData.equipesTotal?.total || 0) === 0;

  // Rendu permanent du rectangle avec son chiffre en noir au-dessus (ne s'éteint JAMAIS, ne clignote pas)
  const renderBarWithPermanentNumber = (props: any) => {
    const { x, y, width, height, fill } = props;
    const val = typeof props.value === "number" ? props.value : (props.payload?.total ?? 0);
    return (
      <g>
        <Rectangle x={x} y={y} width={width} height={height} fill={fill} radius={[5, 5, 0, 0]} />
        {val > 0 && (
          <text
            x={x + width / 2}
            y={y - 8}
            fill="#000000"
            textAnchor="middle"
            fontSize={14}
            fontWeight={900}
          >
            {val}
          </text>
        )}
      </g>
    );
  };

  const printedAt = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());

  return (
    <div className="moyennes-print-root w-full h-full flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-4 flex flex-col gap-3 bg-slate-100/80">
      <header className="moyennes-print-header hidden">
        <div>
          <p className="moyennes-print-kicker">ITALCAR · FLUX ATELIER</p>
          <h1>Rendement Journalier &amp; Moyennes</h1>
          <p className="moyennes-print-period">Période analysée : {MONTH_NAMES[selectedMonth - 1]} {selectedYear}</p>
        </div>
        <div className="moyennes-print-meta">
          <strong>Rapport atelier</strong>
          <span>Édité le {printedAt}</span>
          <span>Source : données temps réel</span>
        </div>
      </header>
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-16 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 bg-emerald-600 text-white rounded-xl shadow-2xl animate-fade-in border border-emerald-500/40 text-xs font-bold">
          <CheckCircle2 size={16} />
          <span>{notification}</span>
        </div>
      )}

      {/* Compact Header & Controls Bar matching page dimension */}
      <div className="moyennes-print-hide bg-white rounded-xl px-4 py-2.5 border border-slate-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Title & Interactive Date selectors */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-700 text-white flex items-center justify-center font-black shadow-2xs">
              <BarChart3 size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-slate-900 tracking-tight">Rendement Journalier & Moyennes</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-blue-50 text-blue-800 border border-blue-200">
                  {roleInfo.title}
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                Suivi quantitatif mensuel par Équipe & Famille de Modèles
              </span>
            </div>
          </div>

          {/* SÉLECTEUR INTERACTIF DE PÉRIODE (Année & Mois modifiables) */}
          <div className="flex items-center gap-1.5 flex-wrap bg-slate-50 border border-slate-200/90 rounded-lg p-1 text-xs">
            {/* Année Dropdown */}
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white rounded border border-slate-300 shadow-2xs hover:border-blue-400 transition-colors">
              <span className="text-slate-400 font-bold text-[10px] uppercase">Année</span>
              <select
                aria-label="Année"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-transparent text-blue-700 font-extrabold text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 rounded py-0.5"
              >
                {AVAILABLE_YEARS.map((yr) => (
                  <option key={yr} value={yr} className="text-slate-900 font-bold">
                    {yr}
                  </option>
                ))}
              </select>
            </div>

            {/* Mois Dropdown */}
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white rounded border border-slate-300 shadow-2xs hover:border-blue-400 transition-colors">
              <Calendar size={13} className="text-blue-600 shrink-0" />
              <span className="text-slate-400 font-bold text-[10px] uppercase">Mois</span>
              <select
                aria-label="Mois"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-transparent text-blue-700 font-extrabold text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 rounded py-0.5"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={idx + 1} value={idx + 1} className="text-slate-900 font-bold">
                    {idx + 1} ({name})
                  </option>
                ))}
              </select>
            </div>

            {/* Status indicator / PostgreSQL sync button */}
            {isDatabasesPeriodActive ? (
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <CheckCircle2 size={11} className="text-emerald-600" />
                <span>Mois actif</span>
              </span>
            ) : (
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleSyncDatabasesPeriod}
                  disabled={syncingPeriod}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-700 hover:bg-blue-800 text-white text-[10px] font-bold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                  title="Enregistrer ce mois et cette année comme période active"
                >
                  {syncingPeriod ? (
                    <RefreshCw size={10} className="animate-spin" />
                  ) : (
                    <Sparkles size={10} className="text-amber-300" />
                  )}
                  <span>Enregistrer la période</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedYear(sheetData.annee || 2026);
                    setSelectedMonth(sheetData.mois || 9);
                  }}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:text-blue-700 bg-white hover:bg-slate-100 rounded border border-slate-200 transition-colors cursor-pointer"
                  title={`Revenir à la période active (${MONTH_NAMES[(sheetData.mois || 9) - 1]} ${sheetData.annee || 2026})`}
                >
                  <RotateCcw size={10} />
                  <span className="hidden xl:inline">Période active</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Quick KPI Pills in header strip */}
        <div className="hidden lg:flex items-center gap-2">
          <div className="px-2.5 py-1 rounded-lg bg-blue-50/80 border border-blue-200 text-xs font-bold text-blue-900 flex items-center gap-1.5">
            <Users size={13} className="text-blue-600" />
            <span>Total Équipes:</span>
            <span className="font-black text-blue-700">{displayData.equipesTotal?.total || 0}</span>
            <span className="text-[10px] text-blue-500 font-medium">
              (Moy: {displayData.equipesTotal ? displayData.equipesTotal.moyenne.toFixed(2) : "0"})
            </span>
          </div>

          <div className="px-2.5 py-1 rounded-lg bg-emerald-50/80 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center gap-1.5">
            <Truck size={13} className="text-emerald-600" />
            <span>Total Modèles:</span>
            <span className="font-black text-emerald-700">{displayData.modelesTotal?.total || 0}</span>
            <span className="text-[10px] text-emerald-600 font-medium">(Top: {topModel?.name || "Daily"})</span>
          </div>

          <div className="px-2.5 py-1 rounded-lg bg-amber-50/80 border border-amber-200 text-xs font-bold text-amber-900 flex items-center gap-1.5">
            <Sparkles size={13} className="text-amber-600" />
            <span>Leader:</span>
            <span className="font-black text-amber-700">{topTeam?.name || "Daily1"}</span>
            <span className="text-[10px] text-amber-600 font-medium">({topTeam?.total || 0})</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* ─── Source fixe : toujours Temps Réel ─── */}
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-extrabold shadow-sm select-none"
            title="Données calculées en temps réel depuis Suivi des Entrées & Avancement Atelier"
          >
            <span>⚡</span>
            <span>Temps Réel</span>
          </span>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => setViewMode("sheet")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                viewMode === "sheet" ? "bg-white text-blue-800 shadow-2xs font-extrabold" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <TableIcon size={13} />
              <span>Tableaux</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("techniciens")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                viewMode === "techniciens" ? "bg-white text-blue-800 shadow-2xs font-extrabold" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Users size={13} />
              <span>Par Technicien ({atelierStats.techniciensList.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("charts")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                viewMode === "charts" ? "bg-white text-blue-800 shadow-2xs font-extrabold" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <BarChart3 size={13} />
              <span>Graphiques</span>
            </button>
          </div>

          {/* Refresh */}
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
            title="Actualiser depuis PostgreSQL"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Actualiser</span>
          </button>

          {/* Export CSV */}
          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
            title="Exporter CSV"
          >
            <Download size={13} />
            <span className="hidden sm:inline">CSV</span>
          </button>

          {/* Print */}
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1 p-1.5 sm:px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 transition-colors cursor-pointer"
            title="Imprimer la vue affichée (tableaux ou graphiques)"
          >
            <Printer size={14} />
            <span className="hidden sm:inline text-xs font-bold">Imprimer</span>
          </button>
        </div>
      </div>

      {/* Executive Workshop KPI Dashboard - 8 Indicateurs de l'Atelier */}
      <div className="moyennes-print-kpis grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
        {/* KPI 1 : Véhicules Entrés */}
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Véhicules Entrés</span>
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
              <Truck size={14} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{atelierStats.totalEntres}</span>
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
              {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1">Reçus en atelier pour la période</span>
        </div>

        {/* KPI 2 : Véhicules Terminés & Taux */}
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Véhicules Terminés</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={14} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-700">{atelierStats.totalTermines}</span>
            <span className="text-[10px] font-black text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300">
              Taux : {atelierStats.tauxTermines}%
            </span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1">{atelierStats.totalEnCours} en cours ou attente</span>
        </div>

        {/* KPI 3 : Temps Moyen de Réparation */}
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Temps Moyen Rép.</span>
            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-700">
              <Clock size={14} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-black text-slate-900">{atelierStats.dureeMoyenneRepFormat}</span>
            <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">
              Début → Fin
            </span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1">Durée moyenne de prise en charge</span>
        </div>

        {/* KPI 4 : Travail Net Effectif */}
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Travail Net Effectif</span>
            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700">
              <Sparkles size={14} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-black text-indigo-900">{atelierStats.travailNetTotalFormat}</span>
            <span className="text-[10px] font-bold text-indigo-800 bg-indigo-50 px-1.5 py-0.5 rounded">
              Moy: {atelierStats.travailNetMoyenFormat}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1">Après déduction des temps d'attente</span>
        </div>
      </div>

      {/* Info notice if custom month/year selected */}
      {!isDatabasesPeriodActive && (
        <div className="moyennes-print-hide bg-amber-50 border border-amber-200/90 rounded-xl px-3.5 py-2 text-xs flex flex-wrap items-center justify-between gap-2 text-amber-900 shadow-2xs">
          <div className="flex items-center gap-2">
            <Info size={15} className="text-amber-600 shrink-0" />
            <span>
              Consultation de la période : <strong>{MONTH_NAMES[selectedMonth - 1]} {selectedYear}</strong>.
              {isDataEmpty ? (
                <span className="ml-1 text-amber-700">
                  (Aucune intervention enregistrée pour ce mois. La période active enregistrée est{" "}
                  <strong>{MONTH_NAMES[(sheetData.mois || 9) - 1]} {sheetData.annee || 2026}</strong>).
                </span>
              ) : (
                <span className="ml-1 text-amber-700">
                  (Interventions calculées pour ce mois).
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSyncDatabasesPeriod}
              disabled={syncingPeriod}
              className="px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
            >
              <Sparkles size={11} />
              <span>Définir la période active dans PostgreSQL</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedYear(sheetData.annee || 2026);
                setSelectedMonth(sheetData.mois || 9);
              }}
              className="px-2 py-1 rounded-md bg-white hover:bg-amber-100 border border-amber-300 font-semibold text-[11px] text-amber-900 transition-colors cursor-pointer flex items-center gap-1"
            >
              <RotateCcw size={11} />
              <span>Revenir à {MONTH_NAMES[(sheetData.mois || 9) - 1]} {sheetData.annee || 2026}</span>
            </button>
          </div>
        </div>
      )}

      {/* Grille mensuelle des moyennes par jour */}
      {viewMode === "sheet" && (
        <div className="moyennes-print-content w-full grid grid-cols-1 xl:grid-cols-12 gap-3 items-start">
          {/* LEFT SIDE: TABLE 1 (EQUIPES) & TABLE 2 (MODELES) - xl:col-span-9 */}
          <div className="xl:col-span-9 space-y-3">
            
            {/* TABLEAU 1: EQUIPE (1..31, Total, Moyenne) */}
            <div className="moyennes-print-table bg-white rounded-xl border border-slate-300 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="zebra-table w-full text-center border-collapse text-[11px]">
                  <thead>
                    {/* Blue Excel-style Header */}
                    <tr className="bg-[#1f4e79] text-white font-bold border-b border-[#1b3a57]">
                      <th className="py-1.5 px-3 text-left font-black tracking-wide bg-[#1f4e79] sticky left-0 z-10 min-w-[125px] border-r border-[#2a6296]">
                        EQUIPE
                      </th>
                      {daysList.map((day) => {
                        const isActive = activeDays.includes(day);
                        return (
                          <th
                            key={`th-eq-${day}`}
                            className={`py-1 px-0.5 w-[25px] min-w-[23px] text-[10px] font-extrabold border-r border-[#2a6296]/60 ${
                              isActive ? "bg-[#285d91] text-amber-300" : "text-white"
                            }`}
                          >
                            {day}
                          </th>
                        );
                      })}
                      <th className="py-1.5 px-2 w-12 font-black bg-[#183d5f] border-r border-[#2a6296]">
                        Total
                      </th>
                      <th className="py-1.5 px-2 w-14 font-black bg-[#153450]">
                        Moyenne
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-medium">
                    {displayData.equipes.map((row, rowIdx) => {
                      return (
                        <tr
                          key={`row-eq-${row.name}`}
                          className={`hover:bg-blue-50/40 transition-colors ${
                            rowIdx % 2 === 1 ? "bg-slate-50/60" : "bg-white"
                          }`}
                        >
                          <td className="py-1 px-3 text-left font-bold text-slate-900 sticky left-0 bg-inherit z-10 border-r border-slate-200 truncate">
                            {row.name}
                          </td>
                          {row.days.map((val, dIdx) => {
                            const isActive = val > 0;
                            return (
                              <td
                                key={`cell-eq-${row.name}-${dIdx}`}
                                className={`py-1 px-0.5 border-r border-slate-200/60 text-center ${
                                  isActive ? "bg-blue-50 font-black text-blue-900" : "text-slate-400 font-normal"
                                }`}
                              >
                                {isActive ? (
                                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded bg-blue-600 text-white font-black text-[10.5px]">
                                    {val}
                                  </span>
                                ) : (
                                  0
                                )}
                              </td>
                            );
                          })}
                          <td className="py-1 px-2 font-black text-slate-900 bg-slate-100/70 border-r border-slate-200">
                            {row.total}
                          </td>
                          <td className="py-1 px-2 font-black text-blue-800 bg-blue-50/50">
                            {row.moyenne.toFixed(2).replace(".", ",")}
                          </td>
                        </tr>
                      );
                    })}

                    {/* GREEN TOTAL ROW */}
                    {displayData.equipesTotal && (
                      <tr className="bg-[#385723] text-white font-black border-t-2 border-[#2b441b]">
                        <td className="py-1.5 px-3 text-left sticky left-0 bg-[#385723] z-10 border-r border-[#4c7530]">
                          Total
                        </td>
                        {displayData.equipesTotal.days.map((val, dIdx) => (
                          <td
                            key={`tot-eq-${dIdx}`}
                            className={`py-1 px-0.5 border-r border-[#4c7530]/60 ${
                              val > 0 ? "bg-[#456c2c] text-white font-black" : "text-emerald-200/60 font-normal"
                            }`}
                          >
                            {val > 0 ? val : 0}
                          </td>
                        ))}
                        <td className="py-1.5 px-2 bg-[#2d461c] font-black border-r border-[#4c7530] text-xs">
                          {displayData.equipesTotal.total}
                        </td>
                        <td className="py-1.5 px-2 bg-[#243916] font-black text-xs">
                          {displayData.equipesTotal.moyenne.toFixed(2).replace(".", ",")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* TABLEAU 2: MODÈLES (1..31, Total, Moyenne) */}
            <div className="moyennes-print-table bg-white rounded-xl border border-slate-300 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="zebra-table w-full text-center border-collapse text-[11px]">
                  <thead>
                    {/* Blue Excel-style Header */}
                    <tr className="bg-[#1f4e79] text-white font-bold border-b border-[#1b3a57]">
                      <th className="py-1.5 px-3 text-left font-black tracking-wide bg-[#1f4e79] sticky left-0 z-10 min-w-[125px] border-r border-[#2a6296]">
                        Modèle
                      </th>
                      {daysList.map((day) => {
                        const isActive = activeDays.includes(day);
                        return (
                          <th
                            key={`th-mod-${day}`}
                            className={`py-1 px-0.5 w-[25px] min-w-[23px] text-[10px] font-extrabold border-r border-[#2a6296]/60 ${
                              isActive ? "bg-[#285d91] text-amber-300" : "text-white"
                            }`}
                          >
                            {day}
                          </th>
                        );
                      })}
                      <th className="py-1.5 px-2 w-12 font-black bg-[#183d5f] border-r border-[#2a6296]">
                        Total
                      </th>
                      <th className="py-1.5 px-2 w-14 font-black bg-[#153450]">
                        Moyenne
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-medium">
                    {displayData.modeles.map((row, rowIdx) => {
                      return (
                        <tr
                          key={`row-mod-${row.name}`}
                          className={`hover:bg-blue-50/40 transition-colors ${
                            rowIdx % 2 === 1 ? "bg-slate-50/60" : "bg-white"
                          }`}
                        >
                          <td className="py-1 px-3 text-left font-bold text-slate-900 sticky left-0 bg-inherit z-10 border-r border-slate-200 truncate">
                            {row.name}
                          </td>
                          {row.days.map((val, dIdx) => {
                            const isActive = val > 0;
                            return (
                              <td
                                key={`cell-mod-${row.name}-${dIdx}`}
                                className={`py-1 px-0.5 border-r border-slate-200/60 text-center ${
                                  isActive ? "bg-blue-50 font-black text-blue-900" : "text-slate-400 font-normal"
                                }`}
                              >
                                {isActive ? (
                                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded bg-blue-600 text-white font-black text-[10.5px]">
                                    {val}
                                  </span>
                                ) : (
                                  0
                                )}
                              </td>
                            );
                          })}
                          <td className="py-1 px-2 font-black text-slate-900 bg-slate-100/70 border-r border-slate-200">
                            {row.total}
                          </td>
                          <td className="py-1 px-2 font-black text-blue-800 bg-blue-50/50">
                            {row.moyenne.toFixed(2).replace(".", ",")}
                          </td>
                        </tr>
                      );
                    })}

                    {/* GREEN TOTAL ROW */}
                    {displayData.modelesTotal && (
                      <tr className="bg-[#385723] text-white font-black border-t-2 border-[#2b441b]">
                        <td className="py-1.5 px-3 text-left sticky left-0 bg-[#385723] z-10 border-r border-[#4c7530]">
                          Total
                        </td>
                        {displayData.modelesTotal.days.map((val, dIdx) => (
                          <td
                            key={`tot-mod-${dIdx}`}
                            className={`py-1 px-0.5 border-r border-[#4c7530]/60 ${
                              val > 0 ? "bg-[#456c2c] text-white font-black" : "text-emerald-200/60 font-normal"
                            }`}
                          >
                            {val > 0 ? val : 0}
                          </td>
                        ))}
                        <td className="py-1.5 px-2 bg-[#2d461c] font-black border-r border-[#4c7530] text-xs">
                          {displayData.modelesTotal.total}
                        </td>
                        <td className="py-1.5 px-2 bg-[#243916] font-black text-xs">
                          {displayData.modelesTotal.moyenne.toFixed(2).replace(".", ",")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          {/* RIGHT SIDE: TABLE 3 (CORRESPONDANCE DES MODELES) - xl:col-span-3 */}
          <div className="moyennes-print-hide xl:col-span-3 bg-white rounded-xl border border-slate-300 shadow-2xs overflow-hidden flex flex-col">
            {/* Header matching Excel sheet */}
            <div className="bg-[#1f4e79] text-white px-3 py-1.5 border-b border-[#1b3a57] flex items-center justify-between">
              <span className="font-black text-xs tracking-wide">
                CORRESPONDANCE DES MODÈLES
              </span>
              <span className="text-[10px] font-bold bg-[#183d5f] px-2 py-0.5 rounded text-blue-200">
                {filteredCorrespondances.length}
              </span>
            </div>

            {/* Sub-header with search input */}
            <div className="p-2 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2 text-slate-400" size={13} />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Rechercher code ou famille..."
                  className="w-full pl-7 pr-2 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-600 font-medium"
                />
              </div>
            </div>

            {/* Table Columns Header */}
            <div className="grid grid-cols-2 bg-[#2a6296] text-white text-[11px] font-bold py-1 px-3 border-b border-[#1f4e79]">
              <span>Code Modèle</span>
              <span>Famille</span>
            </div>

            {/* Scrollable list matching the height of the left tables */}
            <div className="overflow-y-auto max-h-[520px] divide-y divide-slate-100 text-xs">
              {filteredCorrespondances.map((item, idx) => (
                <div
                  key={`corresp-item-${item.codeModele}-${idx}`}
                  className={`grid grid-cols-2 py-1 px-3 items-center hover:bg-blue-50/60 transition-colors ${
                    idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"
                  }`}
                >
                  <span className="font-mono font-bold text-slate-900 text-[11px]">
                    {item.codeModele}
                  </span>
                  <span className="font-semibold text-slate-700 text-[11px] truncate">
                    {item.famille}
                  </span>
                </div>
              ))}
              {filteredCorrespondances.length === 0 && (
                <div className="p-4 text-center text-slate-400 text-xs font-semibold">
                  Aucun résultat
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Alternative View Mode: PAR TECHNICIEN */}
      {viewMode === "techniciens" && (
        <div className="moyennes-print-content bg-white rounded-xl border border-slate-300 shadow-2xs overflow-hidden flex flex-col">
          <div className="bg-[#1f4e79] text-white px-4 py-2.5 border-b border-[#1b3a57] flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-black text-sm tracking-wide flex items-center gap-2">
                <Users size={16} />
                <span>RENDEMENT & DISPONIBILITÉ PAR TECHNICIEN ({MONTH_NAMES[selectedMonth - 1]} {selectedYear})</span>
              </span>
              <p className="text-[11px] text-blue-200 mt-0.5">
                Nombre de véhicules traités, interventions terminées, durée de travail net effectif et statut en temps réel
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold bg-[#183d5f] px-2.5 py-1 rounded text-white">
                {atelierStats.techniciensList.length} collaborateurs actifs
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="zebra-table w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200">
                  <th className="py-2.5 px-3">N° Matricule</th>
                  <th className="py-2.5 px-3">NOM DE TECHNICIEN</th>
                  <th className="py-2.5 px-3">Équipe</th>
                  <th className="py-2.5 px-3 text-center">Véhicules Reçus</th>
                  <th className="py-2.5 px-3 text-center">Terminés</th>
                  <th className="py-2.5 px-3 text-center">En cours</th>
                  <th className="py-2.5 px-3 text-center">Travail Net Moyen</th>
                  <th className="py-2.5 px-3 text-center">Statut Actuel</th>
                  <th className="py-2.5 px-3">Intervention Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {atelierStats.techniciensList.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      Aucune intervention affectée à un technicien sur la période {MONTH_NAMES[selectedMonth - 1]} {selectedYear}.
                    </td>
                  </tr>
                ) : (
                  atelierStats.techniciensList.map((tech) => (
                    <tr key={`${tech.matricule}_${tech.name}`} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        {tech.matricule}
                      </td>
                      <td className="py-2.5 px-3 font-extrabold text-slate-900">
                        {tech.name}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {tech.equipe}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-black text-slate-900">
                        {tech.total}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-emerald-700">
                        {tech.termines}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-blue-700">
                        {tech.enCours}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-semibold text-slate-700">
                        {tech.avgNetFormat}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {tech.isOccupied ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                            Occupé
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                            Disponible
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[11px]">
                        {tech.activeCar ? (
                          <div className="flex items-center gap-1.5 text-slate-700 flex-wrap">
                            <strong className="text-slate-900 font-mono">OR {tech.activeCar.no || tech.activeCar.serie}</strong>
                            <span>•</span>
                            <span>{tech.activeCar.marque} {tech.activeCar.modele || ""}</span>
                            <span>•</span>
                            <span className="font-mono text-blue-700 font-bold">Emp: {tech.activeCar.emplacement || "-"}</span>
                            <span>•</span>
                            <span>{tech.activeCar.avancement || "En cours"}</span>
                            <span>•</span>
                            <span className="text-slate-500">Début: {tech.activeCar.heureDebutTravail || tech.activeCar.dateDebutRep?.split(" ")[1] || "-"}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Aucun véhicule actif</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-300 bg-slate-50/70">
            <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-black text-sm text-slate-900">VÉHICULES TRAVAILLÉS PAR JOUR</h2>
                <p className="text-[11px] text-slate-500">Comptage selon la date de début de travail de chaque technicien.</p>
              </div>
              <span className="text-[11px] font-bold text-blue-800 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                {technicianDailyRows.length} technicien(s)
              </span>
            </div>
            <div className="overflow-x-auto bg-white">
              <table className="w-full min-w-[1250px] text-center border-collapse text-[11px]">
                <thead>
                  <tr className="bg-[#2a6296] text-white font-bold">
                    <th className="sticky left-0 z-10 bg-[#1f4e79] py-2 px-3 text-left min-w-[110px]">Matricule</th>
                    <th className="sticky left-[110px] z-10 bg-[#1f4e79] py-2 px-3 text-left min-w-[160px]">Technicien</th>
                    {daysList.map((day) => <th key={day} className="py-2 px-2 min-w-8">{day}</th>)}
                    <th className="py-2 px-3 bg-[#183d5f]">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {technicianDailyRows.length === 0 ? (
                    <tr><td colSpan={daysList.length + 3} className="py-6 text-slate-400">Aucun véhicule travaillé sur cette période.</td></tr>
                  ) : technicianDailyRows.map((tech) => (
                    <tr key={`daily-${tech.matricule}-${tech.name}`} className="hover:bg-blue-50/50">
                      <td className="sticky left-0 z-10 bg-white py-2 px-3 text-left font-mono font-bold text-slate-800">{tech.matricule}</td>
                      <td className="sticky left-[110px] z-10 bg-white py-2 px-3 text-left font-bold text-slate-900">{tech.name}</td>
                      {tech.days.map((count, index) => (
                        <td key={index} className={`py-2 px-2 font-bold ${count > 0 ? "text-blue-800 bg-blue-50/70" : "text-slate-300"}`}>{count}</td>
                      ))}
                      <td className="py-2 px-3 font-black text-blue-900 bg-blue-50">{tech.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Alternative View Mode: VISUAL CHARTS */}
      {viewMode === "charts" && (
        <div className="moyennes-print-content moyennes-print-charts grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Bar Chart: Par Équipe */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
              <div>
                <h3 className="text-sm font-black text-slate-900 mb-0.5 flex items-center gap-2">
                  <Users size={16} className="text-blue-700" />
                  <span>Volume Réalisé par Équipe ({MONTH_NAMES[selectedMonth - 1]} {selectedYear})</span>
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">Comparatif des interventions terminées sur le mois</p>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black bg-blue-50 text-blue-900 border border-blue-200 shrink-0 self-start sm:self-auto shadow-2xs">
                <span>Total véhicules =</span>
                <span className="px-2 py-0.5 rounded-md bg-blue-700 text-white font-black text-xs">
                  {totalVehiculesEquipes}
                </span>
              </div>
            </div>

            {/* Graphique avec les nombres directement au-dessus des barres comme dans l'exemple manuscrit */}
            <div className="h-72 w-full mt-auto">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={teamsChartData} margin={{ top: 25, right: 10, left: -20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} angle={-25} textAnchor="end" height={45} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    allowDecimals={false}
                    domain={[0, (dataMax: number) => (dataMax > 0 ? Math.ceil(dataMax * 1.35) + 3 : 5)]}
                  />
                  <RechartsTooltip
                    formatter={(val: any) => [val, "Total véhicules"]}
                    contentStyle={{ borderRadius: 8, border: "1px solid #cbd5e1" }}
                  />
                  <Bar
                    dataKey="total"
                    name="Total véhicules"
                    isAnimationActive={false}
                    shape={renderBarWithPermanentNumber}
                  >
                    {teamsChartData.map((entry, index) => (
                      <Cell key={`cell-team-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bar Chart: Par Modèle */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
              <div>
                <h3 className="text-sm font-black text-slate-900 mb-0.5 flex items-center gap-2">
                  <Truck size={16} className="text-blue-700" />
                  <span>Volume par Famille de Modèles ({MONTH_NAMES[selectedMonth - 1]} {selectedYear})</span>
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">Répartition du flux selon la gamme de véhicules</p>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black bg-emerald-50 text-emerald-900 border border-emerald-200 shrink-0 self-start sm:self-auto shadow-2xs">
                <span>Total unités =</span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white font-black text-xs">
                  {totalUnitesModeles}
                </span>
              </div>
            </div>

            {/* Graphique avec les nombres directement au-dessus des barres comme dans l'exemple manuscrit */}
            <div className="h-72 w-full mt-auto">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modelsChartData} margin={{ top: 25, right: 10, left: -20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} angle={-25} textAnchor="end" height={45} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    allowDecimals={false}
                    domain={[0, (dataMax: number) => (dataMax > 0 ? Math.ceil(dataMax * 1.35) + 3 : 5)]}
                  />
                  <RechartsTooltip
                    formatter={(val: any) => [val, "Unités"]}
                    contentStyle={{ borderRadius: 8, border: "1px solid #cbd5e1" }}
                  />
                  <Bar
                    dataKey="total"
                    name="Total unités"
                    isAnimationActive={false}
                    shape={renderBarWithPermanentNumber}
                  >
                    {modelsChartData.map((entry, index) => (
                      <Cell key={`cell-mod-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
