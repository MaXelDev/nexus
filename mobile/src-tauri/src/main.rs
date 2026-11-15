// Desktop entry, only for `tauri dev` on the PC; Android starts from lib.rs.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    nexus_mobile_lib::run()
}
