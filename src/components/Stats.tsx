import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  createProfile,
  deleteProfile,
  getConsumptionByCategory,
  getConsumptionByProfile,
  getTopMadeRecipes,
  listProfiles,
  updateProfile,
  type CategoryStat,
  type ProfileStat,
  type Profile,
  type TopRecipeStat,
} from "../lib/db";
import { INGREDIENT_CATEGORIES } from "../lib/constants";
import { getAvatarUrl } from "../lib/avatarIllustrations";
import { BarChart } from "./BarChart";
import { ProfileBar } from "./ProfileBar";
import "./Stats.css";

const CATEGORY_LABEL_BY_VALUE = Object.fromEntries(INGREDIENT_CATEGORIES.map((c) => [c.value, c.label]));

interface StatsProps {
  onBack: () => void;
}

export function Stats({ onBack }: StatsProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [topRecipes, setTopRecipes] = useState<TopRecipeStat[]>([]);
  const [byCategory, setByCategory] = useState<CategoryStat[]>([]);
  const [byProfile, setByProfile] = useState<ProfileStat[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (profileId: number | null) => {
    const [recipes, categories, profileStats] = await Promise.all([
      getTopMadeRecipes(5, profileId),
      getConsumptionByCategory(profileId),
      getConsumptionByProfile(),
    ]);
    setTopRecipes(recipes);
    setByCategory(categories);
    setByProfile(profileStats);
  }, []);

  useEffect(() => {
    (async () => {
      setProfiles(await listProfiles());
      await refresh(null);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function selectProfile(id: number | null) {
    setSelectedProfileId(id);
    setLoading(true);
    await refresh(id);
    setLoading(false);
  }

  async function handleAddProfile(name: string, color: string, avatar: string | null) {
    await createProfile({ name, color, avatar });
    setProfiles(await listProfiles());
  }

  async function handleUpdateProfile(id: number, name: string, color: string, avatar: string | null) {
    await updateProfile(id, { name, color, avatar });
    setProfiles(await listProfiles());
  }

  async function handleDeleteProfile(id: number) {
    await deleteProfile(id);
    setProfiles(await listProfiles());
    if (selectedProfileId === id) {
      await selectProfile(null);
    } else {
      await refresh(selectedProfileId);
    }
  }

  if (loading) return <p className="status-text">Chargement des statistiques...</p>;

  const hasAnyData = topRecipes.length > 0 || byCategory.length > 0 || byProfile.length > 0;

  return (
    <div className="stats">
      <button className="book-nav__back" onClick={onBack}>
        ← Table
      </button>
      <header className="pantry__header">
        <h1>Statistiques</h1>
      </header>

      <div className="stats__profiles">
        {profiles.length > 0 && (
          <button
            className={`stats__profile-filter${selectedProfileId === null ? " stats__profile-filter--active" : ""}`}
            onClick={() => selectProfile(null)}
            title="Tous"
          >
            {getAvatarUrl("ensemble") ? (
              <img className="stats__profile-avatar" src={getAvatarUrl("ensemble")} alt="Tous" />
            ) : (
              <span className="stats__profile-avatar stats__profile-avatar--all">Tous</span>
            )}
          </button>
        )}
        {profiles.map((p) => {
          const avatarUrl = getAvatarUrl(p.avatar);
          return (
            <button
              key={p.id}
              className={`stats__profile-filter${selectedProfileId === p.id ? " stats__profile-filter--active" : ""}`}
              onClick={() => selectProfile(p.id)}
              style={{ "--profile-color": p.color } as CSSProperties}
              title={p.name}
            >
              {avatarUrl ? (
                <img className="stats__profile-avatar" src={avatarUrl} alt={p.name} />
              ) : (
                <span className="stats__profile-avatar stats__profile-avatar--dot">{p.name.charAt(0).toUpperCase()}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="stats__manage-profiles">
        <ProfileBar
          profiles={profiles}
          onAdd={handleAddProfile}
          onUpdate={handleUpdateProfile}
          onDelete={handleDeleteProfile}
        />
      </div>

      {!hasAnyData ? (
        <p className="pantry__empty">
          Pas encore de données — marque des recettes comme "faites" et consomme des ingrédients du garde-manger
          pour voir tes statistiques ici.
        </p>
      ) : (
        <div className="stats__sections">
          <section className="stats__section">
            <h2>Recettes préférées</h2>
            {topRecipes.length > 0 ? (
              <BarChart items={topRecipes.map((r) => ({ label: r.title, value: r.count }))} />
            ) : (
              <p className="stats__empty">Aucune recette faite pour l'instant.</p>
            )}
          </section>

          <section className="stats__section">
            <h2>Répartition par catégorie</h2>
            {byCategory.length > 0 ? (
              <BarChart
                items={byCategory.map((c) => ({
                  label: CATEGORY_LABEL_BY_VALUE[c.category] ?? c.category,
                  value: c.count,
                }))}
              />
            ) : (
              <p className="stats__empty">Pas encore assez de données.</p>
            )}
          </section>

          {selectedProfileId === null && (
            <section className="stats__section">
              <h2>Par profil</h2>
              {byProfile.length > 0 ? (
                <BarChart
                  items={byProfile.map((p) => ({ label: p.profile_name, value: p.count, color: p.profile_color }))}
                />
              ) : (
                <p className="stats__empty">Associe des profils à tes consommations pour voir cette section.</p>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
