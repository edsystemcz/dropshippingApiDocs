// Údaje odvozené z prostředí v environments.json (docs/adr/0004).

/** Označení prostředí ve výpisech skriptů: `prod` → `PROD`. */
export const environmentLabel = (slug) => slug.toUpperCase();

/** Označení jazykové verze prostředí ve výpisech skriptů: `cs PROD`. */
export const versionLabel = (language, slug) => `${language} ${environmentLabel(slug)}`;

/** Hodnoty zástupných symbolů, které se liší mezi prostředími. */
export const environmentValues = ({ slug, baseUrl, tokenUrl }) => ({ baseUrl, tokenUrl, envSlug: slug });
