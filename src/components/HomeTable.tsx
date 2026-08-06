import recipeBook from "../assets/illustrations/recipe-book.png";
import pantryBasket from "../assets/illustrations/pantry-basket.png";
import menuCalendar from "../assets/illustrations/menu-calendar.png";
import statsNotebook from "../assets/illustrations/stats-notebook.png";
import shoppingListImg from "../assets/illustrations/shopping-list.png";
import tableBackground from "../assets/illustrations/table-background.png";
import "./HomeTable.css";

type Section = "carnet" | "pantry" | "menus" | "stats" | "shopping";

interface HomeTableProps {
  onSelect: (section: Section) => void;
  onLogout: () => void;
  notifPermission: NotificationPermission | "unsupported";
  onEnableNotifications: () => void;
}

const OBJECTS: { section: Section; title: string; image: string; className: string }[] = [
  { section: "carnet", title: "Carnet de recettes", image: recipeBook, className: "home-object--carnet" },
  { section: "pantry", title: "Garde-manger", image: pantryBasket, className: "home-object--pantry" },
  { section: "menus", title: "Menus", image: menuCalendar, className: "home-object--menus" },
  { section: "stats", title: "Statistiques", image: statsNotebook, className: "home-object--stats" },
  { section: "shopping", title: "Liste de courses", image: shoppingListImg, className: "home-object--shopping" },
];

export function HomeTable({ onSelect, onLogout, notifPermission, onEnableNotifications }: HomeTableProps) {
  return (
    <div className="home-table" style={{ backgroundImage: `url(${tableBackground})` }}>
      <div className="home-table__topbar">
        {notifPermission === "default" && (
          <button className="home-table__logout" onClick={onEnableNotifications}>
            🔔 Activer les notifications
          </button>
        )}
        <button className="home-table__logout" onClick={onLogout}>
          Se déconnecter
        </button>
      </div>
      <h1 className="home-table__title">Cooking Mamacita</h1>
      {OBJECTS.map(({ section, title, image, className }) => (
        <button key={section} className={`home-object ${className}`} onClick={() => onSelect(section)} aria-label={title}>
          <img src={image} alt={title} />
        </button>
      ))}
    </div>
  );
}
