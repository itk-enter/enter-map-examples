/* Row and detail text for the ParkingSpot data model in Enter's
 * merged-handicap-parking-spots source, shared by the parking pages: one
 * entity per bay, merged from Aarhus Kommune's register (MTM) and
 * OpenStreetMap. Load before the page's own file in js/maps/. */

window.PARKING_SPOT = (function () {
  "use strict";

  const GLYPH =
    '<path d="M12 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm-1 5.5h2l.6 3H17v2h-3.9l-.4-2H11a4.5 4.5 0 1 0 4.4 5.5h2A6.5 6.5 0 1 1 11 9.5Z"/>';

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

  function describe(props) {
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
  }

  return { glyph: GLYPH, describe: describe };
})();
