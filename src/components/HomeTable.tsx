import recipeBook from "../assets/illustrations/recipe-book.png";
import pantryBasket from "../assets/illustrations/pantry-basket.png";
import menuCalendar from "../assets/illustrations/menu-calendar.png";
import statsNotebook from "../assets/illustrations/stats-notebook.png";
import tableBackground from "../assets/illustrations/table-background.png";
import "./HomeTable.css";

type Section = "carnet" | "pantry" | "menus" | "stats";

interface HomeTableProps {
  onSelect: (section: Section) => void;
}

const OBJECTS: { section: Section; title: string; image: string; className: string }[] = [
  { section: "carnet", title: "Carnet de recettes", image: recipeBook, className: "home-object--carnet" },
  { section: "pantry", title: "Garde-manger", image: pantryBasket, className: "home-object--pantry" },
  { section: "menus", title: "Menus", image: menuCalendar, className: "home-object--menus" },
  { section: "stats", title: "Statistiques", image: statsNotebook, className: "home-object--stats" },
];

export function HomeTable({ onSelect }: HomeTableProps) {
  return (
    <div className="home-table" style={{ backgroundImage: `url(${tableBackground})` }}>
      <h1 className="home-table__title">Cooking Mamacita</h1>
      {OBJECTS.map(({ section, title, image, className }) => (
        <button key={section} className={`home-object ${className}`} onClick={() => onSelect(section)} aria-label={title}>
          <img src={image} alt={title} />
        </button>
      ))}
    </div>
  );
}
