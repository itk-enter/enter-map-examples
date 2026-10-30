/* Handicapparkering and hundeskove for leaflet.html: the snapshot the widget
 * builds use, in the fields the old staging instance published. */

window.ENTER_MAP = {
  sources: [
    {
      kind: "handicapparkering",
      label: "Handicapparkering",
      url: "./data/handicapparkering.geojson",
      colour: "#3661d8",
      glyph:
        '<path d="M12 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm-1 5.5h2l.6 3H17v2h-3.9l-.4-2H11a4.5 4.5 0 1 0 4.4 5.5h2A6.5 6.5 0 1 1 11 9.5Z"/>',
      describe: function (props) {
        const address = [props.vejnavn, props.husnnr].filter(Boolean).join(" ").trim();
        const spots = Number(props.invalidepladser || 0);

        return {
          title: "Handicapparkering",
          address: address || "Adresse ikke registreret",
          city: "8000 Aarhus",
          fact: spots ? spots + (spots === 1 ? " plads" : " pladser") : "Antal pladser ikke registreret",
          facts: [
            { label: "Pladsforhold", value: props.bemrk || "Ikke registreret endnu" },
            { label: "Betaling", value: "Ikke registreret endnu" },
            { label: "Belægning", value: "Ikke registreret endnu" },
            { label: "Ladestander", value: "Ikke registreret endnu" },
            { label: "Køretøjstype", value: "Ikke registreret endnu" },
            { label: "Vurdering", value: "Ikke registreret endnu" },
          ],
          key: props.mi_prinx,
          // Precomputed by bin/nearest.py: the distance is between two features,
          // so it cannot come from the feature's own properties in the source.
          neighbour:
            props.nabo_prinx === undefined || props.nabo_prinx === null
              ? null
              : { key: props.nabo_prinx, metres: props.nabo_afstand_m },
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
