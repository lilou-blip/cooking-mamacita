const modules = import.meta.glob<{ default: string }>("../assets/avatars/*.{png,jpg,jpeg,webp}", {
  eager: true,
});

export interface AvatarOption {
  slug: string;
  url: string;
}

const avatarsBySlug = new Map<string, string>();
for (const path in modules) {
  const fileName = path.split("/").pop() ?? "";
  const slug = fileName.replace(/\.[^.]+$/, "");
  avatarsBySlug.set(slug, modules[path].default);
}

/** Liste des avatars disponibles dans src/assets/avatars/, pour le sélecteur du formulaire de profil. */
export function listAvatarOptions(): AvatarOption[] {
  return Array.from(avatarsBySlug.entries())
    .map(([slug, url]) => ({ slug, url }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function getAvatarUrl(slug: string | null): string | undefined {
  return slug ? avatarsBySlug.get(slug) : undefined;
}
