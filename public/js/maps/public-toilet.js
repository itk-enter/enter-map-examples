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
   * a function of the properties for a source that merges others. */
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
      facts.push({
        label: "Kilde",
        value: typeof sourceLabel === "function" ? sourceLabel(props) : sourceLabel,
      });

      return {
        title: props.name || "Toilet",
        address: address.streetAddress || "Adresse ikke registreret",
        city: [address.postalCode, address.addressLocality].filter(Boolean).join(" ") || "Aarhus Kommune",
        fact: WHEELCHAIR[props.wheelchairAccessible] || "Handicapadgang ikke registreret",
        facts: facts,
      };
    };
  }

  return { glyph: GLYPH, describer: describer };
})();
