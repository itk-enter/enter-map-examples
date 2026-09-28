/* Host code for the styled widget builds.
 *
 * The widget is created here from `widgetapi.mjs` instead of by the
 * `widgetconfig.js` loader, which keeps both the configuration and the widget
 * instance to itself. Three things need one or the other:
 *
 * 1. The routing key for `route`, which is not in the repository. It is read
 *    from `config/key.json` and put into the configuration before the widget
 *    sees it. Without a key the control is left out — it cannot work, and an
 *    address search that silently returns nothing is worse than no field.
 * 2. The zoom gate. `maxResolution` on a layer hides its features and empties
 *    the list, but the only text the table can show is `emptyText`, which reads
 *    "nothing matches your search" where the honest message is "zoom in". The
 *    card itself is rendered by the panel's `html` control; this decides when it
 *    is shown and how full its progress bar is.
 * 3. "Vis" next to the nearest other place. The distance is a property on the
 *    feature, but selecting the neighbour needs the widget's own API. */

import Widget from "https://widget.cdn.septima.dk/3.23.0/widgetapi.mjs";

/* Zoom steps below the threshold at which the progress bar reads empty. */
const GATE_STEPS = 4;

const mount = document.querySelector("[data-widget-url]");
const configUrl = new URL(mount.getAttribute("data-widget-url"), document.baseURI);
const status = document.getElementById("kort-status");

const config = await loadConfig(configUrl);

/* The threshold is `maxResolution` in the configuration; reading it back from
 * there keeps one source of truth for where the gate sits. */
const threshold = gateThreshold(config);

let gated = null;

const widget = new Widget(mount, config);

widget.on("controlsready", function () {
  apply(widget.getView());
});

widget.on("mapmove", function (name, instance, view) {
  apply(view);
});

async function loadConfig(url) {
  const config = await (await fetch(url)).json();
  const controls = config.map.controls[0];

  if (!controls.route) {
    return config;
  }

  const key = await routeKey(url);

  if (key) {
    controls.route.apikey = key;
  } else {
    delete controls.route;
    forEachSlot(config, function (slot) {
      slot.controls = (slot.controls || []).filter(function (name) {
        return name !== "route";
      });
    });
  }

  return config;
}

/* `config/key.json` holds the keys that must not be committed; see the README.
 * It is absent on a fresh checkout, which is a state the page handles, not an
 * error. */
async function routeKey(configUrl) {
  const response = await fetch(new URL("key.json", configUrl));

  if (!response.ok) {
    return null;
  }

  return (await response.json()).routeApiKey || null;
}

function forEachSlot(config, callback) {
  const slots = (config.map.layout || {}).slots || {};

  Object.keys(slots).forEach(function (name) {
    callback(slots[name]);
  });
}

function gateThreshold(config) {
  const limits = (config.map.layer || [])
    .map(function (layer) {
      return layer.maxResolution;
    })
    .filter(Boolean);

  return limits.length ? Math.max.apply(null, limits) : null;
}

function apply(view) {
  const card = document.querySelector(".zoomgate");

  if (threshold === null || !card || !view || !view.resolution) {
    return;
  }

  // One step is one zoom level: the resolutions are 1638.4 halved per level.
  const steps = Math.log2(view.resolution / threshold);
  const hidden = steps > 0.01;
  const progress = Math.min(1, Math.max(0, 1 - steps / GATE_STEPS));
  const bar = card.querySelector(".zoomgate__bar");

  card.hidden = !hidden;
  document.body.classList.toggle("is-zoomgated", hidden);
  bar.style.setProperty("--zoomgate-progress", String(progress));
  bar.setAttribute("aria-valuenow", String(Math.round(progress * 100)));

  if (hidden === gated) {
    return;
  }
  gated = hidden;

  // The card is not a live region: it is hidden when the data is there, and a
  // region that is `hidden` announces nothing when it comes back.
  if (status) {
    status.textContent = hidden ? card.querySelector(".zoomgate__label").textContent : "";
  }
}

/* "Vis" on the nearest other place. `mi_prinx` is the source's own key and the
 * only identifier the select predicate can see: it reads feature properties,
 * where the GeoJSON feature id does not appear. */
document.addEventListener("click", function (event) {
  const trigger = event.target.closest("[data-nabo-layer]");

  if (!trigger) {
    return;
  }

  const neighbour = Number(trigger.getAttribute("data-nabo"));

  widget.selectFeatureInLayer(
    trigger.getAttribute("data-nabo-layer"),
    function (properties) {
      return properties.mi_prinx === neighbour;
    },
    // Without `minResolution` the widget stops zooming at 3.2, which is the
    // resolution where the layer itself switches off.
    { activateZoom: true, minResolution: 0.4 },
  );
});
