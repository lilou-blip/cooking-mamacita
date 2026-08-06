import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";
import {
  countRecipeMade,
  deleteRecipe,
  getRecipeById,
  listProfiles,
  listRecipesWithTags,
  markRecipeMade,
  type Profile,
  type RecipeCard,
  type RecipeFull,
} from "./lib/db";
import { ensureSeedRecipe } from "./lib/seed";
import { recipeAccentColor } from "./lib/recipeAccent";
import { BookSpread } from "./components/BookSpread";
import { TocPage } from "./components/TocPage";
import { RecipePreviewPage } from "./components/RecipePreviewPage";
import { RecipeIngredientsPage } from "./components/RecipeIngredientsPage";
import { RecipeStepsPage } from "./components/RecipeStepsPage";
import { RecipeForm } from "./components/RecipeForm";
import { PantryRoom } from "./components/PantryRoom";
import { Menus } from "./components/Menus";
import { Stats } from "./components/Stats";
import { HomeTable } from "./components/HomeTable";
import { ImportRecipe } from "./components/ImportRecipe";
import { AiAssistant } from "./components/AiAssistant";
import { ShoppingLists } from "./components/ShoppingLists";
import type { RecipeDraft } from "./lib/ollama";
import { checkAndNotify, notificationPermission, requestNotificationPermission } from "./lib/notifications";

type View = "toc" | "book" | "form" | "import";
type Section = "table" | "carnet" | "pantry" | "menus" | "stats" | "shopping";
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
  const [turning, setTurning] = useState<TurnDirection | null>(null);
  const [notifPermission, setNotifPermission] = useState(notificationPermission());
  const touchStartX = useRef<number | null>(null);

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
    if (profiles.length === 0) {
      confirmMade([]);
      return;
    }
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
    setMadeCount(await countRecipeMade(currentRecipe.id));
    setShowMadeForm(false);
    setSelectedMadeProfiles(new Set());
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

  if (loading) return <p className="status-text">Chargement du carnet...</p>;
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
              onMarkMadeClick={handleMarkMadeClick}
              onToggleMadeProfile={toggleMadeProfile}
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
        <PantryRoom onBack={() => setSection("table")} onSuggestRecipe={handleVideFrigoDraft} />
      ) : section === "menus" ? (
        <Menus onBack={() => setSection("table")} />
      ) : section === "stats" ? (
        <Stats onBack={() => setSection("table")} />
      ) : section === "shopping" ? (
        <ShoppingLists onBack={() => setSection("table")} />
      ) : (
        renderCarnet()
      )}
      <AiAssistant
        section={section}
        currentRecipeTitle={section === "carnet" && view === "book" ? currentRecipe?.title : undefined}
      />
    </>
  );
}

export default App;
