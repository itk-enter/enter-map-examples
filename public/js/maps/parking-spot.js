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
    paving_stones: "Fliser",
    sett: "Brosten",
    grass_paver: "Græsarmering",
    gravel: "Grus",
  };

  const FEES = { yes: "Betaling", no: "Gratis" };

  const PLACEMENTS = { onStreet: "Plads ved vejen", offStreet: "Plads på en parkeringsplads" };

  function yesNo(value) {
    return value === undefined || value === null ? "" : value ? "Ja" : "Nej";
  }

  function metres(value) {
    return typeof value === "number" ? String(value).replace(".", ",") + " m" : "";
  }

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

  /* Width, length, kerb and time limit are not recorded by any source yet, so
   * the detail leaves them out until they are. Charging point, vehicle type
   * and rating are shown as not registered, as the prototype does. */
  function describe(props) {
    const extra = props.additionalInformation || {};
    const van =
      extra.vanAccessible === true
        ? "Plads til kassebil med rampe eller lift"
        : extra.vanAccessible === false
          ? "Ikke plads til kassebil med rampe eller lift"
          : "Ikke registreret endnu";

    // No neighbour: the nearest other bay is mostly the next one in the
    // same row, which says nothing.
    return {
      title: "Handicapparkering",
      address: props.name || "Adresse ikke registreret",
      city: "Aarhus Kommune",
      fact: PLACEMENTS[props.category] || "Plads",
      facts: [
        { label: "Pladsforhold", value: props.description || "Ikke registreret endnu", attribute: "description" },
        { label: "Bredde", value: metres(props.width), attribute: "width" },
        { label: "Længde", value: metres(props.length), attribute: "length" },
        { label: "Betaling", value: FEES[extra.fee] || "Ikke registreret endnu", attribute: "additionalInformation.fee" },
        {
          label: "Belægning",
          value: SURFACES[extra.surface] || extra.surface || "Ikke registreret endnu",
          attribute: "additionalInformation.surface",
        },
        {
          label: "Sænket kantsten til fortovet",
          value: yesNo(extra.loweredKerb),
          attribute: "additionalInformation.loweredKerb",
        },
        { label: "Tidsbegrænsning", value: extra.maxStay || "", attribute: "additionalInformation.maxStay" },
        {
          label: "Ladestander",
          value: yesNo(extra.chargingPoint) || "Ikke registreret endnu",
          attribute: "additionalInformation.chargingPoint",
        },
        { label: "Køretøjstype", value: van, attribute: "additionalInformation.vanAccessible" },
        { label: "Vurdering", value: "Ikke registreret endnu", attribute: "rating" },
        { label: "Kilde", value: mergedFrom(props.seeAlso), attribute: "seeAlso" },
      ],
      attributes: { fact: "category" },
    };
  }

  /* What a citizen can add or correct, for pages that collect contributions.
   * Description, width, length and category are ParkingSpot attributes in the
   * Smart Data Model; the rest is not in the model, and goes in
   * `additionalInformation`, where Enter already keeps fee and surface. */
  const FIELDS = [
    {
      attribute: "description",
      label: "Pladsforhold",
      type: "text",
      multiline: true,
      hint: "Fx at der er plads til en rampe i højre side, eller at pladsen hælder.",
    },
    { attribute: "width", label: "Bredde", type: "number", unit: "m", min: 1, max: 10, step: 0.1 },
    { attribute: "length", label: "Længde", type: "number", unit: "m", min: 2, max: 15, step: 0.1 },
    {
      attribute: "category",
      label: "Placering",
      type: "choice",
      options: [
        { value: "onStreet", label: "Ved vejen" },
        { value: "offStreet", label: "På en parkeringsplads" },
      ],
    },
    {
      attribute: "additionalInformation.fee",
      label: "Betaling",
      type: "choice",
      options: [
        { value: "no", label: FEES.no },
        { value: "yes", label: FEES.yes },
      ],
    },
    {
      attribute: "additionalInformation.surface",
      label: "Belægning",
      type: "choice",
      options: Object.keys(SURFACES).map(function (value) {
        return { value: value, label: SURFACES[value] };
      }),
    },
    { attribute: "additionalInformation.chargingPoint", label: "Ladestander", type: "boolean" },
    {
      attribute: "additionalInformation.vanAccessible",
      label: "Plads til kassebil med rampe eller lift",
      type: "boolean",
    },
    { attribute: "additionalInformation.loweredKerb", label: "Sænket kantsten til fortovet", type: "boolean" },
    {
      attribute: "additionalInformation.maxStay",
      label: "Tidsbegrænsning",
      type: "text",
      hint: "Fx 2 timer, hverdage 9–18",
    },
  ];

  return { glyph: GLYPH, describe: describe, fields: FIELDS };
})();
