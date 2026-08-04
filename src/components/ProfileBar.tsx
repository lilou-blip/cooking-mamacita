import { useState, type CSSProperties, type FormEvent } from "react";
import type { Profile } from "../lib/db";
import { getAvatarUrl, listAvatarOptions } from "../lib/avatarIllustrations";
import "./ProfileBar.css";

interface ProfileBarProps {
  profiles: Profile[];
  onAdd: (name: string, color: string, avatar: string | null) => Promise<void> | void;
  onUpdate?: (id: number, name: string, color: string, avatar: string | null) => Promise<void> | void;
  onDelete?: (id: number) => Promise<void> | void;
  showChips?: boolean;
}

const DEFAULT_COLOR = "#c0392b";

type Mode = { kind: "none" } | { kind: "add" } | { kind: "edit"; id: number };

export function ProfileBar({ profiles, onAdd, onUpdate, onDelete, showChips = true }: ProfileBarProps) {
  const [mode, setMode] = useState<Mode>({ kind: "none" });
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [avatar, setAvatar] = useState<string | null>(null);
  const avatarOptions = listAvatarOptions();

  function startAdd() {
    setName("");
    setColor(DEFAULT_COLOR);
    setAvatar(null);
    setMode({ kind: "add" });
  }

  function startEdit(p: Profile) {
    setName(p.name);
    setColor(p.color);
    setAvatar(p.avatar);
    setMode({ kind: "edit", id: p.id });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (mode.kind === "edit") {
      await onUpdate?.(mode.id, name.trim(), color, avatar);
    } else {
      await onAdd(name.trim(), color, avatar);
    }
    setMode({ kind: "none" });
  }

  async function handleDelete() {
    if (mode.kind !== "edit") return;
    if (!window.confirm("Supprimer ce profil ? Ses assignations et associations seront retirées.")) return;
    await onDelete?.(mode.id);
    setMode({ kind: "none" });
  }

  return (
    <div className="profile-bar">
      {showChips &&
        profiles.map((p) => {
          const avatarUrl = getAvatarUrl(p.avatar);
          return (
            <button
              type="button"
              key={p.id}
              className="profile-chip"
              style={{ "--profile-color": p.color } as CSSProperties}
              onClick={() => (onUpdate ? startEdit(p) : undefined)}
            >
              {avatarUrl ? (
                <img className="profile-chip__avatar" src={avatarUrl} alt="" />
              ) : (
                <span className="profile-chip__dot" />
              )}
              {p.name}
            </button>
          );
        })}

      {mode.kind !== "none" ? (
        <form className="profile-bar__form" onSubmit={handleSubmit}>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="profile-bar__color"
            aria-label="Couleur du profil"
          />
          <input
            autoFocus
            placeholder="Prénom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="profile-bar__name"
          />
          {avatarOptions.length > 0 && (
            <div className="profile-bar__avatars">
              <button
                type="button"
                className={`profile-bar__avatar-option${avatar === null ? " profile-bar__avatar-option--selected" : ""}`}
                onClick={() => setAvatar(null)}
                aria-label="Aucun avatar"
              >
                ×
              </button>
              {avatarOptions.map((opt) => (
                <button
                  type="button"
                  key={opt.slug}
                  className={`profile-bar__avatar-option${avatar === opt.slug ? " profile-bar__avatar-option--selected" : ""}`}
                  onClick={() => setAvatar(opt.slug)}
                  aria-label={opt.slug}
                >
                  <img src={opt.url} alt="" />
                </button>
              ))}
            </div>
          )}
          <button type="submit" className="profile-bar__ok">
            OK
          </button>
          {mode.kind === "edit" && onDelete && (
            <button type="button" className="profile-bar__delete" onClick={handleDelete}>
              Supprimer
            </button>
          )}
          <button
            type="button"
            className="profile-bar__cancel"
            onClick={() => setMode({ kind: "none" })}
            aria-label="Annuler"
          >
            ×
          </button>
        </form>
      ) : (
        <button className="profile-bar__add" onClick={startAdd}>
          + Profil
        </button>
      )}
    </div>
  );
}
