#!/usr/bin/env python3
"""Build a static page for every public City Edition, plus the all-cities
directory on /city-editions/ and the matching sitemap entries.

Input: city-editions/data/catalog.json — a snapshot of the live SideQuest
catalog (Supabase project qoxoutfmmmuzjneyvryi). To refresh it, export the
public City catalog (active, edition_kind = 'city', not visibility 'testing')
with each city's active packs and their `preview` JSON, then run:

    python3 scripts/build_city_pages.py

Pages are written to city-editions/<city-id>/index.html. Cities featured in
the carousel keep their hand-written copy on /city-editions/ and also get a
page here. Artwork is served from the app's public preview bucket.
"""
from __future__ import annotations

import html
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "city-editions" / "data" / "catalog.json"
INDEX = ROOT / "city-editions" / "index.html"
SITEMAP = ROOT / "sitemap.xml"
SITE = "https://tinysidequest.com"
APP_STORE = "https://apps.apple.com/us/app/sidequest-tiny-adventures/id6781441096"
PREVIEW_BASE = "https://qoxoutfmmmuzjneyvryi.supabase.co/storage/v1/object/public/sidequest-city-previews/"

COUNTRIES = {
    "AE": "United Arab Emirates", "AR": "Argentina", "AT": "Austria", "AU": "Australia", "BE": "Belgium",
    "BR": "Brazil", "CA": "Canada", "CH": "Switzerland", "CZ": "Czechia", "DE": "Germany", "DK": "Denmark",
    "ES": "Spain", "FI": "Finland", "FR": "France", "GB": "United Kingdom", "GR": "Greece", "HK": "Hong Kong",
    "HR": "Croatia", "HU": "Hungary", "IE": "Ireland", "IS": "Iceland", "IT": "Italy", "JP": "Japan",
    "KR": "South Korea", "MO": "Macau", "MX": "Mexico", "MY": "Malaysia", "NL": "Netherlands", "NO": "Norway",
    "NZ": "New Zealand", "PE": "Peru", "PL": "Poland", "PR": "Puerto Rico", "PT": "Portugal", "SE": "Sweden",
    "SG": "Singapore", "TH": "Thailand", "TR": "Türkiye", "TW": "Taiwan", "US": "USA", "VN": "Vietnam",
}

# US city -> state. Every US City Edition in the catalog must appear here.
US_STATES = {
    "albany-ny": "New York", "albuquerque": "New Mexico", "anaheim": "California", "anchorage": "Alaska",
    "asheville": "North Carolina", "athens-ga": "Georgia", "atlanta": "Georgia", "atlantic-city": "New Jersey",
    "austin": "Texas", "baltimore": "Maryland", "bar-harbor-me": "Maine", "boise": "Idaho",
    "boston": "Massachusetts", "boulder": "Colorado", "bozeman-mt": "Montana", "branson": "Missouri",
    "breckenridge-co": "Colorado", "burlington-vt": "Vermont", "charleston": "South Carolina",
    "charlotte": "North Carolina", "chattanooga": "Tennessee", "chicago": "Illinois", "cincinnati-oh": "Ohio",
    "clearwater": "Florida", "cleveland": "Ohio", "colorado-springs": "Colorado", "columbus": "Ohio",
    "corpus-christi": "Texas", "dallas": "Texas", "daytona-beach": "Florida", "denton-tx": "Texas",
    "denver": "Colorado", "destin": "Florida", "detroit": "Michigan", "durango-co": "Colorado",
    "el-paso": "Texas", "eugene-or": "Oregon", "flagstaff": "Arizona", "fort-collins-co": "Colorado",
    "fort-lauderdale": "Florida", "fort-myers": "Florida", "fort-worth": "Texas", "gainesville-fl": "Florida",
    "galveston": "Texas", "gatlinburg": "Tennessee", "gettysburg-pa": "Pennsylvania", "hilo": "Hawaii",
    "honolulu": "Hawaii", "houston": "Texas", "indianapolis": "Indiana", "jacksonville": "Florida",
    "juneau": "Alaska", "kailua-kona-hi": "Hawaii", "kansas-city-mo": "Missouri", "key-west": "Florida",
    "knoxville": "Tennessee", "laguna-beach-ca": "California", "las-vegas": "Nevada",
    "los-angeles": "California", "louisville-ky": "Kentucky", "lubbock-tx": "Texas", "madison": "Wisconsin",
    "memphis-tn": "Tennessee", "miami": "Florida", "milwaukee": "Wisconsin", "minneapolis": "Minnesota",
    "monterey": "California", "myrtle-beach": "South Carolina", "napa": "California", "naples-fl": "Florida",
    "nashville": "Tennessee", "new-haven": "Connecticut", "new-orleans": "Louisiana", "new-york": "New York",
    "newport-ri": "Rhode Island", "niagara-falls": "New York", "oklahoma-city": "Oklahoma",
    "orlando": "Florida", "palm-springs": "California", "panama-city-beach": "Florida",
    "pasadena-ca": "California", "pensacola": "Florida", "philadelphia": "Pennsylvania", "phoenix": "Arizona",
    "pigeon-forge-tn": "Tennessee", "pittsburgh-pa": "Pennsylvania", "pomona-ca": "California",
    "portland-me": "Maine", "portland-or": "Oregon", "portsmouth-nh": "New Hampshire",
    "providence": "Rhode Island", "raleigh": "North Carolina", "richmond": "Virginia",
    "rochester-ny": "New York", "sacramento": "California", "salem-ma": "Massachusetts",
    "salt-lake-city": "Utah", "san-antonio": "Texas", "san-diego": "California",
    "san-francisco": "California", "san-jose": "California", "san-luis-obispo": "California",
    "santa-barbara": "California", "santa-cruz": "California", "santa-fe": "New Mexico",
    "santa-monica": "California", "sarasota": "Florida", "savannah": "Georgia", "scottsdale-az": "Arizona",
    "seattle": "Washington", "sedona": "Arizona", "south-lake-tahoe-ca": "California", "spokane": "Washington",
    "springfield-mo": "Missouri", "st-augustine": "Florida", "st-louis": "Missouri",
    "st-petersburg-fl": "Florida", "tallahassee-fl": "Florida", "tampa": "Florida", "taos-nm": "New Mexico",
    "tempe-az": "Arizona", "tucson": "Arizona", "tulsa": "Oklahoma", "virginia-beach": "Virginia",
    "waco-tx": "Texas", "washington-dc": "District of Columbia", "west-palm-beach": "Florida",
    "long-beach": "California", "fresno": "California", "arlington-tx": "Texas", "lexington-ky": "Kentucky",
    "irvine-ca": "California", "durham-nc": "North Carolina", "riverside-ca": "California", "lincoln-ne": "Nebraska",
    "baton-rouge-la": "Louisiana", "reno-nv": "Nevada",
    "williamsburg-va": "Virginia", "wilmington-nc": "North Carolina", "winston-salem-nc": "North Carolina",
}

# City -> country code for everything outside the US.
NON_US = {
    "amsterdam": "NL", "antalya": "TR", "athens": "GR", "auckland": "NZ", "bangkok": "TH", "barcelona": "ES",
    "berlin": "DE", "bruges": "BE", "brussels": "BE", "budapest": "HU", "buenos-aires": "AR",
    "chiang-mai": "TH", "copenhagen": "DK", "da-nang": "VN", "dubai": "AE", "dublin": "IE",
    "dubrovnik": "HR", "edinburgh": "GB", "florence": "IT", "fukuoka": "JP", "george-town": "MY",
    "granada": "ES", "hanoi": "VN", "helsinki": "FI", "hiroshima": "JP", "ho-chi-minh-city": "VN",
    "hoi-an": "VN", "hong-kong": "HK", "istanbul": "TR", "krakow": "PL", "kuala-lumpur": "MY",
    "kyoto": "JP", "lima": "PE", "lisbon": "PT", "london": "GB", "lucerne": "CH", "macau": "MO",
    "madrid": "ES", "malaga": "ES", "melbourne": "AU", "mexico-city": "MX", "milan": "IT",
    "montreal": "CA", "munich": "DE", "naples": "IT", "nice": "FR", "osaka": "JP", "oslo": "NO",
    "palma": "ES", "paris": "FR", "pattaya": "TH", "phuket": "TH", "porto": "PT", "prague": "CZ",
    "queenstown": "NZ", "reykjavik": "IS", "rio-de-janeiro": "BR", "rome": "IT", "salzburg": "AT",
    "san-juan-pr": "PR", "seoul": "KR", "seville": "ES", "singapore": "SG", "stockholm": "SE",
    "sydney": "AU", "taipei": "TW", "tokyo": "JP", "valencia": "ES", "venice": "IT", "vienna": "AT", "warsaw": "PL",
    "zurich": "CH",
}

e = lambda s: html.escape(str(s), quote=True)
the = lambda country: f"the {country}" if country in ("USA", "United Kingdom", "Netherlands", "United Arab Emirates") else country
normal = lambda s: unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower().strip()


def display_name(city: dict) -> str:
    title = city["title"]
    if city["id"] == "washington-dc":
        return "Washington, DC"
    if city["id"] in US_STATES and "," in title:
        return title.split(",")[0].strip()
    return title


def pack_title(pack: dict) -> str:
    title = pack["title"]
    prefix = pack.get("city", "")
    if prefix and title.startswith(prefix + ": "):
        return title[len(prefix) + 2:]
    return title.split(": ", 1)[1] if ": " in title else title


def wide_cover(pack: dict, names: set[str]) -> str:
    url = pack.get("coverUrl") or ""
    big = url.replace("-400-q60.jpg", "-1600-q85.jpg")
    return big if big.replace(PREVIEW_BASE, "") in names else url


def sentence(text: str) -> str:
    text = text.strip()
    return text if text.endswith((".", "!", "?")) else text + "."


def load() -> tuple[list[dict], set[str]]:
    data = json.loads(DATA.read_text())
    cities, names = data["cities"], set(data["previewImages"])
    by_name: dict[str, list[dict]] = {}
    for city in cities:
        cid = city["id"]
        if cid in US_STATES:
            city["state"], city["country"] = US_STATES[cid], "USA"
            city["region"] = "Washington, DC, USA" if cid == "washington-dc" else f'{US_STATES[cid]}, USA'
        elif cid in NON_US:
            city["state"], city["country"] = None, COUNTRIES[NON_US[cid]]
            city["region"] = city["country"]
        else:
            raise SystemExit(f"No country or state for {cid}; add it to build_city_pages.py")
        city["name"] = display_name(city)
        live = {p["id"]: p for p in city["packs"] if p.get("live")}
        # Same rule as the app (sidequest_private.city_core_pack_ids): the scope-based
        # Citywide/Local pair, else the city's reviewed coverage pair.
        pair = [city.get("cw"), city.get("nb")]
        if not all(pid in live for pid in pair):
            pair = [city.get("coverageCw"), city.get("coverageLocal")]
        if not all(pid in live for pid in pair) or pair[0] == pair[1]:
            pair = [pid for pid in pair if pid in live] or list(live)[:1]
        core = [live[pid] for pid in pair]
        for index, pack in enumerate(core):
            pack["role"] = "Citywide" if index == 0 else "Local"
        city["core"], city["extra"] = core, [p for p in live.values() if p not in core]
        by_name.setdefault(city["name"], []).append(city)
    for same in by_name.values():
        for city in same:
            city["fullName"] = city["name"] if len(same) == 1 else f'{city["name"]}, {city["state"] or city["country"]}'
    return [c for c in cities if c["core"]], names


def role(pack: dict, index: int) -> str:
    if pack.get("role"):
        return pack["role"]
    scope = pack.get("scope") or pack.get("editionScope")
    if scope == "citywide":
        return "Citywide"
    if scope == "neighborhood":
        return "Local"
    return "Citywide" if index == 0 else "Local"


HEADER = ('<header class="site-header"><div class="header-inner"><a class="brand" href="/" aria-label="SideQuest home">'
          '<img src="/assets/wordmark.png" width="180" height="70" alt="SideQuest"></a><nav aria-label="Main navigation">'
          '<a href="/#how-it-works">How it works</a><a href="/#quest-worlds">Explore packs</a><a href="/blog/">Blog</a>'
          '<a href="/city-editions/" aria-current="page">City Editions</a><a class="contact-nav" href="/contact/">Contact</a>'
          '</nav></div></header>')
FOOTER = ('<footer class="footer"><div class="footer-inner"><p>© 2026 SideQuest. Tiny adventures. Real-life XP.</p>'
          '<nav aria-label="Footer"><a href="/contact/">Contact</a><a href="/support/">Support</a><a href="/privacy/">Privacy</a>'
          '<a href="/terms/">Terms</a><a href="/blog/">Blog</a></nav></div></footer>')


def pack_html(city: dict, pack: dict, label: str, names: set[str]) -> str:
    title = pack_title(pack)
    area = pack.get("neighborhood") or f'Across {city["name"]}'
    chips = "".join(f"<li>{e(v)}</li>" for v in (pack.get("valueLabels") or [])[1:])
    quests = "".join(
        f'<li class="cp-quest"><img src="{e(q["heroUrl"])}" alt="" width="120" height="80" loading="lazy" decoding="async">'
        f'<span><strong>{e(q["title"])}</strong><small>{e(q["subtitle"])}</small></span></li>'
        for q in (pack.get("previews") or [])[:3] if q.get("heroUrl"))
    quest_block = (f'<div class="cp-quests"><p class="cp-quests-label">A few quests from this pack</p><ul>{quests}</ul></div>'
                   if quests else "")
    return (f'<article class="pack-row cp-pack" id="{e(pack["id"])}"><div class="pack-art">'
            f'<img src="{e(wide_cover(pack, names))}" alt="{e(city["name"])} {e(title)} pack cover artwork" width="1600" height="1067" loading="lazy" decoding="async"></div>'
            f'<div class="pack-copy"><div class="pack-label"><span class="tag">{label}</span><span class="count">{pack["questCount"]} quests</span></div>'
            f'<h3>{e(title)}</h3><p class="cp-promise">{e(sentence(pack["promise"]))}</p><p>{e(sentence(pack["description"]))}</p>'
            f'<p class="area">{e(area)}</p>{f"<ul class=cp-chips>{chips}</ul>" if chips else ""}{quest_block}</div></article>')


def related(city: dict, cities: list[dict]) -> list[dict]:
    same = [c for c in cities if c is not city and c["country"] == city["country"]]
    if city["state"]:
        same.sort(key=lambda c: (c["state"] != city["state"], c["sort"], c["name"]))
    else:
        same.sort(key=lambda c: (c["sort"], c["name"]))
    if len(same) < 6:
        pool = [c for c in cities if c is not city and c not in same and c["id"] in FEATURED_FALLBACK]
        same += pool
    return same[:8]


FEATURED_FALLBACK = ["new-york", "london", "paris", "tokyo", "rome", "chicago", "san-francisco", "barcelona", "kyoto", "lisbon"]


def page(city: dict, cities: list[dict], names: set[str]) -> str:
    name, full = city["name"], city["fullName"]
    core, extra = city["core"], city["extra"]
    total = sum(p["questCount"] for p in core)
    portrait = next((p["portraitCoverUrl"] for p in core if p.get("portraitCoverUrl")), None)
    hero_img = portrait or wide_cover(core[0], names)
    hero_alt = next((p.get("coverAccessibilityLabel") for p in core if p.get("portraitCoverUrl")), None) or f"{name} City Edition cover artwork"
    titles = [pack_title(p) for p in core]
    local = core[1] if len(core) > 1 else None
    local_area = local.get("neighborhood") if local else None
    if len(core) > 1:
        lede = (f'{total} quests across {name} in two packs: <em>{e(titles[0])}</em> for the bigger picture, '
                f'and <em>{e(titles[1])}</em>{" for " + e(local_area) if local_area else ""}.')
    else:
        lede = f'{total} quests across {name} in <em>{e(titles[0])}</em>.'
    description = (f"Things to do in {full}: {total} small adventures in two SideQuest packs, "
                   f"{titles[0]}{' and ' + titles[1] if len(titles) > 1 else ''}. Riddles, creative challenges and details to find.")
    canonical = f"{SITE}/city-editions/{city['id']}/"
    packs = "".join(pack_html(city, p, role(p, i), names) for i, p in enumerate(core))
    extras = ""
    if extra:
        extras = (f'<section class="cp-section" aria-labelledby="more-packs"><h2 id="more-packs" class="cp-h2">More in {e(name)}</h2>'
                  + "".join(pack_html(city, p, "Extra pack", names) for p in extra) + "</section>")
    rel = related(city, cities)
    rel_label = (f'More City Editions in {the(city["country"])}' if rel and all(c["country"] == city["country"] for c in rel)
                 else "More City Editions to explore")
    rel_html = "".join(
        f'<li><a href="/city-editions/{c["id"]}/"><strong>{e(c["name"])}</strong><small>{e(c["region"])}</small></a></li>' for c in rel)
    ld = {
        "@context": "https://schema.org", "@type": "WebPage", "name": f"{full} City Edition", "description": description,
        "url": canonical, "inLanguage": "en",
        "about": {"@type": "City", "name": full},
        "breadcrumb": {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "City Editions", "item": f"{SITE}/city-editions/"},
            {"@type": "ListItem", "position": 2, "name": full, "item": canonical}]},
        "publisher": {"@type": "Organization", "name": "SideQuest", "url": f"{SITE}/"},
    }
    head = (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<meta name="robots" content="index,follow,max-image-preview:large"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#FFF9EC">'
            f'<title>{e(full)} City Edition: {total} Side Quests — SideQuest</title><meta name="description" content="{e(description)}">'
            f'<link rel="canonical" href="{canonical}"><meta property="og:type" content="website"><meta property="og:site_name" content="SideQuest">'
            f'<meta property="og:title" content="{e(full)} City Edition — SideQuest"><meta property="og:description" content="{e(description)}">'
            f'<meta property="og:url" content="{canonical}"><meta property="og:image" content="{e(wide_cover(core[0], names))}"><meta name="twitter:card" content="summary_large_image">'
            f'<link rel="icon" href="/favicon.ico"><link rel="stylesheet" href="/city-editions/cities.css"><link rel="stylesheet" href="/navigation.css">'
            f'<link rel="stylesheet" href="/city-editions/city-page.css"><link rel="preconnect" href="https://qoxoutfmmmuzjneyvryi.supabase.co">'
            f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script></head>')
    body = (f'<body><a class="skip" href="#main">Skip to content</a>{HEADER}<main id="main" class="cp">'
            f'<nav class="cp-crumbs" aria-label="Breadcrumb"><a href="/city-editions/">City Editions</a><span aria-hidden="true">/</span><span aria-current="page">{e(name)}</span></nav>'
            f'<section class="city-story cp-hero" aria-labelledby="city-title"><div class="city-story-copy">'
            f'<p class="eyebrow">City Edition · {e(city["region"])}</p><h1 id="city-title">{e(name)}</h1>'
            f'<p class="cp-lede">{lede}</p>'
            f'<p>Each quest gives you something to look for, an optional riddle to solve, or a small creative challenge that makes the place your own.</p>'
            f'<div class="cp-actions"><a class="city-app-link" href="{APP_STORE}">Get the {e(name)} City Edition <span aria-hidden="true">↗</span></a>'
            f'<a class="city-quest-link" href="#packs">See the packs <span aria-hidden="true">↓</span></a></div></div>'
            f'<aside class="city-included" aria-label="{e(name)} City Edition includes"><div class="city-included-copy">'
            f'<p class="city-total"><strong>{total}</strong> <span>quests across {e(name)}</span></p>'
            f'<p>{"Two complementary packs, included in one City Edition." if len(core) > 1 else "One pack, ready on your phone."}</p></div>'
            f'<div class="city-included-art"><img src="{e(hero_img)}" alt="{e(hero_alt)}" width="600" height="800" fetchpriority="high"></div></aside></section>'
            f'<section class="cp-section" id="packs" aria-labelledby="packs-title"><h2 id="packs-title" class="cp-h2">What’s in the {e(name)} City Edition</h2>{packs}</section>'
            f'{extras}'
            f'<section class="city-cta" aria-labelledby="city-cta-title"><div class="city-cta-art" aria-hidden="true">'
            + "".join(f'<img src="{e(wide_cover(p, names))}" alt="" width="720" height="480" loading="lazy">' for p in (core + core)[:2]) +
            f'</div><div class="city-cta-copy"><h3 id="city-cta-title">Your next {e(name)} story starts here.</h3>'
            f'<a class="city-app-link" href="{APP_STORE}">Download on the App Store <span aria-hidden="true">↗</span></a></div></section>'
            f'<section class="cp-section cp-related" aria-labelledby="related-title"><h2 id="related-title" class="cp-h2">{e(rel_label)}</h2>'
            f'<ul class="cp-city-list">{rel_html}</ul><a class="city-quest-link" href="/city-editions/#all-cities">See all {len(cities)} cities <span aria-hidden="true">→</span></a></section>'
            f'</main>{FOOTER}<script src="/site-analytics.js" defer></script></body></html>\n')
    return head + body


def directory(cities: list[dict]) -> tuple[str, str]:
    """Return (directory JSON for search, all-cities HTML) for /city-editions/."""
    entries = []
    for c in cities:
        terms = [c["title"], c["region"], c.get("state") or "", c["country"], *c.get("aliases", [])]
        entries.append({"id": c["id"], "name": c["name"], "region": c["region"],
                        "terms": normal(" ".join(t for t in terms if t))})
    entries.sort(key=lambda x: normal(x["name"]))
    us = sorted((c for c in cities if c["country"] == "USA"), key=lambda c: normal(c["name"]))
    world = sorted((c for c in cities if c["country"] != "USA"), key=lambda c: (normal(c["country"]), normal(c["name"])))
    li = lambda c, sub: f'<li><a href="/city-editions/{c["id"]}/">{e(c["name"])}<small>{e(sub)}</small></a></li>'
    html_out = (f'<section class="all-cities" id="all-cities" aria-labelledby="all-cities-title"><div class="all-cities-head">'
                f'<p class="eyebrow">Every City Edition</p><h2 id="all-cities-title">{len(cities)} cities and counting</h2>'
                f'<p>Every City Edition comes with two packs of small adventures. Pick a city to see what’s inside.</p></div>'
                f'<div class="all-cities-group"><h3>United States</h3><ul>{"".join(li(c, c["state"] if c["id"] != "washington-dc" else "DC") for c in us)}</ul></div>'
                f'<div class="all-cities-group"><h3>Around the world</h3><ul>{"".join(li(c, c["country"]) for c in world)}</ul></div></section>')
    return json.dumps(entries, ensure_ascii=False, separators=(",", ":")), html_out


def replace_between(text: str, start: str, end: str, inner: str) -> str:
    a, b = text.index(start) + len(start), text.index(end)
    return text[:a] + inner + text[b:]


def main() -> None:
    cities, names = load()
    for city in cities:
        out = ROOT / "city-editions" / city["id"] / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(page(city, cities, names))
    data_json, dir_html = directory(cities)
    index = INDEX.read_text()
    index = replace_between(index, '<script id="city-directory" type="application/json">', "</script><!--/city-directory-->", data_json)
    index = replace_between(index, "<!--all-cities-->", "<!--/all-cities-->", dir_html)
    INDEX.write_text(index)
    sitemap = SITEMAP.read_text()
    urls = "".join(f"\n  <url><loc>{SITE}/city-editions/{c['id']}/</loc></url>" for c in sorted(cities, key=lambda c: c["id"]))
    sitemap = re.sub(r"\n  <!--city-pages-->.*?<!--/city-pages-->", "", sitemap, flags=re.S)
    sitemap = sitemap.replace("</urlset>", f"  <!--city-pages-->{urls}\n  <!--/city-pages-->\n</urlset>")
    SITEMAP.write_text(sitemap)
    print(f"Built {len(cities)} city pages")


if __name__ == "__main__":
    main()
