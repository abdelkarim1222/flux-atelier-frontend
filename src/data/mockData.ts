export type WorkshopStatus =
  | "Livré"
  | "En cours"
  | "Attente Client"
  | "Attente Réparation"
  | "Travaux Exterieurs"
  | "En attente"
  | "Attente PDR"
  | "A livré"
  | "Terminé"
  | "Essai"
  | "attends acheter";

export interface Flux {
  id: number;
  sheetRowNumber?: number;
  l2n2500?: string;
  cs?: string;
  cleVehicule?: string;
  prioriteIntervention?: string;
  lignePrincipale?: string;
  date: string;
  ordre: string;
  immatriculation: string;
  marque: string;
  modele: string;
  atelier: string;
  operation: string;
  statut: WorkshopStatus;
  montant: number;
  temps: number;
  no: string;
  nbIntervention: number;
  client: string;
  modelePowerBI: string;
  categorie: string;
  chassis: string;
  dateEntree: string;
  heureEntree?: string;
  technicien?: string;
  nomTechnicien?: string;
  /** Historique des techniciens ayant déjà travaillé avant un transfert VR. */
  technicien1?: string;
  nomTechnicien1?: string;
  technicien2?: string;
  nomTechnicien2?: string;
  technicien3?: string;
  nomTechnicien3?: string;
  /** Indique exceptionnellement que le technicien affecté travaille le samedi. */
  travailleSamedi?: boolean;
  equipe?: string;
  avancement?: string;
  dateDebutRep?: string;
  dateDebutTravail?: string;
  heureDebutTravail?: string;
  dateFinRep?: string;
  etatIntervention: WorkshopStatus;
  emplacement: string;
  serie: string;
  bloc?: 1 | 2 | 3;
  avancement1?: string;
  avancement2?: string;
  avancement3?: string;
  equipe1?: string;
  equipe2?: string;
  equipe3?: string;
  isPendingNewEntry?: boolean;
  creationTimestamp?: number;
  dateModification?: string;
  /** Horodatages des transitions utilisés par la chronométrie atelier. */
  dateDevis?: string;
  dateDemande?: string;
  dateReaffectation?: string;
  dateDebutEssai?: string;
  statutAcceptation?: "en_attente" | "accepte" | "mis_en_attente";
  dateAcceptation?: string;
  dateMiseEnAttente?: string;
  acceptePar?: string;
  misEnAttentePar?: string;
  modePaiement?: string;
  statutFacturation?: string;
  statutFacturationFinale?: string;
  dateValidationFacturation?: string;
  facturationValideePar?: string;
  numeroFacture?: string;
  numeroBC?: string;
  numeroEdition?: string;
  /** Détail du choix "Att Facture". Les anciens dossiers sont interprétés comme "standard". */
  attFactureOption?: "standard" | "garant";
  nomGarant?: string;
  engagementReglement?: string;
  dateFacturationFinale?: string;
  facturePar?: string;
  dateAvancement?: string;
  heureAvancement?: string;
  dateHeureAvancement?: string;
  statutGarantie?: string;
  dateValidationGarantie?: string;
  numeroAccordGarantie?: string;
  isGarantie?: boolean;
}

export const statusMeta: Array<{
  label: WorkshopStatus;
  color: string;
  soft: string;
}> = [
  { label: "Livré", color: "#16a34a", soft: "#dcfce7" },
  { label: "En cours", color: "#2563eb", soft: "#dbeafe" },
  { label: "Attente Client", color: "#d15a10", soft: "#fef3c7" },
  { label: "Attente Réparation", color: "#ea0c10", soft: "#ffedd5" },
  { label: "Travaux Exterieurs", color: "#0891b2", soft: "#cffafe" },
  { label: "Essai", color: "#8b5cf6", soft: "#f5f3ff" },
  { label: "attends acheter", color: "#f59e0b", soft: "#fffbeb" },
];

// Couleur appliquée directement selon la valeur de la colonne Etat Intervention.
// Les anciens libellés utilisent la couleur de leur état équivalent.
export const statusColors: Record<WorkshopStatus, string> = {
  "Livré": "#16a34a",
  "En cours": "#2563eb",
  "Attente Client": "#d15a10",
  "Attente Réparation": "#ea0c10",
  "Travaux Exterieurs": "#0891b2",
  "En attente": "#d15a10",
  "Attente PDR": "#ea0c10",
  "A livré": "#16a34a",
  "Terminé": "#16a34a",
  "Essai": "#8b5cf6",
  "attends acheter": "#f59e0b",
};

export const fluxData: Flux[] = [
  {
    id: 1,
    date: "26/03/2026",
    ordre: "CS26-005338",
    immatriculation: "36858",
    marque: "IVECO",
    modele: "65C15",
    atelier: "Daily",
    operation: "Diagnostic atelier",
    statut: "En cours",
    montant: 850,
    temps: 4.5,
    no: "CS26-005338",
    nbIntervention: 1,
    client: "M.DE L'INTERIEUR:D.G.G.N",
    modelePowerBI: "65C15",
    categorie: "Daily",
    chassis: "ZCFC065A3P5533810",
    dateEntree: "26/03/2026",
    etatIntervention: "En cours",
    emplacement: "C3",
    serie: "36858",
  },
  {
    id: 2,
    date: "26/03/2026",
    ordre: "CS26-000001",
    immatriculation: "36858",
    marque: "IVECO",
    modele: "65C15",
    atelier: "Daily",
    operation: "Diagnostic atelier",
    statut: "En cours",
    montant: 1250,
    temps: 8,
    no: "CS26-000001",
    nbIntervention: 1,
    client: "MOEZ BEN SADEK TRABELSI",
    modelePowerBI: "65C15",
    categorie: "Daily",
    chassis: "WJMM32AS5PC508006",
    dateEntree: "26/03/2026",
    etatIntervention: "En cours",
    emplacement: "P23",
    serie: "36858",
  },
  {
    id: 3,
    date: "26/03/2026",
    ordre: "CS26-000082",
    immatriculation: "36858",
    marque: "IVECO",
    modele: "65C15",
    atelier: "Daily",
    operation: "Diagnostic atelier",
    statut: "En cours",
    montant: 450,
    temps: 2.5,
    no: "CS26-000082",
    nbIntervention: 1,
    client: "STE DJERBA TRANSPORT DE MARCHANDISES",
    modelePowerBI: "65C15",
    categorie: "Daily",
    chassis: "ZCFAD1EG6S2758171",
    dateEntree: "26/03/2026",
    etatIntervention: "En cours",
    emplacement: "P52",
    serie: "36858",
  },
  {
    id: 4,
    date: "26/03/2026",
    ordre: "CS26-000059",
    immatriculation: "36858",
    marque: "IVECO",
    modele: "65C15",
    atelier: "Daily",
    operation: "Contrôle mécanique",
    statut: "En cours",
    montant: 1800,
    temps: 6,
    no: "CS26-000059",
    nbIntervention: 1,
    client: "SOTUCHOC",
    modelePowerBI: "65C15",
    categorie: "Daily",
    chassis: "ZCFCA70A2N5478001",
    dateEntree: "26/03/2026",
    etatIntervention: "En cours",
    emplacement: "P43",
    serie: "36858",
  },
  {
    id: 5,
    date: "26/03/2026",
    ordre: "CS26-000002",
    immatriculation: "36858",
    marque: "IVECO",
    modele: "65C15",
    atelier: "Daily",
    operation: "Contrôle mécanique",
    statut: "En cours",
    montant: 620,
    temps: 3,
    no: "CS26-000002",
    nbIntervention: 1,
    client: "STE OUANNES DE TRANSPORT SOT",
    modelePowerBI: "65C15",
    categorie: "Daily",
    chassis: "WJMM32AS9NC475184",
    dateEntree: "26/03/2026",
    etatIntervention: "En cours",
    emplacement: "P26",
    serie: "36858",
  },
  {
    id: 6,
    date: "26/03/2026",
    ordre: "CS26-000204",
    immatriculation: "36858",
    marque: "IVECO",
    modele: "65C15",
    atelier: "Daily",
    operation: "Révision",
    statut: "En cours",
    montant: 980,
    temps: 5,
    no: "CS26-000204",
    nbIntervention: 1,
    client: "M.DE LA JUSTICE D.G.P.R",
    modelePowerBI: "65C15",
    categorie: "Daily",
    chassis: "ZCFCA35AXP5547800",
    dateEntree: "26/03/2026",
    etatIntervention: "En cours",
    emplacement: "P22",
    serie: "36858",
  },
  {
    id: 7,
    date: "26/03/2026",
    ordre: "CS26-000324",
    immatriculation: "36858",
    marque: "IVECO",
    modele: "65C15",
    atelier: "Daily",
    operation: "Révision",
    statut: "En cours",
    montant: 730,
    temps: 3.5,
    no: "CS26-000324",
    nbIntervention: 1,
    client: "ANIS KTHIRI",
    modelePowerBI: "65C15",
    categorie: "Daily",
    chassis: "ZCFCA70A8P5555215",
    dateEntree: "26/03/2026",
    etatIntervention: "En cours",
    emplacement: "P40",
    serie: "36858",
  },
  {
    id: 8,
    date: "26/03/2026",
    ordre: "CS26-000284",
    immatriculation: "36858",
    marque: "IVECO",
    modele: "65C15",
    atelier: "Daily",
    operation: "Révision",
    statut: "En cours",
    montant: 910,
    temps: 4,
    no: "CS26-000284",
    nbIntervention: 1,
    client: "STE DJERBA TRANSPORT DE MARCHANDISES",
    modelePowerBI: "65C15",
    categorie: "Daily",
    chassis: "ZCFAD1EG4S2756483",
    dateEntree: "26/03/2026",
    etatIntervention: "En cours",
    emplacement: "P33",
    serie: "36858",
  },
  {
    id: 9,
    date: "27/03/2026",
    ordre: "CS26-000417",
    immatriculation: "39214",
    marque: "IVECO",
    modele: "35C16",
    atelier: "Mécanique",
    operation: "Commande pièces",
    statut: "Attente Client",
    montant: 1420,
    temps: 9,
    no: "CS26-000417",
    nbIntervention: 2,
    client: "SNCFT",
    modelePowerBI: "35C16",
    categorie: "Daily",
    chassis: "ZCFC135B905571882",
    dateEntree: "27/03/2026",
    etatIntervention: "Attente Client",
    emplacement: "P11",
    serie: "39214",
  },
  {
    id: 10,
    date: "27/03/2026",
    ordre: "CS26-000418",
    immatriculation: "39218",
    marque: "IVECO",
    modele: "35C16",
    atelier: "Mécanique",
    operation: "Commande pièces",
    statut: "Attente Client",
    montant: 1320,
    temps: 7.5,
    no: "CS26-000418",
    nbIntervention: 1,
    client: "SOTRAPIL",
    modelePowerBI: "35C16",
    categorie: "Daily",
    chassis: "ZCFC135C105573221",
    dateEntree: "27/03/2026",
    etatIntervention: "Attente Client",
    emplacement: "P12",
    serie: "39218",
  },
  {
    id: 11,
    date: "28/03/2026",
    ordre: "CS26-000451",
    immatriculation: "40309",
    marque: "IVECO",
    modele: "Eurocargo",
    atelier: "Carrosserie",
    operation: "Redressage",
    statut: "Attente Réparation",
    montant: 2460,
    temps: 12,
    no: "CS26-000451",
    nbIntervention: 1,
    client: "TRANSTU",
    modelePowerBI: "Eurocargo",
    categorie: "Truck",
    chassis: "ZCFA71A3102684417",
    dateEntree: "28/03/2026",
    etatIntervention: "Attente Réparation",
    emplacement: "T21",
    serie: "40309",
  },
  {
    id: 12,
    date: "28/03/2026",
    ordre: "CS26-000472",
    immatriculation: "40981",
    marque: "IVECO",
    modele: "Eurocargo",
    atelier: "Carrosserie",
    operation: "Peinture",
    statut: "Attente Réparation",
    montant: 3160,
    temps: 15,
    no: "CS26-000472",
    nbIntervention: 1,
    client: "STEG",
    modelePowerBI: "Eurocargo",
    categorie: "Truck",
    chassis: "ZCFA71B1202719088",
    dateEntree: "28/03/2026",
    etatIntervention: "Attente Réparation",
    emplacement: "T22",
    serie: "40981",
  },
  {
    id: 13,
    date: "29/03/2026",
    ordre: "CS26-000501",
    immatriculation: "41177",
    marque: "IVECO",
    modele: "S-Way",
    atelier: "Mécanique",
    operation: "Essai final",
    statut: "Livré",
    montant: 1820,
    temps: 6,
    no: "CS26-000501",
    nbIntervention: 1,
    client: "CTN",
    modelePowerBI: "S-Way",
    categorie: "Truck",
    chassis: "WJMM62AT40C441177",
    dateEntree: "29/03/2026",
    etatIntervention: "Livré",
    emplacement: "D81",
    serie: "41177",
  },
  {
    id: 14,
    date: "29/03/2026",
    ordre: "CS26-000517",
    immatriculation: "41700",
    marque: "IVECO",
    modele: "S-Way",
    atelier: "Mécanique",
    operation: "Nettoyage livraison",
    statut: "Livré",
    montant: 990,
    temps: 2.5,
    no: "CS26-000517",
    nbIntervention: 1,
    client: "SOTUMAG",
    modelePowerBI: "S-Way",
    categorie: "Truck",
    chassis: "WJMM62AT71C441700",
    dateEntree: "29/03/2026",
    etatIntervention: "Livré",
    emplacement: "L4",
    serie: "41700",
  },
  
  
  {
    id: 17,
    date: "31/03/2026",
    ordre: "CS26-000587",
    immatriculation: "42566",
    marque: "IVECO",
    modele: "Daily",
    atelier: "Diagnostic",
    operation: "Contrôle électrique",
    statut: "Attente Client",
    montant: 760,
    temps: 3,
    no: "CS26-000587",
    nbIntervention: 1,
    client: "VILLE DE TUNIS",
    modelePowerBI: "Daily",
    categorie: "Daily",
    chassis: "ZCFC235B505742566",
    dateEntree: "31/03/2026",
    etatIntervention: "Attente Client",
    emplacement: "M11",
    serie: "42566",
  },
  {
    id: 18,
    date: "31/03/2026",
    ordre: "CS26-000593",
    immatriculation: "42748",
    marque: "IVECO",
    modele: "Daily",
    atelier: "Diagnostic",
    operation: "Contrôle électrique",
    statut: "Attente Client",
    montant: 680,
    temps: 2,
    no: "CS26-000593",
    nbIntervention: 1,
    client: "SNTRI",
    modelePowerBI: "Daily",
    categorie: "Daily",
    chassis: "ZCFC235B705742748",
    dateEntree: "31/03/2026",
    etatIntervention: "Attente Client",
    emplacement: "M12",
    serie: "42748",
  },
  {
    id: 19,
    date: "01/04/2026",
    ordre: "CS26-000611",
    immatriculation: "42912",
    marque: "IVECO",
    modele: "Eurocargo",
    atelier: "Mécanique",
    operation: "Réparation freinage",
    statut: "Attente Réparation",
    montant: 2110,
    temps: 9,
    no: "CS26-000611",
    nbIntervention: 1,
    client: "OFFICE DES CÉRÉALES",
    modelePowerBI: "Eurocargo",
    categorie: "Truck",
    chassis: "ZCFA71B1202742912",
    dateEntree: "01/04/2026",
    etatIntervention: "Attente Réparation",
    emplacement: "J11",
    serie: "42912",
  },
  
];

export const monthlyData = [
  { mois: "Jan", flux: 120 },
  { mois: "Fév", flux: 145 },
  { mois: "Mar", flux: 180 },
  { mois: "Avr", flux: 165 },
  { mois: "Mai", flux: 210 },
  { mois: "Juin", flux: 195 },
  { mois: "Juil", flux: 240 },
  { mois: "Août", flux: 225 },
];

export const atelierData = [
  { atelier: "Daily", nombre: 14 },
  { atelier: "Mécanique", nombre: 8 },
  { atelier: "Carrosserie", nombre: 4 },
  { atelier: "Diagnostic", nombre: 2 },
];

export const statusData = statusMeta.map((status) => ({
  name: status.label,
  color: status.color,
  value: fluxData.filter(
    (flux) => statusColors[flux.etatIntervention] === status.color
  ).length,
}));
