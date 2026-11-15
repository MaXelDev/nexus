// Today's weather from Open-Meteo (free, no key).
use crate::config::WeatherCfg;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct Weather {
    temp: f64,
    code: u32,
    is_day: bool,
    min: f64,
    max: f64,
    rain: Option<u32>,
    place: String,
}

#[derive(Deserialize)]
struct Resp {
    current: Current,
    daily: Daily,
}
#[derive(Deserialize)]
struct Current {
    temperature_2m: f64,
    weather_code: u32,
    is_day: u8,
}
#[derive(Deserialize)]
struct Daily {
    temperature_2m_min: Vec<f64>,
    temperature_2m_max: Vec<f64>,
    precipitation_probability_max: Vec<Option<u32>>,
}

pub fn fetch(cfg: &WeatherCfg) -> Result<Weather, String> {
    let url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={}&longitude={}&current=temperature_2m,weather_code,is_day\
         &daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max&timezone=auto&forecast_days=1",
        cfg.latitude, cfg.longitude
    );
    let r: Resp = ureq::get(&url)
        .call()
        .and_then(|mut r| r.body_mut().read_json())
        .map_err(|e| format!("Open-Meteo : {e}"))?;
    let first = |v: &[f64]| v.first().copied().ok_or("Open-Meteo : réponse incomplète");
    Ok(Weather {
        temp: r.current.temperature_2m,
        code: r.current.weather_code,
        is_day: r.current.is_day == 1,
        min: first(&r.daily.temperature_2m_min)?,
        max: first(&r.daily.temperature_2m_max)?,
        rain: r.daily.precipitation_probability_max.first().copied().flatten(),
        place: cfg.place.clone(),
    })
}
