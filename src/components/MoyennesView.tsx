import { useState, useEffect, useMemo } from "react";
import {
  BarChart3,
  Calendar,
  Download,
  FileSpreadsheet,
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
} from "recharts";
import { useRole } from "../context/RoleContext";
import {
  fetchMoyennesSheetData,
  updateGoogleSheetMoyennesPeriode,
  fetchGoogleSheetFluxData,
  DEFAULT_MOYENNES_DATA,
  MOYENNES_SHEET_URL,
  type MoyennesSheetData,
} from "../services/googleSheets";
import type { Flux } from "../data/mockData";

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

export default function MoyennesView() {
  const { role, roleInfo } = useRole();
  const [sheetData, setSheetData] = useState<MoyennesSheetData>(DEFAULT_MOYENNES_DATA);
  const [vehicles, setVehicles] = useState<Flux[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(9);
  const [hasInitializedPeriod, setHasInitializedPeriod] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingPeriod, setSyncingPeriod] = useState(false);
  const [viewMode, setViewMode] = useState<"sheet" | "charts">("sheet");
  const [searchFilter, setSearchFilter] = useState("");
  const [notification, setNotification] = useState<string | null>(null);

  // Security check: only Administration and Chef d'Atelier can access
  const isAuthorized = role === "administration" || role === "chef_atelier";

  const loadData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    try {
      const [fetchedMoyennes, fetchedFlux] = await Promise.all([
        fetchMoyennesSheetData(),
        fetchGoogleSheetFluxData().catch(() => []),
      ]);
      setSheetData(fetchedMoyennes);
      setVehicles(fetchedFlux);

      if (!hasInitializedPeriod) {
        setSelectedYear(fetchedMoyennes.annee || 2026);
        setSelectedMonth(fetchedMoyennes.mois || 9);
        setHasInitializedPeriod(true);
      }

      if (isManual) {
        showNotification("Données Moyennes actualisées avec succès depuis Google Sheets !");
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

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  // Is the current view matching the active period configured in Google Sheets?
  const isGoogleSheetsPeriodActive =
    selectedYear === (sheetData.annee || 2026) &&
    selectedMonth === (sheetData.mois || 9);

  // Synchronize chosen period to cell B1 (Année) and B2 (Mois) in Google Sheets
  const handleSyncGoogleSheetsPeriod = async () => {
    setSyncingPeriod(true);
    try {
      const res = await updateGoogleSheetMoyennesPeriode(selectedYear, selectedMonth);
      showNotification(
        res.message ||
          `Période ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} définie dans Google Sheets !`
      );
      await loadData(true);
    } catch (err) {
      console.error("Erreur mise à jour période Sheets:", err);
      showNotification("Erreur lors de la synchronisation avec Google Sheets.");
    } finally {
      setSyncingPeriod(false);
    }
  };

  // Compute or select the effective data displayed for selectedYear & selectedMonth
  const displayData = useMemo<MoyennesSheetData>(() => {
    // If selected period matches the sheet's configured month, return the exact Google Sheets sheetData
    if (
      selectedYear === (sheetData.annee || 2026) &&
      selectedMonth === (sheetData.mois || 9)
    ) {
      return sheetData;
    }

    // Otherwise, compute dynamic distribution from recorded vehicles for selectedYear and selectedMonth
    const teamDays: Record<string, number[]> = {};
    STANDARD_TEAMS.forEach((t) => (teamDays[t] = Array(31).fill(0)));

    const modelDays: Record<string, number[]> = {};
    STANDARD_MODELS.forEach((m) => (modelDays[m] = Array(31).fill(0)));

    // Map Code Modèle -> Famille using sheet correspondances
    const codeToFamille = new Map<string, string>();
    (sheetData.correspondances || []).forEach((c) => {
      codeToFamille.set(c.codeModele.toUpperCase().trim(), c.famille.trim());
    });

    // Tally interventions from vehicles
    vehicles.forEach((veh) => {
      if (!veh.date || veh.date.includes("1899")) return;
      const match = veh.date.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (!match) return;
      const d = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const y = parseInt(match[3], 10);

      if (y === selectedYear && m === selectedMonth && d >= 1 && d <= 31) {
        // Team matching
        const teamName = STANDARD_TEAMS.find(
          (t) => t.toLowerCase() === (veh.equipe || "").toLowerCase()
        );
        if (teamName) {
          teamDays[teamName][d - 1] += 1;
        }

        // Model matching
        let modelFamille: string | undefined = undefined;
        const modUpper = (veh.modele || "").toUpperCase().trim();
        if (codeToFamille.has(modUpper)) {
          modelFamille = codeToFamille.get(modUpper);
        } else {
          // Fuzzy match on full description
          const fullDesc = `${veh.modele || ""} ${veh.atelier || ""}`.toUpperCase();
          if (fullDesc.includes("EUROCARGO") || fullDesc.includes("ML")) modelFamille = "Eurocargo";
          else if (fullDesc.includes("DAILY")) modelFamille = "Daily";
          else if (fullDesc.includes("SWAY") || fullDesc.includes("S-WAY") || fullDesc.includes("AS440")) modelFamille = "S-Way";
          else if (fullDesc.includes("CHANGAN") || fullDesc.includes("HUNTER") || fullDesc.includes("STAR")) modelFamille = "Changan";
          else if (fullDesc.includes("IRISBUS") || fullDesc.includes("BUS")) modelFamille = "IRISBUS";
          else if (fullDesc.includes("JMC") || fullDesc.includes("VIGUS")) modelFamille = "JMC";
        }

        if (modelFamille && STANDARD_MODELS.includes(modelFamille)) {
          modelDays[modelFamille][d - 1] += 1;
        }
      }
    });

    // Count active days (days where at least 1 team has interventions)
    let activeDaysCount = 0;
    for (let dayIdx = 0; dayIdx < 31; dayIdx++) {
      const sumDay = STANDARD_TEAMS.reduce((acc, t) => acc + teamDays[t][dayIdx], 0);
      if (sumDay > 0) activeDaysCount++;
    }

    // Build equipes rows
    const equipesRows = STANDARD_TEAMS.map((name) => {
      const days = teamDays[name];
      const total = days.reduce((a, b) => a + b, 0);
      const moyenne = activeDaysCount > 0 ? total / activeDaysCount : 0;
      return { name, days, total, moyenne };
    });

    // Build equipes total
    const equipesTotalDays = Array.from({ length: 31 }, (_, dIdx) =>
      STANDARD_TEAMS.reduce((acc, t) => acc + teamDays[t][dIdx], 0)
    );
    const equipesTotalVal = equipesTotalDays.reduce((a, b) => a + b, 0);
    const equipesTotalMoy = activeDaysCount > 0 ? equipesTotalVal / activeDaysCount : 0;

    // Build modeles rows
    const modelesRows = STANDARD_MODELS.map((name) => {
      const days = modelDays[name];
      const total = days.reduce((a, b) => a + b, 0);
      const moyenne = activeDaysCount > 0 ? total / activeDaysCount : 0;
      return { name, days, total, moyenne };
    });

    // Build modeles total
    const modelesTotalDays = Array.from({ length: 31 }, (_, dIdx) =>
      STANDARD_MODELS.reduce((acc, m) => acc + modelDays[m][dIdx], 0)
    );
    const modelesTotalVal = modelesTotalDays.reduce((a, b) => a + b, 0);
    const modelesTotalMoy = activeDaysCount > 0 ? modelesTotalVal / activeDaysCount : 0;

    return {
      annee: selectedYear,
      mois: selectedMonth,
      equipes: equipesRows,
      equipesTotal: {
        name: "Total",
        days: equipesTotalDays,
        total: equipesTotalVal,
        moyenne: equipesTotalMoy,
        isTotal: true,
      },
      modeles: modelesRows,
      modelesTotal: {
        name: "Total",
        days: modelesTotalDays,
        total: modelesTotalVal,
        moyenne: modelesTotalMoy,
        isTotal: true,
      },
      correspondances: sheetData.correspondances || DEFAULT_MOYENNES_DATA.correspondances,
      lastUpdated: new Date().toISOString(),
    };
  }, [selectedYear, selectedMonth, sheetData, vehicles]);

  // Days list: 1 to 31
  const daysList = useMemo(() => Array.from({ length: 31 }, (_, i) => i + 1), []);

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
        <p className="text-xs text-slate-500">Connexion à Google Sheets (GID: 965668700)</p>
      </div>
    );
  }

  const isDataEmpty = (displayData.equipesTotal?.total || 0) === 0;

  return (
    <div className="w-full h-full flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-4 flex flex-col gap-3 bg-slate-100/80">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-16 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 bg-emerald-600 text-white rounded-xl shadow-2xl animate-fade-in border border-emerald-500/40 text-xs font-bold">
          <CheckCircle2 size={16} />
          <span>{notification}</span>
        </div>
      )}

      {/* Compact Header & Controls Bar matching page dimension */}
      <div className="bg-white rounded-xl px-4 py-2.5 border border-slate-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-3 shrink-0">
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

            {/* Status indicator / Google Sheets sync button */}
            {isGoogleSheetsPeriodActive ? (
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <CheckCircle2 size={11} className="text-emerald-600" />
                <span>Mois actif Sheets</span>
              </span>
            ) : (
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleSyncGoogleSheetsPeriod}
                  disabled={syncingPeriod}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-700 hover:bg-blue-800 text-white text-[10px] font-bold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                  title="Définir ce mois et année dans les cellules B1 et B2 de Google Sheets"
                >
                  {syncingPeriod ? (
                    <RefreshCw size={10} className="animate-spin" />
                  ) : (
                    <Sparkles size={10} className="text-amber-300" />
                  )}
                  <span>Appliquer à Sheets</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedYear(sheetData.annee || 2026);
                    setSelectedMonth(sheetData.mois || 9);
                  }}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:text-blue-700 bg-white hover:bg-slate-100 rounded border border-slate-200 transition-colors cursor-pointer"
                  title={`Revenir au mois Google Sheets (${MONTH_NAMES[(sheetData.mois || 9) - 1]} ${sheetData.annee || 2026})`}
                >
                  <RotateCcw size={10} />
                  <span className="hidden xl:inline">Mois Sheets</span>
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
            title="Actualiser depuis Google Sheets"
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

          {/* Google Sheets Link */}
          <a
            href={MOYENNES_SHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold transition-colors"
            title="Ouvrir dans Google Sheets"
          >
            <FileSpreadsheet size={13} />
            <span className="hidden md:inline">Sheets</span>
          </a>

          {/* Print */}
          <button
            type="button"
            onClick={() => window.print()}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 transition-colors cursor-pointer"
            title="Imprimer"
          >
            <Printer size={14} />
          </button>
        </div>
      </div>

      {/* Info notice if custom month/year selected */}
      {!isGoogleSheetsPeriodActive && (
        <div className="bg-amber-50 border border-amber-200/90 rounded-xl px-3.5 py-2 text-xs flex flex-wrap items-center justify-between gap-2 text-amber-900 shadow-2xs">
          <div className="flex items-center gap-2">
            <Info size={15} className="text-amber-600 shrink-0" />
            <span>
              Consultation de la période : <strong>{MONTH_NAMES[selectedMonth - 1]} {selectedYear}</strong>.
              {isDataEmpty ? (
                <span className="ml-1 text-amber-700">
                  (Aucune intervention enregistrée pour ce mois. La feuille Google Sheets est actuellement sur{" "}
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
              onClick={handleSyncGoogleSheetsPeriod}
              disabled={syncingPeriod}
              className="px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
            >
              <Sparkles size={11} />
              <span>Définir ce mois dans Google Sheets (B1/B2)</span>
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

      {/* Main View Mode: SPREADSHEET SIDE-BY-SIDE DIMENSION (Exactly matching the sheet) */}
      {viewMode === "sheet" && (
        <div className="w-full grid grid-cols-1 xl:grid-cols-12 gap-3 items-start">
          {/* LEFT SIDE: TABLE 1 (EQUIPES) & TABLE 2 (MODELES) - xl:col-span-9 */}
          <div className="xl:col-span-9 space-y-3">
            
            {/* TABLEAU 1: EQUIPE (1..31, Total, Moyenne) */}
            <div className="bg-white rounded-xl border border-slate-300 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-center border-collapse text-[11px]">
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
            <div className="bg-white rounded-xl border border-slate-300 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-center border-collapse text-[11px]">
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
          <div className="xl:col-span-3 bg-white rounded-xl border border-slate-300 shadow-2xs overflow-hidden flex flex-col">
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

      {/* Alternative View Mode: VISUAL CHARTS */}
      {viewMode === "charts" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Bar Chart: Par Équipe */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs">
            <h3 className="text-sm font-black text-slate-900 mb-0.5 flex items-center gap-2">
              <Users size={16} className="text-blue-700" />
              <span>Volume Réalisé par Équipe ({MONTH_NAMES[selectedMonth - 1]} {selectedYear})</span>
            </h3>
            <p className="text-[11px] text-slate-500 mb-4 font-medium">Comparatif des interventions terminées sur le mois</p>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={teamsChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} angle={-25} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10 }} />
                  <RechartsTooltip
                    formatter={(val: any) => [val, "Total véhicules"]}
                    contentStyle={{ borderRadius: 8, border: "1px solid #cbd5e1" }}
                  />
                  <Bar dataKey="total" name="Total véhicules" radius={[4, 4, 0, 0]}>
                    {teamsChartData.map((entry, index) => (
                      <Cell key={`cell-team-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bar Chart: Par Modèle */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs">
            <h3 className="text-sm font-black text-slate-900 mb-0.5 flex items-center gap-2">
              <Truck size={16} className="text-blue-700" />
              <span>Volume par Famille de Modèles ({MONTH_NAMES[selectedMonth - 1]} {selectedYear})</span>
            </h3>
            <p className="text-[11px] text-slate-500 mb-4 font-medium">Répartition du flux selon la gamme de véhicules</p>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modelsChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} angle={-25} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10 }} />
                  <RechartsTooltip
                    formatter={(val: any) => [val, "Unités"]}
                    contentStyle={{ borderRadius: 8, border: "1px solid #cbd5e1" }}
                  />
                  <Bar dataKey="total" name="Total unités" radius={[4, 4, 0, 0]}>
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
