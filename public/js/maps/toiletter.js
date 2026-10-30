/* Toilets for toiletter.html: three Enter sources on the PublicToilet data
 * model, side by side. OpenStreetMap covers the most places but rarely names
 * them; the two MTM registers from Aarhus Kommune name every toilet and give
 * an address. Each source keeps its own colour and checkbox, so where they
 * overlap and where they disagree shows on the map. */

(function () {
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

  function describer(sourceLabel) {
    return function (props) {
      const address = props.address || {};
      const extra = props.additionalInformation || {};
      const facts = [
        { label: "Beskrivelse", value: props.description },
        { label: "Adgang", value: ACCESS[props.accessType] || props.accessType },
        { label: "Adgangsforhold", value: props.accessNote },
        { label: "Pris", value: price(props) },
        { label: "Åbningstider", value: openingHours(props.openingHours) },
        { label: "Sæson", value: extra.season },
        {
          label: "Puslebord",
          value: props.babyChange === undefined ? "" : props.babyChange ? "Ja" : "Nej",
        },
        { label: "Status", value: extra.status },
      ].filter(function (fact) {
        return fact.value;
      });

      // The sources differ in what they record, so the detail shows what this
      // one has and says where it came from.
      facts.push({ label: "Kilde", value: sourceLabel });

      return {
        title: props.name || "Toilet",
        address: address.streetAddress || "Adresse ikke registreret",
        city: [address.postalCode, address.addressLocality].filter(Boolean).join(" ") || "Aarhus Kommune",
        fact: WHEELCHAIR[props.wheelchairAccessible] || "Handicapadgang ikke registreret",
        facts: facts,
      };
    };
  }

  function source(kind, label, colour) {
    return {
      kind: kind,
      label: label,
      url: "./data/test-" + kind + ".geojson",
      colour: colour,
      glyph: GLYPH,
      describe: describer(label),
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
