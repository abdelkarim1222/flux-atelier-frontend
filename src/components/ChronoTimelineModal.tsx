import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Clock,
  Wrench,
  Package,
  FileSignature,
  CheckCircle2,
  Plus,
  Trash2,
  Timer,
  Car,
  Calculator,
  Hourglass,
  HelpCircle,
  Save,
  Edit2,
  RefreshCcw,
  Gauge,
} from "lucide-react";
import {
  calculateVehicleTimes,
  saveVehicleTimeLog,
  getVehicleTimeLogs,
  formatMinutes,
  parseDateTimestamp,
  type VehicleTimeCalculation,
  type VehicleTimeStep,
} from "../services/timeTracking";

interface ChronoTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: any | null;
  onUpdated?: () => void;
}

export default function ChronoTimelineModal({
  isOpen,
  onClose,
  vehicle,
  onUpdated,
}: ChronoTimelineModalProps) {
  const [calc, setCalc] = useState<VehicleTimeCalculation | null>(null);

  // Formulaire d'ajout d'une nouvelle attente / interruption
  const [showAddForm, setShowAddForm] = useState(false);
  const [newStepType, setNewStepType] = useState<
    "attente_pieces" | "attente_devis" | "attente_mecanicien" | "reaffectation" | "essai" | "attente_client"
  >("attente_pieces");
  const [newStepLabel, setNewStepLabel] = useState("");
  const [newStepDebut, setNewStepDebut] = useState("");
  const [newStepFin, setNewStepFin] = useState("");
  const [newStepReprisePrevue, setNewStepReprisePrevue] = useState("");
  const [newStepDureeMin, setNewStepDureeMin] = useState<number | "">("");
  const [newStepCommentaire, setNewStepCommentaire] = useState("");
  const [now, setNow] = useState(() => Date.now());

  // Configuration du barème / temps alloué prévu par le Chef d'équipe
  const [inputTempsAlloueMin, setInputTempsAlloueMin] = useState<number | "">("");
  const [isEditingAlloue, setIsEditingAlloue] = useState(false);

  // Configuration ou ajustement du temps de présence total (Séjour Total entre entrée et sortie)
  const [inputPresenceTotalMin, setInputPresenceTotalMin] = useState<number | "">("");
  const [isEditingPresence, setIsEditingPresence] = useState(false);

  const refreshCalc = () => {
    if (!vehicle) return;
    const res = calculateVehicleTimes(vehicle);
    setCalc(res);
    setInputTempsAlloueMin(res.tempsAlloueMin ?? "");
    setInputPresenceTotalMin(res.tempsPresenceTotalMin > 0 ? res.tempsPresenceTotalMin : "");
  };

  useEffect(() => {
    if (isOpen && vehicle) {
      refreshCalc();
      // Date par défaut du formulaire = aujourd'hui maintenant
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, "0");
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const yyyy = now.getFullYear();
      const hh = String(now.getHours()).padStart(2, "0");
      const min = String(now.getMinutes()).padStart(2, "0");
      setNewStepDebut(`${dd}/${mm}/${yyyy} ${hh}:${min}`);
    }
  }, [isOpen, vehicle]);

  // Le temps restant d'une attente mécanicien doit continuer à évoluer tant que la fenêtre est ouverte.
  useEffect(() => {
    if (!isOpen) return;
    // Les attentes en cours doivent évoluer sans fermer/réouvrir la fenêtre.
    const timer = window.setInterval(() => {
      setNow(Date.now());
      refreshCalc();
    }, 30_000);
    return () => window.clearInterval(timer);
  // refreshCalc lit les données les plus récentes du véhicule et des journaux.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, vehicle]);

  if (!isOpen || !vehicle || !calc) return null;

  const handleSaveTempsAlloue = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!calc) return;
    const key = calc.vehicleKey;
    const allLogs = getVehicleTimeLogs();
    const existingLog = allLogs[key] || {
      vehicleKey: key,
      noOr: calc.noOr,
      chassis: calc.chassis,
      immatriculation: calc.immatriculation,
      client: calc.client,
      equipe: calc.equipe,
    };
    saveVehicleTimeLog({
      ...existingLog,
      tempsAlloueMin:
        typeof inputTempsAlloueMin === "number" && inputTempsAlloueMin > 0
          ? inputTempsAlloueMin
          : undefined,
    });
    setIsEditingAlloue(false);
    refreshCalc();
    if (onUpdated) onUpdated();
  };

  const handleSavePresenceTotal = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!calc) return;
    const key = calc.vehicleKey;
    const allLogs = getVehicleTimeLogs();
    const existingLog = allLogs[key] || {
      vehicleKey: key,
      noOr: calc.noOr,
      chassis: calc.chassis,
      immatriculation: calc.immatriculation,
      client: calc.client,
      equipe: calc.equipe,
    };
    saveVehicleTimeLog({
      ...existingLog,
      tempsPresenceTotalMin:
        typeof inputPresenceTotalMin === "number" && inputPresenceTotalMin > 0
          ? inputPresenceTotalMin
          : undefined,
    });
    setIsEditingPresence(false);
    refreshCalc();
    if (onUpdated) onUpdated();
  };

  const handleAddStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStepDebut.trim()) return;

    let computedMin = typeof newStepDureeMin === "number" ? newStepDureeMin : 0;
    if (!computedMin && newStepDebut && newStepFin) {
      const tsD = parseDateTimestamp(newStepDebut);
      const tsF = parseDateTimestamp(newStepFin);
      if (tsD > 0 && tsF > tsD) {
        computedMin = Math.round((tsF - tsD) / 60000);
      }
    }

    const newStep: VehicleTimeStep = {
      id: `custom-${Date.now()}`,
      type: newStepType,
      label:
        newStepLabel.trim() ||
        (newStepType === "attente_pieces"
          ? "Attente pièces de rechange"
          : newStepType === "attente_devis"
          ? "Attente accord de devis"
          : newStepType === "attente_mecanicien"
          ? "Attente déclarée par le mécanicien"
          : newStepType === "reaffectation"
          ? "Technicien réaffecté"
          : newStepType === "essai"
          ? "Essai routier & Contrôle qualité"
          : "Attente décision client"),
      dateDebut: newStepDebut.trim(),
      dateFin: newStepFin.trim() || undefined,
      datePrevueFin: newStepType === "attente_mecanicien" ? newStepReprisePrevue.trim() || undefined : undefined,
      dureeMinutes: computedMin > 0 ? computedMin : undefined,
      commentaire: newStepCommentaire.trim() || undefined,
      automatique: false,
    };

    const key = calc.vehicleKey;
    const allLogs = getVehicleTimeLogs();
    const existingLog = allLogs[key] || {
      vehicleKey: key,
      noOr: calc.noOr,
      chassis: calc.chassis,
      immatriculation: calc.immatriculation,
      client: calc.client,
      equipe: calc.equipe,
      customSteps: [],
    };

    const updatedSteps = [...(existingLog.customSteps || []), newStep];
    saveVehicleTimeLog({
      ...existingLog,
      customSteps: updatedSteps,
    });

    // Reset formulaire
    setNewStepLabel("");
    setNewStepFin("");
    setNewStepReprisePrevue("");
    setNewStepDureeMin("");
    setNewStepCommentaire("");
    setShowAddForm(false);

    refreshCalc();
    if (onUpdated) onUpdated();
  };

  const handleDeleteCustomStep = (stepId: string) => {
    const key = calc.vehicleKey;
    const allLogs = getVehicleTimeLogs();
    const existingLog = allLogs[key];
    if (!existingLog || !existingLog.customSteps) return;

    const filtered = existingLog.customSteps.filter((s) => s.id !== stepId);
    saveVehicleTimeLog({
      ...existingLog,
      customSteps: filtered,
    });

    refreshCalc();
    if (onUpdated) onUpdated();
  };

  // Calcul des pourcentages pour la barre de répartition visuelle
  const totalMin = Math.max(1, calc.tempsPresenceTotalMin);
  const pctAttenteRep = Math.min(100, Math.round((calc.tempsAttenteReparationMin / totalMin) * 100));
  const pctTravail = Math.min(100, Math.round((calc.tempsTravailEffectifMin / totalMin) * 100));
  const pctPieces = Math.min(100, Math.round((calc.tempsAttentePiecesMin / totalMin) * 100));
  const pctDevis = Math.min(100, Math.round((calc.tempsAttenteDevisMin / totalMin) * 100));
  const pctReaffecte = Math.min(100, Math.round((calc.tempsReaffecteMin / totalMin) * 100));
  const pctEssai = Math.min(100, Math.round((calc.tempsEssaiMin / totalMin) * 100));

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
              <Timer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Chronométrie & Décomposition des Temps
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  OR: {calc.noOr}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Calcul exact du temps d'attente, de travail effectif et des interruptions
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Fiche Identité Véhicule */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/70 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">Client</span>
              <span className="font-bold text-slate-800 truncate block">{calc.client}</span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">N° Châssis</span>
              <span className="font-mono font-bold text-slate-800 truncate block">{calc.chassis}</span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">N° Immatriculation</span>
              <span className="font-mono font-bold text-slate-800 truncate block">{calc.immatriculation}</span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">Équipe assignée</span>
              <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 inline-block">
                {calc.equipe}
              </span>
            </div>
          </div>

          {/* Synthèse des 6 Temps Clés + Séjour Total */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {/* 0. Temps Entrée -> Sortie (Séjour Total) */}
            <div className="bg-slate-100/80 border border-slate-200 rounded-xl p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-700 mb-1">
                <span className="text-[11px] font-bold">Séjour Total</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIsEditingPresence(!isEditingPresence)}
                    className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                    title="Ajuster le temps de séjour total (Entrée-Sortie)"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <Timer className="w-4 h-4 text-slate-500" />
                </div>
              </div>
              {isEditingPresence ? (
                <form onSubmit={handleSavePresenceTotal} className="flex items-center gap-1 my-1">
                  <input
                    type="number"
                    min="0"
                    placeholder="Min"
                    value={inputPresenceTotalMin}
                    onChange={(e) =>
                      setInputPresenceTotalMin(e.target.value === "" ? "" : Number(e.target.value))
                    }
                    className="w-20 px-1.5 py-0.5 text-xs border rounded bg-white font-mono"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="px-1.5 py-0.5 bg-indigo-600 text-white text-[10px] font-bold rounded cursor-pointer"
                  >
                    OK
                  </button>
                </form>
              ) : (
                <div className="text-lg font-black text-slate-900">{calc.tempsPresenceTotalFormat}</div>
              )}
              <div className="text-[10px] text-slate-500 mt-1">Entrée → Sortie</div>
            </div>

            {/* 1. Attente Réparation */}
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between text-amber-700 mb-1">
                <span className="text-[11px] font-bold">Attente Rép.</span>
                <Clock className="w-4 h-4" />
              </div>
              <div className="text-lg font-black text-amber-900">{calc.tempsAttenteReparationFormat}</div>
              <div className="text-[10px] text-amber-700/80 mt-1">Avant atelier</div>
            </div>

            {/* 2. Attente Pièces */}
            <div className="bg-orange-50/70 border border-orange-200/80 rounded-xl p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between text-orange-700 mb-1">
                <span className="text-[11px] font-bold">Attente Pièces</span>
                <Package className="w-4 h-4" />
              </div>
              <div className="text-lg font-black text-orange-900">{calc.tempsAttentePiecesFormat}</div>
              <div className="text-[10px] text-orange-700/80 mt-1">Magasin PDR</div>
            </div>

            {/* 3. Attente Devis */}
            <div className="bg-purple-50/70 border border-purple-200/80 rounded-xl p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between text-purple-700 mb-1">
                <span className="text-[11px] font-bold">Attente Devis</span>
                <FileSignature className="w-4 h-4" />
              </div>
              <div className="text-lg font-black text-purple-900">{calc.tempsAttenteDevisFormat}</div>
              <div className="text-[10px] text-purple-700/80 mt-1">Accord client</div>
            </div>

            {/* 4. Technicien réaffecté */}
            <div className="bg-fuchsia-50/70 border border-fuchsia-200/80 rounded-xl p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between text-fuchsia-700 mb-1">
                <span className="text-[11px] font-bold">Réaffectation</span>
                <RefreshCcw className="w-4 h-4" />
              </div>
              <div className="text-lg font-black text-fuchsia-900">{calc.tempsReaffecteFormat}</div>
              <div className="text-[10px] text-fuchsia-700/80 mt-1">Tech réaffecté</div>
            </div>

            {/* 5. Essai Routier */}
            <div className="bg-violet-50/70 border border-violet-200/80 rounded-xl p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between text-violet-700 mb-1">
                <span className="text-[11px] font-bold">Essai Routier</span>
                <Gauge className="w-4 h-4" />
              </div>
              <div className="text-lg font-black text-violet-900">{calc.tempsEssaiFormat}</div>
              <div className="text-[10px] text-violet-700/80 mt-1">Contrôle qualité</div>
            </div>
          </div>

          {/* Bandeau Travail Net Effectif */}
          <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center border border-white/20 shadow-inner">
                <Wrench className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-xs uppercase font-extrabold tracking-wider text-blue-100">
                  Travail Net Effectif (Production Active Réelle)
                </div>
                <div className="text-2xl font-black">{calc.tempsTravailEffectifFormat}</div>
              </div>
            </div>
            <div className="text-xs text-blue-100 font-mono bg-white/10 px-3.5 py-2 rounded-lg border border-white/20 text-center sm:text-right">
              <span className="block font-bold text-white mb-0.5">Formule appliquée :</span>
              <span>Temps Entrée-Sortie - (Rép + Pièces + Devis + Réaffecté + Essai)</span>
            </div>
          </div>

          {/* Card Formule Exacte & Combien reste dans le travail */}
          <div className="bg-gradient-to-br from-indigo-50/90 via-blue-50/70 to-purple-50/80 border border-indigo-200/90 rounded-2xl p-4 shadow-sm space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-xl bg-indigo-600 text-white shadow-xs">
                  <Calculator className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-indigo-950">
                    Calcul Mathématique & Reste à Travailler
                  </h3>
                  <p className="text-[11px] text-indigo-700/80">
                    Formule exacte atelier et estimation du temps restant
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white text-indigo-800 border border-indigo-200 shadow-2xs">
                  Avancement : {calc.avancement} ({calc.avancementPct}%)
                </span>
              </div>
            </div>

            {/* Formule mathématique décomposée */}
            <div className="bg-white/90 backdrop-blur-xs rounded-xl p-3.5 border border-indigo-100 shadow-2xs space-y-2">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Formule appliquée : Temps restant entre entrée et sortie - (Attente Réparation + Attente Pièces + Attente Devis + Technicien réaffecté + Essai)
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono font-bold text-slate-800">
                <span className="bg-slate-100 px-2 py-1 rounded-md text-slate-900 border border-slate-200">
                  {calc.tempsPresenceTotalFormat} <span className="text-[10px] text-slate-500 font-sans">(Entrée → Sortie)</span>
                </span>
                <span className="text-slate-400 font-sans font-black text-sm">-</span>
                <span className="bg-amber-50 px-2 py-1 rounded-md text-amber-900 border border-amber-200">
                  [ {calc.tempsAttenteReparationFormat} <span className="text-[10px] text-amber-600 font-sans">(Rép)</span> + {calc.tempsAttentePiecesFormat} <span className="text-[10px] text-orange-600 font-sans">(Pièces)</span> + {calc.tempsAttenteDevisFormat} <span className="text-[10px] text-purple-600 font-sans">(Devis)</span> + {calc.tempsReaffecteFormat} <span className="text-[10px] text-fuchsia-600 font-sans">(Réaffecté)</span> + {calc.tempsEssaiFormat} <span className="text-[10px] text-violet-600 font-sans">(Essai)</span> ]
                </span>
                <span className="text-slate-400 font-sans font-black text-sm">=</span>
                <span className="bg-blue-600 text-white px-2.5 py-1 rounded-md font-black shadow-xs">
                  {calc.tempsTravailEffectifFormat} <span className="text-[10px] text-blue-100 font-sans">(Travail Net Effectif)</span>
                </span>
              </div>
              <p className="text-[11px] text-indigo-700/80 font-medium italic">
                Exemple type : 6h - (30min [Rép] + 15min [Pièces] + 3h [Devis] + 30min [Réaffecté] + 15min [Essai]) = 1h 30min de travail net effectif.
              </p>
            </div>

            {/* Bloc : Combien reste dans le travail */}
            <div className="bg-white/95 rounded-xl p-3.5 border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <Hourglass className="w-4 h-4 text-indigo-600" />
                  <span>Combien reste dans le travail pour cette voiture :</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xl font-black ${
                      calc.resteTravailStatut === "termine"
                        ? "text-emerald-700"
                        : calc.resteTravailStatut === "depasse"
                        ? "text-rose-700"
                        : "text-indigo-900"
                    }`}
                  >
                    {calc.tempsRestantEstimeFormat}
                  </span>
                  {calc.tempsAlloueMin && (
                    <span className="text-xs font-semibold text-slate-500">
                      (sur barème alloué de {calc.tempsAlloueFormat})
                    </span>
                  )}
                </div>
              </div>

              {/* Contrôle du barème constructeur / temps alloué prévu */}
              <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                {isEditingAlloue ? (
                  <form onSubmit={handleSaveTempsAlloue} className="flex items-center gap-1.5">
                    <input
                      type="number"
                      placeholder="Barème (min)"
                      value={inputTempsAlloueMin}
                      onChange={(e) =>
                        setInputTempsAlloueMin(e.target.value ? Number(e.target.value) : "")
                      }
                      className="w-24 px-2 py-1 bg-white border border-indigo-300 rounded-lg text-xs font-mono text-slate-900"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Save className="w-3 h-3" />
                      OK
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingAlloue(false)}
                      className="px-2 py-1 text-slate-500 hover:text-slate-700 text-xs font-semibold"
                    >
                      Annuler
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditingAlloue(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg border border-slate-200 transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>
                      {calc.tempsAlloueMin ? "Modifier barème" : "Définir barème prévu"}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Formule & Barre Visuelle de Répartition */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-800">
                Séjour total dans l'atelier : <strong className="text-slate-900 text-sm">{calc.tempsPresenceTotalFormat}</strong>
              </span>
              <span className="text-[11px] font-medium text-slate-500">
                Travail net = Séjour - Attentes
              </span>
            </div>

            {/* Barre de répartition */}
            <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden flex shadow-inner">
              {pctAttenteRep > 0 && (
                <div
                  style={{ width: `${pctAttenteRep}%` }}
                  className="bg-amber-500 h-full transition-all"
                  title={`Attente Réparation: ${calc.tempsAttenteReparationFormat} (${pctAttenteRep}%)`}
                />
              )}
              {pctTravail > 0 && (
                <div
                  style={{ width: `${pctTravail}%` }}
                  className="bg-blue-600 h-full transition-all"
                  title={`Travail Effectif: ${calc.tempsTravailEffectifFormat} (${pctTravail}%)`}
                />
              )}
              {pctPieces > 0 && (
                <div
                  style={{ width: `${pctPieces}%` }}
                  className="bg-orange-500 h-full transition-all"
                  title={`Attente Pièces: ${calc.tempsAttentePiecesFormat} (${pctPieces}%)`}
                />
              )}
              {pctDevis > 0 && (
                <div
                  style={{ width: `${pctDevis}%` }}
                  className="bg-purple-600 h-full transition-all"
                  title={`Attente Devis: ${calc.tempsAttenteDevisFormat} (${pctDevis}%)`}
                />
              )}
              {pctReaffecte > 0 && (
                <div
                  style={{ width: `${pctReaffecte}%` }}
                  className="bg-fuchsia-500 h-full transition-all"
                  title={`Technicien réaffecté: ${calc.tempsReaffecteFormat} (${pctReaffecte}%)`}
                />
              )}
              {pctEssai > 0 && (
                <div
                  style={{ width: `${pctEssai}%` }}
                  className="bg-violet-600 h-full transition-all"
                  title={`Essai routier: ${calc.tempsEssaiFormat} (${pctEssai}%)`}
                />
              )}
            </div>

            {/* Légende */}
            <div className="flex items-center flex-wrap gap-4 mt-2.5 text-[11px] font-semibold text-slate-600">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span>Attente Réparation ({pctAttenteRep}%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                <span>Travail Net Actif ({pctTravail}%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                <span>Attente Pièces ({pctPieces}%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                <span>Attente Devis ({pctDevis}%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-fuchsia-500" />
                <span>Réaffectation ({pctReaffecte}%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-violet-600" />
                <span>Essai ({pctEssai}%)</span>
              </div>
            </div>
          </div>

          {/* Timeline chronologique des étapes */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                Déroulement Chronologique Pas-à-Pas
              </h3>
              <button
                type="button"
                onClick={() => setShowAddForm((prev) => !prev)}
                className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg border border-indigo-200 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {showAddForm ? "Annuler" : "Ajouter une interruption / attente"}
              </button>
            </div>

            {/* Formulaire d'ajout d'interruption */}
            {showAddForm && (
              <form
                onSubmit={handleAddStep}
                className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-4 mb-4 space-y-3 text-xs animate-in slide-in-from-top-2 duration-150"
              >
                <div className="font-bold text-indigo-900 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-indigo-600" />
                  Enregistrer une période d'attente pour ce véhicule
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Type d'attente
                    </label>
                    <select
                      value={newStepType}
                      onChange={(e) => setNewStepType(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-medium text-slate-800"
                    >
                      <option value="attente_pieces">Attente Pièces (Achat / PDR)</option>
                      <option value="attente_devis">Attente Accord Devis (N° DV)</option>
                      <option value="attente_mecanicien">Attente Mécanicien (reprise prévue)</option>
                      <option value="reaffectation">Technicien Réaffecté (Pause intervention)</option>
                      <option value="essai">Essai Routier & Contrôle Qualité</option>
                      <option value="attente_client">Attente Décision Client</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Date & Heure Début
                    </label>
                    <input
                      type="text"
                      placeholder="DD/MM/YYYY HH:mm"
                      value={newStepDebut}
                      onChange={(e) => setNewStepDebut(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-slate-800"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      {newStepType === "attente_mecanicien"
                        ? "Date & Heure de fin réelle (si reprise déjà faite)"
                        : "Date & Heure Fin (Optionnelle)"}
                    </label>
                    <input
                      type="text"
                      placeholder="DD/MM/YYYY HH:mm"
                      value={newStepFin}
                      onChange={(e) => setNewStepFin(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-slate-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {newStepType === "attente_mecanicien" && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Date & Heure de reprise prévue
                      </label>
                      <input
                        type="text"
                        placeholder="DD/MM/YYYY HH:mm"
                        value={newStepReprisePrevue}
                        onChange={(e) => setNewStepReprisePrevue(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-indigo-300 rounded-lg font-mono text-slate-800"
                        required
                      />
                      <p className="text-[10px] text-indigo-700 mt-1">Le système calculera automatiquement le temps restant.</p>
                    </div>
                  )}
                  {newStepType !== "attente_mecanicien" && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Ou Durée directe en minutes (ex: 15 ou 60)
                      </label>
                      <input
                        type="number"
                        placeholder="Ex: 15 (min)"
                        value={newStepDureeMin}
                        onChange={(e) => setNewStepDureeMin(e.target.value ? Number(e.target.value) : "")}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-slate-800"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Motif / Pièce / Commentaire
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Plaquettes de frein, Accord devis n°..."
                      value={newStepCommentaire}
                      onChange={(e) => setNewStepCommentaire(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-indigo-200/60">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 font-semibold"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-xs cursor-pointer"
                  >
                    Valider l'attente
                  </button>
                </div>
              </form>
            )}

            {/* Liste des étapes */}
            <div className="relative pl-6 border-l-2 border-slate-200 space-y-4">
              {calc.steps.map((step, idx) => {
                let badgeColor = "bg-slate-100 text-slate-700 border-slate-200";
                let dotColor = "bg-slate-400";
                let Icon = Clock;

                if (step.type === "reception") {
                  badgeColor = "bg-emerald-100 text-emerald-800 border-emerald-300";
                  dotColor = "bg-emerald-600";
                  Icon = Car;
                } else if (step.type === "entree_equipe") {
                  badgeColor = "bg-blue-100 text-blue-800 border-blue-300";
                  dotColor = "bg-blue-600";
                  Icon = Wrench;
                } else if (step.type === "attente_pieces") {
                  badgeColor = "bg-orange-100 text-orange-800 border-orange-300";
                  dotColor = "bg-orange-500";
                  Icon = Package;
                } else if (step.type === "attente_devis") {
                  badgeColor = "bg-purple-100 text-purple-800 border-purple-300";
                  dotColor = "bg-purple-600";
                  Icon = FileSignature;
                } else if (step.type === "attente_mecanicien") {
                  badgeColor = "bg-sky-100 text-sky-800 border-sky-300";
                  dotColor = "bg-sky-600";
                  Icon = Wrench;
                } else if (step.type === "reaffectation") {
                  badgeColor = "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300";
                  dotColor = "bg-fuchsia-600";
                  Icon = RefreshCcw;
                } else if (step.type === "essai") {
                  badgeColor = "bg-violet-100 text-violet-800 border-violet-300";
                  dotColor = "bg-violet-600";
                  Icon = Gauge;
                } else if (step.type === "modification") {
                  badgeColor = "bg-slate-100 text-slate-800 border-slate-300";
                  dotColor = "bg-slate-600";
                  Icon = Edit2;
                } else if (step.type === "fin") {
                  badgeColor = "bg-emerald-100 text-emerald-800 border-emerald-300";
                  dotColor = "bg-emerald-600";
                  Icon = CheckCircle2;
                }

                return (
                  <div key={step.id || idx} className="relative group">
                    {/* Pastille chronologique */}
                    <div
                      className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full ${dotColor} border-2 border-white shadow-xs`}
                    />

                    <div className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-3 shadow-2xs transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badgeColor}`}
                          >
                            <Icon className="w-3 h-3" />
                            {step.label}
                          </span>
                          <span className="font-mono text-xs font-semibold text-slate-700">
                            {step.dateDebut} {step.dateFin && `→ ${step.dateFin}`}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {step.dureeMinutes !== undefined && step.dureeMinutes > 0 && (
                            <span className="font-bold text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200">
                              ⏱️ {formatMinutes(step.dureeMinutes)}
                            </span>
                          )}

                          {!step.automatique && (
                            <button
                              type="button"
                              onClick={() => handleDeleteCustomStep(step.id)}
                              className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors cursor-pointer"
                              title="Supprimer cette étape"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {step.commentaire && (
                        <p className="text-xs text-slate-500 mt-1 pl-1">
                          {step.commentaire}
                        </p>
                      )}
                      {step.type === "attente_mecanicien" && step.datePrevueFin && (() => {
                        const repriseTs = parseDateTimestamp(step.datePrevueFin);
                        const remainingMin = Math.ceil((repriseTs - now) / 60000);
                        const hasValidDate = repriseTs > 0;
                        return (
                          <div className={`mt-2 ml-1 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-bold border ${
                            !hasValidDate ? "bg-slate-50 text-slate-500 border-slate-200" : remainingMin > 0 ? "bg-sky-50 text-sky-800 border-sky-200" : "bg-rose-50 text-rose-700 border-rose-200"
                          }`}>
                            <Hourglass className="w-3.5 h-3.5" />
                            {hasValidDate
                              ? remainingMin > 0
                                ? `Reprise prévue : ${step.datePrevueFin} — reste ${formatMinutes(remainingMin)}`
                                : `Reprise prévue : ${step.datePrevueFin} — dépassé de ${formatMinutes(Math.abs(remainingMin))}`
                              : "Date de reprise prévue invalide"}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-slate-400" />
            <span>Les temps d'attente sont déduits du temps total pour obtenir le temps de travail effectif.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
