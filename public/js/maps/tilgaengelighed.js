/* Handicapparkering and hundeskove for leaflet.html. Parking is Enter's
 * merged-handicap-parking-spots source: one ParkingSpot per bay, merged from
 * Aarhus Kommune's register (MTM) and OpenStreetMap, so a site with six bays
 * is six places. The widget builds still read the September snapshot of the
 * old staging instance, which counted bays per site. Dog forests are that
 * snapshot too. */

(function () {
  "use strict";

  const SURFACES = {
    asphalt: "Asfalt",
    grass_paver: "Græsarmering",
    gravel: "Grus",
  };

  const FEES = { yes: "Betaling", no: "Gratis" };

  /* "Aarhus Kommune (MTM) og OpenStreetMap", or the one source. `seeAlso`
   * holds the ids the bay was merged from, a string for one and an array for
   * several; OpenStreetMap ids carry "-osm-". */
  function mergedFrom(seeAlso) {
    const ids = [].concat(seeAlso || []);
    const osm = ids.filter(function (id) {
      return id.indexOf("-osm-") !== -1;
    }).length;
    const labels = [];

    if (osm < ids.length) {
      labels.push("Aarhus Kommune (MTM)");
    }
    if (osm) {
      labels.push("OpenStreetMap");
    }

    return labels.join(" og ") || "Ikke oplyst";
  }

  window.ENTER_MAP = {
    sources: [
      {
        kind: "handicapparkering",
        label: "Handicapparkering",
        url: "./data/merged-handicap-parking-spots.geojson",
        colour: "#3661d8",
        glyph:
          '<path d="M12 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm-1 5.5h2l.6 3H17v2h-3.9l-.4-2H11a4.5 4.5 0 1 0 4.4 5.5h2A6.5 6.5 0 1 1 11 9.5Z"/>',
        describe: function (props) {
          const extra = props.additionalInformation || {};

          // No neighbour: the nearest other bay is mostly the next one in the
          // same row, which says nothing.
          return {
            title: "Handicapparkering",
            address: props.name || "Adresse ikke registreret",
            city: "Aarhus Kommune",
            fact: props.category === "onStreet" ? "Plads ved vejen" : "Plads",
            facts: [
              { label: "Pladsforhold", value: props.description || "Ikke registreret endnu" },
              { label: "Betaling", value: FEES[extra.fee] || "Ikke registreret endnu" },
              { label: "Belægning", value: SURFACES[extra.surface] || extra.surface || "Ikke registreret endnu" },
              { label: "Ladestander", value: "Ikke registreret endnu" },
              { label: "Køretøjstype", value: "Ikke registreret endnu" },
              { label: "Vurdering", value: "Ikke registreret endnu" },
              { label: "Kilde", value: mergedFrom(props.seeAlso) },
            ],
          };
        },
      },
      {
        kind: "hundeskov",
        label: "Hundeskove",
        url: "./data/hundeskov.geojson",
        colour: "#277646",
        glyph: '<path d="M12 2 5 12h3l-3 5h5v5h4v-5h5l-3-5h3L12 2Z"/>',
        describe: function (props) {
          return {
            title: "Hundeskov",
            address: props.navn || "Navn ikke registreret",
            city: "Aarhus Kommune",
            fact: props.hegnet || "Hegning ikke registreret",
            facts: [
              { label: "Hegning", value: props.hegnet || "Ikke registreret endnu" },
              { label: "Ejer", value: props.ejer || "Ikke registreret endnu" },
            ],
          };
        },
      },
    ],
  };
})();
