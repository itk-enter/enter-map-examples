/* Row and detail text for the Bench data model, shared by the bench pages:
 * benches harvested from OpenStreetMap, which carry no address, so the row
 * describes the bench instead. Load before the page's own file in js/maps/. */

window.BENCH = (function () {
  "use strict";

  const GLYPH = '<path d="M4 8h16v3H4zM3 12h18v2H3zM5 14h2v5H5zm12 0h2v5h-2z"/>';

  const MATERIALS = {
    wood: "Træ",
    concrete: "Beton",
    metal: "Metal",
    steel: "Stål",
    plastic: "Plast",
    granite: "Granit",
    stone: "Sten",
  };

  function yesNo(value) {
    if (value === undefined || value === null) {
      return "Ikke registreret";
    }

    return value ? "Ja" : "Nej";
  }

  function describe(props) {
    const material = props.material ? MATERIALS[props.material] || props.material : "";
    const seats = props.seats ? props.seats + (props.seats === 1 ? " siddeplads" : " siddepladser") : "";
    const facts = [
      { label: "Ryglæn", value: yesNo(props.backrest), attribute: "backrest" },
      { label: "Armlæn", value: yesNo(props.armrest), attribute: "armrest" },
      { label: "Materiale", value: material || "Ikke registreret", attribute: "material" },
      { label: "Siddepladser", value: props.seats ? String(props.seats) : "Ikke registreret", attribute: "seats" },
      // Rarely recorded, so the detail leaves it out until it is.
      {
        label: "Plads til at ligge ned",
        value: props.lyingDown === undefined ? "" : yesNo(props.lyingDown),
        attribute: "lyingDown",
      },
    ];

    if (props.checkDate) {
      facts.push({ label: "Senest tjekket", value: props.checkDate });
    }
    if (props.seeAlso) {
      facts.push({ label: "Kilde", value: "Se bænken på OpenStreetMap", href: props.seeAlso, attribute: "seeAlso" });
    }

    return {
      title: props.name && props.name !== "Bench" ? props.name : "Bænk",
      address: [material, seats].filter(Boolean).join(", "),
      city: "",
      fact:
        props.backrest === true ? "Med ryglæn" : props.backrest === false ? "Uden ryglæn" : "Ryglæn ikke registreret",
      facts: facts,
      attributes: { fact: "backrest" },
    };
  }

  /* What a citizen can add or correct, for pages that collect contributions.
   * `attribute` is the property in the Bench model. */
  const FIELDS = [
    { attribute: "backrest", label: "Ryglæn", type: "boolean" },
    { attribute: "armrest", label: "Armlæn", type: "boolean" },
    { attribute: "lyingDown", label: "Plads til at ligge ned", type: "boolean" },
    {
      attribute: "material",
      label: "Materiale",
      type: "choice",
      options: Object.keys(MATERIALS).map(function (value) {
        return { value: value, label: MATERIALS[value] };
      }),
    },
    { attribute: "seats", label: "Siddepladser", type: "number", min: 1, max: 20, step: 1 },
  ];

  return { glyph: GLYPH, describe: describe, fields: FIELDS };
})();
