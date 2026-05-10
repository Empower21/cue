//! User config persisted to ~/.cue/config.toml (or %APPDATA%\cue\config.toml).

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct Config {
    pub deepgram_api_key: Option<String>,
    pub anthropic_override_key: Option<String>,
    pub mode: Option<String>,
    /// User-pasted JD text (pinned in Anthropic prompt cache).
    pub job_description: Option<String>,
    /// User-pasted resume text.
    pub resume: Option<String>,
    /// User-pasted role/seniority/company context.
    pub role_context: Option<String>,
}

pub fn config_path() -> anyhow::Result<PathBuf> {
    let dir = dirs::config_dir()
        .ok_or_else(|| anyhow::anyhow!("could not resolve config dir"))?
        .join("cue");
    Ok(dir.join("config.toml"))
}

pub fn load() -> anyhow::Result<Config> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(Config::default());
    }
    let text = std::fs::read_to_string(&path)?;
    Ok(toml::from_str(&text)?)
}

pub fn save(config: &Config) -> anyhow::Result<()> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let text = toml::to_string_pretty(config)?;
    std::fs::write(&path, text)?;
    Ok(())
}
