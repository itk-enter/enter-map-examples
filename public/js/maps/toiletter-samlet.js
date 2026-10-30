/* Toilets for toiletter-samlet.html: the test:merged-public-toilets source in
 * Enter, where each toilet is stated once, merged from the toilet sources
 * toiletter.html shows side by side. `seeAlso` holds the ids of the entities a
 * toilet was merged from, and their prefix tells which source each came from. */

(function () {
  "use strict";

  const INPUTS = [
    { prefix: "urn:ngsi-ld:PublicToilet:aarhus-toilet-osm-", label: "OpenStreetMap" },
    { prefix: "urn:ngsi-ld:PublicToilet:aarhus-toilet-city-", label: "Bytoiletter (MTM)" },
    { prefix: "urn:ngsi-ld:PublicToilet:aarhus-toilet-other-", label: "Andre toiletter (MTM)" },
    { prefix: "urn:ngsi-ld:PublicToilet:aarhus-toilet-findtoilet-", label: "FindToilet" },
  ];

  /* "Samlet fra Bytoiletter (MTM) og OpenStreetMap", or the one source. A
   * single merged-from id arrives as a string, several as an array. */
  function mergedFrom(props) {
    const ids = [].concat(props.seeAlso || []);
    const labels = [];

    ids.forEach(function (id) {
      const input = INPUTS.find(function (candidate) {
        return id.indexOf(candidate.prefix) === 0;
      });
      const label = input ? input.label : "Ukendt kilde";

      if (labels.indexOf(label) === -1) {
        labels.push(label);
      }
    });

    if (labels.length < 2) {
      return labels[0] || "Ikke oplyst";
    }

    return "Samlet fra " + labels.slice(0, -1).join(", ") + " og " + labels[labels.length - 1];
  }

  window.ENTER_MAP = {
    sources: [
      {
        kind: "merged-public-toilets",
        label: "Offentlige toiletter (samlet)",
        url: "./data/test-merged-public-toilets.geojson",
        colour: "#6b3fa0",
        glyph: window.PUBLIC_TOILET.glyph,
        describe: window.PUBLIC_TOILET.describer(mergedFrom),
      },
    ],
  };
})();
