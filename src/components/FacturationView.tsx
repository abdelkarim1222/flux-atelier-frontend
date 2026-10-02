import { useState, useMemo, useEffect } from "react";
import {
  Receipt,
  CheckCircle2,
  Clock,
  FileText,
  AlertCircle,
  Search,
  Check,
  Send,
  RefreshCw,
  FileCheck,
  Info,
  ArrowRight,
} from "lucide-react";
import {
  type Flux,
} from "../data/mockData";
import { isVehicleMatchingTeam } from "../config/teams";
import {
  type FacturationNotification,
  type FacturationPaymentMode,
  getFacturationNotifications,
  validerPaiementFacturation,
} from "../services/database";
import { useAuth } from "../context/AuthContext";

interface FacturationViewProps {
  vehicles: Flux[];
  onRefresh?: () => void;
  onNavigateToReception?: (notice?: string) => void;
  onSelectVehicle?: (v: Flux) => void;
  initialSubTab?: FacturationTab;
}

type FacturationTab = "en_attente" | "edition_fin_travaux" | "historique" | "tous";

export default function FacturationView({
  vehicles,
  onRefresh,
  onNavigateToReception,
  onSelectVehicle,
  initialSubTab,
}: FacturationViewProps) {
  const { currentUser } = useAuth();
  const isAdministration = currentUser?.role === "administration";
  // L'Administration et le Chef d'Atelier voient tous les dossiers. Les
  // comptes Facturation et Chefs d'Équipe restent limités à leurs équipes,
  // même lorsqu'un Chef d'Équipe reçoit le droit Facturation en supplément.
  const isRestrictedToAssignedTeams =
    (currentUser?.role === "facturation" || currentUser?.role === "chef_equipe") &&
    !currentUser?.customPermissions?.canViewAllFacturation &&
    Boolean(currentUser?.assignedTeam) &&
    (currentUser?.assignedTeam || "").trim().toLowerCase() !== "toutes" &&
    (currentUser?.assignedTeam || "").trim().toLowerCase() !== "all";
  const [notifications, setNotifications] = useState<FacturationNotification[]>(getFacturationNotifications);
  const [activeSubTab, setActiveSubTab] = useState<FacturationTab>(initialSubTab || "en_attente");
  const [search, setSearch] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // Modal de choix du mode de paiement (3 options)
  const [selectedVehicleForPayment, setSelectedVehicleForPayment] = useState<{
    noOr: string;
    chassis: string;
    immatriculation?: string;
    marque?: string;
    modele?: string;
    client?: string;
    equipe?: string;
    technicien?: string;
    dateFinTravaux?: string;
  } | null>(null);

  const [chosenMode, setChosenMode] = useState<FacturationPaymentMode>("Facture");
  const [inputNumeroFacture, setInputNumeroFacture] = useState("");
  const [inputNumeroBC, setInputNumeroBC] = useState("");
  const [inputNumeroEdition, setInputNumeroEdition] = useState("");
  const [inputCommentaire, setInputCommentaire] = useState("");

  // Modal de régularisation Facture finale pour "Édition fin de travaux"
  const [regularisationItem, setRegularisationItem] = useState<FacturationNotification | null>(null);
  const [regularisationMode, setRegularisationMode] = useState<"Facture" | "Bon de commande">("Facture");

  // Écoute des mises à jour des notifications Facturation
  useEffect(() => {
    const handleUpdate = () => {
      setNotifications(getFacturationNotifications());
    };
    window.addEventListener("facturation_notifications_updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("facturation_notifications_updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  // Détection des véhicules dont les travaux sont terminés côté atelier ou ayant des données de facturation
  const vehiclesFinisAtelier = useMemo(() => {
    return vehicles.filter((v) => {
      if (isRestrictedToAssignedTeams && (!v.equipe || !isVehicleMatchingTeam(v.equipe, currentUser?.assignedTeam || ""))) {
        return false;
      }
      // Les dossiers Garantie (R10) sont traités exclusivement dans le Tableau Garantie
      const cs = String(v.cs || "").trim().toUpperCase();
      if (cs === "R10" || (v as any).isGarantie) {
        return false;
      }
      const av = (v.avancement || "").trim().toLowerCase();
      const etat = (v.etatIntervention || v.statut || "").trim().toLowerCase();
      const vAny = v as unknown as Record<string, unknown>;
      const hasFacturationData = Boolean(
        vAny.modePaiement ||
        vAny.statutFacturation ||
        vAny.dateValidationFacturation ||
        vAny.numeroFacture ||
        vAny.numeroEdition
      );
      const isFinished =
        av === "terminer" ||
        av.includes("termin") ||
        av === "100%" ||
        etat.includes("prêt") ||
        etat.includes("attente client") ||
        etat.includes("fini") ||
        hasFacturationData;
      return isFinished;
    });
  }, [vehicles, isRestrictedToAssignedTeams, currentUser?.assignedTeam]);

  // Fusionner les véhicules terminés avec les notifications pour obtenir la liste consolidée
  const dossiersConsolides = useMemo(() => {
    const visibleNotifications = notifications.filter((n) => {
      if (!isRestrictedToAssignedTeams) return true;
      const matchingVehicle = vehicles.find(
        (v) =>
          n.noOr
            ? v.no === n.noOr || v.ordre === n.noOr
            : n.chassis && v.chassis === n.chassis
      );
      const itemTeam = n.equipe || matchingVehicle?.equipe || "";
      if (!itemTeam) return false;
      return isVehicleMatchingTeam(itemTeam, currentUser?.assignedTeam || "");
    });

    const items: Array<{
      key: string;
      noOr: string;
      chassis: string;
      immatriculation: string;
      marque: string;
      modele: string;
      client: string;
      equipe: string;
      technicien: string;
      dateFinTravaux: string;
      statutPaiement: "en_attente" | "facture" | "bon_commande" | "edition_fin_travaux";
      modePaiement?: FacturationPaymentMode;
      numeroFacture?: string;
      numeroBC?: string;
      numeroEdition?: string;
      statutFacturationFinale?: "non_facture" | "facture";
      dateDecision?: string;
      decisionPar?: string;
      dateFacturationFinale?: string;
      facturePar?: string;
      etatVehicule?: string;
      emplacementVehicule?: string;
      rawVehicle?: Flux;
      rawNotif?: FacturationNotification;
    }> = [];

    const seenKeys = new Set<string>();

    // 1. Ajouter depuis les notifications enregistrées
    visibleNotifications.forEach((n) => {
      const key = `${n.noOr || ""}_${n.chassis || ""}`.trim();
      if (!key) return;
      seenKeys.add(key);

      const matchingVehicle = vehicles.find(
        (v) =>
          n.noOr
            ? v.no === n.noOr || v.ordre === n.noOr
            : n.chassis && v.chassis === n.chassis
      );

      const clientName =
        (n.nomClient && n.nomClient !== "Client non renseigné" && n.nomClient !== "-" && n.nomClient !== "Client non spécifié" ? n.nomClient : "") ||
        (matchingVehicle?.client && matchingVehicle.client !== "Client non renseigné" && matchingVehicle.client !== "-" && matchingVehicle.client !== "Client non spécifié" ? matchingVehicle.client : "") ||
        n.nomClient ||
        matchingVehicle?.client ||
        "Client non renseigné";

      items.push({
        key,
        noOr: n.noOr,
        chassis: n.chassis,
        immatriculation: n.immatriculation || matchingVehicle?.serie || matchingVehicle?.immatriculation || "",
        marque: n.marque || matchingVehicle?.marque || "",
        modele: n.modele || matchingVehicle?.modele || "",
        client: clientName,
        equipe: n.equipe || matchingVehicle?.equipe || "",
        technicien: n.technicien || matchingVehicle?.nomTechnicien || matchingVehicle?.technicien || "",
        dateFinTravaux: n.dateFinTravaux || matchingVehicle?.dateFinRep || "",
        statutPaiement: n.statutPaiement || "en_attente",
        modePaiement: n.modePaiement,
        numeroFacture: n.numeroFacture,
        numeroBC: n.numeroBC,
        numeroEdition: n.numeroEdition,
        statutFacturationFinale: n.statutFacturationFinale,
        dateDecision: n.dateDecision,
        decisionPar: n.decisionPar,
        dateFacturationFinale: n.dateFacturationFinale,
        facturePar: n.facturePar,
        etatVehicule: matchingVehicle?.etatIntervention || matchingVehicle?.statut,
        emplacementVehicule: matchingVehicle?.emplacement,
        rawVehicle: matchingVehicle,
        rawNotif: n,
      });
    });

    // 2. Ajouter les véhicules terminés dans l'atelier qui n'ont pas encore de notification
    vehiclesFinisAtelier.forEach((v) => {
      const noOr = String(v.no || v.ordre || "").trim();
      const chassis = String(v.chassis || "").trim();
      const key = `${noOr}_${chassis}`.trim();
      if (!key || seenKeys.has(key)) return;
      seenKeys.add(key);

      const vAny = v as unknown as Record<string, unknown>;
      const vMode = vAny.modePaiement as FacturationPaymentMode | undefined;
      const vStatutFactFinale = vAny.statutFacturationFinale as "non_facture" | "facture" | undefined;

      let statutPaiement: "en_attente" | "facture" | "bon_commande" | "edition_fin_travaux" = "en_attente";
      if (vMode === "Facture") statutPaiement = "facture";
      else if (vMode === "Bon de commande") statutPaiement = "bon_commande";
      else if (vMode === "Att Facture" || vMode === "Édition fin de travaux" || String(vMode || "") === "Attente Facture") statutPaiement = "edition_fin_travaux";

      items.push({
        key,
        noOr,
        chassis,
        immatriculation: v.serie || v.immatriculation || "",
        marque: v.marque || "",
        modele: v.modele || "",
        client: v.client || "Client non renseigné",
        equipe: v.equipe || "",
        technicien: v.nomTechnicien || v.technicien || "",
        dateFinTravaux: v.dateFinRep || v.dateModification || "",
        statutPaiement,
        modePaiement: vMode,
        numeroFacture: vAny.numeroFacture as string | undefined,
        numeroBC: vAny.numeroBC as string | undefined,
        numeroEdition: vAny.numeroEdition as string | undefined,
        statutFacturationFinale: vStatutFactFinale || (statutPaiement === "edition_fin_travaux" ? "non_facture" : undefined),
        dateDecision: vAny.dateValidationFacturation as string | undefined,
        decisionPar: vAny.facturationValideePar as string | undefined,
        dateFacturationFinale: vAny.dateFacturationFinale as string | undefined,
        facturePar: vAny.facturePar as string | undefined,
        etatVehicule: v.etatIntervention || v.statut,
        emplacementVehicule: v.emplacement,
        rawVehicle: v,
      });
    });

    return items;
  }, [notifications, vehicles, vehiclesFinisAtelier, isRestrictedToAssignedTeams, currentUser?.assignedTeam]);

  // Compteurs statistiques
  const stats = useMemo(() => {
    const enAttente = dossiersConsolides.filter((d) => d.statutPaiement === "en_attente").length;
    const aFacturerEFT = dossiersConsolides.filter(
      (d) => d.statutPaiement === "edition_fin_travaux" && d.statutFacturationFinale !== "facture"
    ).length;
    const facturesSoldees = dossiersConsolides.filter(
      (d) =>
        d.statutPaiement === "facture" ||
        d.statutPaiement === "bon_commande" ||
        (d.statutPaiement === "edition_fin_travaux" && d.statutFacturationFinale === "facture")
    ).length;
    return {
      total: dossiersConsolides.length,
      enAttente,
      aFacturerEFT,
      facturesSoldees,
    };
  }, [dossiersConsolides]);

  // Filtrage selon sous-onglet et recherche
  const dossiersFiltres = useMemo(() => {
    let list = dossiersConsolides;

    if (activeSubTab === "en_attente") {
      list = list.filter((d) => d.statutPaiement === "en_attente");
    } else if (activeSubTab === "edition_fin_travaux") {
      list = list.filter(
        (d) => d.statutPaiement === "edition_fin_travaux" && d.statutFacturationFinale !== "facture"
      );
    } else if (activeSubTab === "historique" && isAdministration) {
      list = list.filter(
        (d) =>
          d.statutPaiement === "facture" ||
          d.statutPaiement === "bon_commande" ||
          (d.statutPaiement === "edition_fin_travaux" && d.statutFacturationFinale === "facture")
      );
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (d) =>
          d.noOr.toLowerCase().includes(q) ||
          d.chassis.toLowerCase().includes(q) ||
          d.immatriculation.toLowerCase().includes(q) ||
          d.client.toLowerCase().includes(q) ||
          d.marque.toLowerCase().includes(q) ||
          d.modele.toLowerCase().includes(q) ||
          d.equipe.toLowerCase().includes(q)
      );
    }

    // Les dossiers clôturés disparaissent de la Facturation : l'archive est
    // consultable uniquement par l'Administration.
    if (!isAdministration) {
      list = list.filter((d) =>
        d.statutPaiement !== "facture" &&
        d.statutPaiement !== "bon_commande" &&
        d.statutFacturationFinale !== "facture"
      );
    }
    return list;
  }, [dossiersConsolides, activeSubTab, search, isAdministration]);

  // Ouvrir modal de validation de paiement
  const handleOpenPaymentModal = (item: {
    noOr: string;
    chassis: string;
    immatriculation?: string;
    marque?: string;
    modele?: string;
    client?: string;
    equipe?: string;
    technicien?: string;
    dateFinTravaux?: string;
  }) => {
    setSelectedVehicleForPayment(item);
    setChosenMode("Facture");
    setInputNumeroFacture("");
    setInputNumeroBC("");
    setInputNumeroEdition("");
    setInputCommentaire("");
    setError(null);
  };

  // Soumission de la validation du mode de paiement
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicleForPayment) return;
    setIsSubmitting(true);
    setError(null);
    setNotice(null);

    const userName = currentUser?.name || currentUser?.email || "Service Facturation";

    try {
      await validerPaiementFacturation({
        noOr: selectedVehicleForPayment.noOr,
        chassis: selectedVehicleForPayment.chassis,
        modePaiement: chosenMode,
        numeroFacture: inputNumeroFacture.trim(),
        numeroBC: inputNumeroBC.trim(),
        numeroEdition: inputNumeroEdition.trim(),
        commentaire: inputCommentaire.trim(),
        validePar: userName,
        equipe: selectedVehicleForPayment.equipe,
        client: selectedVehicleForPayment.client,
        nomClient: selectedVehicleForPayment.client,
      });

      if (chosenMode === "Att Facture" || chosenMode === "Édition fin de travaux") {
        setActiveSubTab("edition_fin_travaux");
        setNotice(
          `✅ OR ${selectedVehicleForPayment.noOr} transféré à la Réception en « Attente Client ». Il reste dans « Att Facture » jusqu'au règlement de fin de mois.`
        );
      } else {
        setActiveSubTab("historique");
        setNotice(
          `✅ Règlement validé : [${chosenMode}] pour l'OR ${selectedVehicleForPayment.noOr}. Le véhicule est placé en « Attente Client » à la Réception.`
        );
      }
      setSelectedVehicleForPayment(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la validation du paiement.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Soumission régularisation Facture pour Édition Fin de Travaux
  const handleSubmitRegularisation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regularisationItem) return;
    setIsSubmitting(true);
    setError(null);
    setNotice(null);

    const userName = currentUser?.name || currentUser?.email || "Service Facturation";

    try {
      await validerPaiementFacturation({
        noOr: regularisationItem.noOr,
        chassis: regularisationItem.chassis,
        modePaiement: regularisationMode,
        validePar: userName,
        regularisation: true,
        equipe: regularisationItem.equipe,
        client: regularisationItem.client,
        nomClient: regularisationItem.client,
      });

      setNotice(
        `✅ ${regularisationMode} validé pour l'OR ${regularisationItem.noOr}. Le véhicule est transféré à la Réception en « Attente Client ».`
      );
      setRegularisationItem(null);
      setRegularisationMode("Facture");
      setActiveSubTab("en_attente");
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement de la facture.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/10 backdrop-blur-xs p-4 lg:p-6 overflow-y-auto space-y-5">
      {/* Header Card */}
      <div className="bg-white/92 backdrop-blur-md rounded-2xl p-5 border border-white/60 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md shadow-amber-500/25">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  Facturation & Encaissement
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                  Validation Règlements & Autorisation Livraison
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Dès fin des travaux atelier, choisissez le mode de règlement parmi les 3 options pour transférer le véhicule à la réception.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer border border-slate-200/80"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Actualiser</span>
              </button>
            )}
          </div>
        </div>

        {/* Notices & Errors */}
        {notice && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-semibold text-emerald-800 flex items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 flex-wrap">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{notice}</span>
              {onNavigateToReception && (
                <button
                  type="button"
                  onClick={() => onNavigateToReception()}
                  className="ml-1 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-lg cursor-pointer transition-colors shadow-2xs"
                  title="Voir le véhicule dans le tableau de Réception"
                >
                  <span>Voir en Réception</span>
                  <ArrowRight size={12} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-emerald-700 hover:text-emerald-950 font-bold px-1"
            >
              ×
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs font-semibold text-rose-800 flex items-center justify-between animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-rose-700 hover:text-rose-950 font-bold px-1"
            >
              ×
            </button>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {/* Card 1 : En attente */}
          <button
            type="button"
            onClick={() => setActiveSubTab("en_attente")}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              activeSubTab === "en_attente"
                ? "bg-amber-50/90 border-amber-400 ring-2 ring-amber-400/20 shadow-sm"
                : "bg-slate-50/80 border-slate-200 hover:bg-slate-100"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                À Traiter
              </span>
              <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
                <Clock className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-amber-950">{stats.enAttente}</span>
              <span className="text-[10px] font-medium text-slate-500">dossiers</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1 leading-tight">
              Travaux terminés, en attente de choix paiement
            </p>
          </button>

          {/* Card 2 : Att Facture À FACTURER */}
          <button
            type="button"
            onClick={() => setActiveSubTab("edition_fin_travaux")}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden ${
              activeSubTab === "edition_fin_travaux"
                ? "bg-orange-50/90 border-orange-400 ring-2 ring-orange-400/20 shadow-sm"
                : "bg-slate-50/80 border-slate-200 hover:bg-slate-100"
            }`}
          >
            {stats.aFacturerEFT > 0 && (
              <span className="absolute top-2 right-2 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
              </span>
            )}
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-orange-800 uppercase tracking-wider">
                Att Facture
              </span>
              <div className="w-6 h-6 rounded-lg bg-orange-100 flex items-center justify-center text-orange-700">
                <FileText className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-orange-950">{stats.aFacturerEFT}</span>
              <span className="text-[10px] font-bold text-orange-700">À FACTURER</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1 leading-tight">
              À conserver jusqu'à validation Facture ou BC
            </p>
          </button>

          {/* Card 3 : Soldés — archive réservée à l'administration */}
          {isAdministration && <button
            type="button"
            onClick={() => setActiveSubTab("historique")}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              activeSubTab === "historique"
                ? "bg-emerald-50/90 border-emerald-400 ring-2 ring-emerald-400/20 shadow-sm"
                : "bg-slate-50/80 border-slate-200 hover:bg-slate-100"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                Facturés / Soldés
              </span>
              <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-emerald-950">{stats.facturesSoldees}</span>
              <span className="text-[10px] font-medium text-slate-500">dossiers</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1 leading-tight">
              Facture ou Bon de commande validé
            </p>
          </button>}

          {/* Card 4 : Total — archive réservée à l'administration */}
          {isAdministration && <button
            type="button"
            onClick={() => setActiveSubTab("tous")}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              activeSubTab === "tous"
                ? "bg-blue-50/90 border-blue-400 ring-2 ring-blue-400/20 shadow-sm"
                : "bg-slate-50/80 border-slate-200 hover:bg-slate-100"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">
                Total Suivis
              </span>
              <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700">
                <Receipt className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-blue-950">{stats.total}</span>
              <span className="text-[10px] font-medium text-slate-500">véhicules</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1 leading-tight">
              Ensemble des dossiers atelier terminés
            </p>
          </button>}
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white/92 backdrop-blur-md rounded-2xl border border-white/60 shadow-lg flex-1 flex flex-col min-h-[450px] overflow-hidden">
        {/* Sub-Tabs & Search Toolbar */}
        <div className="p-4 border-b border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/60">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <button
              type="button"
              onClick={() => setActiveSubTab("en_attente")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer border ${
                activeSubTab === "en_attente"
                  ? "bg-amber-600 text-white border-amber-600 shadow-sm shadow-amber-600/30"
                  : "bg-white text-slate-700 hover:bg-amber-50 border-slate-200"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>En attente de paiement</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  activeSubTab === "en_attente" ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800"
                }`}
              >
                {stats.enAttente}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab("edition_fin_travaux")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer border ${
                activeSubTab === "edition_fin_travaux"
                  ? "bg-orange-600 text-white border-orange-600 shadow-sm shadow-orange-600/30"
                  : "bg-white text-orange-700 hover:bg-orange-50 border-orange-200"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Att Facture (À FACTURER)</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  activeSubTab === "edition_fin_travaux" ? "bg-white/20 text-white" : "bg-orange-100 text-orange-800"
                }`}
              >
                {stats.aFacturerEFT}
              </span>
            </button>

            {isAdministration && <button
              type="button"
              onClick={() => setActiveSubTab("historique")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer border ${
                activeSubTab === "historique"
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/30"
                  : "bg-white text-slate-700 hover:bg-emerald-50 border-slate-200"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Facturés & Clôturés</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  activeSubTab === "historique" ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {stats.facturesSoldees}
              </span>
            </button>}

            {isAdministration && <button
              type="button"
              onClick={() => setActiveSubTab("tous")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer border ${
                activeSubTab === "tous"
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-600/30"
                  : "bg-white text-slate-700 hover:bg-slate-100 border-slate-200"
              }`}
            >
              <span>Tous</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  activeSubTab === "tous" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                }`}
              >
                {stats.total}
              </span>
            </button>}
          </div>

          {/* Search box */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher N° OR, Châssis, Client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white rounded-lg border border-slate-200 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* Informative Banner for Att Facture tab */}
        {activeSubTab === "edition_fin_travaux" && (
          <div className="px-4 py-2.5 bg-orange-50/90 border-b border-orange-200 flex items-center justify-between text-xs text-orange-950 font-medium">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-orange-600 shrink-0" />
              <span>
                Ces véhicules sont transférés à la Réception en <strong>« Attente Client »</strong> afin que le client puisse les prendre. Ils restent dans votre tableau Facturation jusqu’au règlement de fin de mois.
              </span>
            </div>
            <span className="font-extrabold text-orange-800 shrink-0 ml-2">
              {stats.aFacturerEFT} restant(s) à facturer
            </span>
          </div>
        )}

        {/* Table Content */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">N° OR & Châssis</th>
                <th className="py-3 px-4">Véhicule & Immat</th>
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4">Équipe / Tech</th>
                <th className="py-3 px-4">Fin Travaux</th>
                <th className="py-3 px-4">Statut Règlement</th>
                <th className="py-3 px-4 text-right">Action Facturation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {dossiersFiltres.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30 text-amber-600" />
                    <p className="font-semibold">Aucun dossier dans cet onglet</p>
                    <p className="text-[11px] mt-0.5">
                      {search ? "Modifiez vos filtres de recherche." : "Tous les dossiers sont à jour."}
                    </p>
                  </td>
                </tr>
              ) : (
                dossiersFiltres.map((item) => {
                  const isPending = item.statutPaiement === "en_attente";
                  const isEFT = item.statutPaiement === "edition_fin_travaux";
                  const isEFTNonFacture = isEFT && item.statutFacturationFinale !== "facture";
                  const isSolde =
                    item.statutPaiement === "facture" ||
                    item.statutPaiement === "bon_commande" ||
                    (isEFT && item.statutFacturationFinale === "facture");

                  return (
                    <tr
                      key={item.key}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isPending
                          ? "bg-amber-50/30 font-medium"
                          : isEFTNonFacture
                          ? "bg-orange-50/20"
                          : ""
                      }`}
                    >
                      {/* N° OR & Châssis */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => {
                              if (item.rawVehicle && onSelectVehicle) {
                                onSelectVehicle(item.rawVehicle);
                              }
                            }}
                            className={`font-mono font-black text-left text-sm ${
                              onSelectVehicle && item.rawVehicle
                                ? "text-blue-700 hover:text-blue-900 hover:underline cursor-pointer"
                                : "text-slate-900"
                            }`}
                          >
                            {item.noOr || "-"}
                          </button>
                          <span className="font-mono text-[10px] text-slate-500">
                            {item.chassis || "-"}
                          </span>
                        </div>
                      </td>

                      {/* Véhicule & Immat */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900">
                            {item.marque} {item.modele}
                          </span>
                          <span className="font-mono text-[11px] text-blue-700 font-semibold">
                            {item.immatriculation || "Non immatriculé"}
                          </span>
                        </div>
                      </td>

                      {/* Client */}
                      <td className="py-3.5 px-4">
                        <span className="font-medium text-slate-800 line-clamp-1 max-w-[160px]" title={item.client}>
                          {item.client || "Client standard"}
                        </span>
                      </td>

                      {/* Équipe / Tech */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-700">
                            {item.equipe || "Atelier"}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {item.technicien && item.technicien !== "-" ? item.technicien : "Technicien libéré"}
                          </span>
                        </div>
                      </td>

                      {/* Fin Travaux */}
                      <td className="py-3.5 px-4">
                        <span className="text-slate-600 font-medium text-[11px]">
                          {item.dateFinTravaux || "-"}
                        </span>
                      </td>

                      {/* Statut Règlement */}
                      <td className="py-3.5 px-4">
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                            <Clock className="w-3 h-3 text-amber-700" />
                            En attente de paiement
                          </span>
                        )}

                        {isEFT && (
                          <div className="flex flex-col gap-1 items-start">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-orange-100 text-orange-900 border border-orange-300">
                                <FileText className="w-3 h-3 text-orange-600" />
                                Att Facture
                              </span>
                              {item.etatVehicule && (
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                                    item.etatVehicule.toLowerCase().includes("livr")
                                      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                      : "bg-blue-50 text-blue-800 border-blue-300"
                                  }`}
                                >
                                  {item.etatVehicule.toLowerCase().includes("livr") ? "✓ Livré client" : "Attente Client"}
                                </span>
                              )}
                            </div>
                            {isEFTNonFacture ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                                ⚠️ À FACTURER
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <Check className="w-3 h-3" /> Facturé {item.numeroFacture ? `(${item.numeroFacture})` : ""}
                              </span>
                            )}
                          </div>
                        )}

                        {item.statutPaiement === "facture" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                            Facture validée {item.numeroFacture ? `(${item.numeroFacture})` : ""}
                          </span>
                        )}

                        {item.statutPaiement === "bon_commande" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-blue-100 text-blue-900 border border-blue-300">
                            <FileCheck className="w-3.5 h-3.5 text-blue-700" />
                            Bon de commande {item.numeroBC ? `(${item.numeroBC})` : ""}
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right">
                        {isPending && (
                          <button
                            type="button"
                            onClick={() => handleOpenPaymentModal(item)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-sm hover:shadow transition-all cursor-pointer"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            <span>Définir Mode Paiement</span>
                          </button>
                        )}

                        {isEFTNonFacture && (
                          <button
                            type="button"
                            onClick={() => {
                              if (item.rawNotif) {
                                setRegularisationItem(item.rawNotif);
                              } else {
                                setRegularisationItem({
                                  id: `facturation_${item.noOr}_${item.chassis}`,
                                  noOr: item.noOr,
                                  chassis: item.chassis,
                                  immatriculation: item.immatriculation,
                                  marque: item.marque,
                                  modele: item.modele,
                                  nomClient: item.client,
                                  equipe: item.equipe,
                                  technicien: item.technicien,
                                  dateFinTravaux: item.dateFinTravaux,
                                  statutPaiement: "edition_fin_travaux",
                                  modePaiement: "Att Facture",
                                  statutFacturationFinale: "non_facture",
                                  createdAt: Date.now(),
                                });
                              }
                              setRegularisationMode("Facture");
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black text-white bg-gradient-to-r from-orange-600 to-rose-600 hover:from-orange-700 hover:to-rose-700 shadow-sm hover:shadow transition-all cursor-pointer"
                          >
                            <FileCheck className="w-3.5 h-3.5" />
                            <span>Facturer (Régulariser)</span>
                          </button>
                        )}

                        {isSolde && (
                          <div className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Validé par {item.decisionPar || "Facturation"}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1 : Choix du Mode de Paiement (3 Options) */}
      {selectedVehicleForPayment && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmitting) setSelectedVehicleForPayment(null);
          }}
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-6 py-5 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-white backdrop-blur-xs">
                  <Receipt className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-black leading-tight">
                    Validation du Mode de Paiement
                  </h2>
                  <p className="text-amber-100 text-xs font-medium">
                    N° OR : <strong className="font-mono font-bold text-white">{selectedVehicleForPayment.noOr}</strong> • Châssis : {selectedVehicleForPayment.chassis}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVehicleForPayment(null)}
                disabled={isSubmitting}
                className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold transition-colors cursor-pointer"
              >
                ×
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmitPayment} className="p-6 space-y-4">
              {/* Résumé véhicule */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs grid grid-cols-2 gap-2 text-slate-700">
                <div>
                  <span className="text-slate-400 block text-[10px]">Client :</span>
                  <strong className="text-slate-900">{selectedVehicleForPayment.client || "Client standard"}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Véhicule :</span>
                  <strong className="text-slate-900">{selectedVehicleForPayment.marque} {selectedVehicleForPayment.modele}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Immatriculation :</span>
                  <span className="font-mono font-bold text-blue-800">{selectedVehicleForPayment.immatriculation || "-"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Fin Travaux :</span>
                  <span className="text-slate-800 font-semibold">{selectedVehicleForPayment.dateFinTravaux || "Terminé"}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-2">
                  Choisissez l'un des 3 modes de règlement *
                </label>

                <div className="space-y-2.5">
                  {/* Option 1 : Facture */}
                  <label
                    className={`block p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
                      chosenMode === "Facture"
                        ? "border-emerald-500 bg-emerald-50/80 shadow-xs"
                        : "border-slate-200 hover:border-emerald-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="modePaiement"
                        value="Facture"
                        checked={chosenMode === "Facture"}
                        onChange={() => setChosenMode("Facture")}
                        className="mt-1 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span className="text-xs font-black text-emerald-950">
                            1. Facture (Règlement validé)
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                          Facture acquittée. Le véhicule est <strong>transféré immédiatement à la réception pour livraison au client</strong>.
                        </p>
                      </div>
                    </div>
                  </label>

                  {/* Option 2 : Bon de commande */}
                  <label
                    className={`block p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
                      chosenMode === "Bon de commande"
                        ? "border-blue-500 bg-blue-50/80 shadow-xs"
                        : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="modePaiement"
                        value="Bon de commande"
                        checked={chosenMode === "Bon de commande"}
                        onChange={() => setChosenMode("Bon de commande")}
                        className="mt-1 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <FileCheck className="w-4 h-4 text-blue-600" />
                          <span className="text-xs font-black text-blue-950">
                            2. Bon de commande (BC / Bon d'engagement)
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                          Règlement garanti par bon de commande. Le véhicule est <strong>transféré immédiatement à la réception pour livraison</strong>.
                        </p>
                      </div>
                    </div>
                  </label>

                  {/* Option 3 : Att Facture */}
                  <label
                    className={`block p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
                      chosenMode === "Att Facture" || chosenMode === "Édition fin de travaux"
                        ? "border-orange-500 bg-orange-50/90 shadow-xs ring-1 ring-orange-400"
                        : "border-slate-200 hover:border-orange-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="modePaiement"
                        value="Att Facture"
                        checked={chosenMode === "Att Facture" || chosenMode === "Édition fin de travaux"}
                        onChange={() => setChosenMode("Att Facture")}
                        className="mt-1 text-orange-600 focus:ring-orange-500 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-orange-600" />
                          <span className="text-xs font-black text-orange-950">
                            3. Att Facture
                          </span>
                        </div>
                        <p className="text-[11px] text-orange-900 mt-0.5 leading-snug font-medium">
                          Le véhicule est transféré à la Réception pour livraison au client. Le dossier <strong>reste dans votre tableau Facturation</strong> jusqu’au règlement de fin de mois.
                        </p>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Champs conditionnels selon le mode choisi */}
              {chosenMode === "Facture" && (
                <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 space-y-1.5">
                  <label className="block text-xs font-bold text-emerald-950">
                    N° de Facture (optionnel) :
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: FAC-2026-00458"
                    value={inputNumeroFacture}
                    onChange={(e) => setInputNumeroFacture(e.target.value)}
                    className="w-full px-3 py-2 bg-white rounded-lg border border-emerald-300 text-xs font-mono font-bold text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
              )}

              {chosenMode === "Bon de commande" && (
                <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200 space-y-1.5">
                  <label className="block text-xs font-bold text-blue-950">
                    N° de Bon de Commande / Réf (optionnel) :
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: BC-88492-STE"
                    value={inputNumeroBC}
                    onChange={(e) => setInputNumeroBC(e.target.value)}
                    className="w-full px-3 py-2 bg-white rounded-lg border border-blue-300 text-xs font-mono font-bold text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              )}

              {(chosenMode === "Att Facture" || chosenMode === "Édition fin de travaux") && (
                <div className="p-3 bg-orange-50 rounded-xl border border-orange-200 space-y-2">
                  <div className="flex items-center gap-1.5 text-orange-800 text-xs font-bold">
                    <AlertCircle className="w-4 h-4 text-orange-600 shrink-0" />
                    <span>Rappel de fonctionnement :</span>
                  </div>
                  <p className="text-[11px] text-orange-900 leading-snug">
                    Ce dossier est envoyé à la Réception en <strong>« Attente Client »</strong> pour livraison au client. Il reste dans l'onglet <strong>« Att Facture »</strong> jusqu'au règlement final.
                  </p>
                  <div>
                    <label className="block text-xs font-bold text-orange-950 mb-1">
                      N° Document / Réf provisoire (optionnel) :
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: ATT-FAC-0012"
                      value={inputNumeroEdition}
                      onChange={(e) => setInputNumeroEdition(e.target.value)}
                      className="w-full px-3 py-2 bg-white rounded-lg border border-orange-300 text-xs font-mono font-bold text-orange-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                </div>
              )}

              {/* Commentaire optionnel */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Commentaire / Remarques Facturation (optionnel) :
                </label>
                <textarea
                  rows={2}
                  placeholder="Notes sur le paiement, modalité, client..."
                  value={inputCommentaire}
                  onChange={(e) => setInputCommentaire(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Footer Actions */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedVehicleForPayment(null)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 disabled:opacity-50 transition-all cursor-pointer shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? "Validation..." : "Valider & Transférer à Réception"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2 : Régularisation Facture Finale pour "Édition fin de travaux" */}
      {regularisationItem && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmitting) setRegularisationItem(null);
          }}
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-200">
            <div className="bg-gradient-to-r from-orange-600 to-rose-600 px-6 py-5 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-white backdrop-blur-xs">
                  <FileCheck className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-black leading-tight">
                    Valider le règlement final
                  </h2>
                  <p className="text-orange-100 text-xs font-medium">
                    N° OR : <strong className="font-mono font-bold text-white">{regularisationItem.noOr}</strong> • Dossier en Att Facture
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRegularisationItem(null)}
                disabled={isSubmitting}
                className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold transition-colors cursor-pointer"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmitRegularisation} className="p-6 space-y-4">
              <p className="text-xs text-slate-600 font-medium">
                Sélectionnez uniquement le statut de règlement qui autorise le transfert du dossier vers la Réception. Aucun document n’est créé ici.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setRegularisationMode("Facture")}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold ${regularisationMode === "Facture" ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-slate-200 text-slate-600"}`}>
                  Facture (règlement validé)
                </button>
                <button type="button" onClick={() => setRegularisationMode("Bon de commande")}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold ${regularisationMode === "Bon de commande" ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-200 text-slate-600"}`}>
                  Bon de commande
                </button>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setRegularisationItem(null)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black text-white bg-gradient-to-r from-orange-600 to-rose-600 hover:from-orange-700 hover:to-rose-700 disabled:opacity-50 transition-all cursor-pointer shadow-sm"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? "Enregistrement..." : "Valider & transférer"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
