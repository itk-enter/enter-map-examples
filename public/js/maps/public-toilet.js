/* Row and detail text for the PublicToilet data model, shared by the toilet
 * pages. Load before the page's own file in js/maps/. */

window.PUBLIC_TOILET = (function () {
  "use strict";

  const GLYPH =
    '<text x="12" y="16" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="700">WC</text>';

  const WHEELCHAIR = {
    yes: "Handicapvenligt",
    limited: "Delvist handicapvenligt",
    no: "Ikke handicapvenligt",
  };

  const ACCESS = {
    public: "Offentligt",
    customers: "Kun for kunder",
    permissive: "Tilladt for alle",
  };

  function openingHours(value) {
    return Array.isArray(value) ? value.join("; ") : value;
  }

  function price(props) {
    if (props.isAccessibleForFree === true) {
      return "Gratis";
    }
    if (props.chargeAmount) {
      return props.chargeAmount + " " + (props.chargeCurrency || "kr.");
    }

    return props.isAccessibleForFree === false ? "Betaling" : "";
  }

  /* `sourceLabel` is what the detail says under "Kilde": a source's name, or
   * a function of the properties for a source that merges others. A fact
   * without a value is left out by the page, since the sources differ in what
   * they record. */
  function describer(sourceLabel) {
    return function (props) {
      const address = props.address || {};
      const extra = props.additionalInformation || {};
      const facts = [
        { label: "Beskrivelse", value: props.description },
        { label: "Adgang", value: ACCESS[props.accessType] || props.accessType, attribute: "accessType" },
        { label: "Adgangsforhold", value: props.accessNote },
        { label: "Pris", value: price(props), attribute: "isAccessibleForFree" },
        { label: "Åbningstider", value: openingHours(props.openingHours), attribute: "openingHours" },
        { label: "Sæson", value: extra.season },
        {
          label: "Puslebord",
          value: props.babyChange === undefined ? "" : props.babyChange ? "Ja" : "Nej",
          attribute: "babyChange",
        },
        { label: "Status", value: extra.status },
        // The sources differ in what they record, so the detail says where
        // this one came from: a merged toilet's from the ids in `seeAlso`.
        typeof sourceLabel === "function"
          ? { label: "Kilde", value: sourceLabel(props), attribute: "seeAlso" }
          : { label: "Kilde", value: sourceLabel },
      ];

      return {
        title: props.name || "Toilet",
        address: address.streetAddress || "Adresse ikke registreret",
        city: [address.postalCode, address.addressLocality].filter(Boolean).join(" ") || "Aarhus Kommune",
        fact: WHEELCHAIR[props.wheelchairAccessible] || "Handicapadgang ikke registreret",
        facts: facts,
        attributes: { title: "name", address: "address", fact: "wheelchairAccessible" },
      };
    };
  }

  /* What a citizen can add or correct, for pages that collect contributions.
   * `attribute` is the property in the PublicToilet model. */
  const FIELDS = [
    { attribute: "name", label: "Navn", type: "text", hint: "Fx Toiletterne ved Dokk1" },
    { attribute: "address", label: "Adresse", type: "address" },
    {
      attribute: "wheelchairAccessible",
      label: "Kørestolsadgang",
      type: "choice",
      options: [
        { value: "yes", label: "Ja" },
        { value: "limited", label: "Delvist" },
        { value: "no", label: "Nej" },
      ],
    },
    {
      attribute: "accessType",
      label: "Adgang",
      type: "choice",
      options: [
        { value: "public", label: ACCESS.public },
        { value: "customers", label: ACCESS.customers },
        { value: "permissive", label: ACCESS.permissive },
      ],
    },
    { attribute: "isAccessibleForFree", label: "Pris", type: "boolean", labels: { yes: "Gratis", no: "Betaling" } },
    {
      attribute: "chargeAmount",
      label: "Beløb",
      type: "number",
      unit: "kr.",
      min: 0,
      max: 100,
      step: 1,
      when: { attribute: "isAccessibleForFree", value: false },
    },
    { attribute: "openingHours", label: "Åbningstider", type: "openingHours" },
    { attribute: "babyChange", label: "Puslebord", type: "boolean" },
  ];

  /* For merged-public-toilets: which inputs a toilet was merged from. */
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

  return { glyph: GLYPH, describer: describer, mergedFrom: mergedFrom, fields: FIELDS };
})();
