import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  createProfile,
  deleteProfile,
  getConsumptionByCategory,
  getConsumptionByProfile,
  getShoppingBudgetTrend,
  getTopMadeRecipes,
  getWasteAvoidedItems,
  listProfiles,
  updateProfile,
  type CategoryStat,
  type ProfileStat,
  type Profile,
  type ShoppingBudgetPoint,
  type TopRecipeStat,
  type WasteAvoidedItem,
} from "../lib/db";
import { estimatePriceRange } from "../lib/ollama";
import { INGREDIENT_CATEGORIES } from "../lib/constants";
import { guidelineForAge } from "../lib/nutritionGuidelines";
import { getAvatarUrl } from "../lib/avatarIllustrations";
import { BarChart } from "./BarChart";
import { ProfileBar } from "./ProfileBar";
import { LoadingScreen } from "./LoadingScreen";
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
  const [wasteItems, setWasteItems] = useState<WasteAvoidedItem[]>([]);
  const [budgetTrend, setBudgetTrend] = useState<ShoppingBudgetPoint[]>([]);
  const [wasteValue, setWasteValue] = useState<number | null>(null);
  const [estimatingWaste, setEstimatingWaste] = useState(false);
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
      setWasteItems(await getWasteAvoidedItems());
      setBudgetTrend(await getShoppingBudgetTrend());
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleEstimateWasteValue() {
    if (wasteItems.length === 0) return;
    setEstimatingWaste(true);
    try {
      const grouped = new Map<string, { name: string; quantity: number; unit: string | null }>();
      for (const item of wasteItems) {
        const key = `${item.ingredient_name.toLowerCase()}:${item.unit_abbreviation ?? ""}`;
        const existing = grouped.get(key);
        if (existing) existing.quantity += item.quantity;
        else grouped.set(key, { name: item.ingredient_name, quantity: item.quantity, unit: item.unit_abbreviation });
      }
      let total = 0;
      for (const g of grouped.values()) {
        const range = await estimatePriceRange(g.name, g.quantity, g.unit);
        total += (range.low + range.high) / 2;
      }
      setWasteValue(Math.round(total * 100) / 100);
    } finally {
      setEstimatingWaste(false);
    }
  }

  async function selectProfile(id: number | null) {
    setSelectedProfileId(id);
    setLoading(true);
    await refresh(id);
    setLoading(false);
  }

  async function handleAddProfile(
    name: string,
    color: string,
    avatar: string | null,
    dietaryNotes: string | null,
    age: number | null,
    isGuest: boolean,
  ) {
    await createProfile({ name, color, avatar, dietary_notes: dietaryNotes, age, is_guest: isGuest });
    setProfiles(await listProfiles());
  }

  async function handleUpdateProfile(
    id: number,
    name: string,
    color: string,
    avatar: string | null,
    dietaryNotes: string | null,
    age: number | null,
    isGuest: boolean,
  ) {
    await updateProfile(id, { name, color, avatar, dietary_notes: dietaryNotes, age, is_guest: isGuest });
    setProfiles(await listProfiles());
    await refresh(selectedProfileId);
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

  if (loading) return <LoadingScreen message="Calcul des statistiques..." />;

  const hasAnyData =
    topRecipes.length > 0 || byCategory.length > 0 || byProfile.length > 0 || wasteItems.length > 0 || budgetTrend.length > 0;

  const selectedProfile = selectedProfileId != null ? profiles.find((p) => p.id === selectedProfileId) : null;
  const selectedGuideline = selectedProfile?.age != null ? guidelineForAge(selectedProfile.age) : null;

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

          {selectedGuideline && (
            <section className="stats__section">
              <h2>Repères nutrition — {selectedGuideline.label}</h2>
              <p className="stats__guideline-disclaimer">
                Indications générales grand public (type PNNS/"Manger Bouger"), pas un avis médical personnalisé —
                à comparer à l'oeil avec la répartition par catégorie ci-dessus, pas un calcul exact.
              </p>
              <ul className="stats__guideline-list">
                {selectedGuideline.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </section>
          )}

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

          <section className="stats__section">
            <h2>Anti-gaspillage</h2>
            {wasteItems.length > 0 ? (
              <>
                <p className="stats__waste-count">
                  <strong>{wasteItems.length}</strong> aliment(s) sauvé(s) du gaspillage (consommés proches de la
                  péremption ou déjà périmés).
                </p>
                {wasteValue != null ? (
                  <p className="stats__waste-value">≈ {wasteValue.toFixed(2)} € de nourriture évitée du gaspillage</p>
                ) : (
                  <button
                    type="button"
                    className="stats__estimate-waste"
                    onClick={handleEstimateWasteValue}
                    disabled={estimatingWaste}
                  >
                    {estimatingWaste ? "Estimation..." : "💰 Estimer la valeur"}
                  </button>
                )}
              </>
            ) : (
              <p className="stats__empty">
                Pas encore de données — consomme des aliments proches de la péremption pour voir cette section évoluer.
              </p>
            )}
          </section>

          <section className="stats__section">
            <h2>Budget courses</h2>
            {budgetTrend.length > 0 ? (
              <BarChart
                items={budgetTrend.slice(-8).map((b) => ({
                  label: new Date(b.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
                  value: Math.round(b.total_price * 100) / 100,
                }))}
              />
            ) : (
              <p className="stats__empty">Pas encore de listes de courses avec des prix estimés.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
