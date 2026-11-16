// Hlášení, která GitHub Actions ukáže v přehledu běhu workflow, ne jen ve
// výpisu kroku: varování o výpadku API a důvod, proč se build zastavil.

/** Skript běží ve workflow GitHub Actions. */
export const inWorkflow = (env = process.env) => env.GITHUB_ACTIONS === 'true';

/** Zpráva musí být na jednom řádku, jinak by její další řádky runner četl jako příkazy workflow. */
const escapeMessage = (message) => message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');

/**
 * Řádek, který skript vypíše, aby se hlášení ukázalo v přehledu běhu.
 * @param {'warning' | 'error'} level
 * @param {string} title nadpis hlášení; bez čárky a dvojtečky
 * @param {string} message
 */
export const annotation = (level, title, message) => `::${level} title=${title}::${escapeMessage(message)}`;
