import csv
import json
import urllib.request
from io import StringIO
import signal

# Ignore BrokenPipeError when piping output
signal.signal(signal.SIGPIPE, signal.SIG_DFL)

AIRPORTS_URL = "https://raw.githubusercontent.com/komed3/airportmap-database/master/airport.csv"
FREQ_URL     = "https://raw.githubusercontent.com/komed3/airportmap-database/master/frequency.csv"
OUTPUT_JSON  = "airports_min.json"

VHF_MIN = 108.0
VHF_MAX = 137.0

def download_csv(url):
    with urllib.request.urlopen(url) as response:
        if response.status != 200:
            raise Exception(f"Failed to download {url}, status: {response.status}")
        data = response.read().decode("utf-8")
    return StringIO(data)

# --- Airports ---
airports_csv = download_csv(AIRPORTS_URL)
airports_reader = list(csv.DictReader(airports_csv, quotechar='"'))

airports = {}
for row in airports_reader:
    icao = row.get("ICAO")
    lat = row.get("lat")
    lon = row.get("lon")
    if icao and lat and lon:
        try:
            airports[icao] = {
                "c": icao,  # ICAO code (e.g., "CZBB", "KLAX")
                "l": [round(float(lat), 3), round(float(lon), 3)],  # location: [lat, lon] (3 decimal places ~111m/364ft precision)
                "f": []  # frequencies
            }
        except Exception:
            continue

# --- Frequencies ---
freq_csv = download_csv(FREQ_URL)
freq_reader = list(csv.DictReader(freq_csv, quotechar='"'))

for row in freq_reader:
    icao = row.get("airport")
    freq_raw = row.get("frequency")
    freq_type = row.get("type", "").strip()
    if icao in airports and freq_raw:
        try:
            f = float(freq_raw)
            if f > 500:
                f = f / 1000
            if VHF_MIN <= f <= VHF_MAX:
                freq_khz = int(round(f * 1000))
                # Store as object with type if type is available, otherwise as number for backward compatibility
                if freq_type:
                    freq_entry = {"f": freq_khz, "t": freq_type}  # f=frequency, t=type
                else:
                    freq_entry = freq_khz
                airports[icao]["f"].append(freq_entry)
        except ValueError:
            continue

# --- Deduplicate frequencies per airport ---
# Keep frequencies with types, prefer entries with types over plain numbers
for airport in airports.values():
    freq_dict = {}
    for freq in airport["f"]:
        if isinstance(freq, dict):
            freq_key = freq["f"]  # frequency key
            # Prefer entries with type information
            if freq_key not in freq_dict or not isinstance(freq_dict[freq_key], dict):
                freq_dict[freq_key] = freq
        else:
            freq_key = freq
            # Only add if we don't already have this frequency (with or without type)
            if freq_key not in freq_dict:
                freq_dict[freq_key] = freq
    
    # Convert to compact array format: [freq, type] instead of {"f": freq, "t": type}
    freq_list = sorted(freq_dict.values(), key=lambda x: x["f"] if isinstance(x, dict) else x)
    compact_freqs = []
    for freq in freq_list:
        if isinstance(freq, dict):
            # Map type code before converting to array
            freq_type = freq.get("t", "")
            if freq_type:
                # Apply type mapping
                TYPE_MAP = {
                    "CTAF": "C", "UNICOM": "U", "TOWER": "T", "GROUND": "G",
                    "APP": "A", "ATIS": "I", "DEP": "D", "MISC": "M",
                    "ASOW": "S", "FSS": "F", "RADIO": "R", "CLD": "L",
                    "INFO": "N", "AFIS": "Z", "A/G": "Y", "OPS": "O",
                    "RADAR": "X", "APRON": "P", "ATF": "H", "RCO": "Q",
                    "TRAFFIC": "V", "TMA": "W", "ASOS": "B", "PAL": "J",
                    "AAS": "K", "DIR": "E", "GCA": "Y", "A/A": "AA",
                    "FCC": "FC", "ACP": "AC", "TIBA": "TB", "A/D": "AD",
                    "ACC": "CC", "ARTC": "RT",
                }
                freq_type = TYPE_MAP.get(freq_type, freq_type)
            # Use array format: [frequency, type_code]
            compact_freqs.append([freq["f"], freq_type])
        else:
            # Legacy number format - keep as is
            compact_freqs.append(freq)
    
    airport["f"] = compact_freqs

# --- Keep only airports with frequencies ---
airport_list = [a for a in airports.values() if a["f"]]

# --- Save JSON (compact, no indentation) ---
with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
    json.dump(airport_list, f, separators=(',', ':'), ensure_ascii=False)

print(f"Wrote {len(airport_list)} airport entries to {OUTPUT_JSON}")
print(f"Type mapping: {len(TYPE_MAP)} types mapped to codes")

