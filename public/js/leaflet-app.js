/* Leaflet build.
 *
 * The list, the detail view and the interaction between them are written here
 * rather than configured, which is the point of this variant. What the page
 * shows comes from `window.ENTER_MAP`, set by a file in js/maps/ loaded before
 * this one: one entry per data source, each with its snapshot, its marker and
 * a `describe` that turns a feature's properties into the text of a row and a
 * detail view.
 *
 * External services: OpenStreetMap tiles and address search from Adressevælger
 * (Klimadatastyrelsen). Neither needs a key. Distances are computed in the
 * browser. */

(function () {
  "use strict";

  const CONFIG = window.ENTER_MAP;
  const SOURCES = CONFIG.sources;

  const AARHUS = { lat: 56.15355, lon: 10.21432 }; // Dokk1
  const NEAREST_COUNT = 5;

  /* The widget builds hide their layers above resolution 3.2 m/px; at this
   * latitude that is Leaflet zoom 15, so both builds gate at the same scale. */
  const GATE_ZOOM = 15;
  const GATE_STEPS = 4;

  const dom = {
    search: document.getElementById("soeg"),
    suggestions: document.getElementById("forslag"),
    searchError: document.getElementById("soeg-fejl"),
    categories: document.querySelector(".panel__kategorier"),
    list: document.querySelector(".liste"),
    listBox: document.querySelector(".panel__liste"),
    empty: document.querySelector(".liste__tom"),
    heading: document.querySelector(".panel__overskrift"),
    count: document.getElementById("resultatantal"),
    gate: document.querySelector(".zoomgate"),
    gateBar: document.querySelector(".zoomgate__bar"),
    status: document.getElementById("kort-status"),
    detail: document.querySelector(".detalje-host"),
  };

  const state = {
    places: [],
    visible: [],
    query: "",
    categories: {},
    origin: null,
    selected: null,
    gated: false,
    returnFocusTo: null,
  };

  /* Map ------------------------------------------------------------------ */

  const map = L.map("map", {
    center: [AARHUS.lat, AARHUS.lon],
    zoom: 15,
    scrollWheelZoom: false,
    zoomControl: true,
  });

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bidragydere · Data: Aarhus Kommune',
  }).addTo(map);

  const markerLayer = L.layerGroup().addTo(map);

  /* Zoom gate ------------------------------------------------------------ */

  /* Zoomed out, hundreds of places are a carpet of pins and a list nobody can use, so
   * the map holds the data back and the panel says how to get to it. */
  function updateGate() {
    const steps = GATE_ZOOM - map.getZoom();
    const gated = steps > 0;
    const progress = Math.min(1, Math.max(0, 1 - steps / GATE_STEPS));

    dom.gate.hidden = !gated;
    document.body.classList.toggle("is-zoomgated", gated);
    dom.gateBar.style.setProperty("--zoomgate-progress", String(progress));
    dom.gateBar.setAttribute("aria-valuenow", String(Math.round(progress * 100)));

    if (gated === state.gated) {
      return;
    }
    state.gated = gated;

    // The card is hidden while the places are on the map, and a region that is
    // `hidden` announces nothing when it comes back.
    dom.status.textContent = gated
      ? document.getElementById("zoomgate-label").textContent
      : "";
  }

  // A pan changes what the list holds; a zoom changes that and the gate. Both
  // end in `moveend`.
  map.on("moveend", function () {
    updateGate();
    render();
  });

  function markerIcon(place, selected) {
    const glyph = place.source.glyph;
    const fill = selected ? "#12285e" : place.source.colour;
    const size = selected ? 38 : 30;

    return L.divIcon({
      className: "pin",
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      html:
        '<svg viewBox="0 0 30 30" width="' + size + '" height="' + size + '" aria-hidden="true">' +
        '<rect x="1" y="1" width="28" height="28" rx="5" fill="' + fill + '" stroke="#fff" stroke-width="2"/>' +
        '<g transform="translate(3 3) scale(1)" fill="#fff">' + glyph + "</g></svg>",
    });
  }

  /* Data ----------------------------------------------------------------- */

  function centroid(geometry) {
    if (geometry.type === "Point") {
      return { lat: geometry.coordinates[1], lon: geometry.coordinates[0] };
    }

    // The MTM toilets arrive as MultiPoint with a single point.
    const rings =
      geometry.type === "MultiPoint"
        ? [geometry.coordinates]
        : geometry.type === "Polygon"
          ? geometry.coordinates
          : geometry.coordinates.flat();
    const points = rings.flat();
    const sum = points.reduce(
      function (acc, point) {
        return { lat: acc.lat + point[1], lon: acc.lon + point[0] };
      },
      { lat: 0, lon: 0 },
    );

    return { lat: sum.lat / points.length, lon: sum.lon / points.length };
  }

  /* `describe` gives the text: title, address, city, fact and facts, and for
   * parking the precomputed neighbour. The rest is the same for every source. */
  function toPlace(feature, source, index) {
    const point = centroid(feature.geometry);

    return Object.assign(source.describe(feature.properties || {}), {
      id: source.kind + "-" + index,
      kind: source.kind,
      source: source,
      geometry: feature.geometry,
      lat: point.lat,
      lon: point.lon,
    });
  }

  /* Distance ------------------------------------------------------------- */

  function distanceInMetres(from, to) {
    const R = 6371000;
    const toRad = function (deg) {
      return (deg * Math.PI) / 180;
    };
    const dLat = toRad(to.lat - from.lat);
    const dLon = toRad(to.lon - from.lon);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function formatDistance(metres) {
    return metres < 1000
      ? Math.round(metres / 10) * 10 + " m"
      : (metres / 1000).toFixed(1).replace(".", ",") + " km";
  }

  /* Coordinates ----------------------------------------------------------- */

  /* Adressevælger returns access points in ETRS89 / UTM zone 32N (EPSG:25832),
   * where DAWA returned WGS84. Inverse transverse Mercator on the GRS80
   * ellipsoid, which is what Leaflet needs. */
  function utm32ToWgs84(east, north) {
    const a = 6378137;
    const f = 1 / 298.257222101;
    const k0 = 0.9996;
    const e2 = f * (2 - f);
    const ep2 = e2 / (1 - e2);
    const x = east - 500000;
    const m = north / k0;
    const mu = m / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const phi =
      mu +
      (1.5 * e1 - (27 * Math.pow(e1, 3)) / 32) * Math.sin(2 * mu) +
      ((21 * e1 * e1) / 16 - (55 * Math.pow(e1, 4)) / 32) * Math.sin(4 * mu) +
      ((151 * Math.pow(e1, 3)) / 96) * Math.sin(6 * mu) +
      ((1097 * Math.pow(e1, 4)) / 512) * Math.sin(8 * mu);
    const sin = Math.sin(phi);
    const cos = Math.cos(phi);
    const tan = Math.tan(phi);
    const c = ep2 * cos * cos;
    const t = tan * tan;
    const n = a / Math.sqrt(1 - e2 * sin * sin);
    const r = (a * (1 - e2)) / Math.pow(1 - e2 * sin * sin, 1.5);
    const d = x / (n * k0);
    const lat =
      phi -
      ((n * tan) / r) *
        ((d * d) / 2 -
          ((5 + 3 * t + 10 * c - 4 * c * c - 9 * ep2) * Math.pow(d, 4)) / 24 +
          ((61 + 90 * t + 298 * c + 45 * t * t - 252 * ep2 - 3 * c * c) * Math.pow(d, 6)) / 720);
    const lon =
      (d -
        ((1 + 2 * t + c) * Math.pow(d, 3)) / 6 +
        ((5 - 2 * c + 28 * t - 3 * c * c + 8 * ep2 + 24 * t * t) * Math.pow(d, 5)) / 120) /
      cos;

    return { lat: (lat * 180) / Math.PI, lon: 9 + (lon * 180) / Math.PI };
  }

  /* Rendering ------------------------------------------------------------- */

  /* The list holds what the map shows, so a place has to match the categories,
   * the search text and the current view. Areas are judged by their centre:
   * the dog forests are small enough that the difference does not show. */
  function matches(place) {
    if (!state.categories[place.kind]) {
      return false;
    }
    if (!map.getBounds().contains([place.lat, place.lon])) {
      return false;
    }
    if (!state.query) {
      return true;
    }

    const haystack = (place.title + " " + place.address + " " + place.fact + " " + place.source.label).toLowerCase();

    return haystack.indexOf(state.query.toLowerCase()) !== -1;
  }

  function render() {
    state.visible = state.gated ? [] : state.places.filter(matches);

    if (state.origin && !state.gated) {
      state.visible.forEach(function (place) {
        place.distance = distanceInMetres(state.origin, place);
      });
      state.visible.sort(function (a, b) {
        return a.distance - b.distance;
      });
      state.visible = state.visible.slice(0, NEAREST_COUNT);
      dom.heading.textContent = "Nærmeste steder fra " + state.origin.label;
    } else {
      dom.heading.textContent = "Resultater";
    }

    // Gated, the list says nothing: the card above it has the message.
    dom.listBox.hidden = state.gated;
    dom.count.textContent = String(state.visible.length);
    dom.empty.hidden = state.visible.length > 0;
    dom.list.textContent = "";

    state.visible.forEach(function (place) {
      dom.list.appendChild(listRow(place));
    });

    renderMarkers();
  }

  function listRow(place) {
    const item = document.createElement("li");
    const button = document.createElement("button");

    button.type = "button";
    button.className = "resultat";
    button.dataset.id = place.id;
    button.setAttribute("aria-pressed", String(state.selected === place.id));

    const distance = place.distance !== undefined ? "<span class=\"resultat__afstand\">" + formatDistance(place.distance) + "</span>" : "";

    // With several sources of the same thing, the row says which one it is.
    const source = CONFIG.showSource
      ? '<span class="resultat__kilde"><span class="kategori-ikon" style="--kategori-farve: ' +
        place.source.colour + '" aria-hidden="true"></span>' + escapeHtml(place.source.label) + "</span>"
      : "";

    button.innerHTML =
      '<span class="resultat__tekst">' +
      '<span class="resultat__titel">' + escapeHtml(place.title) + "</span>" +
      '<span class="resultat__adresse">' + addressLines(place) + "</span>" +
      '<span class="resultat__fakta">' + escapeHtml(place.fact) + "</span>" +
      source +
      "</span>" +
      distance +
      '<span class="thumb" aria-hidden="true"></span>';

    button.addEventListener("click", function () {
      select(place.id, button);
    });

    item.appendChild(button);

    return item;
  }

  /* Benches have no address, so either line can be empty. */
  function addressLines(place) {
    return [place.address, place.city]
      .filter(Boolean)
      .map(escapeHtml)
      .join("<br />");
  }

  function renderMarkers() {
    markerLayer.clearLayers();

    state.visible.forEach(function (place) {
      if (place.geometry.type === "Polygon" || place.geometry.type === "MultiPolygon") {
        L.geoJSON(place.geometry, {
          style: {
            color: place.source.colour,
            weight: 2,
            fillColor: place.source.colour,
            fillOpacity: state.selected === place.id ? 0.45 : 0.25,
          },
        })
          .on("click", function () {
            select(place.id);
          })
          .addTo(markerLayer);
      }

      const marker = L.marker([place.lat, place.lon], {
        icon: markerIcon(place, state.selected === place.id),
        keyboard: false,
        title: place.title + ", " + place.address,
        zIndexOffset: state.selected === place.id ? 1000 : 0,
      });

      marker.on("click", function () {
        select(place.id);
      });
      marker.addTo(markerLayer);
    });
  }

  /* Selection and detail --------------------------------------------------- */

  function select(id, originButton) {
    const place = state.places.find(function (candidate) {
      return candidate.id === id;
    });

    if (!place) {
      return;
    }

    state.selected = id;
    state.returnFocusTo =
      originButton || dom.list.querySelector('.resultat[data-id="' + id + '"]') || dom.search;

    map.setView([place.lat, place.lon], Math.max(map.getZoom(), 17));
    renderMarkers();
    openDetail(place);
  }

  /* Distance to the nearest other place of the same kind, and a way to open
   * it. Only where `describe` gives a neighbour, which is parking: two dog
   * forests being 2 km apart says nothing useful. */
  function neighbourLine(place) {
    if (place.neighbour === undefined) {
      return "";
    }

    if (!place.neighbour) {
      return '<p class="detalje__nabo">Afstanden til nærmeste anden plads er ikke beregnet</p>';
    }

    // The distance is rounded to 10 m in the data, so two bays on the same
    // corner come out as 0.
    const distance =
      place.neighbour.metres < 10 ? "Under 10 m" : formatDistance(place.neighbour.metres);

    return (
      '<p class="detalje__nabo"><span>' +
      distance +
      " til nærmeste anden plads</span>" +
      '<button type="button" class="detalje__nabo-vis">Vis</button></p>'
    );
  }

  function showNeighbour(place) {
    const neighbour = state.places.find(function (candidate) {
      return candidate.kind === place.kind && candidate.key === place.neighbour.key;
    });

    if (neighbour) {
      select(neighbour.id);
    }
  }

  function openDetail(place) {
    const route =
      "https://www.google.com/maps/dir/?api=1&destination=" + place.lat + "," + place.lon;

    dom.detail.innerHTML =
      '<div class="detalje">' +
      '<div class="detalje__photo"><span class="detalje__photo-note">Foto ikke tilgængeligt endnu</span></div>' +
      '<button type="button" class="detalje__luk" aria-label="Luk">&times;</button>' +
      '<div class="detalje__body">' +
      '<h3 class="detalje__title" tabindex="-1">' + escapeHtml(place.title) + "</h3>" +
      '<div class="detalje__address"><p>' + addressLines(place) + "</p>" +
      '<a class="detalje__route" href="' + route + '" target="_blank" rel="noopener">Vis rute</a></div>' +
      '<p class="detalje__spots">' + escapeHtml(place.fact) + "</p>" +
      neighbourLine(place) +
      place.facts
        .map(function (fact) {
          const value = fact.href
            ? '<a href="' + escapeHtml(fact.href) + '" target="_blank" rel="noopener">' + escapeHtml(fact.value) + "</a>"
            : escapeHtml(fact.value);

          return '<div class="detalje__section"><h4>' + escapeHtml(fact.label) + "</h4><p>" + value + "</p></div>";
        })
        .join("") +
      "</div></div>";

    dom.detail.hidden = false;
    document.body.classList.add("detalje-aaben");
    dom.detail.querySelector(".detalje__title").focus();
    dom.detail.querySelector(".detalje__luk").addEventListener("click", closeDetail);

    const neighbour = dom.detail.querySelector(".detalje__nabo-vis");

    if (neighbour) {
      neighbour.addEventListener("click", function () {
        showNeighbour(place);
      });
    }
  }

  function closeDetail() {
    dom.detail.hidden = true;
    document.body.classList.remove("detalje-aaben");
    dom.detail.textContent = "";
    state.selected = null;
    renderMarkers();

    if (state.returnFocusTo && document.contains(state.returnFocusTo)) {
      state.returnFocusTo.focus();
    }
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !dom.detail.hidden) {
      closeDetail();
    }
  });

  /* Search ----------------------------------------------------------------- */

  /* Adressevælger is Klimadatastyrelsen's replacement for DAWA, which closes on
   * 1 October 2026. Two calls: a phonetic search that returns labels and ids,
   * then a lookup on the chosen id for its access point. The token is not an
   * API key — it is mandatory but unmanaged, and KDS asks everyone to send this
   * value until user management arrives (expected late 2026). */
  const ADRESSEVAELGER = "https://adressevaelger.dk";
  const ADRESSE_TOKEN = "adressevaelger123";
  const KOMMUNEKODE = "0751";
  const SUGGESTION_COUNT = 5;

  let suggestTimer = null;
  let suggestRequest = 0;
  let suggestions = [];
  let activeSuggestion = -1;

  dom.search.addEventListener("input", function () {
    state.query = dom.search.value.trim();
    state.origin = null;
    render();

    window.clearTimeout(suggestTimer);
    suggestTimer = window.setTimeout(suggestAddresses, 250);
  });

  dom.search.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      hideSuggestions();

      return;
    }

    if (dom.suggestions.hidden) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActiveSuggestion(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" && activeSuggestion !== -1) {
      event.preventDefault();
      chooseSuggestion(suggestions[activeSuggestion]);
    }
  });

  async function suggestAddresses() {
    const query = dom.search.value.trim();
    const request = ++suggestRequest;

    if (query.length < 3) {
      hideSuggestions();

      return;
    }

    try {
      const response = await fetch(
        ADRESSEVAELGER +
          "/husnumre/soeg?kommunekode=" +
          KOMMUNEKODE +
          "&token=" +
          ADRESSE_TOKEN +
          "&tekst=" +
          encodeURIComponent(query),
      );

      if (!response.ok) {
        throw new Error("Adressevælger svarede " + response.status);
      }

      const payload = await response.json();

      // A slower answer to an earlier keystroke must not replace a newer one.
      if (request !== suggestRequest) {
        return;
      }

      reportSearchError(false);
      showSuggestions((payload.fund || []).slice(0, SUGGESTION_COUNT));
    } catch (error) {
      if (request === suggestRequest) {
        // An address lookup that fails must not take the list with it.
        hideSuggestions();
        reportSearchError(true);
      }
    }
  }

  function showSuggestions(hits) {
    if (!hits.length) {
      hideSuggestions();

      return;
    }

    suggestions = hits;
    activeSuggestion = -1;
    dom.suggestions.textContent = "";

    hits.forEach(function (hit, index) {
      const item = document.createElement("li");

      item.className = "forslag__item";
      item.id = "forslag-" + index;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", "false");
      item.textContent = hit.titel;

      // Street-level hits carry no position: choosing one narrows the search
      // instead of picking a place, so it says so.
      if (!hasPosition(hit)) {
        const note = document.createElement("span");

        note.className = "forslag__note";
        note.textContent = "Vælg for at søge videre på denne vej";
        item.appendChild(note);
      }

      item.addEventListener("mousedown", function (event) {
        // Keeps focus in the field, so the blur handler does not close the list
        // before the click lands.
        event.preventDefault();
      });
      item.addEventListener("click", function () {
        chooseSuggestion(hit);
      });
      dom.suggestions.appendChild(item);
    });

    dom.suggestions.hidden = false;
    dom.search.setAttribute("aria-expanded", "true");
  }

  function moveActiveSuggestion(step) {
    const items = dom.suggestions.children;
    const next = (activeSuggestion + step + items.length + 1) % (items.length + 1);

    activeSuggestion = next === items.length ? -1 : next;

    Array.prototype.forEach.call(items, function (item, index) {
      const active = index === activeSuggestion;

      item.classList.toggle("forslag__item--aktiv", active);
      item.setAttribute("aria-selected", String(active));
    });

    if (activeSuggestion === -1) {
      dom.search.removeAttribute("aria-activedescendant");
    } else {
      dom.search.setAttribute("aria-activedescendant", items[activeSuggestion].id);
      items[activeSuggestion].scrollIntoView({ block: "nearest" });
    }
  }

  function hideSuggestions() {
    suggestions = [];
    activeSuggestion = -1;
    dom.suggestions.hidden = true;
    dom.suggestions.textContent = "";
    dom.search.setAttribute("aria-expanded", "false");
    dom.search.removeAttribute("aria-activedescendant");
  }

  dom.search.addEventListener("blur", function () {
    hideSuggestions();
  });

  function hasPosition(hit) {
    return hit.type === "husnummer";
  }

  function chooseSuggestion(hit) {
    if (hasPosition(hit)) {
      useAddress(hit);

      return;
    }

    // Named road or road-and-postcode: put it back in the field and search
    // again, which is how Adressevælger expects a hit to be narrowed down.
    dom.search.value = hit.titel + " ";
    state.query = "";
    hideSuggestions();
    render();
    suggestAddresses();
  }

  async function useAddress(hit) {
    try {
      const response = await fetch(
        ADRESSEVAELGER + "/husnumre/" + encodeURIComponent(hit.id) + "?token=" + ADRESSE_TOKEN,
      );

      if (!response.ok) {
        throw new Error("Adressevælger svarede " + response.status);
      }

      const payload = await response.json();
      const point = payload.husnummer && payload.husnummer.adgangspunkt;

      if (!point || !point.koordinater) {
        throw new Error("Adressen har intet adgangspunkt");
      }

      const position = utm32ToWgs84(point.koordinater.x, point.koordinater.y);

      reportSearchError(false);
      state.origin = { lat: position.lat, lon: position.lon, label: hit.titel };
      state.query = "";
      dom.search.value = hit.titel;
      hideSuggestions();
      map.setView([position.lat, position.lon], 16);
      render();
    } catch (error) {
      hideSuggestions();
      reportSearchError(true);
    }
  }

  function reportSearchError(failed) {
    dom.searchError.hidden = !failed;
  }

  /* One checkbox per source, so the sources can be compared on the map. */
  SOURCES.forEach(function (source) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    const swatch = document.createElement("span");

    input.type = "checkbox";
    input.value = source.kind;
    input.checked = true;
    input.addEventListener("change", function () {
      state.categories[source.kind] = input.checked;
      render();
    });

    swatch.className = "kategori-ikon";
    swatch.style.setProperty("--kategori-farve", source.colour);
    swatch.setAttribute("aria-hidden", "true");

    label.append(input, swatch, source.label);
    dom.categories.appendChild(label);
    state.categories[source.kind] = true;
  });

  /* Boot ------------------------------------------------------------------- */

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  Promise.all(
    SOURCES.map(function (source) {
      return fetch(source.url)
        .then(function (response) {
          return response.json();
        })
        .then(function (collection) {
          return collection.features.map(function (feature, index) {
            return toPlace(feature, source, index);
          });
        });
    }),
  )
    .then(function (sets) {
      state.places = sets.flat();
      updateGate();
      render();
    })
    .catch(function () {
      dom.heading.textContent = "Kunne ikke hente data";
      dom.empty.hidden = false;
    });
})();
