/* Toilets for toiletter.html: three Enter sources on the PublicToilet data
 * model, side by side. OpenStreetMap covers the most places but rarely names
 * them; the two MTM registers from Aarhus Kommune name every toilet and give
 * an address. Each source keeps its own colour and checkbox, so where they
 * overlap and where they disagree shows on the map. */

(function () {
  "use strict";

  function source(kind, label, colour) {
    return {
      kind: kind,
      label: label,
      url: "./data/test-" + kind + ".geojson",
      colour: colour,
      glyph: window.PUBLIC_TOILET.glyph,
      describe: window.PUBLIC_TOILET.describer(label),
    };
  }

  window.ENTER_MAP = {
    showSource: true,
    sources: [
      source("osm-public-toilet", "Offentlige toiletter (OpenStreetMap)", "#6b3fa0"),
      source("mtm_spatialmaps-toilet-city", "Bytoiletter (MTM)", "#b3261e"),
      source("mtm_spatialmaps-toilet-other", "Andre toiletter (MTM)", "#0f6e74"),
    ],
  };
})();
