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
    ]
}

/// Appelle l'API locale d'Ollama depuis Rust plutôt que le webview, pour éviter tout souci de CORS.
#[tauri::command]
async fn ollama_chat(system_prompt: String, user_message: String, model: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": model,
        "format": "json",
        "stream": false,
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![ollama_chat])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
