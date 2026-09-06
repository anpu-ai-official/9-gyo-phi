use base64::Engine;
use std::net::TcpStream;
use std::process::Command;
use std::time::Duration;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct VoiceInfo {
    pub name: String,
    pub lang: String,
    pub sample: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct AudioResult {
    pub audio_b64: String,
    pub duration: f64,
    pub sample_rate: u32,
}

fn is_server_alive(port: u16) -> bool {
    let addr = format!("127.0.0.1:{}", port);
    if let Ok(socket_addr) = addr.parse() {
        TcpStream::connect_timeout(&socket_addr, Duration::from_millis(150)).is_ok()
    } else {
        false
    }
}

#[tauri::command]
fn is_python_server_running(port: Option<u16>) -> bool {
    let p = port.unwrap_or(8765);
    is_server_alive(p)
}

fn collect_system_voices() -> Vec<VoiceInfo> {
    let mut voices = Vec::new();

    let default_mac_voices = vec![
        ("Samantha", "en_US", "Hello! My name is Samantha."),
        ("Daniel", "en_GB", "Hello! My name is Daniel."),
        ("Alex", "en_US", "Most people recognize me by my voice."),
        ("Karen", "en_AU", "G'day! My name is Karen."),
        ("Victoria", "en_US", "Isn't it a fine day to read?"),
        ("Fred", "en_US", "I sure like being inside this Macintosh."),
    ];

    if let Ok(output) = Command::new("/usr/bin/say").arg("-v").arg("?").output() {
        if let Ok(text) = String::from_utf8(output.stdout) {
            for line in text.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if let Some((left, sample)) = trimmed.split_once('#') {
                    let parts: Vec<&str> = left.split_whitespace().collect();
                    if parts.len() >= 2 {
                        let lang = parts.last().unwrap_or(&"").to_string();
                        let name = parts[..parts.len() - 1].join(" ");
                        voices.push(VoiceInfo {
                            name,
                            lang,
                            sample: sample.trim().to_string(),
                        });
                    }
                }
            }
        }
    }

    if voices.is_empty() {
        for (name, lang, sample) in default_mac_voices {
            voices.push(VoiceInfo {
                name: name.to_string(),
                lang: lang.to_string(),
                sample: sample.to_string(),
            });
        }
    }

    voices
}

fn generate_native_speech(
    text: String,
    voice: Option<String>,
    rate: Option<u32>,
) -> Result<AudioResult, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("Text cannot be empty".to_string());
    }

    if text.chars().count() > 100_000 {
        return Err("Text must be under 100,000 characters".to_string());
    }
    if rate.is_some_and(|r| !(80..=450).contains(&r)) {
        return Err("Speech rate must be between 80 and 450 words per minute".to_string());
    }
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temp_file = std::env::temp_dir().join(format!("9_gyo_phi_{}.wav", timestamp));

    let mut cmd = Command::new("/usr/bin/say");
    if let Some(v) = &voice {
        if !v.is_empty()
            && v != "default"
            && !v.starts_with("af_")
            && !v.starts_with("am_")
            && !v.starts_with("bf_")
            && !v.starts_with("bm_")
        {
            cmd.arg("-v").arg(v);
        }
    }
    if let Some(r) = rate {
        cmd.arg("-r").arg(r.to_string());
    }
    cmd.arg("-o").arg(&temp_file);
    cmd.arg("--data-format=LEI16@24000");
    cmd.arg("--").arg(trimmed);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run say command: {}", e))?;

    if !output.status.success() {
        let _ = std::fs::remove_file(&temp_file);
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Speech synthesis failed: {}", err_msg));
    }

    let wav_bytes =
        std::fs::read(&temp_file).map_err(|e| format!("Failed to read generated wav: {}", e))?;
    let _ = std::fs::remove_file(&temp_file);

    let pcm_bytes = if wav_bytes.len() > 44 {
        wav_bytes.len() - 44
    } else {
        0
    };
    let duration = (pcm_bytes as f64) / 48000.0;
    let audio_b64 = base64::engine::general_purpose::STANDARD.encode(&wav_bytes);

    Ok(AudioResult {
        audio_b64,
        duration: (duration * 1000.0).round() / 1000.0,
        sample_rate: 24000,
    })
}

#[tauri::command]
async fn get_system_voices() -> Result<Vec<VoiceInfo>, String> {
    tauri::async_runtime::spawn_blocking(collect_system_voices)
        .await
        .map_err(|e| format!("Voice discovery failed: {}", e))
}

#[tauri::command]
async fn synthesize_native_speech(
    text: String,
    voice: Option<String>,
    rate: Option<u32>,
) -> Result<AudioResult, String> {
    tauri::async_runtime::spawn_blocking(move || generate_native_speech(text, voice, rate))
        .await
        .map_err(|e| format!("Speech task failed: {}", e))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_system_voices,
            synthesize_native_speech,
            is_python_server_running
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
