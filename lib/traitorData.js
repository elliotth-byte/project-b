export const isTraitor = (role) => role === "traitor-red" || role === "traitor-black";
export const factionLabel = (role) => role === "traitor-red" ? "Red" : role === "traitor-black" ? "Black" : "Faithful";
export const factionColor = (role) => role === "traitor-red" ? "#c45c3c" : role === "traitor-black" ? "#c9a84c" : "#7a9a5c";
export const roleDisplay = (role) => isTraitor(role) ? `Traitor (${factionLabel(role)})` : "Faithful";

export const STORAGE_KEY_TRAITOR_ROLES = "traitor-roles";
