/* Citizen contributions: the store and what the contribution page and the
 * review page share about them. Load after the model files in js/maps/.
 *
 * DEMO: contributions are kept in this browser's IndexedDB, not sent
 * anywhere. Another browser, or another person, does not see them. Tabs in
 * the same browser are kept in step through a BroadcastChannel, so approving
 * in the review page updates an open map.
 *
 * A contribution, as a backend would hold it:
 *
 *   {
 *     id, entityId, entityType,             // NGSI-LD id and type of the place
 *     place: { title, address },            // as the contributor saw it
 *     createdAt,                            // ISO 8601
 *     contributor: {
 *       subject,                            // pseudonym, never a CPR number
 *       name,                               // full name from the login
 *       displayName,                        // what is shown if showName
 *       showName,                           // consent to show it
 *       authMethod: "mitid",
 *       assurance: "substantial",           // NSIS level of the login
 *     },
 *     changes: [{ attribute, previous, value, incorrect, review }],
 *     closure: { value: "removed" | "temporarilyClosed", review } | null,
 *     message: { text, review } | null,     // "Skriv om noget andet"
 *     photos: [{ id, blob, width, height, review }],
 *     rating: { stars, review } | null,     // 1–5
 *     comment: { text, review } | null,     // with a rating, optional
 *     note,                                 // "how do you know", optional
 *   }
 *
 * `review` is null until decided, then { status: "approved" | "rejected",
 * reason, by, at }. A change with `incorrect` says the current value is wrong
 * without giving the right one; approved, it removes the value.
 *
 * A rating is a contribution of its own, with no changes or photos. A
 * person's newest approved rating of a place is the one that counts; an
 * earlier one, and its comment, stop showing once a newer one is approved. */

window.CONTRIBUTIONS = (function () {
  "use strict";

  const DB_NAME = "enter-contributions";
  const STORE = "contributions";
  const channel = "BroadcastChannel" in window ? new BroadcastChannel(DB_NAME) : null;
  const listeners = [];

  const MODELS = {
    ParkingSpot: window.PARKING_SPOT,
    PublicToilet: window.PUBLIC_TOILET,
    Bench: window.BENCH,
  };

  const CLOSURES = {
    removed: "Stedet findes ikke længere",
    temporarilyClosed: "Stedet er midlertidigt lukket",
  };

  const STATUSES = {
    pending: "Afventer godkendelse",
    approved: "Godkendt",
    partial: "Delvist godkendt",
    rejected: "Ikke godkendt",
  };

  const AUTH_METHODS = { mitid: "MitID" };
  const ASSURANCES = { substantial: "Betydelig" };

  /* Store ------------------------------------------------------------------ */

  let database = null;

  function open() {
    if (!database) {
      database = new Promise(function (resolve, reject) {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = function () {
          request.result.createObjectStore(STORE, { keyPath: "id" }).createIndex("entityId", "entityId");
        };
        request.onsuccess = function () {
          resolve(request.result);
        };
        request.onerror = function () {
          reject(request.error);
        };
      });
    }

    return database;
  }

  function transaction(mode, work) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE, mode);
        const result = work(tx.objectStore(STORE));

        tx.oncomplete = function () {
          resolve(result.result);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  /* Newest first. */
  function list() {
    return transaction("readonly", function (store) {
      return store.getAll();
    }).then(function (records) {
      return records.sort(function (a, b) {
        return b.createdAt.localeCompare(a.createdAt);
      });
    });
  }

  function save(record) {
    return transaction("readwrite", function (store) {
      return store.put(record);
    }).then(changed);
  }

  function clear() {
    return transaction("readwrite", function (store) {
      return store.clear();
    }).then(changed);
  }

  /* Tells this tab's listeners and every other tab's. */
  function changed() {
    if (channel) {
      channel.postMessage("changed");
    }
    listeners.forEach(function (listener) {
      listener();
    });
  }

  function onChange(listener) {
    listeners.push(listener);
  }

  if (channel) {
    channel.addEventListener("message", function () {
      listeners.forEach(function (listener) {
        listener();
      });
    });
  }

  /* Review ----------------------------------------------------------------- */

  /* Everything in a contribution that is approved or rejected on its own. */
  function items(record) {
    return []
      .concat(record.changes)
      .concat(record.closure ? [record.closure] : [])
      .concat(record.message ? [record.message] : [])
      .concat(record.photos)
      .concat(record.rating ? [record.rating] : [])
      .concat(record.comment ? [record.comment] : []);
  }

  function status(record) {
    const reviews = items(record).map(function (item) {
      return item.review;
    });

    if (reviews.some(function (review) {
      return !review;
    })) {
      return "pending";
    }

    const approved = reviews.filter(function (review) {
      return review.status === "approved";
    }).length;

    return approved === reviews.length ? "approved" : approved ? "partial" : "rejected";
  }

  function approved(item) {
    return Boolean(item.review) && item.review.status === "approved";
  }

  /* What a contribution holds, in a few words: "2 oplysninger, 1 foto og en
   * melding om lukning". One contribution can mix them all. */
  function summary(record) {
    const parts = [];

    if (record.changes.length) {
      parts.push(record.changes.length + (record.changes.length === 1 ? " oplysning" : " oplysninger"));
    }
    if (record.photos.length) {
      parts.push(record.photos.length + (record.photos.length === 1 ? " foto" : " fotos"));
    }
    if (record.closure) {
      parts.push("en melding om lukning");
    }
    if (record.message) {
      parts.push("en besked");
    }
    if (record.rating) {
      parts.push(stars(record.rating.stars) + (record.comment ? " med kommentar" : ""));
    }

    return parts.length > 1 ? parts.slice(0, -1).join(", ") + " og " + parts[parts.length - 1] : parts[0] || "";
  }

  /* "1 stjerne", "4 stjerner". */
  function stars(count) {
    return count + (count === 1 ? " stjerne" : " stjerner");
  }

  /* What the public sees of a place's ratings, from its contributions: each
   * person's newest approved rating counts once; its comment shows if that
   * was approved too. Newest first. */
  function ratingsFor(records) {
    const bySubject = new Map();

    records.forEach(function (record) {
      if (!record.rating || !approved(record.rating)) {
        return;
      }

      const known = bySubject.get(record.contributor.subject);

      if (!known || known.rating.review.at < record.rating.review.at) {
        bySubject.set(record.contributor.subject, record);
      }
    });

    const counted = Array.from(bySubject.values()).sort(function (a, b) {
      return b.rating.review.at.localeCompare(a.rating.review.at);
    });
    const total = counted.reduce(function (sum, record) {
      return sum + record.rating.stars;
    }, 0);

    return {
      count: counted.length,
      average: counted.length ? total / counted.length : 0,
      comments: counted.filter(function (record) {
        return record.comment && approved(record.comment);
      }),
    };
  }

  function formatAverage(average) {
    return average.toFixed(1).replace(".", ",");
  }

  /* Fields and values ------------------------------------------------------ */

  function fields(entityType) {
    return MODELS[entityType] ? MODELS[entityType].fields : [];
  }

  function field(entityType, attribute) {
    return fields(entityType).find(function (candidate) {
      return candidate.attribute === attribute;
    });
  }

  /* `additionalInformation.fee` reads the nested property. */
  function read(properties, attribute) {
    return attribute.split(".").reduce(function (value, key) {
      return value === undefined || value === null ? undefined : value[key];
    }, properties);
  }

  /* A copy of `properties` with one attribute set, or removed when `value` is
   * undefined; nested objects on the way are copied, not changed. */
  function write(properties, attribute, value) {
    const keys = attribute.split(".");
    const copy = Object.assign({}, properties);
    let target = copy;

    keys.slice(0, -1).forEach(function (key) {
      target[key] = Object.assign({}, target[key]);
      target = target[key];
    });

    if (value === undefined) {
      delete target[keys[keys.length - 1]];
    } else {
      target[keys[keys.length - 1]] = value;
    }

    return copy;
  }

  function isEmpty(value) {
    return value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length);
  }

  /* The value as the detail would say it. */
  function format(field, value) {
    if (isEmpty(value)) {
      return "";
    }

    switch (field.type) {
      case "choice": {
        const option = field.options.find(function (candidate) {
          return candidate.value === value;
        });

        return option ? option.label : String(value);
      }
      case "boolean": {
        const labels = field.labels || { yes: "Ja", no: "Nej" };

        return value ? labels.yes : labels.no;
      }
      case "number":
        return String(value).replace(".", ",") + (field.unit ? " " + field.unit : "");
      case "openingHours":
        return [].concat(value).join("; ");
      case "address":
        return [value.streetAddress, [value.postalCode, value.addressLocality].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", ");
      default:
        return String(value);
    }
  }

  /* People ----------------------------------------------------------------- */

  function publicName(contributor) {
    return contributor.showName ? contributor.displayName : "en borger";
  }

  const DATE = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", year: "numeric" });
  const DATE_TIME = new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeStyle: "short" });

  function formatDate(iso) {
    return DATE.format(new Date(iso));
  }

  function formatDateTime(iso) {
    return DATE_TIME.format(new Date(iso));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  return {
    list: list,
    save: save,
    clear: clear,
    onChange: onChange,
    items: items,
    status: status,
    approved: approved,
    summary: summary,
    stars: stars,
    ratingsFor: ratingsFor,
    formatAverage: formatAverage,
    fields: fields,
    field: field,
    read: read,
    write: write,
    isEmpty: isEmpty,
    format: format,
    publicName: publicName,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    escapeHtml: escapeHtml,
    CLOSURES: CLOSURES,
    STATUSES: STATUSES,
    AUTH_METHODS: AUTH_METHODS,
    ASSURANCES: ASSURANCES,
  };
})();
