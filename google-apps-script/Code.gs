/************************************************************
 * TABLEAUX DE CHARGEMENT
 * GESTION COMPLETE + API WEB APP (POUR L'APPLICATION FRONTEND)
 ************************************************************/


/************************************************************
 * CONFIGURATION
 ************************************************************/

const NOM_FEUILLE = "tableaux de chargement";
const NOM_FEUILLE_SUIVI = "Suivi des entrées";
const NOM_FEUILLE_VIN = "VIN";
const NOM_FEUILLE_EQUIPE = "EQUIPE";
const NOM_FEUILLE_COMPTES = "COMPTES";
const NOM_FEUILLE_MOYENNES = "Moyennes";
const NOM_LISTES = "_LISTES_EQUIPE";
const WRITE_TOKEN = ""; // Laisser vide ou définir un token secret si vous le souhaitez

/************************************************************
 * COLONNES
 ************************************************************/

const COL = {
  // ETAT
  ETAT: 6, // F

  // =========================
  // BLOC 1
  // =========================
  EQUIPE1: 7,      // G
  MAT1: 8,         // H
  NOM1: 9,         // I
  POSTE1: 10,      // J
  DEBUT1: 11,      // K
  AV1: 12,         // L
  FIN1: 13,        // M

  // =========================
  // BLOC 2
  // =========================
  EQUIPE2: 14,     // N
  MAT2: 15,        // O
  NOM2: 16,        // P
  POSTE2: 17,      // Q
  DEBUT2: 18,      // R
  AV2: 19,         // S
  FIN2: 20,        // T

  // =========================
  // BLOC 3
  // =========================
  EQUIPE3: 21,     // U
  MAT3: 22,        // V
  NOM3: 23,        // W
  POSTE3: 24,      // X
  DEBUT3: 25,      // Y
  AV3: 26,         // Z
  FIN3: 27         // AA
};


/************************************************************
 * MENU ITALCAR ET DECLENCHEURS AUTOMATIQUES GOOGLE SHEETS
 * onOpen, onEdit, onChange
 * Synchronise automatiquement les nouvelles entrées (N° OR, CS, Châssis)
 * de "Suivi des entrées" vers "tableaux de chargement"
 * avec l'état : "Attente réparation".
 ************************************************************/

function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu("Italcar Atelier")
      .addItem("Synchroniser Suivi -> Tableaux de chargement", "menuSynchroniserSuiviVersChargement_")
      .addItem("Débloquer les cellules (Supprimer validations strictes)", "menuReparerValidations_")
      .addToUi();
  } catch (err) {
    Logger.log("Info onOpen UI: " + err);
  }
}

function menuSynchroniserSuiviVersChargement_() {
  const count = synchroniserSuiviVersChargementAutomatique_();
  try {
    SpreadsheetApp.getUi().alert("Synchronisation terminée : " + count + " entrée(s) traitée(s) ou ajoutée(s) dans tableaux de chargement.");
  } catch (e) {}
}

function menuReparerValidations_() {
  const msg = reparerValidationsTableauChargement();
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {}
}

function reparerValidationsTableauChargement() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(NOM_FEUILLE);
  if (!sheet) return "Feuille non trouvée : " + NOM_FEUILLE;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return "Aucune ligne de données trouvée.";

  const blocs = [1, 2, 3];
  for (let r = 2; r <= lastRow; r++) {
    for (let b = 0; b < blocs.length; b++) {
      const cols = obtenirColonnesBloc_(blocs[b]);
      try {
        sheet.getRange(r, cols.matricule).clearDataValidations();
        sheet.getRange(r, cols.equipe).clearDataValidations();
        sheet.getRange(r, cols.avancement).clearDataValidations();
      } catch (_) {}
    }
  }
  SpreadsheetApp.flush();
  return "Succès : les règles de validation strictes ont été débloquées sur " + (lastRow - 1) + " lignes.";
}

function onChange(e) {
  try {
    synchroniserSuiviVersChargementAutomatique_();
  } catch (err) {
    Logger.log("Erreur onChange : " + err);
  }
}

function traiterLigneSuiviModifiee_(sheetSuivi, row) {
  if (!sheetSuivi || row < 2) return;
  const ss = sheetSuivi.getParent();
  const sheetChargement = ss.getSheetByName(NOM_FEUILLE);
  if (!sheetChargement) return;

  const noOr = String(sheetSuivi.getRange(row, 1).getValue() || "").trim();
  const cs = String(sheetSuivi.getRange(row, 2).getValue() || "").trim();
  const chassis = String(sheetSuivi.getRange(row, 3).getValue() || "").trim();

  // Ne traiter que si au moins un identifiant principal est présent
  if (!noOr && !cs && !chassis) return;

  const marque = String(sheetSuivi.getRange(row, 7).getValue() || "IVECO").trim() || "IVECO";
  const modele = String(sheetSuivi.getRange(row, 8).getValue() || "-").trim() || "-";
  const equipe = String(sheetSuivi.getRange(row, 10).getValue() || "").trim();

  // 1. S'assurer que la Date d'entrée (colonne 6) est renseignée si vide
  // Si déjà renseignée, elle reste STRICTEMENT FIXE et n'est JAMAIS modifiée
  const cellDateSuivi = sheetSuivi.getRange(row, 6);
  const valDateSuivi = String(cellDateSuivi.getValue() || "").trim();
  if (!valDateSuivi) {
    const dNow = new Date();
    const dd = String(dNow.getDate()).padStart(2, "0");
    const mm = String(dNow.getMonth() + 1).padStart(2, "0");
    const yyyy = dNow.getFullYear();
    const hh = String(dNow.getHours()).padStart(2, "0");
    const min = String(dNow.getMinutes()).padStart(2, "0");
    const ss = String(dNow.getSeconds()).padStart(2, "0");
    cellDateSuivi.setValue(dd + "/" + mm + "/" + yyyy + " " + hh + ":" + min + ":" + ss);
  }

  // 2. S'assurer que l'État dans "Suivi des entrées" (colonne 17) est "Attente réparation"
  const cellEtatSuivi = sheetSuivi.getRange(row, 17);
  const valEtatSuivi = String(cellEtatSuivi.getValue() || "").trim();
  if (!valEtatSuivi || valEtatSuivi === "-" || valEtatSuivi.toLowerCase().includes("attente")) {
    cellEtatSuivi.setValue("Attente réparation");
  }

  // 3. Synchroniser dans "tableaux de chargement" avec État : "Attente réparation" sans créer de doublon
  let rowChargement = trouverLigneParIdentifiants_(sheetChargement, noOr, cs, chassis);

  if (!rowChargement) {
    rowChargement = trouverProchaineLigneLibre_(sheetChargement);
    const nouvelleLigne = [
      noOr,
      cs || "R18",
      chassis,
      marque,
      modele,
      "Attente réparation",
      equipe
    ];
    sheetChargement.getRange(rowChargement, 1, 1, nouvelleLigne.length).setValues([nouvelleLigne]);
  } else {
    const cellEtatChargement = sheetChargement.getRange(rowChargement, COL.ETAT);
    const valEtatChargement = String(cellEtatChargement.getValue() || "").trim();
    if (!valEtatChargement || valEtatChargement === "-" || valEtatChargement.toLowerCase().includes("attente")) {
      cellEtatChargement.setValue("Attente réparation");
    }
    if (equipe) {
      const cellEquipeChargement = sheetChargement.getRange(rowChargement, COL.EQUIPE1);
      const valEq = String(cellEquipeChargement.getValue() || "").trim();
      if (!valEq || valEq === "-") {
        cellEquipeChargement.setValue(equipe);
      }
    }
  }

  SpreadsheetApp.flush();
}

function synchroniserSuiviVersChargementAutomatique_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetSuivi = ss.getSheetByName(NOM_FEUILLE_SUIVI);
  const sheetChargement = ss.getSheetByName(NOM_FEUILLE);
  if (!sheetSuivi || !sheetChargement) return 0;

  const lastRowSuivi = sheetSuivi.getLastRow();
  if (lastRowSuivi < 2) return 0;

  const dataSuivi = sheetSuivi.getRange(2, 1, lastRowSuivi - 1, 17).getValues();
  const lastRowChargement = sheetChargement.getLastRow();

  const existingKeys = new Set();
  if (lastRowChargement >= 2) {
    const dataChargement = sheetChargement.getRange(2, 1, lastRowChargement - 1, 3).getValues();
    for (let i = 0; i < dataChargement.length; i++) {
      const o = String(dataChargement[i][0] || "").trim().toLowerCase();
      const v = String(dataChargement[i][2] || "").trim().toLowerCase();
      if (o && o !== "-") existingKeys.add("or:" + o);
      if (v && v !== "-") existingKeys.add("vin:" + v);
    }
  }

  let countAdded = 0;
  const nouvellesLignes = [];

  for (let i = 0; i < dataSuivi.length; i++) {
    const rowIdx = i + 2;
    const noOr = String(dataSuivi[i][0] || "").trim();
    const cs = String(dataSuivi[i][1] || "").trim();
    const chassis = String(dataSuivi[i][2] || "").trim();
    const marque = String(dataSuivi[i][6] || "IVECO").trim() || "IVECO";
    const modele = String(dataSuivi[i][7] || "-").trim() || "-";
    const equipeSuivi = String(dataSuivi[i][9] || "").trim();
    const etat = String(dataSuivi[i][16] || "").trim();

    if (!noOr && !chassis) continue;

    if (!etat || etat === "-") {
      sheetSuivi.getRange(rowIdx, 17).setValue("Attente réparation");
    }

    const orKey = noOr && noOr !== "-" ? "or:" + noOr.toLowerCase() : "";
    const vinKey = chassis && chassis !== "-" ? "vin:" + chassis.toLowerCase() : "";

    // Ne JAMAIS vérifier par csKey seul ("R10", "R18") car c'est un code de centre partagé par tous les véhicules !
    const alreadyExists =
      (orKey && existingKeys.has(orKey)) ||
      (!orKey && vinKey && existingKeys.has(vinKey));

    if (!alreadyExists) {
      nouvellesLignes.push([
        noOr,
        cs || "R10",
        chassis,
        marque,
        modele,
        "Attente réparation",
        equipeSuivi
      ]);
      if (orKey) existingKeys.add(orKey);
      if (vinKey) existingKeys.add(vinKey);
      countAdded++;
    }
  }

  if (nouvellesLignes.length > 0) {
    const startRow = trouverProchaineLigneLibre_(sheetChargement);
    sheetChargement.getRange(startRow, 1, nouvellesLignes.length, 7).setValues(nouvellesLignes);
    SpreadsheetApp.flush();
  }

  return countAdded;
}


/************************************************************
 * POINT D'ENTREE DE L'APPLICATION WEB (OBLIGATOIRE)
 ************************************************************/

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const result = traiterRequeteApp_(params);

  return reponseJsonp_(params.callback, result);
}

/************************************************************
 * ASSIGNATION EMPLACEMENT SECURISEE
 * Supprime toute règle de validation avant d'écrire la valeur
 * pour éviter l'erreur de validation stricte de Google Sheets.
 ************************************************************/

function assignerEmplacementSecurise_(sheet, row, emplacementCol, valeur) {
  const cellule = sheet.getRange(row, emplacementCol);
  cellule.clearDataValidations();
  if (valeur) {
    cellule.setValue(valeur);
  } else {
    cellule.clearContent();
  }
}

/************************************************************
 * ECRITURE CELLULE SECURISEE
 * Supprime toute règle de validation avant d'écrire la valeur
 * pour éviter l'erreur de validation stricte de Google Sheets
 * (ex: validation bloquante sur matricule O16, équipe, avancement).
 ************************************************************/

function ecrireCelluleSecurisee_(range, valeur) {
  if (!range) return;
  try {
    range.clearDataValidations();
  } catch (_) {}

  if (valeur !== undefined && valeur !== null && String(valeur).trim() !== "") {
    try {
      range.setValue(valeur);
    } catch (err) {
      try {
        range.clearDataValidations();
        range.setValue(valeur);
      } catch (err2) {
        Logger.log("Erreur ecrireCelluleSecurisee_: " + err2);
      }
    }
  } else {
    try {
      range.clearContent();
    } catch (_) {
      try { range.setValue(""); } catch (_) {}
    }
  }
}


/************************************************************
 * VR -> EQUIPE SUIVANTE AUTORISEE
 ************************************************************/

const VR_EQUIPE = {

  "vrElictrique": [
    "Elictrique"
  ],

  "vrService Rapide": [
    "Service Rapide"
  ],

  "vrCarrosserie": [
    "Carrosserie"
  ],

  "vrDaily": [
    "Daily1",
    "Daily2"
  ],

  "vrLourd": [
    "Lourd"
  ],

  "vrChangan": [
    "Changan"
  ]
};


/************************************************************
 * EMPLACEMENTS
 ************************************************************/

const EMPLACEMENTS = {

  // =========================
  // DAILY
  // =========================

  D: [
    "D1",
    "D2",
    "D3",
    "D4",
    "D5",
    "D6",
    "D7",
    "D8",

    "D11",
    "D12",

    "D21",
    "D22",

    "D31",
    "D32",

    "D41",
    "D42",

    "D51",
    "D52",

    "D61",
    "D62",

    "D71",
    "D72",

    "D81",
    "D82"
  ],


  // =========================
  // SERVICE RAPIDE
  // =========================

  S: [
    "S21",
    "S11",
    "S22"
  ],


  // =========================
  // ELECTRIQUE
  // =========================

  E: [
    "E1",
    "E2",
    "E11",
    "E12",
    "E21",
    "E22"
  ],


  // =========================
  // CARROSSERIE
  // =========================

  C: [
    "C1",
    "C2",
    "C3"
  ],


  // =========================
  // ATTENTE CLIENT
  // =========================

  L: [
    "L1",
    "L2",
    "L3",
    "L4",
    "L5",
    "L6",
    "L7",
    "L8"
  ],


  // =========================
  // CHANGAN / JMC
  // =========================

  J: [
    "J11",
    "J12",

    "J21",
    "J22",

    "J31",
    "J32",

    "J41",
    "J42",

    "J51",
    "J52",

    "J61",
    "J62"
  ],


  // =========================
  // LOURDS
  // =========================

  T: [
    "T1",
    "T2",
    "T3",
    "T4",

    "T11",
    "T12",

    "T21",
    "T22",

    "T31",
    "T32",

    "T41",
    "T42"
  ],


  // =========================
  // LOURDE
  // =========================

  M: [
    "M11",
    "M21",
    "M12"
  ],


  // =========================
  // PLACES GENERALES
  // =========================

  P: Array.from(
    {
      length: 76
    },
    (_, i) => "P" + (i + 1)
  )
};


/************************************************************
 * ON EDIT PRINCIPAL (DANS GOOGLE SHEETS)
 ************************************************************/

function onEdit(e) {
  try {
    if (!e || !e.range) return;

    const sheet = e.range.getSheet();
    const sheetName = sheet.getName();
    const row = e.range.getRow();

    if (row < 2) return;

    // ==========================================================
    // 1. MODIFICATION DANS "Suivi des entrées"
    // Synchronisation automatique vers "tableaux de chargement"
    // avec État : "Attente réparation"
    // ==========================================================
    if (sheetName === NOM_FEUILLE_SUIVI) {
      const numRows = e.range.getNumRows();
      for (let r = row; r < row + numRows; r++) {
        traiterLigneSuiviModifiee_(sheet, r);
      }
      return;
    }

    // ==========================================================
    // 2. MODIFICATION DANS "tableaux de chargement"
    // ==========================================================
    if (sheetName !== NOM_FEUILLE) {
      return;
    }

    const col = e.range.getColumn();

    const emplacementCol =
      trouverColonneEmplacement_(sheet);


  if (!emplacementCol) {

    SpreadsheetApp
      .getActive()
      .toast(
        'Colonne "Emplacement" introuvable.',
        "Erreur",
        5
      );

    return;
  }


  // ==========================================================
  // ETAT
  // ==========================================================

  if (col === COL.ETAT) {

    gererEtat_(
      sheet,
      row,
      emplacementCol
    );

    return;
  }


  // ==========================================================
  // EQUIPE 1
  // ==========================================================

  if (col === COL.EQUIPE1) {

    gererEquipe_(
      sheet,
      row,
      1,
      emplacementCol
    );

    return;
  }


  // ==========================================================
  // EQUIPE 2
  // ==========================================================

  if (col === COL.EQUIPE2) {

    gererEquipe_(
      sheet,
      row,
      2,
      emplacementCol
    );

    return;
  }


  // ==========================================================
  // EQUIPE 3
  // ==========================================================

  if (col === COL.EQUIPE3) {

    gererEquipe_(
      sheet,
      row,
      3,
      emplacementCol
    );

    return;
  }


  // ==========================================================
  // MATRICULE 1
  // ==========================================================

  if (col === COL.MAT1) {

    gererMatricule_(
      sheet,
      row,
      1
    );

    mettreEmplacementAutomatique_(
      sheet,
      row,
      emplacementCol
    );

    return;
  }


  // ==========================================================
  // MATRICULE 2
  // ==========================================================

  if (col === COL.MAT2) {

    gererMatricule_(
      sheet,
      row,
      2
    );

    mettreEmplacementAutomatique_(
      sheet,
      row,
      emplacementCol
    );

    return;
  }


  // ==========================================================
  // MATRICULE 3
  // ==========================================================

  if (col === COL.MAT3) {

    gererMatricule_(
      sheet,
      row,
      3
    );

    mettreEmplacementAutomatique_(
      sheet,
      row,
      emplacementCol
    );

    return;
  }


  // ==========================================================
  // AVANCEMENT 1
  // ==========================================================

  if (col === COL.AV1) {

    gererAvancement_(
      sheet,
      row,
      1,
      emplacementCol
    );

    return;
  }


  // ==========================================================
  // AVANCEMENT 2
  // ==========================================================

  if (col === COL.AV2) {

    gererAvancement_(
      sheet,
      row,
      2,
      emplacementCol
    );

    return;
  }


  // ==========================================================
  // AVANCEMENT 3
  // ==========================================================

  if (col === COL.AV3) {

    gererAvancement_(
      sheet,
      row,
      3,
      emplacementCol
    );

    return;
  }


  // ==========================================================
  // EMPLACEMENT
  // ==========================================================

  if (col === emplacementCol) {

      verifierEmplacementManuel_(
        sheet,
        row,
        emplacementCol
      );

      return;
    }
  } catch (err) {
    Logger.log("Erreur onEdit : " + err);
  }
}


/************************************************************
 * GESTION ETAT
 ************************************************************/

function gererEtat_(
  sheet,
  row,
  emplacementCol
) {

  const etat =
    sheet
      .getRange(row, COL.ETAT)
      .getDisplayValue()
      .trim();


  // ==========================================================
  // ATTENTE REPARATION
  // ==========================================================

  if (etat === "Attente réparation") {

    // Préparer EQUIPE 1
    mettreListeEquipePrincipale_(
      sheet,
      row,
      1
    );

    bloquerBloc_(
      sheet,
      row,
      2
    );

    bloquerBloc_(
      sheet,
      row,
      3
    );

    mettreEmplacementAutomatique_(
      sheet,
      row,
      emplacementCol
    );

    return;
  }


  // ==========================================================
  // ATTENTE CLIENT
  // ==========================================================

  if (etat === "Attente client") {

    mettreEmplacementAutomatique_(
      sheet,
      row,
      emplacementCol
    );

    return;
  }


  // ==========================================================
  // LIVRÉ
  // ==========================================================

  if (etat === "Livré") {

    assignerEmplacementSecurise_(
      sheet,
      row,
      emplacementCol,
      "Livraison au client"
    );

    return;
  }


  // ==========================================================
  // EN COURS
  // ==========================================================

  if (etat === "En cours") {

    const equipe1 =
      sheet
        .getRange(row, COL.EQUIPE1)
        .getDisplayValue()
        .trim();

    const equipe2 =
      sheet
        .getRange(row, COL.EQUIPE2)
        .getDisplayValue()
        .trim();

    const equipe3 =
      sheet
        .getRange(row, COL.EQUIPE3)
        .getDisplayValue()
        .trim();


    // --------------------------------------------------------
    // Aucune équipe
    // --------------------------------------------------------

    if (
      equipe1 === "" &&
      equipe2 === "" &&
      equipe3 === ""
    ) {

      mettreListeEquipePrincipale_(
        sheet,
        row,
        1
      );

      bloquerBloc_(
        sheet,
        row,
        2
      );

      bloquerBloc_(
        sheet,
        row,
        3
      );

      mettreEmplacementAutomatique_(
        sheet,
        row,
        emplacementCol
      );

      return;
    }


    // --------------------------------------------------------
    // Trouver le bloc actif
    // --------------------------------------------------------

    const blocActif =
      trouverBlocActif_(
        sheet,
        row
      );


    if (blocActif === 1) {

      mettreListeAvancement_(
        sheet,
        row,
        1
      );

    } else if (blocActif === 2) {

      mettreListeAvancement_(
        sheet,
        row,
        2
      );

    } else if (blocActif === 3) {

      mettreListeAvancement_(
        sheet,
        row,
        3
      );
    }


    mettreEmplacementAutomatique_(
      sheet,
      row,
      emplacementCol
    );

    return;
  }


  // ==========================================================
  // AUTRE ETAT
  // ==========================================================

  sheet
    .getRange(row, emplacementCol)
    .clearDataValidations();

  sheet
    .getRange(row, emplacementCol)
    .clearContent();
}


/************************************************************
 * TROUVER BLOC ACTIF
 ************************************************************/

function trouverBlocActif_(
  sheet,
  row
) {

  const av1 =
    sheet
      .getRange(row, COL.AV1)
      .getDisplayValue()
      .trim();

  const av2 =
    sheet
      .getRange(row, COL.AV2)
      .getDisplayValue()
      .trim();

  const av3 =
    sheet
      .getRange(row, COL.AV3)
      .getDisplayValue()
      .trim();


  const eq1 =
    sheet
      .getRange(row, COL.EQUIPE1)
      .getDisplayValue()
      .trim();

  const eq2 =
    sheet
      .getRange(row, COL.EQUIPE2)
      .getDisplayValue()
      .trim();

  const eq3 =
    sheet
      .getRange(row, COL.EQUIPE3)
      .getDisplayValue()
      .trim();


  // ==========================================================
  // VR 1 -> EQUIPE 2
  // ==========================================================

  if (
    estUneReparation_(av1) &&
    eq2 !== ""
  ) {
    return 2;
  }


  // ==========================================================
  // VR 2 -> EQUIPE 3
  // ==========================================================

  if (
    estUneReparation_(av2) &&
    eq3 !== ""
  ) {
    return 3;
  }


  // ==========================================================
  // AV3 normal
  // ==========================================================

  if (
    eq3 !== "" &&
    estAvancementNormal_(av3)
  ) {
    return 3;
  }


  // ==========================================================
  // AV2 normal
  // ==========================================================

  if (
    eq2 !== "" &&
    estAvancementNormal_(av2)
  ) {
    return 2;
  }


  // ==========================================================
  // AV1 normal
  // ==========================================================

  if (
    eq1 !== "" &&
    estAvancementNormal_(av1)
  ) {
    return 1;
  }


  // ==========================================================
  // Dernier bloc existant
  // ==========================================================

  if (eq3 !== "") return 3;

  if (eq2 !== "") return 2;

  if (eq1 !== "") return 1;


  return 1;
}


/************************************************************
 * GESTION EQUIPE
 ************************************************************/

function gererEquipe_(
  sheet,
  row,
  bloc,
  emplacementCol
) {

  const cols =
    obtenirColonnesBloc_(bloc);


  const equipe =
    sheet
      .getRange(row, cols.equipe)
      .getDisplayValue()
      .trim();


  // ==========================================================
  // SI EQUIPE CHOISIE
  // ==========================================================

  if (equipe !== "") {

    // --------------------------------------------------------
    // Etat automatique = En cours
    // --------------------------------------------------------

    sheet
      .getRange(row, COL.ETAT)
      .setValue("En cours");


    // --------------------------------------------------------
    // Nettoyer le bloc
    // --------------------------------------------------------

    sheet
      .getRange(row, cols.matricule)
      .clearContent();

    sheet
      .getRange(row, cols.nom)
      .clearContent();

    sheet
      .getRange(row, cols.poste)
      .clearContent();

    sheet
      .getRange(row, cols.debut)
      .clearContent();

    sheet
      .getRange(row, cols.avancement)
      .clearContent();

    sheet
      .getRange(row, cols.fin)
      .clearContent();


    // --------------------------------------------------------
    // Liste matricules
    // --------------------------------------------------------

    creerListeMatricules_(
      sheet,
      row,
      bloc
    );


    // --------------------------------------------------------
    // Liste avancement
    // --------------------------------------------------------

    mettreListeAvancement_(
      sheet,
      row,
      bloc
    );


    // --------------------------------------------------------
    // Débloquer uniquement si nécessaire
    // --------------------------------------------------------

    if (bloc === 1) {

      bloquerBloc_(
        sheet,
        row,
        2
      );

      bloquerBloc_(
        sheet,
        row,
        3
      );
    }


    if (bloc === 2) {

      bloquerBloc_(
        sheet,
        row,
        3
      );
    }


    // --------------------------------------------------------
    // Emplacement selon équipe
    // --------------------------------------------------------

    mettreEmplacementSelonEquipe_(
      sheet,
      row,
      emplacementCol,
      equipe
    );

    return;
  }


  // ==========================================================
  // EQUIPE EFFACEE
  // ==========================================================

  sheet
    .getRange(row, cols.matricule)
    .clearContent();

  sheet
    .getRange(row, cols.nom)
    .clearContent();

  sheet
    .getRange(row, cols.poste)
    .clearContent();

  sheet
    .getRange(row, cols.debut)
    .clearContent();

  sheet
    .getRange(row, cols.avancement)
    .clearContent();

  sheet
    .getRange(row, cols.fin)
    .clearContent();

  sheet
    .getRange(row, cols.matricule)
    .clearDataValidations();


  mettreEmplacementAutomatique_(
    sheet,
    row,
    emplacementCol
  );
}


/************************************************************
 * LISTE EQUIPE PRINCIPALE
 ************************************************************/

function mettreListeEquipePrincipale_(
  sheet,
  row,
  bloc
) {

  const cols =
    obtenirColonnesBloc_(bloc);

  const equipes = [
    "Daily1",
    "Daily2",
    "Changan",
    "Service Rapide",
    "Lourd",
    "Carrosserie",
    "Elictrique"
  ];


  const regle =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        equipes,
        true
      )
      .setAllowInvalid(true)
      .build();


  sheet
    .getRange(row, cols.equipe)
    .setDataValidation(regle);
}


/************************************************************
 * GESTION MATRICULE
 ************************************************************/

function gererMatricule_(
  sheet,
  row,
  bloc
) {

  const cols =
    obtenirColonnesBloc_(bloc);


  const matricule =
    sheet
      .getRange(row, cols.matricule)
      .getDisplayValue()
      .trim();


  if (matricule === "") {

    sheet
      .getRange(row, cols.nom)
      .clearContent();

    sheet
      .getRange(row, cols.poste)
      .clearContent();

    sheet
      .getRange(row, cols.debut)
      .clearContent();

    return;
  }


  const source =
    sheet
      .getParent()
      .getSheetByName(
        NOM_LISTES
      );


  if (!source) return;


  const lastRow =
    source.getLastRow();


  if (lastRow < 2) return;


  const data =
    source
      .getRange(
        2,
        1,
        lastRow - 1,
        4
      )
      .getDisplayValues();


  const ligne =
    data.find(
      l =>
        l[1]
          .toString()
          .trim() === matricule
    );


  if (!ligne) return;


  // --------------------------------------------------------
  // NOM
  // --------------------------------------------------------

  sheet
    .getRange(row, cols.nom)
    .setValue(
      ligne[2].trim()
    );


  // --------------------------------------------------------
  // POSTE
  // --------------------------------------------------------

  sheet
    .getRange(row, cols.poste)
    .setValue(
      ligne[3].trim()
    );


  // --------------------------------------------------------
  // DATE DEBUT
  // --------------------------------------------------------

  const celluleDebut =
    sheet.getRange(
      row,
      cols.debut
    );


  if (celluleDebut.isBlank()) {

    celluleDebut
      .setValue(
        new Date()
      );

    try {
      celluleDebut.setNumberFormat("dd/MM/yyyy HH:mm");
    } catch (_) {}
  }
}


/************************************************************
 * LISTE MATRICULES
 ************************************************************/

function creerListeMatricules_(
  sheet,
  row,
  bloc
) {

  const cols =
    obtenirColonnesBloc_(bloc);


  const equipe =
    sheet
      .getRange(row, cols.equipe)
      .getDisplayValue()
      .trim();


  const cellule =
    sheet.getRange(
      row,
      cols.matricule
    );


  try {
    cellule.clearDataValidations();
  } catch (_) {}


  if (equipe === "") {
    try { cellule.clearContent(); } catch (_) {}
    return;
  }


  const source =
    sheet
      .getParent()
      .getSheetByName(
        NOM_LISTES
      );


  if (!source) return;


  const lastRow =
    source.getLastRow();


  if (lastRow < 2) return;


  const data =
    source
      .getRange(
        2,
        1,
        lastRow - 1,
        4
      )
      .getDisplayValues();


  const matricules =
    data
      .filter(
        ligne =>
          ligne[0]
            .toString()
            .trim() === equipe
      )
      .map(
        ligne =>
          ligne[1]
            .toString()
            .trim()
      )
      .filter(
        matricule =>
          matricule !== ""
      );


  if (matricules.length === 0) return;


  const regle =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        matricules,
        true
      )
      .setAllowInvalid(true)
      .build();


  cellule
    .setDataValidation(
      regle
    );
}


/************************************************************
 * LISTE AVANCEMENT
 ************************************************************/

function mettreListeAvancement_(
  sheet,
  row,
  bloc
) {

  const cols =
    obtenirColonnesBloc_(bloc);


  const cellule =
    sheet.getRange(
      row,
      cols.avancement
    );


  const valeurs = [

    "ATENDE DEVIS",
    "En cours - 10%",
    "En cours - 20%",
    "En cours - 30%",
    "En cours - 40%",
    "En cours - 50%",
    "En cours - 60%",
    "En cours - 70%",
    "En cours - 80%",
    "En cours - 90%",

    "attends acheter",
    "Essai",
    "Terminer",

    "vrElictrique",
    "vrService Rapide",
    "vrCarrosserie",
    "vrDaily",
    "vrLourd",
    "vrChangan"
  ];


  try {
    cellule.clearDataValidations();
  } catch (_) {}

  const regle =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        valeurs,
        true
      )
      .setAllowInvalid(true)
      .build();


  cellule
    .setDataValidation(
      regle
    );
}


/************************************************************
 * GESTION AVANCEMENT
 ************************************************************/

function gererAvancement_(
  sheet,
  row,
  bloc,
  emplacementCol
) {

  const cols =
    obtenirColonnesBloc_(bloc);


  const avancement =
    sheet
      .getRange(row, cols.avancement)
      .getDisplayValue()
      .trim();


  // ==========================================================
  // AVANCEMENT NORMAL 10 -> 90
  // ==========================================================

  if (estAvancementNormal_(avancement)) {

    // Date fin effacée
    sheet
      .getRange(row, cols.fin)
      .clearContent();


    // --------------------------------------------------------
    // Bloc suivant bloqué
    // --------------------------------------------------------

    if (bloc === 1) {

      bloquerBloc_(
        sheet,
        row,
        2
      );

      bloquerBloc_(
        sheet,
        row,
        3
      );
    }


    if (bloc === 2) {

      bloquerBloc_(
        sheet,
        row,
        3
      );
    }


    // --------------------------------------------------------
    // Etat = En cours
    // --------------------------------------------------------

    sheet
      .getRange(row, COL.ETAT)
      .setValue("En cours");


    mettreEmplacementAutomatique_(
      sheet,
      row,
      emplacementCol
    );

    return;
  }


  // ==========================================================
  // ESSAI
  // ==========================================================

  if (avancement === "Essai") {
    try {
      sheet.getRange(row, COL.ETAT).clearDataValidations();
    } catch (_) {}
    sheet
      .getRange(row, COL.ETAT)
      .setValue("Essai");
    return;
  }


  // ==========================================================
  // ATTENDS ACHETER
  // ==========================================================

  if (avancement === "attends acheter") {
    try {
      sheet.getRange(row, COL.ETAT).clearDataValidations();
    } catch (_) {}
    sheet
      .getRange(row, COL.ETAT)
      .setValue("attends acheter");
    return;
  }


  // ==========================================================
  // TERMINER
  // ==========================================================

  if (avancement === "Terminer") {

    const celluleFin =
      sheet.getRange(
        row,
        cols.fin
      );


    if (celluleFin.isBlank()) {

      celluleFin
        .setValue(
          new Date()
        );

      try {
        celluleFin.setNumberFormat("dd/MM/yyyy HH:mm");
      } catch (_) {}
    }


    // Etat = Attente client
    sheet
      .getRange(row, COL.ETAT)
      .setValue(
        "Attente client"
      );


    // Bloquer les blocs suivants

    if (bloc === 1) {

      bloquerBloc_(
        sheet,
        row,
        2
      );

      bloquerBloc_(
        sheet,
        row,
        3
      );
    }


    if (bloc === 2) {

      bloquerBloc_(
        sheet,
        row,
        3
      );
    }


    mettreEmplacementAutomatique_(
      sheet,
      row,
      emplacementCol
    );

    return;
  }


  // ==========================================================
  // VR
  // ==========================================================

  if (estUneReparation_(avancement)) {

    const celluleFin =
      sheet.getRange(
        row,
        cols.fin
      );


    // Date fin automatique
    if (celluleFin.isBlank()) {

      celluleFin
        .setValue(
          new Date()
        );

      try {
        celluleFin.setNumberFormat("dd/MM/yyyy HH:mm");
      } catch (_) {}
    }


    // Etat reste En cours
    sheet
      .getRange(row, COL.ETAT)
      .setValue("En cours");


    // --------------------------------------------------------
    // VR BLOC 1 -> BLOC 2
    // --------------------------------------------------------

    if (bloc === 1) {

      debloquerBlocAvecEquipe_(
        sheet,
        row,
        2,
        equipesAutorisees_(
          avancement
        )
      );


      bloquerBloc_(
        sheet,
        row,
        3
      );
    }


    // --------------------------------------------------------
    // VR BLOC 2 -> BLOC 3
    // --------------------------------------------------------

    if (bloc === 2) {

      debloquerBlocAvecEquipe_(
        sheet,
        row,
        3,
        equipesAutorisees_(
          avancement
        )
      );
    }


    mettreEmplacementAutomatique_(
      sheet,
      row,
      emplacementCol
    );

    return;
  }
}


/************************************************************
 * EQUIPES AUTORISEES PAR VR
 ************************************************************/

function equipesAutorisees_(
  vr
) {

  return (
    VR_EQUIPE[vr] ||
    []
  );
}


/************************************************************
 * AVANCEMENT NORMAL
 ************************************************************/

function estAvancementNormal_(
  valeur
) {

  return /^En cours - (10|20|30|40|50|60|70|80|90)%$/
    .test(
      valeur
    ) || valeur === "ATENDE DEVIS" || valeur === "ATTENTE DEVIS";
}


/************************************************************
 * VR
 ************************************************************/

function estUneReparation_(
  valeur
) {

  return Object
    .prototype
    .hasOwnProperty
    .call(
      VR_EQUIPE,
      valeur
    );
}


/************************************************************
 * COLONNES D'UN BLOC
 ************************************************************/

function obtenirColonnesBloc_(
  bloc
) {

  if (bloc === 1) {

    return {

      equipe: COL.EQUIPE1,
      matricule: COL.MAT1,
      nom: COL.NOM1,
      poste: COL.POSTE1,
      debut: COL.DEBUT1,
      avancement: COL.AV1,
      fin: COL.FIN1
    };
  }


  if (bloc === 2) {

    return {

      equipe: COL.EQUIPE2,
      matricule: COL.MAT2,
      nom: COL.NOM2,
      poste: COL.POSTE2,
      debut: COL.DEBUT2,
      avancement: COL.AV2,
      fin: COL.FIN2
    };
  }


  if (bloc === 3) {

    return {

      equipe: COL.EQUIPE3,
      matricule: COL.MAT3,
      nom: COL.NOM3,
      poste: COL.POSTE3,
      debut: COL.DEBUT3,
      avancement: COL.AV3,
      fin: COL.FIN3
    };
  }


  throw new Error(
    "Bloc incorrect : " + bloc
  );
}


/************************************************************
 * DETERMINER LE BLOC ACTIF (1, 2 OU 3)
 * Règle séquentielle stricte :
 * 1. Bloc 1 : EQUIPE 1, MAT 1, NOM 1, POSTE 1, DEBUT 1, AV 1, FIN 1
 * 2. Bloc 2 : EQUIPE 2, MAT 2, NOM 2, POSTE 2, DEBUT 2, AV 2, FIN 2
 * 3. Bloc 3 : EQUIPE 3, MAT 3, NOM 3, POSTE 3, DEBUT 3, AV 3, FIN 3
 ************************************************************/

function estValeurValide_(val) {
  if (!val) return false;
  const s = String(val).trim();
  return s !== "" && s !== "-" && s !== "NA" && s !== "#N/A" && s !== "undefined" && s !== "null";
}

function determinerBlocActif_(sheet, row, params) {
  // 1. Si le paramètre bloc est explicitement spécifié (1, 2 ou 3)
  if (params && (params.bloc === 1 || params.bloc === 2 || params.bloc === 3 || params.bloc === "1" || params.bloc === "2" || params.bloc === "3")) {
    return Number(params.bloc);
  }

  // 2. Lecture des colonnes d'avancement et de date fin des blocs 1 et 2
  const av1 = sheet.getRange(row, COL.AV1).getDisplayValue().trim();
  const fin1 = sheet.getRange(row, COL.FIN1).getDisplayValue().trim();

  const av2 = sheet.getRange(row, COL.AV2).getDisplayValue().trim();
  const fin2 = sheet.getRange(row, COL.FIN2).getDisplayValue().trim();

  // Bloc 1 est terminé si av1 est un transfert vr..., ou Terminer, ou si fin1 et av1 sont renseignés
  const isBloc1Fini = estUneReparation_(av1) || av1 === "Terminer" || (estValeurValide_(fin1) && estValeurValide_(av1));

  // RÈGLE 1 : Si le Bloc 1 n'est pas encore terminé -> TOUT s'enregistre obligatoirement dans le BLOC 1
  if (!isBloc1Fini) {
    return 1;
  }

  // Bloc 2 est terminé si av2 est un transfert vr..., ou Terminer, ou si fin2 et av2 sont renseignés
  const isBloc2Fini = estUneReparation_(av2) || av2 === "Terminer" || (estValeurValide_(fin2) && estValeurValide_(av2));

  // RÈGLE 2 : Si le Bloc 1 est terminé mais le Bloc 2 n'est pas encore terminé -> TOUT s'enregistre dans le BLOC 2
  if (!isBloc2Fini) {
    return 2;
  }

  // RÈGLE 3 : Si le Bloc 1 et le Bloc 2 sont tous les deux terminés -> TOUT s'enregistre dans le BLOC 3
  return 3;
}


/************************************************************
 * DEBLOQUER BLOC AVEC EQUIPE
 ************************************************************/

function debloquerBlocAvecEquipe_(
  sheet,
  row,
  bloc,
  equipes
) {

  const cols =
    obtenirColonnesBloc_(bloc);

  const celluleEquipe =
    sheet.getRange(
      row,
      cols.equipe
    );

  const celluleMatricule =
    sheet.getRange(
      row,
      cols.matricule
    );

  const celluleAvancement =
    sheet.getRange(
      row,
      cols.avancement
    );

  // Supprimer d'abord toute ancienne validation bloquante
  try { celluleEquipe.clearDataValidations(); } catch (_) {}
  try { celluleMatricule.clearDataValidations(); } catch (_) {}
  try { celluleAvancement.clearDataValidations(); } catch (_) {}

  // Nettoyage complet des colonnes de ce bloc uniquement
  celluleEquipe.clearContent();
  celluleMatricule.clearContent();
  sheet.getRange(row, cols.nom).clearContent();
  sheet.getRange(row, cols.poste).clearContent();
  sheet.getRange(row, cols.debut).clearContent();
  celluleAvancement.clearContent();
  sheet.getRange(row, cols.fin).clearContent();

  // Configuration de l'équipe cible et des listes déroulantes
  if (equipes && equipes.length > 0) {
    const regleEquipe =
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          equipes,
          true
        )
        .setAllowInvalid(true)
        .build();

    celluleEquipe.setDataValidation(regleEquipe);
    ecrireCelluleSecurisee_(celluleEquipe, equipes[0]);

    // Initialiser les validations pour l'équipe cible
    creerListeMatricules_(sheet, row, bloc);
    mettreListeAvancement_(sheet, row, bloc);
  }
}


/************************************************************
 * BLOQUER BLOC
 ************************************************************/

function bloquerBloc_(
  sheet,
  row,
  bloc
) {

  const cols =
    obtenirColonnesBloc_(bloc);


  // --------------------------------------------------------
  // Vider les cellules du bloc
  // --------------------------------------------------------

  sheet
    .getRange(row, cols.equipe)
    .clearContent();

  sheet
    .getRange(row, cols.matricule)
    .clearContent();

  sheet
    .getRange(row, cols.nom)
    .clearContent();

  sheet
    .getRange(row, cols.poste)
    .clearContent();

  sheet
    .getRange(row, cols.debut)
    .clearContent();

  sheet
    .getRange(row, cols.avancement)
    .clearContent();

  sheet
    .getRange(row, cols.fin)
    .clearContent();


  // --------------------------------------------------------
  // Nettoyer les validations pour ne jamais bloquer d'écritures
  // ultérieures (évite l'erreur de validation stricte sur O16 etc.)
  // --------------------------------------------------------

  try { sheet.getRange(row, cols.equipe).clearDataValidations(); } catch (_) {}
  try { sheet.getRange(row, cols.matricule).clearDataValidations(); } catch (_) {}
  try { sheet.getRange(row, cols.avancement).clearDataValidations(); } catch (_) {}
}


/************************************************************
 * TROUVER COLONNE EMPLACEMENT
 ************************************************************/

function trouverColonneEmplacement_(
  sheet
) {

  const derniereColonne =
    sheet.getLastColumn();


  const entetes =
    sheet
      .getRange(
        1,
        1,
        1,
        derniereColonne
      )
      .getDisplayValues()[0];


  for (
    let i = 0;
    i < entetes.length;
    i++
  ) {

    if (
      entetes[i]
        .toString()
        .trim()
        .toLowerCase() ===
      "emplacement"
    ) {

      return i + 1;
    }
  }


  return null;
}


/************************************************************
 * ZONE D'UNE EQUIPE
 ************************************************************/

function obtenirZonePourEquipe_(
  equipe
) {

  equipe =
    equipe
      .toString()
      .trim();


  // DAILY

  if (
    equipe === "Daily1" ||
    equipe === "Daily2"
  ) {

    return ["D"];
  }


  // SERVICE RAPIDE

  if (
    equipe === "Service Rapide"
  ) {

    return ["S"];
  }


  // ELECTRIQUE

  if (
    equipe === "Elictrique"
  ) {

    return ["E"];
  }


  // CARROSSERIE

  if (
    equipe === "Carrosserie"
  ) {

    return ["C"];
  }


  // CHANGAN

  if (
    equipe === "Changan"
  ) {

    return ["J"];
  }


  // LOURD

  if (
    equipe === "Lourd"
  ) {

    return [
      "T",
      "M"
    ];
  }


  return [];
}


/************************************************************
 * EQUIPE ACTIVE
 ************************************************************/

function obtenirEquipeActive_(
  sheet,
  row
) {

  const blocs = [
    3,
    2,
    1
  ];


  // ==========================================================
  // PRIORITE :
  // VR 1 -> EQUIPE 2
  // VR 2 -> EQUIPE 3
  // AV normal
  // ==========================================================

  const av1 =
    sheet
      .getRange(row, COL.AV1)
      .getDisplayValue()
      .trim();

  const av2 =
    sheet
      .getRange(row, COL.AV2)
      .getDisplayValue()
      .trim();

  const av3 =
    sheet
      .getRange(row, COL.AV3)
      .getDisplayValue()
      .trim();


  const eq1 =
    sheet
      .getRange(row, COL.EQUIPE1)
      .getDisplayValue()
      .trim();

  const eq2 =
    sheet
      .getRange(row, COL.EQUIPE2)
      .getDisplayValue()
      .trim();

  const eq3 =
    sheet
      .getRange(row, COL.EQUIPE3)
      .getDisplayValue()
      .trim();


  // VR bloc 1
  if (
    estUneReparation_(av1) &&
    eq2 !== ""
  ) {
    return eq2;
  }


  // VR bloc 2
  if (
    estUneReparation_(av2) &&
    eq3 !== ""
  ) {
    return eq3;
  }


  // AV3 normal
  if (
    eq3 !== "" &&
    estAvancementNormal_(av3)
  ) {
    return eq3;
  }


  // AV2 normal
  if (
    eq2 !== "" &&
    estAvancementNormal_(av2)
  ) {
    return eq2;
  }


  // AV1 normal
  if (
    eq1 !== "" &&
    estAvancementNormal_(av1)
  ) {
    return eq1;
  }


  // Dernière équipe
  for (
    const bloc of blocs
  ) {

    const cols =
      obtenirColonnesBloc_(
        bloc
      );

    const equipe =
      sheet
        .getRange(
          row,
          cols.equipe
        )
        .getDisplayValue()
        .trim();


    if (equipe !== "") {
      return equipe;
    }
  }


  return "";
}


/************************************************************
 * EMPLACEMENTS UTILISES
 ************************************************************/

function obtenirEmplacementsUtilises_(
  sheet,
  emplacementCol
) {

  const lastRow =
    sheet.getLastRow();


  if (lastRow < 2) {
    return [];
  }


  return sheet
    .getRange(
      2,
      emplacementCol,
      lastRow - 1,
      1
    )
    .getDisplayValues()
    .map(
      ligne =>
        ligne[0]
          .toString()
          .trim()
    )
    .filter(
      valeur =>
        valeur !== ""
    );
}


/************************************************************
 * TROUVER PLACE LIBRE
 ************************************************************/


function trouverPlaceLibre_(
  sheet,
  emplacementCol,
  liste,
  row
) {

  const utilisees =
    obtenirEmplacementsUtilises_(
      sheet,
      emplacementCol
    );


  const actuel =
    sheet
      .getRange(
        row,
        emplacementCol
      )
      .getDisplayValue()
      .trim();


  // Garder la place actuelle si elle appartient à la zone

  if (
    actuel !== "" &&
    liste.includes(actuel)
  ) {

    const nombre =
      utilisees.filter(
        x =>
          x === actuel
      ).length;


    if (nombre <= 1) {
      return actuel;
    }
  }


  // Chercher place libre

  for (
    const place of liste
  ) {

    const nombre =
      utilisees.filter(
        x =>
          x === place
      ).length;


    if (place === actuel) {
      return place;
    }


    if (nombre === 0) {
      return place;
    }
  }


  return "";
}


/************************************************************
 * EMPLACEMENT DIRECT SELON EQUIPE
 *
 * NOUVELLE LOGIQUE :
 * Choisir EQUIPE => Etat = En cours
 * et emplacement selon EQUIPE
 ************************************************************/

function mettreEmplacementSelonEquipe_(
  sheet,
  row,
  emplacementCol,
  equipe
) {

  equipe =
    equipe
      .toString()
      .trim();


  const zones =
    obtenirZonePourEquipe_(
      equipe
    );


  // Equipe inconnue

  if (zones.length === 0) {

    sheet
      .getRange(
        row,
        emplacementCol
      )
      .clearContent();

    sheet
      .getRange(
        row,
        emplacementCol
      )
      .clearDataValidations();

    return;
  }


  // ==========================================================
  // LOURD
  // T PUIS M
  // ==========================================================

  if (equipe === "Lourd") {

    let place =
      trouverPlaceLibre_(
        sheet,
        emplacementCol,
        EMPLACEMENTS.T,
        row
      );


    if (place === "") {

      place =
        trouverPlaceLibre_(
          sheet,
          emplacementCol,
          EMPLACEMENTS.M,
          row
        );
    }


    if (place !== "") {

      sheet
        .getRange(
          row,
          emplacementCol
        )
        .setValue(
          place
        );

    } else {

      sheet
        .getRange(
          row,
          emplacementCol
        )
        .setValue(
          "Place complet"
        );
    }


    creerListeEmplacements_(
      sheet,
      row,
      emplacementCol,
      EMPLACEMENTS.T.concat(
        EMPLACEMENTS.M
      )
    );

    return;
  }


  // ==========================================================
  // AUTRES EQUIPES
  // ==========================================================

  const zone =
    zones[0];


  const liste =
    EMPLACEMENTS[zone];


  const place =
    trouverPlaceLibre_(
      sheet,
      emplacementCol,
      liste,
      row
    );


  if (place !== "") {

    sheet
      .getRange(
        row,
        emplacementCol
      )
      .setValue(
        place
      );

  } else {

    sheet
      .getRange(
        row,
        emplacementCol
      )
      .setValue(
        "Place complet"
      );
  }


  creerListeEmplacements_(
    sheet,
    row,
    emplacementCol,
    liste
  );
}


/************************************************************
 * EMPLACEMENT AUTOMATIQUE
 ************************************************************/

function mettreEmplacementAutomatique_(
  sheet,
  row,
  emplacementCol
) {

  const etat =
    sheet
      .getRange(
        row,
        COL.ETAT
      )
      .getDisplayValue()
      .trim();


  // ==========================================================
  // ATTENTE REPARATION
  // ==========================================================

  if (
    etat === "Attente réparation"
  ) {

    const place =
      trouverPlaceLibre_(
        sheet,
        emplacementCol,
        EMPLACEMENTS.P,
        row
      );


    if (place !== "") {

      sheet
        .getRange(
          row,
          emplacementCol
        )
        .setValue(
          place
        );

    } else {

      sheet
        .getRange(
          row,
          emplacementCol
        )
        .setValue(
          "Place complet"
        );
    }


    creerListeEmplacements_(
      sheet,
      row,
      emplacementCol,
      EMPLACEMENTS.P
    );


    return;
  }


  // ==========================================================
  // ATTENTE CLIENT
  // ==========================================================

  if (
    etat === "Attente client"
  ) {

    let place =
      trouverPlaceLibre_(
        sheet,
        emplacementCol,
        EMPLACEMENTS.L,
        row
      );


    if (place !== "") {

      sheet
        .getRange(
          row,
          emplacementCol
        )
        .setValue(
          place
        );

    } else {

      place =
        trouverPlaceLibre_(
          sheet,
          emplacementCol,
          EMPLACEMENTS.P,
          row
        );


      if (place !== "") {

        sheet
          .getRange(
            row,
            emplacementCol
          )
          .setValue(
            place
          );

      } else {

        sheet
          .getRange(
            row,
            emplacementCol
          )
          .setValue(
            "Place complet"
          );
      }
    }


    creerListeEmplacements_(
      sheet,
      row,
      emplacementCol,
      EMPLACEMENTS.L.concat(
        EMPLACEMENTS.P
      )
    );


    return;
  }


  // ==========================================================
  // LIVRÉ
  // ==========================================================

  if (etat === "Livré") {

    assignerEmplacementSecurise_(
      sheet,
      row,
      emplacementCol,
      "Livraison au client"
    );

    return;
  }


  // ==========================================================
  // EN COURS
  // ==========================================================

  if (
    etat === "En cours"
  ) {

    const equipe =
      obtenirEquipeActive_(
        sheet,
        row
      );


    if (equipe === "") {

      sheet
        .getRange(
          row,
          emplacementCol
        )
        .clearDataValidations();

      sheet
        .getRange(
          row,
          emplacementCol
        )
        .clearContent();

      return;
    }


    // --------------------------------------------------------
    // Utiliser directement la zone de l'équipe
    // --------------------------------------------------------

    mettreEmplacementSelonEquipe_(
      sheet,
      row,
      emplacementCol,
      equipe
    );

    return;
  }


  // ==========================================================
  // AUTRE ETAT
  // ==========================================================

  sheet
    .getRange(
      row,
      emplacementCol
    )
    .clearDataValidations();

  sheet
    .getRange(
      row,
      emplacementCol
    )
    .clearContent();
}


/************************************************************
 * LISTE EMPLACEMENTS
 ************************************************************/

function creerListeEmplacements_(
  sheet,
  row,
  emplacementCol,
  liste
) {

  const cellule =
    sheet.getRange(
      row,
      emplacementCol
    );


  liste = [
    ...new Set(
      liste
    )
  ];

  if (!liste.includes("Livraison au client")) {
    liste.push("Livraison au client");
  }

  if (liste.length === 0) {

    cellule
      .clearDataValidations();

    return;
  }


  const regle =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        liste,
        true
      )
      .setAllowInvalid(true)
      .build();


  cellule
    .setDataValidation(
      regle
    );
}


/************************************************************
 * VERIFIER CHANGEMENT MANUEL EMPLACEMENT
 ************************************************************/

function verifierEmplacementManuel_(
  sheet,
  row,
  emplacementCol
) {

  const valeur =
    sheet
      .getRange(
        row,
        emplacementCol
      )
      .getDisplayValue()
      .trim();


  if (valeur === "") {
    return;
  }

  if (valeur === "Place complet" || valeur === "Livraison au client") {
    return;
  }


  // ==========================================================
  // VERIFIER DOUBLON
  // ==========================================================

  const lastRow =
    sheet.getLastRow();


  if (lastRow >= 2) {

    const valeurs =
      sheet
        .getRange(
          2,
          emplacementCol,
          lastRow - 1,
          1
        )
        .getDisplayValues();


    for (
      let i = 0;
      i < valeurs.length;
      i++
    ) {

      const vraieLigne =
        i + 2;


      if (
        vraieLigne === row
      ) {
        continue;
      }


      if (
        valeurs[i][0]
          .toString()
          .trim() ===
        valeur
      ) {

        SpreadsheetApp
          .getActive()
          .toast(
            "⚠️ Cette place est déjà occupée : " +
            valeur,
            "Emplacement",
            5
          );


        mettreEmplacementAutomatique_(
          sheet,
          row,
          emplacementCol
        );

        return;
      }
    }
  }


  // ==========================================================
  // ATTENTE REPARATION
  // ==========================================================

  const etat =
    sheet
      .getRange(
        row,
        COL.ETAT
      )
      .getDisplayValue()
      .trim();


  if (
    etat === "Attente réparation"
  ) {

    if (
      !EMPLACEMENTS.P.includes(
        valeur
      )
    ) {

      SpreadsheetApp
        .getActive()
        .toast(
          "⚠️ Pour Attente réparation, utilisez P1 à P76.",
          "Emplacement",
          5
        );


      mettreEmplacementAutomatique_(
        sheet,
        row,
        emplacementCol
      );
    }


    return;
  }


  // ==========================================================
  // ATTENTE CLIENT
  // ==========================================================

  if (
    etat === "Attente client"
  ) {

    const autorise =
      EMPLACEMENTS.L.includes(
        valeur
      ) ||
      EMPLACEMENTS.P.includes(
        valeur
      );


    if (!autorise) {

      SpreadsheetApp
        .getActive()
        .toast(
          "⚠️ Pour Attente client, utilisez L1-L8 ou P1-P76.",
          "Emplacement",
          5
        );


      mettreEmplacementAutomatique_(
        sheet,
        row,
        emplacementCol
      );
    }


    return;
  }


  // ==========================================================
  // EN COURS
  // ==========================================================

  if (
    etat === "En cours"
  ) {

    const equipe =
      obtenirEquipeActive_(
        sheet,
        row
      );


    const zones =
      obtenirZonePourEquipe_(
        equipe
      );


    let autorise = false;


    // Zone de l'équipe

    zones.forEach(
      zone => {

        if (
          EMPLACEMENTS[zone]
            .includes(
              valeur
            )
        ) {

          autorise = true;
        }
      }
    );


    if (!autorise) {

      SpreadsheetApp
        .getActive()
        .toast(
          "⚠️ Emplacement non autorisé pour l'équipe : " +
          equipe,
          "Emplacement",
          5
        );


      mettreEmplacementAutomatique_(
        sheet,
        row,
        emplacementCol
      );
    }
  }
}


/************************************************************
 * ACTUALISER TOUS LES EMPLACEMENTS
 ************************************************************/

function actualiserTousLesEmplacements() {

  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  const sheet =
    ss.getSheetByName(
      NOM_FEUILLE
    );


  if (!sheet) {

    SpreadsheetApp
      .getUi()
      .alert(
        'La feuille "tableaux de chargement" est introuvable.'
      );

    return;
  }


  const emplacementCol =
    trouverColonneEmplacement_(
      sheet
    );


  if (!emplacementCol) {

    SpreadsheetApp
      .getUi()
      .alert(
        'La colonne "Emplacement" est introuvable.'
      );

    return;
  }


  const lastRow =
    sheet.getLastRow();


  for (
    let row = 2;
    row <= lastRow;
    row++
  ) {

    mettreEmplacementAutomatique_(
      sheet,
      row,
      emplacementCol
    );
  }


  SpreadsheetApp
    .getUi()
    .alert(
      "✅ Tous les emplacements ont été actualisés."
    );
}


/************************************************************
 * API WEB APP (CONNEXION POUR L'APPLICATION FLUX ATELIER)
 *
 * Permet à l'application web de mettre à jour les emplacements
 ************************************************************/

function trouverFeuille_(ss, nomCible) {
  if (!ss) return null;
  const direct = ss.getSheetByName(nomCible);
  if (direct) return direct;

  const cleanCible = String(nomCible || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const sName = sheets[i]
      .getName()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (sName === cleanCible || sName.includes(cleanCible) || cleanCible.includes(sName)) {
      return sheets[i];
    }
  }

  return null;
}

function traiterRequeteApp_(params) {
  try {
    if (WRITE_TOKEN && params.token !== WRITE_TOKEN) {
      return { ok: false, error: "Token invalide." };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = trouverFeuille_(ss, NOM_FEUILLE);

    if (!sheet) {
      return { ok: false, error: 'Onglet "' + NOM_FEUILLE + '" introuvable.' };
    }

    const sheetSuivi = trouverFeuille_(ss, NOM_FEUILLE_SUIVI);

    const emplacementCol = trouverColonneEmplacement_(sheet);

    if (!emplacementCol) {
      return { ok: false, error: 'Colonne "Emplacement" introuvable.' };
    }

    // --------------------------------------------------------
    // Action 0.1 : Synchronisation manuelle Suivi -> Tableaux de chargement
    // --------------------------------------------------------
    if (params.action === "synchroniserEntrees") {
      const count = synchroniserSuiviVersChargementAutomatique_();
      return { ok: true, count: count, message: count + " entrée(s) synchronisée(s)." };
    }

    // --------------------------------------------------------
    // Action 0 : Ajout d'une nouvelle entrée (Réception / Chef Atelier)
    // --------------------------------------------------------
    if (params.action === "ajouterEntree") {
      if (!sheetSuivi) {
        return { ok: false, error: 'Onglet "' + NOM_FEUILLE_SUIVI + '" introuvable.' };
      }

      const noOr = String(params.noOr || "").trim();
      const cs = String(params.cs || "R18").trim();
      const chassis = String(params.chassis || "").trim();
      const codeClient = String(params.codeClient || "").trim();
      const nomClient = String(params.nomClient || "").trim() || "Client non renseigné";
      
      let dateEntreeHeure = String(params.dateEntreeHeure || "").trim();
      if (!dateEntreeHeure) {
        const dNow = new Date();
        const dd = String(dNow.getDate()).padStart(2, "0");
        const mm = String(dNow.getMonth() + 1).padStart(2, "0");
        const yyyy = dNow.getFullYear();
        const hh = String(dNow.getHours()).padStart(2, "0");
        const min = String(dNow.getMinutes()).padStart(2, "0");
        const ss = String(dNow.getSeconds()).padStart(2, "0");
        dateEntreeHeure = dd + "/" + mm + "/" + yyyy + " " + hh + ":" + min + ":" + ss;
      }

      const marque = String(params.marque || "IVECO").trim() || "IVECO";
      const modele = String(params.modele || "-").trim() || "-";
      const categorie = String(params.categorie || "-").trim() || "-";
      const equipe = String(params.equipe || "").trim();

      if (!noOr && !chassis) {
        return { ok: false, error: "N° OR ou Châssis obligatoire." };
      }

      // 1. Ajouter dans "Suivi des entrées" EN TÊTE de tableau (ligne 2, directement sous l'en-tête)
      let rowSuivi = 2;
      const lastRowSuivi = sheetSuivi.getLastRow();
      if (lastRowSuivi >= 2) {
        sheetSuivi.insertRowBefore(2);
      }
      const dataSuivi = [
        noOr,
        cs,
        chassis,
        codeClient,
        nomClient || "Client non renseigné",
        dateEntreeHeure,
        marque || "IVECO",
        modele || "-",
        categorie || "-",
        equipe
      ];
      sheetSuivi.getRange(rowSuivi, 1, 1, dataSuivi.length).setValues([dataSuivi]);
      // Mettre l'état initial "Attente réparation" en colonne 17 (Q)
      sheetSuivi.getRange(rowSuivi, 17).setValue("Attente réparation");

      SpreadsheetApp.flush();

      // 2. Synchroniser dans "tableaux de chargement" EN TÊTE également sans créer de doublon
      let chargementRow = 0;
      if (sheet) {
        chargementRow = trouverLigneParIdentifiants_(sheet, noOr, cs, chassis);

        if (!chargementRow) {
          chargementRow = 2;
          const lastRowChargement = sheet.getLastRow();
          if (lastRowChargement >= 2) {
            sheet.insertRowBefore(2);
          }
          const dataChargement = [
            noOr,
            cs,
            chassis,
            marque || "IVECO",
            modele || "-",
            "Attente réparation",
            equipe
          ];
          sheet.getRange(chargementRow, 1, 1, dataChargement.length).setValues([dataChargement]);
        } else {
          sheet.getRange(chargementRow, COL.ETAT).setValue("Attente réparation");
          if (equipe) {
            sheet.getRange(chargementRow, COL.EQUIPE1).setValue(equipe);
          }
        }

        try {
          gererEtat_(sheet, chargementRow, emplacementCol);
        } catch (errEtat) {
          Logger.log("Info gererEtat_ : " + errEtat);
        }
      }

      SpreadsheetApp.flush();

      return {
        ok: true,
        message: "Véhicule ajouté avec succès.",
        noOr: noOr,
        cs: cs,
        chassis: chassis,
        rowSuivi: rowSuivi,
        rowChargement: chargementRow
      };
    }

    // --------------------------------------------------------
    // Action VIN : Ajout d'un nouveau véhicule dans l'onglet VIN
    // --------------------------------------------------------
    if (params.action === "ajouterVin") {
      const sheetVin = trouverFeuille_(ss, NOM_FEUILLE_VIN);
      if (!sheetVin) {
        return { ok: false, error: 'Onglet "' + NOM_FEUILLE_VIN + '" introuvable.' };
      }

      const chassis = String(params.chassis || params.vin || "").trim().toUpperCase();
      const codeMarque = String(params.codeMarque || params.marque || "IVECO").trim();
      const codeModele = String(params.codeModele || params.modele || "").trim();
      const numModeleVersion = String(params.numModeleVersion || "").trim();
      const descriptionSection = String(params.descriptionSection || params.categorie || "").trim();
      const couleurCarrosserie = String(params.couleurCarrosserie || params.couleur || "").trim();
      const codeCouleur = String(params.codeCouleur || "").trim();
      const dateMiseCirculation = String(params.dateMiseCirculation || "").trim();
      const immatriculation = String(params.immatriculation || "").trim();
      const dateVente = String(params.dateVente || "").trim();
      const dateLivraison = String(params.dateLivraison || "").trim();
      const codeClient = String(params.codeClient || params.noClient || "").trim();
      const nomClient = String(params.nomClient || "").trim();

      if (!chassis) {
        return { ok: false, error: "N° Châssis (VIN) obligatoire." };
      }

      const lastRow = sheetVin.getLastRow();
      const targetRow = lastRow + 1;

      // Date du jour (format JJ/MM/AAAA)
      const now = new Date();
      const jourStr = Utilities.formatDate(now, "Africa/Tunis", "dd/MM/yyyy");

      // Calcul séquentiel du code VSN (format VSN-000XXX)
      let vsnCode = "";
      try {
        const lastVsnVal = String(sheetVin.getRange(lastRow, 1).getValue() || "").trim();
        const matchVsn = lastVsnVal.match(/\d+/);
        if (matchVsn) {
          const nextNum = parseInt(matchVsn[0], 10) + 1;
          vsnCode = "VSN-" + String(nextNum).padStart(6, "0");
        }
      } catch (eVsn) {
        vsnCode = "VSN-" + String(targetRow).padStart(6, "0");
      }
      if (!vsnCode) {
        vsnCode = "VSN-" + String(targetRow).padStart(6, "0");
      }

      // Structure exacte des colonnes de la feuille VIN (38 colonnes) :
      // Col 0  (A)  : N° de série (VSN-000xxx)
      // Col 1  (B)  : Date de mise en circulation
      // Col 2  (C)  : VIN (N° Châssis)
      // Col 3  (D)  : Code marque (IVECO, FIAT, FIAT PRO, etc.)
      // Col 4  (E)  : Code modèle
      // Col 5  (F)  : N° modèle version
      // Col 6  (G)  : Description (section analytique)
      // Col 7  (H)  : Couleur carrosserie
      // Col 8  (I)  : Code couleurcarrosserie
      // Col 9  (J)  : Date dernier PDI
      // Col 10 (K)  : N° Immatriculation
      // Col 11 (L)  : Date de mise en circulation
      // Col 12 (M)  : Réserve (FALSE)
      // Col 13 (N)  : Code statut (VC)
      // Col 14 (O)  : Stocks (0,)
      // Col 15 (P)  : Code motif avarie
      // Col 16 (Q)  : Date début avarie
      // Col 17 (R)  : Date fin avarie
      // Col 18 (S)  : Description avarie
      // Col 19 (T)  : Réserve sur commande (FALSE)
      // Col 20 (U)  : Age (Jours) (0)
      // Col 21 (V)  : Date entree stock
      // Col 22 (W)  : Code magasin
      // Col 23 (X)  : Nom tiers destinataire
      // Col 24 (Y)  : Code emplacement
      // Col 25 (Z)  : Num. dossier import
      // Col 26 (AA) : N° Lettre de crédit
      // Col 27 (AB) : N° domiciliation
      // Col 28 (AC) : Fact (FALSE)
      // Col 29 (AD) : N° client
      // Col 30 (AE) : Checkbox (FALSE)
      // Col 31 (AF) : Nom du client
      // Col 32 (AG) : Date vente
      // Col 33 (AH) : Date de livraison
      const rowData = new Array(38).fill("");
      rowData[0] = vsnCode;
      rowData[1] = dateMiseCirculation || jourStr;
      rowData[2] = chassis;
      rowData[3] = codeMarque;
      rowData[4] = codeModele || "-";
      rowData[5] = numModeleVersion || "-";
      rowData[6] = descriptionSection || "-";
      rowData[7] = couleurCarrosserie || "";
      rowData[8] = codeCouleur || "";
      rowData[10] = immatriculation || "-";
      rowData[11] = dateMiseCirculation || jourStr;
      rowData[12] = false;
      rowData[13] = "VC";
      rowData[14] = "0,";
      rowData[19] = false;
      rowData[20] = 0;
      rowData[28] = false;
      rowData[29] = codeClient || "-";
      rowData[30] = false;
      rowData[31] = nomClient || "-";
      rowData[32] = dateVente || jourStr;
      rowData[33] = dateLivraison || dateVente || jourStr;
      rowData[37] = 0;

      if (targetRow > sheetVin.getMaxRows()) {
        sheetVin.insertRowAfter(sheetVin.getMaxRows());
      }

      sheetVin.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);
      SpreadsheetApp.flush();

      return {
        ok: true,
        message: "Véhicule " + chassis + " (" + codeMarque + " " + codeModele + ") enregistré avec succès dans la base VIN.",
        chassis: chassis,
        vsn: vsnCode,
        rowNumber: targetRow
      };
    }

    // --------------------------------------------------------
    // Action VIN : Modification d'un véhicule existant dans l'onglet VIN
    // --------------------------------------------------------
    if (params.action === "modifierVin") {
      const sheetVin = trouverFeuille_(ss, NOM_FEUILLE_VIN);
      if (!sheetVin) {
        return { ok: false, error: 'Onglet "' + NOM_FEUILLE_VIN + '" introuvable.' };
      }

      const chassis = String(params.chassis || params.vin || "").trim().toUpperCase();
      if (!chassis) {
        return { ok: false, error: "N° Châssis (VIN) obligatoire." };
      }

      const lastRow = sheetVin.getLastRow();
      let targetRow = -1;
      if (lastRow >= 2) {
        const vinColValues = sheetVin.getRange(2, 3, lastRow - 1, 1).getValues();
        for (let i = 0; i < vinColValues.length; i++) {
          if (String(vinColValues[i][0] || "").trim().toUpperCase() === chassis) {
            targetRow = i + 2;
            break;
          }
        }
      }

      if (targetRow === -1) {
        return { ok: false, error: 'Châssis "' + chassis + '" introuvable dans l\'onglet VIN.' };
      }

      if (params.codeMarque || params.marque) sheetVin.getRange(targetRow, 4).setValue(String(params.codeMarque || params.marque).trim());
      if (params.codeModele || params.modele) sheetVin.getRange(targetRow, 5).setValue(String(params.codeModele || params.modele).trim());
      if (params.numModeleVersion !== undefined) sheetVin.getRange(targetRow, 6).setValue(String(params.numModeleVersion).trim());
      if (params.descriptionSection || params.categorie) sheetVin.getRange(targetRow, 7).setValue(String(params.descriptionSection || params.categorie).trim());
      if (params.couleurCarrosserie || params.couleur) sheetVin.getRange(targetRow, 8).setValue(String(params.couleurCarrosserie || params.couleur).trim());
      if (params.codeCouleur !== undefined) sheetVin.getRange(targetRow, 9).setValue(String(params.codeCouleur).trim());
      if (params.immatriculation !== undefined) sheetVin.getRange(targetRow, 11).setValue(String(params.immatriculation).trim());
      if (params.dateMiseCirculation !== undefined) {
        sheetVin.getRange(targetRow, 2).setValue(String(params.dateMiseCirculation).trim());
        sheetVin.getRange(targetRow, 12).setValue(String(params.dateMiseCirculation).trim());
      }
      if (params.codeClient !== undefined) sheetVin.getRange(targetRow, 30).setValue(String(params.codeClient).trim());
      if (params.nomClient !== undefined) sheetVin.getRange(targetRow, 32).setValue(String(params.nomClient).trim());
      if (params.dateVente !== undefined) sheetVin.getRange(targetRow, 33).setValue(String(params.dateVente).trim());
      if (params.dateLivraison !== undefined) sheetVin.getRange(targetRow, 34).setValue(String(params.dateLivraison).trim());

      SpreadsheetApp.flush();

      return {
        ok: true,
        message: "Véhicule " + chassis + " mis à jour avec succès dans la base VIN.",
        chassis: chassis,
        rowNumber: targetRow
      };
    }

    // --------------------------------------------------------
    // Action : Modification d'une entrée existante
    // --------------------------------------------------------
    if (params.action === "modifierEntree") {
      if (!sheetSuivi) {
        return { ok: false, error: 'Onglet "' + NOM_FEUILLE_SUIVI + '" introuvable.' };
      }

      const noOr = String(params.noOr || "").trim();
      const cs = String(params.cs || "R10").trim();
      const chassis = String(params.chassis || "").trim().toUpperCase();
      const codeClient = String(params.codeClient || "").trim();
      const nomClient = String(params.nomClient || "").trim();
      const dateEntreeHeure = String(params.dateEntreeHeure || "").trim();
      const marque = String(params.marque || "IVECO").trim();
      const modele = String(params.modele || "").trim();
      const categorie = String(params.categorie || "").trim();
      const equipe = String(params.equipe || "").trim();
      const etat = normaliserEtatApp_(params.etat || "Attente réparation");
      const emplacement = String(params.emplacement || "").trim();

      const origNo = String(params.origNo || noOr).trim();
      const origCs = String(params.origCs || cs).trim();
      const origChassis = String(params.origChassis || chassis).trim();

      // 1. Trouver et mettre à jour dans "Suivi des entrées"
      let ligneSuivi = Number(params.rowSuivi || 0);
      if (!estLigneValidePourVehicule_(sheetSuivi, ligneSuivi, origNo, origCs, origChassis)) {
        ligneSuivi = trouverLigneParIdentifiants_(sheetSuivi, origNo, origCs, origChassis);
      }

      // Préserver impérativement la date/heure originale de l'ancien ajout si non explicitement fournie
      let finalDateEntree = dateEntreeHeure;
      if (!finalDateEntree && ligneSuivi > 1) {
        finalDateEntree = String(sheetSuivi.getRange(ligneSuivi, 6).getValue() || "").trim();
      }

      if (ligneSuivi > 1) {
        const dataSuivi = [
          noOr,
          cs,
          chassis,
          codeClient,
          nomClient || "Client non renseigné",
          finalDateEntree,
          marque || "IVECO",
          modele || "-",
          categorie || "-"
        ];
        sheetSuivi.getRange(ligneSuivi, 1, 1, dataSuivi.length).setValues([dataSuivi]);
        if (equipe) {
          sheetSuivi.getRange(ligneSuivi, 10).setValue(equipe);
        }
        if (etat) {
          sheetSuivi.getRange(ligneSuivi, 17).setValue(etat);
        }
      }

      // 2. Trouver et mettre à jour dans "tableaux de chargement"
      let ligneChargement = Number(params.rowNumber || 0);
      if (sheet) {
        if (!estLigneValidePourVehicule_(sheet, ligneChargement, origNo, origCs, origChassis)) {
          ligneChargement = trouverLigneParIdentifiants_(sheet, origNo, origCs, origChassis);
        }

        if (ligneChargement > 1) {
          sheet.getRange(ligneChargement, 1).setValue(noOr);
          sheet.getRange(ligneChargement, 2).setValue(cs);
          sheet.getRange(ligneChargement, 3).setValue(chassis);
          sheet.getRange(ligneChargement, 4).setValue(marque || "IVECO");
          sheet.getRange(ligneChargement, 5).setValue(modele || "-");
          if (equipe) {
            sheet.getRange(ligneChargement, COL.EQUIPE1).setValue(equipe);
          }
          if (etat) {
            sheet.getRange(ligneChargement, COL.ETAT).setValue(etat);
          }
          if (emplacement) {
            assignerEmplacementSecurise_(sheet, ligneChargement, emplacementCol, emplacement);
          }
        }
      }

      SpreadsheetApp.flush();

      return {
        ok: true,
        message: "Dossier " + noOr + " mis à jour avec succès.",
        noOr: noOr,
        cs: cs,
        chassis: chassis,
        rowSuivi: ligneSuivi,
        rowChargement: ligneChargement
      };
    }

    // --------------------------------------------------------
    // Action : Suppression d'une entrée / dossier
    // --------------------------------------------------------
    if (params.action === "supprimerEntree") {
      const targetNo = String(params.no || params.noOr || "").trim();
      const targetCs = String(params.cs || "").trim();
      const targetChassis = String(params.chassis || "").trim();

      let supprimeSuivi = false;
      let supprimeChargement = false;

      // 1. Supprimer dans "Suivi des entrées"
      if (sheetSuivi) {
        let ligneSuivi = Number(params.rowSuivi || 0);
        if (!estLigneValidePourVehicule_(sheetSuivi, ligneSuivi, targetNo, targetCs, targetChassis)) {
          ligneSuivi = trouverLigneParIdentifiants_(sheetSuivi, targetNo, targetCs, targetChassis);
        }

        if (ligneSuivi > 1) {
          sheetSuivi.deleteRow(ligneSuivi);
          supprimeSuivi = true;
        }
      }

      // 2. Supprimer dans "tableaux de chargement"
      if (sheet) {
        let ligneChargement = Number(params.rowNumber || 0);
        if (!estLigneValidePourVehicule_(sheet, ligneChargement, targetNo, targetCs, targetChassis)) {
          ligneChargement = trouverLigneParIdentifiants_(sheet, targetNo, targetCs, targetChassis);
        }

        if (ligneChargement > 1) {
          sheet.deleteRow(ligneChargement);
          supprimeChargement = true;
        }
      }

      SpreadsheetApp.flush();

      if (!supprimeSuivi && !supprimeChargement) {
        return {
          ok: false,
          error: "Dossier introuvable dans Google Sheets pour suppression (" + targetNo + " / " + targetChassis + ")."
        };
      }

      return {
        ok: true,
        message: "Dossier " + targetNo + " supprimé avec succès de Google Sheets.",
        supprimeSuivi: supprimeSuivi,
        supprimeChargement: supprimeChargement
      };
    }

    // Action utilitaire : Débloquer les validations strictes sur toutes les lignes
    if (params.action === "reparerValidations") {
      const msg = reparerValidationsTableauChargement();
      return { ok: true, message: msg };
    }

    // Trouver la ligne correspondante dans "tableaux de chargement"
    let ligne = Number(params.rowNumber || 0);

    if (!estLigneValidePourVehicule_(sheet, ligne, params.no, params.cs, params.chassis)) {
      ligne = trouverLigneParIdentifiants_(sheet, params.no, params.cs, params.chassis);
    }

    if (!ligne) {
      return { ok: false, error: "Véhicule introuvable dans tableaux de chargement." };
    }

    // --------------------------------------------------------
    // Action 1 : Mise à jour de l'emplacement depuis l'application
    // --------------------------------------------------------
    if (params.action === "updateEmplacement") {
      const nouvelEmplacement = String(params.emplacement || "").trim();

      if (!nouvelEmplacement) {
        return { ok: false, error: "Emplacement vide." };
      }

      assignerEmplacementSecurise_(sheet, ligne, emplacementCol, nouvelEmplacement);
      SpreadsheetApp.flush();

      return {
        ok: true,
        emplacement: nouvelEmplacement,
        rowNumber: ligne,
      };
    }

    // --------------------------------------------------------
    // Action 2 : Mise à jour de l'état depuis l'application
    // --------------------------------------------------------
    if (params.action === "updateEtat") {
      const nouvelEtat = normaliserEtatApp_(params.etat);

      if (!nouvelEtat) {
        return { ok: false, error: "État invalide : " + params.etat };
      }

      // 1. Mettre à jour "tableaux de chargement"
      if (nouvelEtat === "Livré") {
        assignerEmplacementSecurise_(sheet, ligne, emplacementCol, "Livraison au client");
      }

      sheet.getRange(ligne, COL.ETAT).setValue(nouvelEtat);

      // Si l'équipe est fournie, mettre à jour le bloc actif
      const blocEtat = determinerBlocActif_(sheet, ligne, params);
      const colsEtat = obtenirColonnesBloc_(blocEtat);

      if (params.equipe) {
        ecrireCelluleSecurisee_(sheet.getRange(ligne, colsEtat.equipe), String(params.equipe).trim());
      }
      if (params.technicien) {
        ecrireCelluleSecurisee_(sheet.getRange(ligne, colsEtat.matricule), String(params.technicien).trim());
      }
      if (params.nomTechnicien) {
        ecrireCelluleSecurisee_(sheet.getRange(ligne, colsEtat.nom), String(params.nomTechnicien).trim());
      }
      if (params.poste) {
        ecrireCelluleSecurisee_(sheet.getRange(ligne, colsEtat.poste), String(params.poste).trim());
      }

      const cellDebutEtat = sheet.getRange(ligne, colsEtat.debut);
      if (cellDebutEtat.isBlank()) {
        cellDebutEtat.setValue(new Date());
        try { cellDebutEtat.setNumberFormat("dd/MM/yyyy HH:mm"); } catch (_) {}
      }

      try {
        creerListeMatricules_(sheet, ligne, blocEtat);
        mettreListeAvancement_(sheet, ligne, blocEtat);
      } catch (_) {}

      // Déclencher automatiquement la logique d'état et d'emplacement de l'atelier
      gererEtat_(sheet, ligne, emplacementCol);

      // 2. Mettre à jour "Suivi des entrées" si présent
      let ligneSuivi = Number(params.rowSuivi || 0);
      if (sheetSuivi) {
        if (!estLigneValidePourVehicule_(sheetSuivi, ligneSuivi, params.no, params.cs, params.chassis)) {
          ligneSuivi = trouverLigneParIdentifiants_(sheetSuivi, params.no, params.cs, params.chassis);
        }
        if (ligneSuivi > 0) {
          // Colonne 17 = Q (Etat dans Suivi des entrées)
          sheetSuivi.getRange(ligneSuivi, 17).setValue(nouvelEtat);
          if (params.equipe) {
            // Colonne 10 = J (EQUIPE dans Suivi des entrées)
            sheetSuivi.getRange(ligneSuivi, 10).setValue(String(params.equipe).trim());
          }
          if (params.technicien) {
            // Colonne 11 = K (Technicien / Matricule dans Suivi des entrées)
            sheetSuivi.getRange(ligneSuivi, 11).setValue(String(params.technicien).trim());
          }
          if (params.nomTechnicien) {
            // Colonne 12 = L (NOM DE Technicien dans Suivi des entrées)
            sheetSuivi.getRange(ligneSuivi, 12).setValue(String(params.nomTechnicien).trim());
          }
        }
      }

      SpreadsheetApp.flush();

      const emplacementFinal = sheet
        .getRange(ligne, emplacementCol)
        .getDisplayValue()
        .trim();

      return {
        ok: true,
        etat: nouvelEtat,
        emplacement: emplacementFinal,
        rowNumber: ligne,
        rowSuivi: ligneSuivi,
      };
    }

    // --------------------------------------------------------
    // Action 3 : Mise à jour directe du technicien
    // --------------------------------------------------------
    if (params.action === "updateTechnicien") {
      const blocTech = determinerBlocActif_(sheet, ligne, params);
      const colsTech = obtenirColonnesBloc_(blocTech);

      if (params.technicien) {
        ecrireCelluleSecurisee_(sheet.getRange(ligne, colsTech.matricule), String(params.technicien).trim());
      }
      if (params.nomTechnicien) {
        ecrireCelluleSecurisee_(sheet.getRange(ligne, colsTech.nom), String(params.nomTechnicien).trim());
      }
      if (params.poste) {
        ecrireCelluleSecurisee_(sheet.getRange(ligne, colsTech.poste), String(params.poste).trim());
      }
      if (params.equipe) {
        ecrireCelluleSecurisee_(sheet.getRange(ligne, colsTech.equipe), String(params.equipe).trim());
      }

      const cellDebutTech = sheet.getRange(ligne, colsTech.debut);
      if (cellDebutTech.isBlank()) {
        cellDebutTech.setValue(new Date());
        try { cellDebutTech.setNumberFormat("dd/MM/yyyy HH:mm"); } catch (_) {}
      }

      // Si l'avancement du bloc actif est vide ou un transfert, initialiser à "En cours - 10%"
      const cellAvTech = sheet.getRange(ligne, colsTech.avancement);
      const valAvTech = String(cellAvTech.getValue() || "").trim();
      if (cellAvTech.isBlank() || valAvTech === "" || valAvTech === "-" || valAvTech.toLowerCase().startsWith("vr")) {
        ecrireCelluleSecurisee_(cellAvTech, "En cours - 10%");
      }

      // Mettre à jour l'État général de l'intervention à "En cours"
      ecrireCelluleSecurisee_(sheet.getRange(ligne, COL.ETAT), "En cours");

      try {
        creerListeMatricules_(sheet, ligne, blocTech);
        mettreListeAvancement_(sheet, ligne, blocTech);
      } catch (_) {}

      let ligneSuivi = Number(params.rowSuivi || 0);
      if (sheetSuivi) {
        if (!estLigneValidePourVehicule_(sheetSuivi, ligneSuivi, params.no, params.cs, params.chassis)) {
          ligneSuivi = trouverLigneParIdentifiants_(sheetSuivi, params.no, params.cs, params.chassis);
        }
        if (ligneSuivi > 0) {
          if (params.equipe) {
            sheetSuivi.getRange(ligneSuivi, 10).setValue(String(params.equipe).trim());
          }
          if (params.technicien) {
            sheetSuivi.getRange(ligneSuivi, 11).setValue(String(params.technicien).trim());
          }
          if (params.nomTechnicien) {
            sheetSuivi.getRange(ligneSuivi, 12).setValue(String(params.nomTechnicien).trim());
          }
          try { sheetSuivi.getRange(ligneSuivi, 14).setValue("En cours - 10%"); } catch (_) {}
          try { sheetSuivi.getRange(ligneSuivi, 17).setValue("En cours"); } catch (_) {}
        }
      }

      SpreadsheetApp.flush();

      return {
        ok: true,
        technicien: params.technicien,
        nomTechnicien: params.nomTechnicien,
        bloc: blocTech,
        rowNumber: ligne,
        rowSuivi: ligneSuivi,
      };
    }

    // --------------------------------------------------------
    // Action 4 : Mise à jour de l'avancement depuis l'application
    // --------------------------------------------------------
    if (params.action === "updateAvancement") {
      const nouvelAvancement = String(params.avancement || "").trim();

      if (!nouvelAvancement) {
        return { ok: false, error: "Avancement vide." };
      }

      // Déterminer le bloc actif (1, 2 ou 3) de façon séquentielle : AVANCEMENT 1 -> AVANCEMENT 2 -> AVANCEMENT 3
      const bloc = determinerBlocActif_(sheet, ligne, params);
      const cols = obtenirColonnesBloc_(bloc);

      // Si l'équipe du bloc est vide, l'initialiser
      const cellEq = sheet.getRange(ligne, cols.equipe);
      if (cellEq.isBlank()) {
        if (params.equipe) {
          ecrireCelluleSecurisee_(cellEq, String(params.equipe).trim());
        } else if (bloc === 2) {
          const av1Prec = sheet.getRange(ligne, COL.AV1).getDisplayValue().trim();
          if (av1Prec && VR_EQUIPE[av1Prec] && VR_EQUIPE[av1Prec].length > 0) {
            ecrireCelluleSecurisee_(cellEq, VR_EQUIPE[av1Prec][0]);
          }
        } else if (bloc === 3) {
          const av2Prec = sheet.getRange(ligne, COL.AV2).getDisplayValue().trim();
          if (av2Prec && VR_EQUIPE[av2Prec] && VR_EQUIPE[av2Prec].length > 0) {
            ecrireCelluleSecurisee_(cellEq, VR_EQUIPE[av2Prec][0]);
          }
        }
      }

      // Si la date de début du bloc est vide, l'enregistrer
      const cellDebut = sheet.getRange(ligne, cols.debut);
      if (cellDebut.isBlank()) {
        cellDebut.setValue(new Date());
        try { cellDebut.setNumberFormat("dd/MM/yyyy HH:mm"); } catch (_) {}
      }

      // Inscription de l'avancement dans la colonne du bloc actif (AV1, AV2 ou AV3)
      ecrireCelluleSecurisee_(sheet.getRange(ligne, cols.avancement), nouvelAvancement);

      // Si une demande de pièces / achat est transmise (attends acheter)
      if (params.ref || params.designation) {
        try {
          const NOM_FEUILLE_ACHATS = "ACHATS";
          let sheetAchats = trouverFeuille_(ss, NOM_FEUILLE_ACHATS);
          if (!sheetAchats) {
            sheetAchats = ss.insertSheet(NOM_FEUILLE_ACHATS);
            sheetAchats.appendRow([
              "DATE",
              "OR",
              "CHASSIS",
              "CLIENT",
              "REF",
              "DESIGNATION",
              "QT",
              "COMMENTAIRE",
              "EQUIPE",
              "STATUT"
            ]);
          }
          const nowStr = Utilities.formatDate(new Date(), "Africa/Tunis", "dd/MM/yyyy HH:mm:ss");
          sheetAchats.appendRow([
            params.dateDemande || nowStr,
            params.noOr || params.no || "",
            params.chassis || "",
            params.client || "",
            params.ref || "",
            params.designation || "",
            params.qt || "1",
            params.commentaire || "",
            params.equipe || "",
            "En attente"
          ]);
        } catch (errAchat) {
          Logger.log("Erreur enregistrement demande achat: " + errAchat);
        }
      }

      // Si une demande de devis est transmise (ATENDE DEVIS)
      if (params.numeroDevis) {
        try {
          const NOM_FEUILLE_DEVIS = "DEVIS";
          let sheetDevis = trouverFeuille_(ss, NOM_FEUILLE_DEVIS);
          if (!sheetDevis) {
            sheetDevis = ss.insertSheet(NOM_FEUILLE_DEVIS);
            sheetDevis.appendRow([
              "DATE",
              "N° DEVIS",
              "OR",
              "IMMATRICULATION",
              "MODELE",
              "CHASSIS",
              "CLIENT",
              "EQUIPE",
              "DEMANDEUR",
              "COMMENTAIRE",
              "STATUT"
            ]);
          }
          const nowStr = Utilities.formatDate(new Date(), "Africa/Tunis", "dd/MM/yyyy HH:mm:ss");
          sheetDevis.appendRow([
            params.dateDevis || nowStr,
            params.numeroDevis || "",
            params.noOr || params.no || "",
            params.immatriculation || "",
            params.modele || "",
            params.chassis || "",
            params.client || "",
            params.equipe || "",
            params.demandeur || "",
            params.commentaire || "",
            "En attente accord"
          ]);
        } catch (errDevis) {
          Logger.log("Erreur enregistrement devis: " + errDevis);
        }
      }

      // Si un contrôle d'essai est transmis (Validation Essai Conforme / Non-Conforme)
      if (params.essayeur || params.resultatEssai) {
        try {
          const NOM_FEUILLE_ESSAIS = "ESSAIS";
          let sheetEssais = trouverFeuille_(ss, NOM_FEUILLE_ESSAIS);
          if (!sheetEssais) {
            sheetEssais = ss.insertSheet(NOM_FEUILLE_ESSAIS);
            sheetEssais.appendRow([
              "DATE",
              "OR",
              "CHASSIS",
              "MODELE",
              "CLIENT",
              "ESSAYEUR",
              "RESULTAT",
              "ACTION",
              "DESCRIPTION_PANNE"
            ]);
          }
          const nowStr = Utilities.formatDate(new Date(), "Africa/Tunis", "dd/MM/yyyy HH:mm:ss");
          sheetEssais.appendRow([
            params.dateControle || nowStr,
            params.noOr || params.no || "",
            params.chassis || "",
            params.modele || "",
            params.client || "",
            params.essayeur || "",
            params.resultatEssai || "",
            params.actionNonConforme === "transfert_vr" ? ("Transfert " + (params.targetVr || "")) : (params.actionNonConforme || "Conforme"),
            params.descriptionPanne || ""
          ]);
        } catch (errEssai) {
          Logger.log("Erreur enregistrement contrôle essai: " + errEssai);
        }
      }

      // Déclencher la logique de gestion d'avancement
      try {
        gererAvancement_(sheet, ligne, bloc, emplacementCol);
      } catch (errAv) {
        Logger.log("Info gererAvancement_ : " + errAv);
      }

      if (nouvelAvancement === "attends acheter") {
        try {
          sheet.getRange(ligne, COL.ETAT).clearDataValidations();
          sheet.getRange(ligne, COL.ETAT).setValue("attends acheter");
        } catch (_) {}
      } else if (nouvelAvancement === "Essai") {
        try {
          sheet.getRange(ligne, COL.ETAT).clearDataValidations();
          sheet.getRange(ligne, COL.ETAT).setValue("Essai");
        } catch (_) {}
      } else if (nouvelAvancement === "Terminer") {
        try {
          sheet.getRange(ligne, COL.ETAT).clearDataValidations();
          sheet.getRange(ligne, COL.ETAT).setValue("Attente client");
        } catch (_) {}
      } else if (nouvelAvancement === "Attente client") {
        try {
          sheet.getRange(ligne, COL.ETAT).clearDataValidations();
          sheet.getRange(ligne, COL.ETAT).setValue("Attente client");
        } catch (_) {}
      }

      SpreadsheetApp.flush();

      const nouvelEtat = sheet.getRange(ligne, COL.ETAT).getDisplayValue().trim();
      const nouvelEmplacement = sheet.getRange(ligne, emplacementCol).getDisplayValue().trim();

      // Synchroniser avec "Suivi des entrées" si la ligne existe
      let ligneSuivi = Number(params.rowSuivi || 0);
      if (sheetSuivi) {
        if (!estLigneValidePourVehicule_(sheetSuivi, ligneSuivi, params.no, params.cs, params.chassis)) {
          ligneSuivi = trouverLigneParIdentifiants_(sheetSuivi, params.no, params.cs, params.chassis);
        }
        if (ligneSuivi > 0) {
          if (nouvelEtat) {
            try {
              sheetSuivi.getRange(ligneSuivi, 17).clearDataValidations();
            } catch (_) {}
            sheetSuivi.getRange(ligneSuivi, 17).setValue(nouvelEtat);
          }
          try {
            sheetSuivi.getRange(ligneSuivi, 14).setValue(nouvelAvancement);
          } catch (errSuiviAv) {}
        }
      }

      SpreadsheetApp.flush();

      return {
        ok: true,
        avancement: nouvelAvancement,
        etat: nouvelEtat,
        emplacement: nouvelEmplacement,
        rowNumber: ligne,
        rowSuivi: ligneSuivi,
        bloc: bloc
      };
    }

    // --------------------------------------------------------
    // Action 5 : Mise à jour du statut d'achat (ACHATS)
    // --------------------------------------------------------
    if (params.action === "updateStatutAchat") {
      const NOM_FEUILLE_ACHATS = "ACHATS";
      let sheetAchats = trouverFeuille_(ss, NOM_FEUILLE_ACHATS);
      const targetOr = String(params.or || params.no || "").trim();
      const targetChassis = String(params.chassis || "").trim();
      const targetRef = String(params.ref || "").trim();
      const nouveauStatut = String(params.statut || "Livré").trim();
      const nowStr = Utilities.formatDate(new Date(), "Africa/Tunis", "dd/MM/yyyy HH:mm:ss");

      let updated = false;
      if (sheetAchats && sheetAchats.getLastRow() >= 2) {
        const lastRow = sheetAchats.getLastRow();
        const data = sheetAchats.getRange(2, 1, lastRow - 1, 10).getValues();
        for (let i = 0; i < data.length; i++) {
          const rowOr = String(data[i][1] || "").trim();
          const rowChassis = String(data[i][2] || "").trim();
          const rowRef = String(data[i][4] || "").trim();

          const matchOr = targetOr && (rowOr === targetOr);
          const matchChassis = targetChassis && (rowChassis === targetChassis);
          const matchRef = !targetRef || (rowRef === targetRef);

          if ((matchOr || matchChassis) && matchRef) {
            sheetAchats.getRange(i + 2, 10).setValue(nouveauStatut);
            updated = true;
          }
        }
      }
      SpreadsheetApp.flush();
      return { ok: true, updated: updated, statut: nouveauStatut, date: nowStr };
    }

    // --------------------------------------------------------
    // Action 6 : Récupérer les comptes (COMPTES)
    // --------------------------------------------------------
    if (params.action === "getComptes") {
      let sheetComptes = trouverFeuille_(ss, NOM_FEUILLE_COMPTES);
      if (!sheetComptes) {
        sheetComptes = ss.insertSheet(NOM_FEUILLE_COMPTES);
        sheetComptes.appendRow(["ID", "Nom", "Email", "Mot de passe", "Rôle", "Équipe"]);
      }
      const lastRow = sheetComptes.getLastRow();
      if (lastRow < 2) {
        return { ok: true, comptes: [] };
      }
      const maxCol = Math.max(sheetComptes.getLastColumn(), 6);
      const rows = sheetComptes.getRange(2, 1, lastRow - 1, maxCol).getValues();
      const comptes = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r[0] || r[2]) {
          comptes.push({
            id: String(r[0] || ""),
            name: String(r[1] || ""),
            email: String(r[2] || ""),
            password: String(r[3] || ""),
            role: String(r[4] || "chef_equipe"),
            assignedTeam: String(r[5] || ""),
          });
        }
      }
      return { ok: true, comptes: comptes };
    }

    // --------------------------------------------------------
    // Action 7 : Sauvegarder ou créer un compte (COMPTES)
    // --------------------------------------------------------
    if (params.action === "sauvegarderCompte") {
      let sheetComptes = trouverFeuille_(ss, NOM_FEUILLE_COMPTES);
      if (!sheetComptes) {
        sheetComptes = ss.insertSheet(NOM_FEUILLE_COMPTES);
        sheetComptes.appendRow(["ID", "Nom", "Email", "Mot de passe", "Rôle", "Équipe"]);
      }
      const id = String(params.id || "").trim();
      const name = String(params.name || "").trim();
      const email = String(params.email || "").trim();
      const password = String(params.password || "").trim();
      const role = String(params.role || "chef_equipe").trim();
      const team = String(params.team || params.equipe || "").trim();

      if (!email || !password) {
        return { ok: false, error: "Email et mot de passe requis." };
      }

      const lastRow = sheetComptes.getLastRow();
      let foundRow = 0;
      if (lastRow >= 2) {
        const data = sheetComptes.getRange(2, 1, lastRow - 1, 3).getValues();
        for (let i = 0; i < data.length; i++) {
          const rowId = String(data[i][0] || "").trim();
          const rowEmail = String(data[i][2] || "").trim().toLowerCase();
          if ((id && rowId === id) || (email && rowEmail === email.toLowerCase())) {
            foundRow = i + 2;
            break;
          }
        }
      }

      if (foundRow > 0) {
        sheetComptes.getRange(foundRow, 1, 1, 6).setValues([[id, name, email, password, role, team]]);
      } else {
        sheetComptes.appendRow([id, name, email, password, role, team]);
      }

      SpreadsheetApp.flush();
      return { ok: true, message: "Compte enregistré avec succès." };
    }

    // --------------------------------------------------------
    // Action 8 : Supprimer un compte (COMPTES)
    // --------------------------------------------------------
    if (params.action === "supprimerCompte") {
      const sheetComptes = trouverFeuille_(ss, NOM_FEUILLE_COMPTES);
      if (!sheetComptes) {
        return { ok: true, message: "Feuille introuvable." };
      }
      const id = String(params.id || "").trim();
      const email = String(params.email || "").trim().toLowerCase();
      const lastRow = sheetComptes.getLastRow();
      if (lastRow >= 2) {
        const data = sheetComptes.getRange(2, 1, lastRow - 1, 3).getValues();
        for (let i = 0; i < data.length; i++) {
          const rowId = String(data[i][0] || "").trim();
          const rowEmail = String(data[i][2] || "").trim().toLowerCase();
          if ((id && rowId === id) || (email && rowEmail === email)) {
            sheetComptes.deleteRow(i + 2);
            SpreadsheetApp.flush();
            return { ok: true, message: "Compte supprimé." };
          }
        }
      }
      return { ok: true, message: "Compte déjà absent." };
    }

    // --------------------------------------------------------
    // Action 9 : Mettre à jour Année et Mois (Moyennes)
    // --------------------------------------------------------
    if (params.action === "updateMoyennesPeriode") {
      const sheetMoyennes = trouverFeuille_(ss, NOM_FEUILLE_MOYENNES);
      if (!sheetMoyennes) {
        return { ok: false, error: "Feuille Moyennes introuvable." };
      }
      const annee = Number(params.annee);
      const mois = Number(params.mois);
      if (annee && annee >= 2000 && annee <= 2100) {
        sheetMoyennes.getRange(1, 2).setValue(annee); // B1
      }
      if (mois && mois >= 1 && mois <= 12) {
        sheetMoyennes.getRange(2, 2).setValue(mois); // B2
      }
      SpreadsheetApp.flush();
      return { ok: true, annee: annee, mois: mois, message: "Période mise à jour avec succès dans Google Sheets." };
    }

    return { ok: false, error: "Action inconnue : " + params.action };
  } catch (error) {
    return {
      ok: false,
      error: String(error && error.message ? error.message : error),
    };
  }
}

function estLigneValidePourVehicule_(sheet, ligne, targetNo, targetCs, targetChassis) {
  const lastRow = sheet.getLastRow();
  if (!ligne || ligne < 2 || ligne > lastRow) {
    return false;
  }

  const noRecherche = String(targetNo || "").replace(/^-$/, "").trim().toLowerCase();
  const chassisRecherche = String(targetChassis || "").replace(/^-$/, "").trim().toLowerCase();

  // Si aucun identifiant spécifique n'est renseigné, la ligne passée est valide
  if (!noRecherche && !chassisRecherche) {
    return true;
  }

  // Col 1 = N° OR, Col 2 = CS, Col 3 = N° Chassis
  const values = sheet.getRange(ligne, 1, 1, 3).getDisplayValues()[0];
  const noCell = values[0].trim().toLowerCase();
  const chassisCell = values[2].trim().toLowerCase();

  if (noRecherche && chassisRecherche) {
    return noCell === noRecherche && chassisCell === chassisRecherche;
  }
  if (noRecherche) return noCell === noRecherche;
  if (chassisRecherche) return chassisCell === chassisRecherche;

  return false;
}

function trouverLigneParIdentifiants_(sheet, targetNo, targetCs, targetChassis) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const noRecherche = String(targetNo || "").replace(/^-$/, "").trim().toLowerCase();
  const chassisRecherche = String(targetChassis || "").replace(/^-$/, "").trim().toLowerCase();

  // ATTENTION CRITIQUE : Ne JAMAIS chercher par targetCs seul ("R10", "R18" etc.) car c'est un code de centre
  // partagé par tous les véhicules du centre ! Cela écraserait d'autres dossiers !
  if (!noRecherche && !chassisRecherche) return 0;

  // Colonnes 1 à 3 : A (N° OR), B (CS), C (N° Chassis)
  const values = sheet
    .getRange(2, 1, lastRow - 1, 3)
    .getDisplayValues();

  // 1ère passe (DE BAS EN HAUT = plus récent) : Correspondance exacte du N° OR (clé primaire)
  if (noRecherche) {
    for (let i = values.length - 1; i >= 0; i--) {
      const rowNo = values[i][0].trim().toLowerCase();
      if (rowNo === noRecherche) {
        return i + 2;
      }
    }
    // Si un N° OR spécifique est recherché et n'existe pas, c'est un nouveau dossier/OR
    return 0;
  }

  // 2ème passe : Correspondance du Châssis (uniquement si AUCUN N° OR n'était recherché)
  if (chassisRecherche) {
    for (let i = values.length - 1; i >= 0; i--) {
      const rowChassis = values[i][2].trim().toLowerCase();
      if (rowChassis === chassisRecherche) {
        return i + 2;
      }
    }
  }

  return 0;
}

/**
 * Trouve la prochaine ligne libre dans le tableau de manière intelligente et contiguë.
 * Scanne les colonnes A (N° OR) et C (N° Châssis) pour identifier la dernière ligne réellement renseignée
 * dans le bloc principal du tableau.
 * Ignore les lignes orphelines accidentelles tout en bas (ex: ligne 1001 créée par l'ancien appendRow).
 * Renvoie la ligne immédiatement consécutive (ex: si la dernière ligne est 973, renvoie 974).
 */
function trouverProchaineLigneLibre_(sheet) {
  if (!sheet) return 2;
  const maxRows = sheet.getMaxRows();
  if (maxRows < 2) return 2;

  // On lit les colonnes A (N° OR) et C (N° Châssis)
  const data = sheet.getRange(1, 1, maxRows, 3).getValues();

  let derniereLigneRemplie = 1;

  for (let i = 1; i < data.length; i++) {
    const sheetRow = i + 1; // 1-based index dans la feuille
    const noOr = String(data[i][0] || "").trim();
    const chassis = String(data[i][2] || "").trim();

    const hasData = (noOr !== "" && noOr !== "-" && !noOr.startsWith("SHEET-")) ||
                    (chassis !== "" && chassis !== "-");

    if (hasData) {
      // Si un écart de plus de 3 lignes vides sépare cette ligne du bloc principal,
      // il s'agit d'une ligne orpheline isolée (ex: ligne 1001+ créée par l'ancien appendRow), on l'ignore.
      if (sheetRow - derniereLigneRemplie > 3 && derniereLigneRemplie > 10) {
        break;
      }
      derniereLigneRemplie = sheetRow;
    }
  }

  const ligneCible = derniereLigneRemplie + 1;

  // Si on dépasse le nombre de lignes max de la feuille, insérer une ligne
  if (ligneCible > sheet.getMaxRows()) {
    sheet.insertRowAfter(sheet.getMaxRows());
  }

  return ligneCible;
}

function normaliserEtatApp_(valeur) {
  const clean = String(valeur || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

  if (clean.includes("livr") || clean.includes("pret") || clean.includes("termin")) {
    return "Livré";
  }
  if (clean.includes("client")) {
    return "Attente client";
  }
  if (clean.includes("repar") || clean.includes("pdr")) {
    return "Attente réparation";
  }
  if (clean.includes("cours")) {
    return "En cours";
  }

  return valeur;
}

function reponseJsonp_(callback, result) {
  const safeCallback = String(callback || "callback").replace(/[^a-zA-Z0-9_$.]/g, "");

  return ContentService
    .createTextOutput(safeCallback + "(" + JSON.stringify(result) + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
