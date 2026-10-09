import type { Flux } from '../data/mockData';
import type { SuiviEntree } from './database';
import { calculateVehicleTimes, type VehicleTimeCalculation } from './timeTracking';
import { isCompletedWarrantyVehicle } from './warranty';

/**
 * Source unique des dossiers analysés par Chronométrie et Rendement.
 * Chaque dossier de réception est fusionné avec son flux avant le calcul des
 * attentes et du travail net. Ainsi les deux écrans affichent les mêmes temps.
 */
export function buildChronoTimeCalculations(
  vehicles: Flux[],
  suiviList: SuiviEntree[],
): VehicleTimeCalculation[] {
  const mapByOr = new Map<string, Flux>();
  const mapByChassis = new Map<string, Flux>();
  vehicles.forEach((vehicle) => {
    const noOr = String(vehicle.ordre || vehicle.no || '').trim().toUpperCase();
    const chassis = String(vehicle.chassis || '').trim().toUpperCase();
    if (noOr) mapByOr.set(noOr, vehicle);
    if (chassis) mapByChassis.set(chassis, vehicle);
  });

  const merged: Array<Record<string, unknown>> = [];
  const treatedKeys = new Set<string>();
  suiviList.forEach((entry) => {
    const noOr = String(entry.noOr || '').trim().toUpperCase();
    const chassis = String(entry.chassis || '').trim().toUpperCase();
    const flux = mapByOr.get(noOr) || mapByChassis.get(chassis);
    if (noOr) treatedKeys.add(noOr);
    if (chassis) treatedKeys.add(chassis);
    merged.push({
      ...flux,
      ...entry,
      noOr: entry.noOr || flux?.ordre || flux?.no || '-',
      chassis: entry.chassis || flux?.chassis || '-',
      immatriculation: entry.immatriculation || flux?.immatriculation || flux?.serie || '-',
      client: entry.nomClient || flux?.client || 'Client non spécifié',
      equipe: flux?.equipe || entry.equipe || 'Daily',
      etat: flux?.etatIntervention || flux?.statut || entry.etat || 'En attente',
      avancement: flux?.avancement || entry.avancement || '0%',
      dateEntreeHeure: entry.dateEntreeHeure || flux?.dateEntree,
      dateDebutRep: entry.dateDebutRep,
      dateFinRep: flux?.dateFinRep || entry.dateFinRep,
      dateModification: flux?.dateModification,
      dateDevis: flux?.dateDevis,
      dateDemande: flux?.dateDemande,
      dateReaffectation: flux?.dateReaffectation,
      dateDebutEssai: flux?.dateDebutEssai,
    });
  });

  vehicles.forEach((flux) => {
    const noOr = String(flux.ordre || flux.no || '').trim().toUpperCase();
    const chassis = String(flux.chassis || '').trim().toUpperCase();
    if ((noOr && treatedKeys.has(noOr)) || (chassis && treatedKeys.has(chassis))) return;
    merged.push({
      ...flux,
      noOr: flux.ordre || flux.no || '-',
      chassis: flux.chassis || '-',
      immatriculation: flux.immatriculation || flux.serie || '-',
      client: flux.client || 'Client non spécifié',
      equipe: flux.equipe || 'Daily',
      etat: flux.etatIntervention || flux.statut || 'En cours',
      avancement: flux.avancement || '0%',
      dateEntreeHeure: flux.dateEntree,
      dateFinRep: flux.dateFinRep,
      dateModification: flux.dateModification,
      dateDevis: flux.dateDevis,
      dateDemande: flux.dateDemande,
      dateReaffectation: flux.dateReaffectation,
      dateDebutEssai: flux.dateDebutEssai,
    });
  });

  return merged
    .filter((vehicle) => !isCompletedWarrantyVehicle(vehicle))
    .map((vehicle) => calculateVehicleTimes(vehicle));
}
