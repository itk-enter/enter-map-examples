/* Toilets for toiletter-samlet.html: the merged-public-toilets source in
 * Enter, where each toilet is stated once, merged from the toilet sources
 * toiletter.html shows side by side. The detail names the sources a toilet
 * was merged from. */

window.ENTER_MAP = {
  sources: [
    {
      kind: "merged-public-toilets",
      label: "Offentlige toiletter (samlet)",
      url: "./data/merged-public-toilets.geojson",
      colour: "#6b3fa0",
      glyph: window.PUBLIC_TOILET.glyph,
      describe: window.PUBLIC_TOILET.describer(window.PUBLIC_TOILET.mergedFrom),
    },
  ],
};
