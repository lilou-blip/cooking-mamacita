const modules = import.meta.glob<{ default: string }>("../assets/storage/*.{png,jpg,jpeg,webp}", {
  eager: true,
});

export interface StorageIllustrationOption {
  slug: string;
  url: string;
}

const illustrationsBySlug = new Map<string, string>();
for (const path in modules) {
  const fileName = path.split("/").pop() ?? "";
  const slug = fileName.replace(/\.[^.]+$/, "");
  illustrationsBySlug.set(slug, modules[path].default);
}

/** Liste des illustrations de meubles disponibles dans src/assets/storage/, pour le sélecteur du formulaire. */
export function listStorageIllustrations(): StorageIllustrationOption[] {
  return Array.from(illustrationsBySlug.entries())
    .filter(([slug]) => !slug.endsWith("-ouvert"))
    .map(([slug, url]) => ({ slug, url }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function getStorageIllustration(slug: string | null): string | undefined {
  return slug ? illustrationsBySlug.get(slug) : undefined;
}

/** Illustration "meuble ouvert" utilisée comme fond de la page détail d'un meuble (ex: "frigo" -> "frigo-ouvert"). */
export function getStorageOpenBackground(slug: string | null): string | undefined {
  return slug ? illustrationsBySlug.get(`${slug}-ouvert`) : undefined;
}
