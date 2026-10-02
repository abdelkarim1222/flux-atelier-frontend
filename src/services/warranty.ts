import type { Flux } from "../data/mockData";

type WarrantyVehicle = Partial<Flux> & {
  typeDossier?: unknown;
};

/** True only for the warranty Centre Service R10 workflow. */
export function isWarrantyVehicle(vehicle: WarrantyVehicle): boolean {
  const cs = String(vehicle.cs || "").trim().toUpperCase();
  return cs === "R10";
}

/** A completed workshop intervention, independently from the warranty-case status. */
export function isWorkshopFinished(vehicle: WarrantyVehicle): boolean {
  const avancement = String(vehicle.avancement || "").trim().toLowerCase();
  const etat = String(vehicle.etatIntervention || vehicle.statut || "").trim().toLowerCase();
  const percent = avancement.match(/(\d{1,3})\s*%/)?.[1];

  return (
    avancement.includes("termin") ||
    avancement.includes("fini") ||
    avancement === "100" ||
    avancement === "100%" ||
    Number(percent) === 100 ||
    etat.includes("attente client") ||
    etat.includes("termin") ||
    etat.includes("prêt") ||
    etat.includes("pret")
  );
}

/** Finished warranty work is handled exclusively from the warranty dashboard. */
export function isCompletedWarrantyVehicle(vehicle: WarrantyVehicle): boolean {
  return isWarrantyVehicle(vehicle) && isWorkshopFinished(vehicle);
}
