use futures_util::StreamExt;
use tauri_plugin_sql::{Migration, MigrationKind};

const DB_URL: &str = "sqlite:cooking-mamacita.db";

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_initial_schema",
            sql: include_str!("../migrations/0001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "enhancements",
            sql: include_str!("../migrations/0002_enhancements.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "pantry_consumption_log",
            sql: include_str!("../migrations/0003_pantry_consumption.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "weekly_menu",
            sql: include_str!("../migrations/0004_weekly_menu.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "pantry_location",
            sql: include_str!("../migrations/0005_pantry_location.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "storage_units",
            sql: include_str!("../migrations/0006_storage_units.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "etagere_unit",
            sql: include_str!("../migrations/0007_etagere_unit.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "profile_avatar",
            sql: include_str!("../migrations/0008_profile_avatar.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "backfill_avatars",
            sql: include_str!("../migrations/0009_backfill_avatars.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "shopping_suggestions",
            sql: include_str!("../migrations/0010_shopping_suggestions.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "profile_dietary_notes",
            sql: include_str!("../migrations/0011_profile_dietary_notes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "waste_avoided_log",
            sql: include_str!("../migrations/0012_waste_avoided_log.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "missing_indexes",
            sql: include_str!("../migrations/0013_missing_indexes.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

/// Appelle l'API locale d'Ollama depuis Rust plutôt que le webview, pour éviter tout souci de CORS.
/// `num_predict` borne le nombre de tokens générés : sans borne, un petit modèle en mode JSON peut
/// parfois partir dans des répétitions et mettre beaucoup plus de temps que nécessaire à répondre.
/// `keep_alive` garde le modèle chargé en mémoire entre deux appels pour éviter un rechargement à chaque fois.
#[tauri::command]
async fn ollama_chat(
    system_prompt: String,
    user_message: String,
    model: String,
    num_predict: Option<i32>,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": model,
        "format": "json",
        "stream": false,
        "keep_alive": "30m",
        "options": {
            "num_predict": num_predict.unwrap_or(400),
            "temperature": 0.6
        },
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]
    });

    let res = client
        .post("http://localhost:11434/api/chat")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Impossible de contacter Ollama (est-il lancé ?) : {e}"))?;

    if !res.status().is_success() {
        return Err(format!("Ollama a répondu avec le statut {}", res.status()));
    }

    let data: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    data.get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .map(String::from)
        .ok_or_else(|| "Réponse Ollama invalide".to_string())
}

/// Retire les balises `<script>`/`<style>` (contenu inclus) et toutes les autres balises HTML d'une page,
/// en insérant un saut de ligne aux séparations de blocs pour garder une structure lisible par l'IA.
fn strip_html(html: &str) -> String {
    let mut out = String::with_capacity(html.len() / 2);
    let mut rest = html;
    let mut skipping: Option<&'static str> = None;

    while let Some(lt) = rest.find('<') {
        let text = &rest[..lt];
        if skipping.is_none() && !text.trim().is_empty() {
            out.push_str(text);
            out.push(' ');
        }
        let after_lt = &rest[lt + 1..];
        let Some(gt) = after_lt.find('>') else { break };
        let tag_content = &after_lt[..gt];
        let tag_lower = tag_content.to_lowercase();
        let is_closing = tag_lower.starts_with('/');
        let name_part = tag_lower.trim_start_matches('/');
        let tag_name: String = name_part.chars().take_while(|c| c.is_alphanumeric()).collect();

        if let Some(skip_tag) = skipping {
            if is_closing && tag_name == skip_tag {
                skipping = None;
            }
        } else if !is_closing && (tag_name == "script" || tag_name == "style") {
            skipping = Some(if tag_name == "script" { "script" } else { "style" });
        } else if matches!(tag_name.as_str(), "p" | "br" | "div" | "li" | "tr" | "h1" | "h2" | "h3" | "h4" | "h5") {
            out.push('\n');
        }

        rest = &after_lt[gt + 1..];
    }
    if skipping.is_none() {
        out.push_str(rest);
    }
    out
}

fn decode_entities(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&nbsp;", " ")
}

fn normalize_whitespace(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut last_char: Option<char> = None;
    for c in s.chars() {
        if c == '\n' {
            if last_char != Some('\n') {
                out.push('\n');
                last_char = Some('\n');
            }
        } else if c.is_whitespace() {
            if last_char != Some(' ') && last_char != Some('\n') {
                out.push(' ');
                last_char = Some(' ');
            }
        } else {
            out.push(c);
            last_char = Some(c);
        }
    }
    out.trim().to_string()
}

/// On n'a besoin que de 15 000 caractères de texte visible en sortie : largement assez de HTML brut
/// pour les extraire, même sur une page dense. Au-delà, on arrête de lire plutôt que de charger
/// une page (ou un flux sans fin) entière en mémoire.
const MAX_FETCH_BYTES: usize = 2_000_000;

/// Récupère une page web et en extrait le texte brut (balises retirées), pour l'import de recette par URL.
/// Lit le corps en streaming avec un plafond dur (`MAX_FETCH_BYTES`) plutôt que via `res.text()`,
/// pour ne pas dépendre du Content-Length (absent ou mensonger) ni charger une page géante en mémoire.
#[tauri::command]
async fn fetch_recipe_text(url: String) -> Result<String, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("L'URL doit commencer par http:// ou https://".to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (compatible; CookingMamacita/1.0)")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Impossible de récupérer la page : {e}"))?;

    if !res.status().is_success() {
        return Err(format!("La page a répondu avec le statut {}", res.status()));
    }

    let mut buf: Vec<u8> = Vec::new();
    let mut stream = res.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Erreur de lecture de la page : {e}"))?;
        buf.extend_from_slice(&chunk);
        if buf.len() >= MAX_FETCH_BYTES {
            break;
        }
    }

    let html = String::from_utf8_lossy(&buf);
    let normalized = normalize_whitespace(&decode_entities(&strip_html(&html)));
    let truncated: String = normalized.chars().take(15_000).collect();

    if truncated.trim().is_empty() {
        return Err("Aucun texte exploitable n'a été trouvé sur cette page.".to_string());
    }
    Ok(truncated)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![ollama_chat, fetch_recipe_text])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
