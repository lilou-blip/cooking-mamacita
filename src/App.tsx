import { lazy, Suspense, useCallback, useEffect, useRef, useState, type TouchEvent } from "react";
import { useIsMobile } from "./lib/useIsMobile";
import {
  countRecipeMade,
  createPantryItem,
  deleteRecipe,
  getRecipeById,
  listProfiles,
  listRecipesWithTags,
  listStorageUnits,
  markRecipeMade,
  type Profile,
  type RecipeCard,
  type RecipeFull,
  type StorageUnit,
} from "./lib/db";
import { ensureSeedRecipe } from "./lib/seed";
import { recipeAccentColor } from "./lib/recipeAccent";
import { HomeTable } from "./components/HomeTable";
import { LoadingScreen } from "./components/LoadingScreen";
import { AiAssistant } from "./components/AiAssistant";
import type { RecipeDraft } from "./lib/ollama";
import { checkAndNotify, notificationPermission, requestNotificationPermission } from "./lib/notifications";

// Sections visitées occasionnellement : chargées à la demande plutôt que dans le bundle initial,
// pour que le premier écran (la table, presque toujours la première chose vue) s'affiche plus vite.
const PantryRoom = lazy(() => import("./components/PantryRoom").then((m) => ({ default: m.PantryRoom })));
const Menus = lazy(() => import("./components/Menus").then((m) => ({ default: m.Menus })));
const Stats = lazy(() => import("./components/Stats").then((m) => ({ default: m.Stats })));
const ShoppingLists = lazy(() => import("./components/ShoppingLists").then((m) => ({ default: m.ShoppingLists })));
const BatchCooking = lazy(() => import("./components/BatchCooking").then((m) => ({ default: m.BatchCooking })));
const BookSpread = lazy(() => import("./components/BookSpread").then((m) => ({ default: m.BookSpread })));
const TocPage = lazy(() => import("./components/TocPage").then((m) => ({ default: m.TocPage })));
const RecipePreviewPage = lazy(() => import("./components/RecipePreviewPage").then((m) => ({ default: m.RecipePreviewPage })));
const RecipeIngredientsPage = lazy(() =>
  import("./components/RecipeIngredientsPage").then((m) => ({ default: m.RecipeIngredientsPage })),
);
const RecipeStepsPage = lazy(() => import("./components/RecipeStepsPage").then((m) => ({ default: m.RecipeStepsPage })));
const RecipeForm = lazy(() => import("./components/RecipeForm").then((m) => ({ default: m.RecipeForm })));
const ImportRecipe = lazy(() => import("./components/ImportRecipe").then((m) => ({ default: m.ImportRecipe })));

type View = "toc" | "book" | "form" | "import";
type Section = "table" | "carnet" | "pantry" | "menus" | "stats" | "shopping" | "batch";
type TurnDirection = "next" | "prev";

const PAGE_TURN_MS = 220;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface AppProps {
  onLogout: () => void;
}

function App({ onLogout }: AppProps) {
  const [section, setSection] = useState<Section>("table");
  const [view, setView] = useState<View>("toc");
  const [recipes, setRecipes] = useState<RecipeCard[]>([]);
  const [selectedTocId, setSelectedTocId] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentRecipe, setCurrentRecipe] = useState<RecipeFull | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<RecipeFull | null>(null);
  const [importDraft, setImportDraft] = useState<RecipeDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [justMade, setJustMade] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [madeCount, setMadeCount] = useState(0);
  const [showMadeForm, setShowMadeForm] = useState(false);
  const [selectedMadeProfiles, setSelectedMadeProfiles] = useState<Set<number>>(new Set());
  const [storageUnits, setStorageUnits] = useState<StorageUnit[]>([]);
  const [leftoverPortions, setLeftoverPortions] = useState("");
  const [leftoverStorageUnitId, setLeftoverStorageUnitId] = useState<number | "">("");
  const [turning, setTurning] = useState<TurnDirection | null>(null);
  const [notifPermission, setNotifPermission] = useState(notificationPermission());
  const touchStartX = useRef<number | null>(null);
  const isMobile = useIsMobile();

  const refreshRecipes = useCallback(async () => {
    const list = await listRecipesWithTags();
    setRecipes(list);
    return list;
  }, []);

  async function handleEnableNotifications() {
    const permission = await requestNotificationPermission();
    setNotifPermission(permission);
    if (permission === "granted") checkAndNotify();
  }

  useEffect(() => {
    (async () => {
      try {
        await ensureSeedRecipe();
        await refreshRecipes();
        setProfiles(await listProfiles());
        setStorageUnits(await listStorageUnits());
        if (notificationPermission() === "granted") checkAndNotify();
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshRecipes]);

  async function openRecipeAt(index: number) {
    if (index < 0 || index >= recipes.length) return;
    const recipeId = recipes[index].id;
    setCurrentIndex(index);
    const [full, made] = await Promise.all([getRecipeById(recipeId), countRecipeMade(recipeId)]);
    setCurrentRecipe(full);
    setMadeCount(made);
    setSelectedTocId(recipeId);
    setShowMadeForm(false);
    setSelectedMadeProfiles(new Set());
  }

  async function openFromToc(id?: number) {
    const targetId = id ?? selectedTocId ?? recipes[0]?.id;
    if (targetId == null) return;
    const index = recipes.findIndex((r) => r.id === targetId);
    if (index === -1) return;

    setTurning("next");
    await delay(PAGE_TURN_MS);
    await openRecipeAt(index);
    setView("book");
    setTurning(null);
  }

  /** Ouverture directe sur mobile : pas de métaphore "tourner la page" à animer, on affiche juste la recette. */
  async function openMobile(id: number) {
    const index = recipes.findIndex((r) => r.id === id);
    if (index === -1) return;
    await openRecipeAt(index);
    setView("book");
  }

  async function closeToToc() {
    setTurning("prev");
    await delay(PAGE_TURN_MS);
    setView("toc");
    setTurning(null);
  }

  const goTo = useCallback(
    async (index: number) => {
      if (turning || index < 0 || index >= recipes.length || index === currentIndex) return;
      const direction: TurnDirection = index > currentIndex ? "next" : "prev";

      setTurning(direction);
      await delay(PAGE_TURN_MS);
      await openRecipeAt(index);
      setTurning(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recipes, currentIndex, turning],
  );

  function handleNext() {
    if (view === "toc") openFromToc();
    else if (view === "book") goTo(currentIndex + 1);
  }

  function handlePrev() {
    if (view !== "book") return;
    if (currentIndex <= 0) closeToToc();
    else goTo(currentIndex - 1);
  }

  useEffect(() => {
    if (section !== "carnet" || (view !== "book" && view !== "toc")) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "Escape") {
        if (view === "book") closeToToc();
        else setSection("table");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, view, currentIndex, recipes, turning]);

  function onTouchStart(e: TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: TouchEvent) {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 60) {
      if (dx < 0) handleNext();
      else handlePrev();
    }
    touchStartX.current = null;
  }

  async function handleCreated(id: number) {
    const list = await refreshRecipes();
    const index = list.findIndex((r) => r.id === id);
    setCurrentIndex(index === -1 ? 0 : index);
    const [full, made] = await Promise.all([getRecipeById(id), countRecipeMade(id)]);
    setCurrentRecipe(full);
    setMadeCount(made);
    setSelectedTocId(id);
    setEditingRecipe(null);
    setImportDraft(null);
    setView("book");
  }

  function handleAddNew() {
    setEditingRecipe(null);
    setImportDraft(null);
    setView("form");
  }

  function handleImportClick() {
    setView("import");
  }

  function handleDrafted(draft: RecipeDraft) {
    setEditingRecipe(null);
    setImportDraft(draft);
    setView("form");
  }

  function handleVideFrigoDraft(draft: RecipeDraft) {
    setEditingRecipe(null);
    setImportDraft(draft);
    setView("form");
    setSection("carnet");
  }

  function handleCancelForm() {
    if (editingRecipe) {
      setEditingRecipe(null);
      setView("book");
    } else {
      setImportDraft(null);
      setView("toc");
    }
  }

  function handleEdit() {
    if (!currentRecipe) return;
    setEditingRecipe(currentRecipe);
    setView("form");
  }

  function handleMarkMadeClick() {
    setLeftoverPortions("");
    setLeftoverStorageUnitId("");
    setShowMadeForm(true);
  }

  function toggleMadeProfile(id: number) {
    setSelectedMadeProfiles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirmMade(profileIds: number[]) {
    if (!currentRecipe) return;
    await markRecipeMade(currentRecipe.id, currentRecipe.servings, profileIds);

    const portions = Number(leftoverPortions);
    if (portions > 0) {
      await createPantryItem({
        ingredient_name: `Restes de ${currentRecipe.title}`,
        ingredient_category: "autre",
        quantity: portions,
        unit_abbreviation: null,
        storage_unit_id: leftoverStorageUnitId || null,
        recipe_id: currentRecipe.id,
        assignments: [],
      });
    }

    setMadeCount(await countRecipeMade(currentRecipe.id));
    setShowMadeForm(false);
    setSelectedMadeProfiles(new Set());
    setLeftoverPortions("");
    setLeftoverStorageUnitId("");
    setJustMade(true);
    setTimeout(() => setJustMade(false), 2000);
  }

  async function handleDelete() {
    if (!currentRecipe) return;
    if (!window.confirm(`Supprimer "${currentRecipe.title}" ? Cette action est irréversible.`)) return;
    await deleteRecipe(currentRecipe.id);
    await refreshRecipes();
    setCurrentRecipe(null);
    setSelectedTocId(null);
    setView("toc");
  }

  if (loading) return <LoadingScreen message="Ouverture du carnet..." />;
  if (error) return <p className="status-text status-text--error">Erreur: {error}</p>;

  function renderCarnet() {
    if (view === "import") {
      return <ImportRecipe onDrafted={handleDrafted} onCancel={() => setView("toc")} />;
    }

    if (view === "form") {
      return (
        <RecipeForm
          recipe={editingRecipe ?? undefined}
          draft={importDraft ?? undefined}
          onCreated={handleCreated}
          onCancel={handleCancelForm}
        />
      );
    }

    if (isMobile) {
      if (view === "book" && currentRecipe) {
        return (
          <div className="mobile-carnet">
            <button className="book-nav__back" onClick={() => setView("toc")}>
              ← Sommaire
            </button>
            <div className="mobile-book-page" key={currentRecipe.id}>
              <RecipeIngredientsPage recipe={currentRecipe} onEdit={handleEdit} onDelete={handleDelete} />
              <RecipeStepsPage
                recipe={currentRecipe}
                madeCount={madeCount}
                justMade={justMade}
                showMadeForm={showMadeForm}
                profiles={profiles}
                selectedMadeProfiles={selectedMadeProfiles}
                storageUnits={storageUnits}
                leftoverPortions={leftoverPortions}
                leftoverStorageUnitId={leftoverStorageUnitId}
                onMarkMadeClick={handleMarkMadeClick}
                onToggleMadeProfile={toggleMadeProfile}
                onLeftoverPortionsChange={setLeftoverPortions}
                onLeftoverStorageUnitIdChange={setLeftoverStorageUnitId}
                onConfirmMade={() => confirmMade(Array.from(selectedMadeProfiles))}
                onCancelMadeForm={() => setShowMadeForm(false)}
              />
            </div>
          </div>
        );
      }
      return (
        <div className="mobile-carnet">
          <button className="book-nav__back" onClick={() => setSection("table")}>
            ← Table
          </button>
          <div className="mobile-book-page">
            <TocPage
              recipes={recipes}
              selectedId={selectedTocId}
              onSelect={openMobile}
              onAddNew={handleAddNew}
              onImport={handleImportClick}
            />
          </div>
        </div>
      );
    }

    const selectedTocRecipe = recipes.find((r) => r.id === selectedTocId) ?? null;
    const spread =
      view === "book" && currentRecipe ? (
        <BookSpread
          accentColor={recipeAccentColor(currentRecipe)}
          turning={turning}
          left={<RecipeIngredientsPage key={currentRecipe.id} recipe={currentRecipe} onEdit={handleEdit} onDelete={handleDelete} />}
          right={
            <RecipeStepsPage
              recipe={currentRecipe}
              madeCount={madeCount}
              justMade={justMade}
              showMadeForm={showMadeForm}
              profiles={profiles}
              selectedMadeProfiles={selectedMadeProfiles}
              storageUnits={storageUnits}
              leftoverPortions={leftoverPortions}
              leftoverStorageUnitId={leftoverStorageUnitId}
              onMarkMadeClick={handleMarkMadeClick}
              onToggleMadeProfile={toggleMadeProfile}
              onLeftoverPortionsChange={setLeftoverPortions}
              onLeftoverStorageUnitIdChange={setLeftoverStorageUnitId}
              onConfirmMade={() => confirmMade(Array.from(selectedMadeProfiles))}
              onCancelMadeForm={() => setShowMadeForm(false)}
            />
          }
        />
      ) : (
        <BookSpread
          accentColor={selectedTocRecipe ? recipeAccentColor(selectedTocRecipe) : undefined}
          turning={turning}
          left={
            <TocPage
              recipes={recipes}
              selectedId={selectedTocId}
              onSelect={setSelectedTocId}
              onAddNew={handleAddNew}
              onImport={handleImportClick}
            />
          }
          right={<RecipePreviewPage recipe={selectedTocRecipe} onOpen={() => openFromToc()} />}
        />
      );

    return (
      <div className="book-nav">
        <div className="book-nav__toolbar">
          <button className="book-nav__back" onClick={() => setSection("table")}>
            ← Table
          </button>
        </div>

        <div className="book-nav__page" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <button
            className="book-nav__arrow book-nav__arrow--prev"
            onClick={handlePrev}
            disabled={view === "toc"}
            aria-label="Page précédente"
          >
            ‹
          </button>
          <div className="book-page-turn">{spread}</div>
          <button
            className="book-nav__arrow book-nav__arrow--next"
            onClick={handleNext}
            disabled={view === "toc" ? recipes.length === 0 : currentIndex >= recipes.length - 1}
            aria-label="Page suivante"
          >
            ›
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {section === "table" ? (
        <HomeTable
          onSelect={setSection}
          onLogout={onLogout}
          notifPermission={notifPermission}
          onEnableNotifications={handleEnableNotifications}
        />
      ) : section === "pantry" ? (
        <Suspense fallback={<LoadingScreen />}>
          <PantryRoom onBack={() => setSection("table")} onSuggestRecipe={handleVideFrigoDraft} />
        </Suspense>
      ) : section === "menus" ? (
        <Suspense fallback={<LoadingScreen />}>
          <Menus onBack={() => setSection("table")} />
        </Suspense>
      ) : section === "stats" ? (
        <Suspense fallback={<LoadingScreen />}>
          <Stats onBack={() => setSection("table")} />
        </Suspense>
      ) : section === "shopping" ? (
        <Suspense fallback={<LoadingScreen />}>
          <ShoppingLists onBack={() => setSection("table")} />
        </Suspense>
      ) : section === "batch" ? (
        <Suspense fallback={<LoadingScreen />}>
          <BatchCooking onBack={() => setSection("table")} onDone={() => setSection("pantry")} />
        </Suspense>
      ) : (
        <Suspense fallback={<LoadingScreen />}>{renderCarnet()}</Suspense>
      )}
      <AiAssistant
        section={section}
        currentRecipeTitle={section === "carnet" && view === "book" ? currentRecipe?.title : undefined}
      />
    </>
  );
}

export default App;
