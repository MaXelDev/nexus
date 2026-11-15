// One HTTP client for every card. ureq has no timeout by default: a hung server (captive
// portal, dead Wi-Fi) would keep a card on "Chargement…" for minutes and pile up requests.
use std::sync::LazyLock;
use std::time::Duration;

pub static AGENT: LazyLock<ureq::Agent> =
    LazyLock::new(|| ureq::Agent::config_builder().timeout_global(Some(Duration::from_secs(15))).build().into());
