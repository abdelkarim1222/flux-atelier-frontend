import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Wrench,
  UserCheck,
  X,
  Check,
  ArrowRight,
  Users,
  ShieldCheck,
  Zap,
  Hammer,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
} from "lucide-react";
import { type Flux } from "../data/mockData";
import {
  type EquipeMember,
  DEFAULT_EQUIPE_MAPPINGS,
  getCustomEquipeMembers,
  getMemberTeams,
  getReaffectationsLocal,
  type ReaffectationRecord,
} from "../services/database";

import { CANONICAL_TEAMS, getCustomTeams } from "../config/teams";

export function normalizeTeamName(t: string): string {
  const norm = (t || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

  if (norm.includes("daily1")) return "daily1";
  if (norm.includes("daily2")) return "daily2";
  if (norm.includes("daily")) return "daily1";
  if (norm.includes("rapide") || norm.includes("serv")) return "servwrapide";
  if (norm.includes("lourd")) return "lourd";
  if (norm.includes("changan")) return "changan";
  if (norm.includes("carross")) return "carrosserie";
  if (norm.includes("elect") || norm.includes("elict")) return "elictrique";
  return norm;
}

/**
 * Vérifie si un véhicule est terminé (intervention terminée, 100%, sorti ou livré).
 * Dès qu'un véhicule est terminé, le mécanicien redevient immédiatement LIBRE pour une autre voiture.
 */
export function isVehicleFinished(v: Flux): boolean {
  const anyV = v as Record<string, any>;
  if (anyV.dateSortie && anyV.dateSortie !== "-" && String(anyV.dateSortie).trim() !== "") {
    return true;
  }
  const normStatut = (v.statut || "").trim().toLowerCase();
  const normEtat = (v.etatIntervention || "").trim().toLowerCase();
  const normAv = (v.avancement || "").trim().toLowerCase();

  // Indications de travail terminé ou véhicule livré / sorti / attente client
  if (
    normStatut.includes("termin") ||
    normStatut.includes("fini") ||
    normStatut.includes("livr") ||
    normStatut.includes("sorti") ||
    normStatut.includes("pret") ||
    normStatut.includes("attente client")
  ) {
    return true;
  }

  if (
    normEtat.includes("termin") ||
    normEtat.includes("fini") ||
    normEtat.includes("livr") ||
    normEtat.includes("sorti") ||
    normEtat.includes("pret") ||
    normEtat.includes("attente client")
  ) {
    return true;
  }

  // Avancement "Terminer" = travaux clôturés → technicien LIBÉRÉ immédiatement.
  // La réception peut ensuite marquer "Livré au client" sans que le technicien puisse y revenir.
  if (
    normAv === "terminer" ||
    normAv.includes("termin") ||
    normAv.includes("fini") ||
    normAv.includes("100%") ||
    normAv.includes("livr") ||
    normAv.includes("pret")
  ) {
    return true;
  }

  return false;
}

/**
 * Vérifie si un véhicule a son technicien réaffecté (actif et non encore repris).
 * Dans ce cas, le mécanicien a été libéré et doit impérativement être LIBRE pour prendre une autre voiture !
 */
export function isVehicleReaffecteActive(
  v: Flux,
  reaffectationsMap?: Record<string, ReaffectationRecord>
): boolean {
  const normAv = (v.avancement || "").trim().toLowerCase();
  const normEtat = (v.etatIntervention || "").trim().toLowerCase();

  // L'avancement est prioritaire sur l'ancien état interne. Seul un avancement
  // explicitement « En cours » / avec pourcentage occupe le technicien.
  // Un OR « Attente réparation » issu d'une réaffectation peut conserver un
  // ancien état « En cours » en base : il doit malgré tout libérer le technicien.
  if (normAv.startsWith("en cours") || normAv.includes("%")) {
    return false;
  }

  // 1. Détection directe dans les chaînes d'avancement ou d'état
  if (
    normAv.includes("réaffect") ||
    normAv.includes("reaffect") ||
    normEtat.includes("réaffect") ||
    normEtat.includes("reaffect")
  ) {
    return true;
  }

  // 2. Recherche dans le registre des réaffectations enregistrées
  try {
    const all = reaffectationsMap || getReaffectationsLocal();
    const keysToTry = [
      String(v.id || ""),
      String(v.no || ""),
      String(v.serie || ""),
      String(v.immatriculation || ""),
      String(v.ordre || ""),
      String(v.chassis || ""),
    ].filter(Boolean);

    for (const k of keysToTry) {
      if (all[k] && !all[k].isRepris) return true;
      if (all[k.trim()] && !all[k.trim()].isRepris) return true;
    }

    const found = Object.values(all).find((r) => {
      if (v.id && String(r.vehicleId) === String(v.id)) return true;
      if (v.no && r.or && r.or.trim() === v.no.trim()) return true;
      if (v.serie && r.or && r.or.trim() === v.serie.trim()) return true;
      if (v.ordre && r.or && r.or.trim() === v.ordre.trim()) return true;
      if (v.chassis && r.chassis && r.chassis.trim().toUpperCase() === v.chassis.trim().toUpperCase()) return true;
      if (v.immatriculation && r.immatriculation && r.immatriculation.trim() === v.immatriculation.trim()) return true;
      return false;
    });

    if (found && !found.isRepris) {
      return true;
    }
  } catch (e) {
    console.warn("Erreur vérification réaffectation:", e);
  }

  return false;
}

/**
 * Vérifie si un véhicule occupe ACTUELLEMENT le mécanicien (travail en cours actif).
 *
 * RÈGLE D'ATELIER :
 * - Un mécanicien n'est OCCUPÉ que si le véhicule est activement "En cours" (avec travail effectif / %).
 * - Une réaffectation libère le mécanicien uniquement tant que ce véhicule est réellement en attente.
 * - Dès qu'un véhicule est explicitement « En cours » ou possède un pourcentage, il garde le mécanicien OCCUPÉ,
 *   même si un ancien enregistrement de réaffectation existe encore localement.
 * - Si le véhicule est en "Attente réparation", "Attente devis", "Attente pièces" ou "Essai", le mécanicien est LIBRE !
 * - Si le véhicule est terminé / livré / sorti / attente client, le mécanicien est LIBRE !
 */
export function isVehicleActivelyOccupyingTech(
  v: Flux,
  reaffectationsMap?: Record<string, ReaffectationRecord>
): boolean {
  // 1. Véhicule terminé / livré / sorti / attente client -> LIBRE / DISPONIBLE
  if (isVehicleFinished(v)) {
    return false;
  }

  const normAv = (v.avancement || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const normEtat = (v.etatIntervention || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // 2. Un travail déclaré « En cours » est prioritaire : il occupe le technicien.
  // Cela protège le cas où une ancienne réaffectation n'a pas encore été marquée reprise.
  const isEnCoursActif =
    normAv.startsWith("en cours") ||
    normAv.includes("%") ||
    (!normAv && normEtat === "en cours");
  if (isEnCoursActif) {
    return true;
  }

  // 3. Technicien réaffecté (actif et non repris) -> disponible seulement si ce véhicule est bien en attente.
  if (isVehicleReaffecteActive(v, reaffectationsMap)) {
    return false;
  }

  // 4. Transferts VR : Fin du travail de l'équipe actuelle -> Ancien technicien LIBÉRÉ
  if (normAv.startsWith("vr")) {
    return false;
  }

  // 5. Attente PDR : Le travail est arrêté car une pièce de rechange est nécessaire.
  // Le véhicule reste associé à l'intervention du technicien -> 🔴/🟠 Occupé / Réservé
  if (normAv === "attente pdr" || normAv.includes("pdr")) {
    return true;
  }

  // 6. Essai routier : La réparation nécessite un essai avant validation finale -> 🟠 Intervention active (Occupé)
  if (normAv === "essai" || normEtat === "essai") {
    return true;
  }

  // 7. Technicien réaffecté, attends acheter, Lancement devis -> Le mécanicien est DISPONIBLE
  if (
    normAv.includes("reaffect") ||
    normAv === "attends acheter" ||
    normAv.includes("achet") ||
    normAv === "atende devis" ||
    normAv.includes("devis")
  ) {
    return false;
  }

  // 8. Statut en Attente Réparation générale -> LIBRE
  if (
    normAv.includes("repar") ||
    normEtat.includes("repar") ||
    normAv === "attente" ||
    normEtat === "attente"
  ) {
    return false;
  }

  return false;
}

/**
 * Vérifie si un mécanicien est déjà occupé sur un autre véhicule non terminé et activement en cours.
 * Règle de l'atelier : 1 seul véhicule en cours par mécanicien à la fois.
 * Dès qu'un véhicule est terminé ou que le technicien est réaffecté, il redevient LIBRE !
 */
export function getActiveVehicleForTech(
  techMatricule: string,
  techName: string,
  allVehicles: Flux[],
  currentVehicleId?: string | number,
  currentVehicleNo?: string,
  reaffectationsMap?: Record<string, ReaffectationRecord>
): Flux | undefined {
  if (!allVehicles || allVehicles.length === 0) return undefined;
  const normMat = (techMatricule || "").trim().toLowerCase();
  const normName = (techName || "").trim().toLowerCase();
  if ((!normMat || normMat === "-") && (!normName || normName === "-")) return undefined;

  const currentReaffMap = reaffectationsMap || getReaffectationsLocal();

  return allVehicles.find((v) => {
    // Exclure le véhicule en cours de consultation/modification
    if (currentVehicleId && String(v.id) === String(currentVehicleId)) {
      return false;
    }
    if (currentVehicleNo && v.no && v.no.trim() === currentVehicleNo.trim()) {
      return false;
    }

    // Le véhicule doit être ACTUELLEMENT en cours actif pour occuper le mécanicien
    if (!isVehicleActivelyOccupyingTech(v, currentReaffMap)) {
      return false;
    }

    // Vérifier correspondance matricule ou nom
    const vMat = (v.technicien || "").trim().toLowerCase();
    const vName = (v.nomTechnicien || "").trim().toLowerCase();

    const matchMat = normMat !== "" && normMat !== "-" && vMat !== "" && vMat !== "-" && vMat === normMat;
    const matchName = normName !== "" && normName !== "-" && vName !== "" && vName !== "-" && (
      vName === normName ||
      vName.includes(normName) ||
      normName.includes(vName)
    );

    return Boolean(matchMat || matchName);
  });
}

interface AffecterTechnicienModalProps {
  isOpen: boolean;
  vehicle: Flux | null;
  allVehicles?: Flux[];
  reaffectationsMap?: Record<string, ReaffectationRecord>;
  assignedTeam: string;
  equipeMembers: EquipeMember[];
  isOnlyTechnicienChange?: boolean;
  isTransferAcceptance?: boolean;
  canChangeTeam?: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    vehicle: Flux;
    technicien: string;
    nomTechnicien: string;
    poste: string;
    equipe: string;
  }) => Promise<void> | void;
  onConfirmWithoutTech?: (vehicle: Flux, equipe: string) => Promise<void> | void;
}

export default function AffecterTechnicienModal({
  isOpen,
  vehicle,
  allVehicles = [],
  reaffectationsMap,
  assignedTeam,
  equipeMembers,
  isOnlyTechnicienChange = false,
  isTransferAcceptance = false,
  canChangeTeam = false,
  onClose,
  onConfirm,
  onConfirmWithoutTech,
}: AffecterTechnicienModalProps) {
  const [currentTeam, setCurrentTeam] = useState<string>(assignedTeam || "Daily1");
  const [selectedMatricule, setSelectedMatricule] = useState<string>("");
  const [selectedNom, setSelectedNom] = useState<string>("");
  const [selectedPoste, setSelectedPoste] = useState<string>("");
  const [showOtherTeams, setShowOtherTeams] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [occupiedAlert, setOccupiedAlert] = useState<{
    member: EquipeMember;
    car: Flux;
  } | null>(null);

  // État local des collaborateurs avec synchronisation réactive au stockage local
  const [localCustomMembers, setLocalCustomMembers] = useState<EquipeMember[] | null>(() => getCustomEquipeMembers());
  const [localReaffMap, setLocalReaffMap] = useState<Record<string, ReaffectationRecord>>(getReaffectationsLocal);

  useEffect(() => {
    const handleReaffUpdate = () => {
      setLocalReaffMap(getReaffectationsLocal());
    };
    window.addEventListener("reaffectations_updated", handleReaffUpdate);
    window.addEventListener("storage", handleReaffUpdate);
    return () => {
      window.removeEventListener("reaffectations_updated", handleReaffUpdate);
      window.removeEventListener("storage", handleReaffUpdate);
    };
  }, []);

  const effectiveReaffMap = reaffectationsMap || localReaffMap;

  const openedVehicleKeyRef = useRef<string | null>(null);

  // Initialisation à l'ouverture du modal : exécutée UNE SEULE FOIS par session d'ouverture
  useEffect(() => {
    if (!isOpen || !vehicle) {
      openedVehicleKeyRef.current = null;
      return;
    }

    const currentKey = `${vehicle.id || vehicle.no || "veh"}_open`;
    if (openedVehicleKeyRef.current === currentKey) {
      return; // Déjà initialisé, ne pas effacer la sélection de l'utilisateur !
    }
    openedVehicleKeyRef.current = currentKey;

    setLocalCustomMembers(getCustomEquipeMembers());
    setLocalReaffMap(getReaffectationsLocal());
    const targetTeam = assignedTeam && assignedTeam.trim() !== "-" ? assignedTeam.trim() : "Daily1";
    setCurrentTeam(targetTeam);
    setShowOtherTeams(false);
    setOccupiedAlert(null);

    // Initialiser le technicien seulement à l'ouverture initiale
    if (vehicle.technicien && vehicle.technicien !== "-") {
      const custom = getCustomEquipeMembers();
      const list = custom && custom.length > 0 ? custom : (equipeMembers && equipeMembers.length > 0 ? equipeMembers : DEFAULT_EQUIPE_MAPPINGS);
      const match = list.find(
        (m) =>
          m.matricule === vehicle.technicien ||
          (vehicle.nomTechnicien && m.name.toLowerCase() === vehicle.nomTechnicien.toLowerCase())
      );
      if (match) {
        setSelectedMatricule(match.matricule);
        setSelectedNom(match.name);
        setSelectedPoste(match.poste || "");
        if (match.team) {
          setCurrentTeam(match.team);
        }
        return;
      }
      setSelectedMatricule(vehicle.technicien && vehicle.technicien !== "-" ? vehicle.technicien : "");
      setSelectedNom(vehicle.nomTechnicien && vehicle.nomTechnicien !== "-" ? vehicle.nomTechnicien : "");
      setSelectedPoste("");
    } else {
      setSelectedMatricule("");
      setSelectedNom("");
      setSelectedPoste("");
    }
  }, [isOpen, vehicle?.id, vehicle?.no, assignedTeam]);

  // Écouter les mises à jour dynamiques depuis GestionEquipesView ou d'autres onglets
  useEffect(() => {
    const handleUpdate = () => {
      setLocalCustomMembers(getCustomEquipeMembers());
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

  // Liste exhaustive des membres : priorité absolue aux équipes personnalisées à jour
  const allMembers = useMemo(() => {
    const fromStorage = getCustomEquipeMembers();
    if (fromStorage && fromStorage.length > 0) {
      return fromStorage;
    }
    if (localCustomMembers && localCustomMembers.length > 0) {
      return localCustomMembers;
    }
    return equipeMembers && equipeMembers.length > 0 ? equipeMembers : DEFAULT_EQUIPE_MAPPINGS;
  }, [localCustomMembers, equipeMembers]);

  // Liste dynamique de toutes les équipes (canoniques + toute équipe ajoutée)
  const availableTeams = useMemo(() => {
    const set = new Set<string>(CANONICAL_TEAMS);
    getCustomTeams().forEach((t) => {
      if (t && t.trim()) set.add(t.trim());
    });
    allMembers.forEach((m) => {
      getMemberTeams(m).forEach((team) => set.add(team));
    });
    return Array.from(set);
  }, [allMembers]);

  // Group members into current team and other teams, compute free and occupied count, sort available first
  const { teamMembers, otherMembers, freeCount, occupiedCount } = useMemo(() => {
    const norm = normalizeTeamName(currentTeam);
    const inTeam: EquipeMember[] = [];
    const others: EquipeMember[] = [];

    allMembers.forEach((m) => {
      if (getMemberTeams(m).some((team) => normalizeTeamName(team) === norm)) {
        inTeam.push(m);
      } else {
        others.push(m);
      }
    });

    const hasCustom = Boolean(
      (localCustomMembers && localCustomMembers.length > 0) ||
      (getCustomEquipeMembers() && (getCustomEquipeMembers()?.length ?? 0) > 0)
    );

    // Fallback if team has 0 members in sheet and no custom team configuration exists: take from defaults
    if (inTeam.length === 0 && !hasCustom) {
      DEFAULT_EQUIPE_MAPPINGS.forEach((m) => {
        if (normalizeTeamName(m.team) === norm) {
          inTeam.push(m);
        }
      });
    }

    // Calcul du nombre de libres et occupés
    let free = 0;
    let busy = 0;
    inTeam.forEach((m) => {
      const activeCar = getActiveVehicleForTech(
        m.matricule,
        m.name,
        allVehicles,
        vehicle?.id,
        vehicle?.no,
        effectiveReaffMap
      );
      if (activeCar) {
        busy += 1;
      } else {
        free += 1;
      }
    });

    // Tri : Mécaniciens disponibles (libres) en premier, puis les occupés, puis les Chefs d'équipe
    inTeam.sort((a, b) => {
      const aBusy = Boolean(
        getActiveVehicleForTech(
          a.matricule,
          a.name,
          allVehicles,
          vehicle?.id,
          vehicle?.no,
          effectiveReaffMap
        )
      );
      const bBusy = Boolean(
        getActiveVehicleForTech(
          b.matricule,
          b.name,
          allVehicles,
          vehicle?.id,
          vehicle?.no,
          effectiveReaffMap
        )
      );

      if (aBusy !== bBusy) {
        return aBusy ? 1 : -1; // Libres d'abord
      }

      const aIsChef = a.poste.toUpperCase().includes("CHEF") ? 1 : 0;
      const bIsChef = b.poste.toUpperCase().includes("CHEF") ? 1 : 0;
      if (aIsChef !== bIsChef) {
        return aIsChef - bIsChef;
      }
      return a.name.localeCompare(b.name);
    });

    return {
      teamMembers: inTeam,
      otherMembers: others,
      freeCount: free,
      occupiedCount: busy,
    };
  }, [allMembers, currentTeam, localCustomMembers, allVehicles, vehicle?.id, vehicle?.no, effectiveReaffMap]);

  // Vérifier si le collaborateur actuellement sélectionné est occupé sur un autre véhicule
  const selectedMemberBusyCar = useMemo(() => {
    if (!selectedMatricule || selectedMatricule === "-") return undefined;
    return getActiveVehicleForTech(
      selectedMatricule,
      selectedNom,
      allVehicles,
      vehicle?.id,
      vehicle?.no,
      effectiveReaffMap
    );
  }, [selectedMatricule, selectedNom, allVehicles, vehicle?.id, vehicle?.no, effectiveReaffMap]);

  const handleSelectMember = (member: EquipeMember) => {
    const activeCar = getActiveVehicleForTech(
      member.matricule,
      member.name,
      allVehicles,
      vehicle?.id,
      vehicle?.no,
      effectiveReaffMap
    );

    if (activeCar) {
      // Bloquer et afficher l'alerte explicative (1 mécanicien = 1 voiture)
      setOccupiedAlert({ member, car: activeCar });
      return;
    }

    // Mécanicien libre -> sélection valide
    setOccupiedAlert(null);
    setSelectedMatricule(member.matricule);
    setSelectedNom(member.name);
    setSelectedPoste(member.poste);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicle) return;

    // Règle stricte : blocage si le mécanicien a déjà une voiture en cours
    if (selectedMatricule && selectedMatricule !== "-") {
      const busyCar = getActiveVehicleForTech(
        selectedMatricule,
        selectedNom,
        allVehicles,
        vehicle.id,
        vehicle.no,
        effectiveReaffMap
      );
      if (busyCar) {
        setOccupiedAlert({
          member: {
            matricule: selectedMatricule,
            name: selectedNom || selectedMatricule,
            poste: selectedPoste,
            team: currentTeam,
          },
          car: busyCar,
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onConfirm({
        vehicle,
        technicien: selectedMatricule.trim() || "-",
        nomTechnicien: selectedNom.trim() || "-",
        poste: selectedPoste.trim() || "-",
        equipe: currentTeam || assignedTeam || "Daily1",
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipTech = async () => {
    if (!vehicle || !onConfirmWithoutTech) return;
    setIsSubmitting(true);
    try {
      await onConfirmWithoutTech(vehicle, currentTeam || assignedTeam || "Daily1");
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !vehicle) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/65 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center border border-white/20 shadow-inner">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight">
                {isTransferAcceptance
                  ? "Accepter le Travail & Choisir le Technicien"
                  : isOnlyTechnicienChange
                  ? "Modifier le Technicien"
                  : "Affecter un Technicien & Passer En cours"}
              </h3>
              <p className="text-xs text-blue-100 font-medium">
                {vehicle.no || vehicle.l2n2500 ? `OR: ${vehicle.no || vehicle.l2n2500} • ` : ""}
                {vehicle.marque} {vehicle.modele || vehicle.modelePowerBI || ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          {/* Status & Team Banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-blue-50/90 rounded-xl border border-blue-200/80 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-600 font-semibold">Équipe affectée :</span>
              <span className="px-2.5 py-0.5 rounded-md font-extrabold text-[12px] bg-blue-600 text-white shadow-xs">
                {currentTeam}
              </span>
            </div>

            {isTransferAcceptance ? (
              <div className="flex items-center gap-1.5 text-amber-800 font-bold bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300">
                <span>Transfert reçu de :</span>
                <span className="text-amber-950 font-extrabold">
                  {(vehicle.bloc === 3 ? (vehicle.equipe2 || vehicle.equipe1) : vehicle.equipe1) || "Équipe précédente"}
                </span>
              </div>
            ) : !isOnlyTechnicienChange ? (
              <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                <span className="text-slate-600">{vehicle.etatIntervention || "Attente Réparation"}</span>
                <ArrowRight size={13} className="text-slate-400" />
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold">
                  En cours
                </span>
              </div>
            ) : null}
          </div>

          {/* Optional Team Selector for Chef Atelier / Admin */}
          {canChangeTeam && (
            <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-[11px] font-bold text-slate-600 block">
                Changer d'équipe (Accès Responsable) :
              </span>
              <div className="flex flex-wrap gap-1.5">
                {availableTeams.map((teamName) => {
                  const isActive = normalizeTeamName(currentTeam) === normalizeTeamName(teamName);
                  return (
                    <button
                      key={teamName}
                      type="button"
                      onClick={() => {
                        setCurrentTeam(teamName);
                        setSelectedMatricule("");
                        setSelectedNom("");
                        setSelectedPoste("");
                      }}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                        isActive
                          ? "bg-blue-600 text-white border-blue-600 shadow-xs ring-2 ring-blue-400/40"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {teamName}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Vehicle summary pills */}
          <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <div>
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">Châssis</span>
              <span className="font-bold text-slate-800 font-mono text-[11px]">{vehicle.chassis || "-"}</span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">Client</span>
              <span className="font-bold text-slate-800 truncate block text-[11px]" title={vehicle.client}>
                {vehicle.client || "-"}
              </span>
            </div>
          </div>

          {/* TEAM MEMBERS SELECTION CARDS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Users size={14} className="text-blue-600" />
                <span>
                  Qui de l'équipe <strong className="text-blue-700 font-black">{currentTeam}</strong> va travailler ?
                </span>
                <span className="text-red-500 font-bold">*</span>
              </label>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md border border-emerald-300">
                  {freeCount} libre{freeCount > 1 ? "s" : ""}
                </span>
                {occupiedCount > 0 && (
                  <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded-md border border-rose-300">
                    {occupiedCount} occupé{occupiedCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 bg-slate-100/70 px-2.5 py-1.5 rounded-lg border border-slate-200">
              <span className="flex items-center gap-1 font-medium">
                <Info size={12} className="text-blue-600 shrink-0" />
                <span>Règle d'atelier : <strong>1 mécanicien = 1 voiture en cours</strong></span>
              </span>
              <span className="text-[10px] text-slate-500 italic">
                Libre dès que le véhicule actuel est terminé
              </span>
            </div>

            {/* Alerte si tentative de sélectionner un mécanicien occupé */}
            {occupiedAlert && (
              <div className="p-3 bg-rose-50 border-2 border-rose-300 rounded-xl text-xs text-rose-900 flex items-start gap-2.5 animate-in fade-in duration-200 shadow-xs">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-extrabold text-rose-950 flex items-center justify-between">
                    <span>Mécanicien déjà occupé !</span>
                    <button
                      type="button"
                      onClick={() => setOccupiedAlert(null)}
                      className="text-rose-400 hover:text-rose-800 p-0.5 cursor-pointer"
                      title="Fermer"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="mt-1.5 p-2 bg-white/95 rounded-lg border border-rose-300 text-xs space-y-1">
                    <div className="font-extrabold text-rose-950 flex items-center justify-between">
                      <span>{occupiedAlert.member.matricule} – {occupiedAlert.member.name}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-200 text-rose-900 border border-rose-400">
                        🔴 Occupé
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-slate-800 pt-1 border-t border-rose-200">
                      <div><span className="text-slate-500 font-semibold">Véhicule :</span> <strong>{occupiedAlert.car.marque} {occupiedAlert.car.modele || ""}</strong></div>
                      <div><span className="text-slate-500 font-semibold">Emplacement :</span> <strong className="font-mono text-slate-900">{occupiedAlert.car.emplacement || "-"}</strong></div>
                      <div><span className="text-slate-500 font-semibold">Avancement :</span> <strong className="text-blue-700">{occupiedAlert.car.avancement || occupiedAlert.car.etatIntervention || "En cours"}</strong></div>
                      <div><span className="text-slate-500 font-semibold">Début :</span> <strong className="font-mono text-slate-900">{occupiedAlert.car.heureDebutTravail || (occupiedAlert.car.dateDebutRep ? occupiedAlert.car.dateDebutRep.split(" ")[1] : "-")}</strong></div>
                    </div>
                  </div>
                  <p className="mt-1 text-[10px] text-rose-700 font-semibold bg-rose-100/70 p-1 rounded border border-rose-200">
                    🔒 Règle atelier : Un mécanicien ne peut prendre en charge qu'une seule voiture à la fois jusqu'à ce qu'elle soit terminée.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto p-1.5 bg-slate-50/70 rounded-xl border border-slate-200">
              {teamMembers.map((member) => {
                const isSelected = selectedMatricule === member.matricule;
                const isChef = member.poste.toUpperCase().includes("CHEF");
                const activeCar = getActiveVehicleForTech(
                  member.matricule,
                  member.name,
                  allVehicles,
                  vehicle?.id,
                  vehicle?.no,
                  effectiveReaffMap
                );
                const isOccupied = Boolean(activeCar);

                return (
                  <button
                    key={`${member.matricule}_${member.name}`}
                    type="button"
                    onClick={() => handleSelectMember(member)}
                    className={`group text-left p-2.5 rounded-xl border-2 transition-all flex items-center justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? "border-blue-600 bg-blue-50 shadow-sm ring-2 ring-blue-500/30"
                        : isOccupied
                        ? "border-rose-200/80 bg-rose-50/40 hover:border-rose-300 hover:bg-rose-50"
                        : "border-slate-200 hover:border-blue-300 hover:bg-white bg-white/90"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 transition-transform group-hover:scale-105 ${
                          isSelected
                            ? "bg-blue-600 text-white shadow-xs"
                            : isOccupied
                            ? "bg-rose-100 text-rose-800 border border-rose-300"
                            : isChef
                            ? "bg-amber-100 text-amber-900 border border-amber-300"
                            : "bg-slate-100 text-slate-700 border border-slate-200"
                        }`}
                      >
                        {isChef ? (
                          <ShieldCheck size={16} className={isSelected ? "text-white" : isOccupied ? "text-rose-700" : "text-amber-700"} />
                        ) : member.poste.toUpperCase().includes("ELEC") ? (
                          <Zap size={15} className={isSelected ? "text-white" : isOccupied ? "text-rose-700" : "text-purple-600"} />
                        ) : member.poste.toUpperCase().includes("TOLL") ? (
                          <Hammer size={15} className={isSelected ? "text-white" : isOccupied ? "text-rose-700" : "text-emerald-600"} />
                        ) : (
                          <Wrench size={15} className={isSelected ? "text-white" : isOccupied ? "text-rose-700" : "text-blue-600"} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-extrabold text-xs text-slate-900 truncate">
                            {member.name}
                          </span>
                          {isOccupied ? (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300 shrink-0"
                              title={`Occupé sur OR ${activeCar?.no || activeCar?.serie || ""}`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                              Occupé
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                              Disponible
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px]">
                          <span className="font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                            {member.matricule}
                          </span>
                          <span
                            className={`font-semibold uppercase truncate ${
                              isChef ? "text-amber-700 font-bold" : "text-slate-500"
                            }`}
                          >
                            {member.poste}
                          </span>
                        </div>
                        {isOccupied && activeCar && (
                          <div className="mt-1 text-[9.5px] font-semibold text-rose-800 bg-rose-100/70 p-1 rounded border border-rose-200">
                            <div className="truncate">Véhicule : <strong>{activeCar.marque} {activeCar.modele || ""}</strong> (OR {activeCar.no || activeCar.serie || ""})</div>
                            <div className="flex items-center gap-1 text-[9px] text-rose-700 mt-0.5 flex-wrap">
                              <span>Emp: <strong className="font-mono">{activeCar.emplacement || "-"}</strong></span>
                              <span>•</span>
                              <span>{activeCar.avancement || "En cours"}</span>
                              <span>•</span>
                              <span>Début: <strong className="font-mono">{activeCar.heureDebutTravail || (activeCar.dateDebutRep ? activeCar.dateDebutRep.split(" ")[1] : "-")}</strong></span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${
                        isSelected
                          ? "bg-blue-600 text-white shadow-xs scale-105"
                          : isOccupied
                          ? "border border-rose-300 bg-rose-100/60"
                          : "border-2 border-slate-300 bg-white group-hover:border-blue-400"
                      }`}
                    >
                      {isSelected ? (
                        <Check size={12} strokeWidth={3} />
                      ) : isOccupied ? (
                        <span className="text-[10px] text-rose-600 font-black">✕</span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* N° Matricule et Nom de Technicien Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <label htmlFor="input-tech-matricule" className="block text-[11px] font-bold text-slate-700 mb-1">
                N° Matricule <span className="text-red-500">*</span>
              </label>
              <input
                id="input-tech-matricule"
                type="text"
                value={selectedMatricule}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedMatricule(val);
                  const match = allMembers.find((m) => m.matricule.toLowerCase() === val.trim().toLowerCase());
                  if (match) {
                    setSelectedNom(match.name);
                    setSelectedPoste(match.poste);
                  }
                }}
                placeholder="Ex: 1214, 8701..."
                className="w-full text-xs font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                required
              />
            </div>
            <div>
              <label htmlFor="input-tech-nom" className="block text-[11px] font-bold text-slate-700 mb-1">
                NOM DE TECHNICIEN <span className="text-red-500">*</span>
              </label>
              <input
                id="input-tech-nom"
                type="text"
                value={selectedNom}
                onChange={(e) => setSelectedNom(e.target.value)}
                placeholder="Ex: WAJIH TOUIL, Montassar Bjaoui..."
                className="w-full text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                required
              />
            </div>
          </div>

          {/* Selected Member Confirmation Card */}
          <div
            className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs transition-colors ${
              selectedMemberBusyCar
                ? "bg-rose-50/90 border-rose-300 text-rose-950"
                : selectedMatricule
                ? "bg-emerald-50/90 border-emerald-300 text-emerald-950"
                : "bg-amber-50/80 border-amber-200 text-amber-900"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  selectedMemberBusyCar
                    ? "bg-rose-600 text-white"
                    : selectedMatricule
                    ? "bg-emerald-600 text-white"
                    : "bg-amber-200 text-amber-800"
                }`}
              >
                {selectedMemberBusyCar ? <AlertTriangle size={16} /> : <UserCheck size={16} />}
              </div>
              <div className="min-w-0">
                <span className="font-bold text-[10px] block text-slate-500 uppercase tracking-wide">
                  Personne désignée :
                </span>
                {selectedMemberBusyCar ? (
                  <div className="font-extrabold text-xs text-rose-900">
                    <span className="font-mono bg-rose-100 px-1 py-0.2 rounded border border-rose-300 mr-1.5">
                      {selectedMatricule}
                    </span>
                    {selectedNom} - ⛔ Déjà occupé sur OR {selectedMemberBusyCar.no || selectedMemberBusyCar.serie}
                  </div>
                ) : selectedMatricule ? (
                  <div className="font-extrabold text-xs text-emerald-900 truncate">
                    <span className="font-mono bg-emerald-100 px-1 py-0.2 rounded border border-emerald-300 mr-1.5">
                      {selectedMatricule}
                    </span>
                    {selectedNom} {selectedPoste ? `(${selectedPoste})` : ""}
                  </div>
                ) : (
                  <span className="text-amber-800 font-semibold italic text-xs">
                    Veuillez cliquer sur un mécanicien ci-dessus ou saisir son N° Matricule et Nom.
                  </span>
                )}
              </div>
            </div>

            {selectedMemberBusyCar ? (
              <span className="px-2 py-0.5 rounded-md font-extrabold text-[11px] bg-rose-200 text-rose-900 border border-rose-300 shrink-0">
                Non disponible
              </span>
            ) : selectedMatricule ? (
              <span className="px-2 py-0.5 rounded-md font-extrabold text-[11px] bg-emerald-200 text-emerald-800 border border-emerald-300 shrink-0">
                Prêt
              </span>
            ) : null}
          </div>

          {/* Collapsible: Autre collaborateur ou autre équipe (Réservé au Chef Atelier / Administration) */}
          {canChangeTeam && (
            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setShowOtherTeams(!showOtherTeams)}
                className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between font-semibold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <span>Besoin d'affecter un collaborateur d'une autre équipe ?</span>
                </div>
                {showOtherTeams ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showOtherTeams && (
                <div className="p-3 bg-white border-t border-slate-200 space-y-3 animate-in slide-in-from-top-1 duration-150">
                  <div>
                    <label htmlFor="select-other-member" className="block text-[11px] font-bold text-slate-700 mb-1">
                      Choisir un technicien parmi toutes les équipes :
                    </label>
                    <select
                      id="select-other-member"
                      value={selectedMatricule}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) {
                          setSelectedMatricule("");
                          setSelectedNom("");
                          setSelectedPoste("");
                          setOccupiedAlert(null);
                          return;
                        }
                        const match = allMembers.find((m) => m.matricule === val);
                        if (match) {
                          const busy = getActiveVehicleForTech(
                            match.matricule,
                            match.name,
                            allVehicles,
                            vehicle?.id,
                            vehicle?.no,
                            effectiveReaffMap
                          );
                          if (busy) {
                            setOccupiedAlert({ member: match, car: busy });
                            return;
                          }
                          setOccupiedAlert(null);
                          setSelectedMatricule(match.matricule);
                          setSelectedNom(match.name);
                          setSelectedPoste(match.poste);
                          setCurrentTeam(match.team);
                        }
                      }}
                      className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg px-2.5 py-2"
                    >
                      <option value="">-- Sélectionner un autre collaborateur --</option>
                      {otherMembers.map((m) => {
                        const busy = getActiveVehicleForTech(
                          m.matricule,
                          m.name,
                          allVehicles,
                          vehicle?.id,
                          vehicle?.no,
                          effectiveReaffMap
                        );
                        return (
                          <option
                            key={`other_${m.team}_${m.matricule}`}
                            value={m.matricule}
                            disabled={Boolean(busy)}
                          >
                            {busy ? `⛔ [OCCUPÉ - OR ${busy.no || busy.serie || busy.id}] ` : "🟢 [DISPONIBLE] "}
                            [{m.team}] {m.name} ({m.poste}) - Mat: {m.matricule}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Annuler
            </button>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {!isOnlyTechnicienChange && onConfirmWithoutTech && (
                <button
                  type="button"
                  onClick={handleSkipTech}
                  disabled={isSubmitting}
                  className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                  title="Passer en cours et affecter le technicien plus tard"
                >
                  Sans technicien
                </button>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !selectedMatricule.trim() || !selectedNom.trim() || Boolean(selectedMemberBusyCar)}
                className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white rounded-xl shadow-md transition-all cursor-pointer ${
                  selectedMatricule.trim() && selectedNom.trim() && !selectedMemberBusyCar
                    ? "bg-blue-600 hover:bg-blue-700 shadow-blue-600/30 hover:scale-[1.02] active:scale-[0.98]"
                    : "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
                }`}
                title={
                  selectedMemberBusyCar
                    ? "Impossible d'affecter : ce mécanicien est déjà occupé sur un autre véhicule"
                    : undefined
                }
              >
                <Check size={14} strokeWidth={2.5} />
                <span>
                  {isSubmitting
                    ? "Enregistrement..."
                    : isTransferAcceptance
                    ? "Accepter le Travail & Affecter"
                    : isOnlyTechnicienChange
                    ? "Valider Technicien"
                    : "Valider & Passer En cours"}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
