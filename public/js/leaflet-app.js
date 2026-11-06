/* Leaflet build.
 *
 * The list, the detail view and the interaction between them are written here
 * rather than configured, which is the point of this variant. What the page
 * shows comes from `window.ENTER_MAP`, set by a file in js/maps/ loaded before
 * this one: one entry per data source, each with its snapshot, its marker and
 * a `describe` that turns a feature's properties into the text of a row and a
 * detail view.
 *
 * A page can extend the build with `plugins`: functions that get the `app`
 * object below before the data loads, and may return a promise the load waits
 * for.
 *
 * External services: OpenStreetMap tiles and address search from Adressevælger
 * (Klimadatastyrelsen, js/adressevaelger.js). Neither needs a key. Distances
 * are computed in the browser. */

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
   * parking the precomputed neighbour. The rest is the same for every source.
   * The feature's own id is the entity's NGSI-LD id, which stays the same
   * from one snapshot to the next. */
  function toPlace(feature, source, index) {
    const point = centroid(feature.geometry);

    return Object.assign(describePlace(feature, source), {
      id: feature.id || source.kind + "-" + index,
      kind: source.kind,
      source: source,
      feature: feature,
      geometry: feature.geometry,
      lat: point.lat,
      lon: point.lon,
    });
  }

  /* A plugin may change the properties before they are described, through
   * `app.transform`. */
  function describePlace(feature, source) {
    const properties = app.transform(feature.properties || {}, feature, source);

    return Object.assign(source.describe(properties), { properties: properties });
  }

  /* Describes every place again, after a plugin's transform has changed. */
  function rebuild() {
    state.places.forEach(function (place) {
      Object.assign(place, describePlace(place.feature, place.source));
    });
    render();
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

    // With several sources or several kinds of place, the row says which.
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

  /* `focus: false` redraws an open detail without taking focus from where the
   * user is, for a plugin whose data changed underneath it. */
  function openDetail(place, options) {
    const route =
      "https://www.google.com/maps/dir/?api=1&destination=" + place.lat + "," + place.lon;
    const attributes = place.attributes || {};

    dom.detail.innerHTML =
      '<div class="detalje">' +
      '<div class="detalje__photo"><span class="detalje__photo-note">Foto ikke tilgængeligt endnu</span></div>' +
      '<button type="button" class="detalje__luk" aria-label="Luk">&times;</button>' +
      '<div class="detalje__body">' +
      '<h3 class="detalje__title" tabindex="-1"' + dataAttribute(attributes.title) + ">" + escapeHtml(place.title) + "</h3>" +
      '<div class="detalje__address"' + dataAttribute(attributes.address) + "><p>" + addressLines(place) + "</p>" +
      '<a class="detalje__route" href="' + route + '" target="_blank" rel="noopener">Vis rute</a></div>' +
      '<p class="detalje__spots"' + dataAttribute(attributes.fact) + ">" + escapeHtml(place.fact) + "</p>" +
      neighbourLine(place) +
      renderFacts(place.facts) +
      "</div></div>";

    dom.detail.hidden = false;
    document.body.classList.add("detalje-aaben");
    if (!options || options.focus !== false) {
      dom.detail.querySelector(".detalje__title").focus();
    }
    dom.detail.querySelector(".detalje__luk").addEventListener("click", closeDetail);

    const neighbour = dom.detail.querySelector(".detalje__nabo-vis");

    if (neighbour) {
      neighbour.addEventListener("click", function () {
        showNeighbour(place);
      });
    }

    dom.detail.dispatchEvent(new CustomEvent("enter-map:detail", { bubbles: true, detail: { place: place } }));
  }

  /* One section per fact with a value. A fact that names its `attribute`
   * carries it, so a plugin can find the section. */
  function renderFacts(facts) {
    return facts
      .filter(function (fact) {
        return fact.value;
      })
      .map(function (fact) {
        const value = fact.href
          ? '<a href="' + escapeHtml(fact.href) + '" target="_blank" rel="noopener">' + escapeHtml(fact.value) + "</a>"
          : escapeHtml(fact.value);

        return '<div class="detalje__section"' + dataAttribute(fact.attribute) + "><h4>" + escapeHtml(fact.label) + "</h4><p>" + value + "</p></div>";
      })
      .join("");
  }

  /* The model attribute an element shows, for a plugin to find it by. */
  function dataAttribute(attribute) {
    return attribute ? ' data-attribute="' + escapeHtml(attribute) + '"' : "";
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

  /* The field filters the list as you type; choosing an address lists the
   * nearest places to it instead. */
  dom.search.addEventListener("input", function () {
    state.query = dom.search.value.trim();
    state.origin = null;
    render();
  });

  window.ADRESSEVAELGER.combobox(dom.search, dom.suggestions, {
    onChoose: useAddress,
    onError: reportSearchError,
    // A road put back in the field is not a filter on the list.
    onNarrow: function () {
      state.query = "";
      render();
    },
  });

  async function useAddress(hit) {
    try {
      const position = await window.ADRESSEVAELGER.position(hit);

      reportSearchError(false);
      state.origin = { lat: position.lat, lon: position.lon, label: hit.titel };
      state.query = "";
      dom.search.value = hit.titel;
      map.setView([position.lat, position.lon], 16);
      render();
    } catch (error) {
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

  /* App ------------------------------------------------------------------- */

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  let resolveLoaded;

  /* What a plugin gets. `transform(properties, feature, source)` returns the
   * properties to describe; the default leaves them alone. */
  const app = {
    config: CONFIG,
    detailHost: dom.detail,
    transform: function (properties) {
      return properties;
    },
    loaded: new Promise(function (resolve) {
      resolveLoaded = resolve;
    }),
    place: function (id) {
      return state.places.find(function (candidate) {
        return candidate.id === id;
      });
    },
    selected: function () {
      return dom.detail.hidden ? null : app.place(state.selected);
    },
    select: select,
    openDetail: openDetail,
    closeDetail: closeDetail,
    rebuild: rebuild,
    renderFacts: renderFacts,
    escapeHtml: escapeHtml,
  };

  /* Boot ------------------------------------------------------------------- */

  const plugins = (CONFIG.plugins || []).map(function (plugin) {
    return plugin(app);
  });

  Promise.all(
    SOURCES.map(function (source) {
      return fetch(source.url)
        .then(function (response) {
          return response.json();
        })
        .then(function (collection) {
          return collection.features;
        });
    }),
  )
    .then(function (sets) {
      // The plugins have had the time the data took.
      return Promise.all(plugins).then(function () {
        return sets;
      });
    })
    .then(function (sets) {
      state.places = sets.flatMap(function (features, setIndex) {
        return features.map(function (feature, index) {
          return toPlace(feature, SOURCES[setIndex], index);
        });
      });
      updateGate();
      render();
      resolveLoaded();
    })
    .catch(function () {
      dom.heading.textContent = "Kunne ikke hente data";
      dom.empty.hidden = false;
    });
})();
