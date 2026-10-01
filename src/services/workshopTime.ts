/**
 * Horloge de référence de l'atelier.
 * Elle ne dépend pas du fuseau configuré sur le téléphone ou le PC : la même
 * date/heure est produite pour tous les utilisateurs à partir du fuseau du site.
 */
export const WORKSHOP_TIME_ZONE = import.meta.env.VITE_WORKSHOP_TIME_ZONE || "Africa/Tunis";

export function getWorkshopNow(): { dateTime: string; time: string } {
  const values = new Intl.DateTimeFormat("en-GB", {
    timeZone: WORKSHOP_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).reduce<Record<string, string>>((parts, part) => {
    if (part.type !== "literal") parts[part.type] = part.value;
    return parts;
  }, {});
  const time = `${values.hour}:${values.minute}:${values.second}`;
  return { dateTime: `${values.day}/${values.month}/${values.year} ${time}`, time };
}
