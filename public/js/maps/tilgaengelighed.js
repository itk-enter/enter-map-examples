/* Handicapparkering and hundeskove for leaflet.html. Parking is Enter's
 * merged-handicap-parking-spots source, one marker per bay (see
 * parking-spot.js). The widget builds still read the September snapshot of the
 * old staging instance, which counted bays per site. Dog forests are that
 * snapshot too. */

window.ENTER_MAP = {
  sources: [
    {
      kind: "handicapparkering",
      label: "Handicapparkering",
      url: "./data/merged-handicap-parking-spots.geojson",
      colour: "#3661d8",
      glyph: window.PARKING_SPOT.glyph,
      describe: window.PARKING_SPOT.describe,
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
