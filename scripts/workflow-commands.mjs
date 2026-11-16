// Jak skripty mluví s GitHub Actions: hlášení, která se ukážou v přehledu běhu
// workflow (varování o výpadku API, důvod zastavení buildu), a výstup kroku,
// který si přečte další krok.

import { randomUUID } from 'node:crypto';

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

/**
 * Zápis výstupu kroku pro soubor GITHUB_OUTPUT. Hodnota smí mít víc řádků;
 * oddělovač je náhodný, aby ho text hodnoty nemohl ukončit předčasně.
 */
export const stepOutput = (name, value, delimiter = `konec-${randomUUID()}`) => `${name}<<${delimiter}\n${value}\n${delimiter}\n`;

/** Adresa právě běžícího workflow; mimo GitHub Actions `undefined`. */
export const runUrl = ({ GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env) =>
  GITHUB_RUN_ID ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` : undefined;
