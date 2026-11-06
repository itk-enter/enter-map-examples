/* Address search on Adressevælger, Klimadatastyrelsen's replacement for
 * DAWA, which closed on 1 October 2026. Shared by the map search and the
 * address field in the contribution form.
 *
 * Two calls: a phonetic search that returns labels and ids, then a lookup on
 * the chosen id for its access point. The token is not an API key — it is
 * mandatory but unmanaged, and KDS asks everyone to send this value until
 * user management arrives (expected late 2026). */

window.ADRESSEVAELGER = (function () {
  "use strict";

  const BASE = "https://adressevaelger.dk";
  const TOKEN = "adressevaelger123";
  const KOMMUNEKODE = "0751";
  const SUGGESTION_COUNT = 5;

  /* Street-level hits carry no position and no house number: choosing one
   * narrows the search instead of picking an address. */
  function isAddress(hit) {
    return hit.type === "husnummer";
  }

  async function search(text) {
    const response = await fetch(
      BASE + "/husnumre/soeg?kommunekode=" + KOMMUNEKODE + "&token=" + TOKEN + "&tekst=" + encodeURIComponent(text),
    );

    if (!response.ok) {
      throw new Error("Adressevælger svarede " + response.status);
    }

    const payload = await response.json();

    return (payload.fund || []).slice(0, SUGGESTION_COUNT);
  }

  /* The access point of a house number, in WGS84. */
  async function position(hit) {
    const response = await fetch(BASE + "/husnumre/" + encodeURIComponent(hit.id) + "?token=" + TOKEN);

    if (!response.ok) {
      throw new Error("Adressevælger svarede " + response.status);
    }

    const payload = await response.json();
    const point = payload.husnummer && payload.husnummer.adgangspunkt;

    if (!point || !point.koordinater) {
      throw new Error("Adressen har intet adgangspunkt");
    }

    return utm32ToWgs84(point.koordinater.x, point.koordinater.y);
  }

  /* "Hack Kampmanns Plads 2, 8000 Aarhus C" as the parts of a schema.org
   * PostalAddress, which is what the PublicToilet model holds. */
  function postalAddress(hit) {
    const comma = hit.titel.lastIndexOf(",");
    const postal = comma === -1 ? "" : hit.titel.slice(comma + 1).trim();
    const match = postal.match(/^(\d{4})\s+(.+)$/);

    return {
      streetAddress: hit.vejnavn + " " + hit.husnummer,
      postalCode: match ? match[1] : "",
      addressLocality: match ? match[2] : "",
    };
  }

  /* Adressevælger returns access points in ETRS89 / UTM zone 32N (EPSG:25832),
   * where DAWA returned WGS84. Inverse transverse Mercator on the GRS80
   * ellipsoid, which is what Leaflet needs. */
  function utm32ToWgs84(east, north) {
    const a = 6378137;
    const f = 1 / 298.257222101;
    const k0 = 0.9996;
    const e2 = f * (2 - f);
    const ep2 = e2 / (1 - e2);
    const x = east - 500000;
    const m = north / k0;
    const mu = m / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const phi =
      mu +
      (1.5 * e1 - (27 * Math.pow(e1, 3)) / 32) * Math.sin(2 * mu) +
      ((21 * e1 * e1) / 16 - (55 * Math.pow(e1, 4)) / 32) * Math.sin(4 * mu) +
      ((151 * Math.pow(e1, 3)) / 96) * Math.sin(6 * mu) +
      ((1097 * Math.pow(e1, 4)) / 512) * Math.sin(8 * mu);
    const sin = Math.sin(phi);
    const cos = Math.cos(phi);
    const tan = Math.tan(phi);
    const c = ep2 * cos * cos;
    const t = tan * tan;
    const n = a / Math.sqrt(1 - e2 * sin * sin);
    const r = (a * (1 - e2)) / Math.pow(1 - e2 * sin * sin, 1.5);
    const d = x / (n * k0);
    const lat =
      phi -
      ((n * tan) / r) *
        ((d * d) / 2 -
          ((5 + 3 * t + 10 * c - 4 * c * c - 9 * ep2) * Math.pow(d, 4)) / 24 +
          ((61 + 90 * t + 298 * c + 45 * t * t - 252 * ep2 - 3 * c * c) * Math.pow(d, 6)) / 720);
    const lon =
      (d -
        ((1 + 2 * t + c) * Math.pow(d, 3)) / 6 +
        ((5 - 2 * c + 28 * t - 3 * c * c + 8 * ep2 + 24 * t * t) * Math.pow(d, 5)) / 120) /
      cos;

    return { lat: (lat * 180) / Math.PI, lon: 9 + (lon * 180) / Math.PI };
  }

  /* An ARIA 1.2 combobox over `input` and its `listbox`: suggestions as you
   * type, arrow keys and Enter to choose, Escape and blur to close. Choosing a
   * road puts it back in the field and searches again, which is how
   * Adressevælger expects a hit to be narrowed down; choosing an address calls
   * `onChoose(hit)`. `onError(failed)` reports whether the service answers. */
  function combobox(input, listbox, options) {
    let timer = null;
    let request = 0;
    let hits = [];
    let active = -1;

    input.addEventListener("input", function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(suggest, 250);
    });

    input.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !listbox.hidden) {
        // The list closes first; a second Escape belongs to whatever holds
        // the field.
        event.stopPropagation();
        hide();

        return;
      }

      if (listbox.hidden) {
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        move(event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Enter" && active !== -1) {
        event.preventDefault();
        choose(hits[active]);
      }
    });

    input.addEventListener("blur", hide);

    async function suggest() {
      const text = input.value.trim();
      const current = ++request;

      if (text.length < 3) {
        hide();

        return;
      }

      try {
        const found = await search(text);

        // A slower answer to an earlier keystroke must not replace a newer one.
        if (current !== request) {
          return;
        }

        options.onError(false);
        show(found);
      } catch (error) {
        if (current === request) {
          hide();
          options.onError(true);
        }
      }
    }

    function show(found) {
      if (!found.length) {
        hide();

        return;
      }

      hits = found;
      active = -1;
      listbox.textContent = "";

      found.forEach(function (hit, index) {
        const item = document.createElement("li");

        item.className = "forslag__item";
        item.id = listbox.id + "-" + index;
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", "false");
        item.textContent = hit.titel;

        if (!isAddress(hit)) {
          const note = document.createElement("span");

          note.className = "forslag__note";
          note.textContent = "Vælg for at søge videre på denne vej";
          item.appendChild(note);
        }

        item.addEventListener("mousedown", function (event) {
          // Keeps focus in the field, so the blur handler does not close the
          // list before the click lands.
          event.preventDefault();
        });
        item.addEventListener("click", function () {
          choose(hit);
        });
        listbox.appendChild(item);
      });

      listbox.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }

    function move(step) {
      const items = listbox.children;
      const next = (active + step + items.length + 1) % (items.length + 1);

      active = next === items.length ? -1 : next;

      Array.prototype.forEach.call(items, function (item, index) {
        const isActive = index === active;

        item.classList.toggle("forslag__item--aktiv", isActive);
        item.setAttribute("aria-selected", String(isActive));
      });

      if (active === -1) {
        input.removeAttribute("aria-activedescendant");
      } else {
        input.setAttribute("aria-activedescendant", items[active].id);
        items[active].scrollIntoView({ block: "nearest" });
      }
    }

    function hide() {
      hits = [];
      active = -1;
      listbox.hidden = true;
      listbox.textContent = "";
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }

    function choose(hit) {
      if (isAddress(hit)) {
        hide();
        options.onChoose(hit);

        return;
      }

      input.value = hit.titel + " ";
      hide();
      if (options.onNarrow) {
        options.onNarrow();
      }
      suggest();
    }

    return { hide: hide };
  }

  return { combobox: combobox, position: position, postalAddress: postalAddress };
})();
