/* Benches for baenke.html, from the test:osm-bench source in Enter: the
 * Bench data model, harvested from OpenStreetMap. OSM benches carry no
 * address, so the row describes the bench instead. */

(function () {
  "use strict";

  const MATERIALS = {
    wood: "Træ",
    concrete: "Beton",
    metal: "Metal",
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
      { label: "Ryglæn", value: yesNo(props.backrest) },
      { label: "Armlæn", value: yesNo(props.armrest) },
      { label: "Materiale", value: material || "Ikke registreret" },
      { label: "Siddepladser", value: props.seats ? String(props.seats) : "Ikke registreret" },
    ];

    if (props.lyingDown !== undefined) {
      facts.push({ label: "Plads til at ligge ned", value: yesNo(props.lyingDown) });
    }
    if (props.checkDate) {
      facts.push({ label: "Senest tjekket", value: props.checkDate });
    }
    if (props.seeAlso) {
      facts.push({ label: "Kilde", value: "Se bænken på OpenStreetMap", href: props.seeAlso });
    }

    return {
      title: props.name && props.name !== "Bench" ? props.name : "Bænk",
      address: [material, seats].filter(Boolean).join(", "),
      city: "",
      fact:
        props.backrest === true ? "Med ryglæn" : props.backrest === false ? "Uden ryglæn" : "Ryglæn ikke registreret",
      facts: facts,
    };
  }

  window.ENTER_MAP = {
    sources: [
      {
        kind: "osm-bench",
        label: "Bænke (OpenStreetMap)",
        url: "./data/test-osm-bench.geojson",
        colour: "#7a4a1e",
        glyph: '<path d="M4 8h16v3H4zM3 12h18v2H3zM5 14h2v5H5zm12 0h2v5h-2z"/>',
        describe: describe,
      },
    ],
  };
})();
