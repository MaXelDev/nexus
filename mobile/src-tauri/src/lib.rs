// NEXUS Android backend. Step 5: nothing yet, the page runs on demo data.
// Step 6 adds the relay call (token kept here, never in the webview) and the Kotlin plugin.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running NEXUS");
}
