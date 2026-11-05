
/* ============================================================
   AERIS — LOCATION DIRECTORY
   Firestore device network
   ============================================================ */


/* ============================================================
   01. CONFIGURATION
   ============================================================ */

const LOCATION_CONFIG = {
  collectionURL:
    "https://firestore.googleapis.com/v1/projects/aeris-e4168/databases/(default)/documents/devices",

  refreshInterval: 5000,

  pageSize: 100,

  // A device is considered offline when its last update
  // is older than this threshold.
  offlineThreshold: 90 * 1000
};


/* ============================================================
   02. DOM REFERENCES
   ============================================================ */

const elements = {
  total: document.getElementById("totalDevices"),
  online: document.getElementById("onlineDevices"),
  offline: document.getElementById("offlineDevices"),

  synchronized: document.getElementById("lastSynchronized"),
  count: document.getElementById("deviceCountLabel"),

  list: document.getElementById("deviceList"),

  loading: document.getElementById("locationLoading"),
  error: document.getElementById("locationError"),
  errorMessage: document.getElementById("locationErrorMessage"),
  empty: document.getElementById("locationEmpty"),

  retry: document.getElementById("retryLocationFetch")
};


/* ============================================================
   03. APPLICATION STATE
   ============================================================ */

let devices = [];
let expandedDeviceId = null;

let isFetching = false;
let lastRenderedData = "";

let refreshTimer = null;


/* ============================================================
   04. FIRESTORE VALUE DECODER
   ============================================================ */

function decodeFirestoreValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "object") {
    return value;
  }

  if ("stringValue" in value) {
    return value.stringValue;
  }

  if ("integerValue" in value) {
    return Number(value.integerValue);
  }

  if ("doubleValue" in value) {
    return value.doubleValue;
  }

  if ("booleanValue" in value) {
    return value.booleanValue;
  }

  if ("nullValue" in value) {
    return null;
  }

  if ("timestampValue" in value) {
    return value.timestampValue;
  }

  if ("referenceValue" in value) {
    return value.referenceValue;
  }

  if ("geoPointValue" in value) {
    return value.geoPointValue;
  }

  if ("arrayValue" in value) {
    return (value.arrayValue.values || [])
      .map(decodeFirestoreValue);
  }

  if ("mapValue" in value) {
    return decodeFirestoreFields(
      value.mapValue.fields || {}
    );
  }

  return value;
}


function decodeFirestoreFields(fields = {}) {
  const result = {};

  for (const [key, value] of Object.entries(fields)) {
    result[key] = decodeFirestoreValue(value);
  }

  return result;
}


/* ============================================================
   05. DATA HELPERS
   ============================================================ */

function getDeviceId(document) {
  const name = document.name || "";

  return name.split("/").pop() || "Unknown";
}


function getDeviceLocation(fields) {
  const location = fields.location;

  if (
    location === null ||
    location === undefined ||
    String(location).trim() === ""
  ) {
    return "Location not assigned";
  }

  return String(location).trim();
}


function getAQI(fields) {
  const value = fields.aqi;

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  return formatValue(value);
}


function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}


function formatFieldName(name) {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}


/* ============================================================
   06. TIMESTAMP HANDLING
   ============================================================ */

function parseTimestamp(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  let date;

  if (typeof value === "number") {
    // Support Unix seconds and milliseconds.
    date = new Date(
      value < 100000000000 ? value * 1000 : value
    );
  } else {
    date = new Date(value);
  }

  return Number.isNaN(date.getTime()) ? null : date;
}


function getLastUpdated(fields) {
  return parseTimestamp(fields.last_updated);
}


function getConnectivity(fields) {
  const lastUpdated = getLastUpdated(fields);

  if (!lastUpdated) {
    return "unknown";
  }

  const age = Date.now() - lastUpdated.getTime();

  return age <= LOCATION_CONFIG.offlineThreshold
    ? "online"
    : "offline";
}


function formatTimestamp(date) {
  if (!date) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(date);
}


function formatClock(date = new Date()) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(date);
}


/* ============================================================
   07. SAFE HTML ELEMENT CREATION
   ============================================================ */

function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== undefined && text !== null) {
    element.textContent = text;
  }

  return element;
}


/* ============================================================
   08. SENSOR UNIT HELPERS
   ============================================================ */

function getSensorUnit(field) {
  const units = {
    temp: "°C",
    temperature: "°C",
    humidity: "%",
    pm25: "µg/m³",
    pm10: "µg/m³"
  };

  return units[field.toLowerCase()] || "";
}


/* ============================================================
   09. CONNECTIVITY COMPONENT
   ============================================================ */

function createConnectivity(status) {
  const labels = {
    online: "Online",
    offline: "Offline",
    unknown: "Unknown"
  };

  const badge = createElement(
    "div",
    `location-connectivity is-${status}`
  );

  badge.appendChild(
    createElement("span", "location-connectivity-dot")
  );

  badge.appendChild(
    createElement(
      "span",
      "",
      labels[status] || "Unknown"
    )
  );

  return badge;
}


/* ============================================================
   10. SENSOR CARD COMPONENT
   ============================================================ */

function createSensorCard(field, value) {
  const card = createElement(
    "div",
    "location-sensor-card"
  );

  const label = createElement(
    "div",
    "location-sensor-label",
    formatFieldName(field)
  );

  const valueContainer = createElement(
    "div",
    "location-sensor-value"
  );

  const formattedValue = formatValue(value);
  const unit = getSensorUnit(field);

  valueContainer.appendChild(
    document.createTextNode(formattedValue)
  );

  if (unit && formattedValue !== "—") {
    valueContainer.appendChild(
      createElement("span", "location-sensor-unit", unit)
    );
  }

  card.append(label, valueContainer);

  return card;
}


/* ============================================================
   11. METADATA COMPONENT
   ============================================================ */

function createMetadataItem(label, value) {
  const item = createElement(
    "div",
    "location-metadata-item"
  );

  item.append(
    createElement(
      "span",
      "location-metadata-label",
      label
    ),

    createElement(
      "span",
      "location-metadata-value",
      value
    )
  );

  return item;
}


/* ============================================================
   12. DEVICE DETAILS
   ============================================================ */

function createDeviceDetails(device) {
  const { id, fields } = device;

  const details = createElement(
    "div",
    "location-device-details"
  );

  const inner = createElement(
    "div",
    "location-device-details-inner"
  );

  const content = createElement(
    "div",
    "location-device-content"
  );


  // Detail heading

  const heading = createElement(
    "div",
    "location-detail-heading"
  );

  const headingCopy = document.createElement("div");

  headingCopy.append(
    createElement(
      "h3",
      "",
      getDeviceLocation(fields)
    ),

    createElement(
      "p",
      "",
      "Environmental monitoring device"
    )
  );

  const connectivity = createConnectivity(
    getConnectivity(fields)
  );

  heading.append(headingCopy, connectivity);


  // Sensor fields

  const sensorGrid = createElement(
    "div",
    "location-sensor-grid"
  );

  // Location and last_updated are displayed separately.
  // All other Firestore fields are displayed here.

  const excludedFields = [
    "location",
    "last_updated"
  ];

  const sensorEntries = Object.entries(fields)
    .filter(([key]) => !excludedFields.includes(key))
    .sort(([a], [b]) => a.localeCompare(b));

  if (sensorEntries.length === 0) {
    sensorGrid.appendChild(
      createElement(
        "p",
        "",
        "No additional sensor data available."
      )
    );
  } else {
    for (const [key, value] of sensorEntries) {
      sensorGrid.appendChild(
        createSensorCard(key, value)
      );
    }
  }


  // Metadata

  const metadata = createElement(
    "div",
    "location-metadata"
  );

  const lastUpdated = getLastUpdated(fields);

  metadata.append(
    createMetadataItem(
      "Last Updated",
      formatTimestamp(lastUpdated)
    ),

    createMetadataItem(
      "Device ID",
      id
    )
  );


  content.append(
    heading,
    sensorGrid,
    metadata
  );

  inner.appendChild(content);
  details.appendChild(inner);

  return details;
}


/* ============================================================
   13. DEVICE ROW
   ============================================================ */

function createDeviceRow(device) {
  const { id, fields } = device;

  const isExpanded = expandedDeviceId === id;

  const article = createElement(
    "article",
    `location-device${isExpanded ? " is-expanded" : ""}`
  );

  article.dataset.deviceId = id;


  // Main clickable row

  const trigger = createElement(
    "button",
    "location-device-trigger"
  );

  trigger.type = "button";
  trigger.setAttribute("aria-expanded", String(isExpanded));

  const detailsId = `device-details-${CSS.escape(id)}`;

  trigger.setAttribute("aria-controls", detailsId);


  // Location

  const main = createElement(
    "div",
    "location-device-main"
  );

  main.append(
    createElement(
      "div",
      "location-device-label",
      "Assigned Location"
    ),

    createElement(
      "div",
      "location-device-name",
      getDeviceLocation(fields)
    )
  );


  // AQI

  const aqi = createElement(
    "div",
    "location-device-aqi"
  );

  aqi.append(
    createElement(
      "strong",
      "",
      getAQI(fields)
    ),

    createElement(
      "span",
      "",
      "AQI"
    )
  );


  // Device ID

  const deviceId = createElement(
    "div",
    "location-device-id",
    id
  );


  // Expand indicator

  const arrow = createElement(
    "span",
    "location-device-arrow",
    "⌄"
  );

  arrow.setAttribute("aria-hidden", "true");


  trigger.append(
    main,
    aqi,
    deviceId,
    arrow
  );


  // Expanded details

  const details = createDeviceDetails(device);

  details.id = detailsId;
  details.setAttribute("aria-hidden", String(!isExpanded));


  // Accordion interaction

  trigger.addEventListener("click", () => {
    if (expandedDeviceId === id) {
      expandedDeviceId = null;
    } else {
      expandedDeviceId = id;
    }

    renderDevices();
  });


  article.append(
    trigger,
    details
  );

  return article;
}


/* ============================================================
   14. DEVICE DIRECTORY RENDERING
   ============================================================ */

function renderDevices(force = false) {
  const signature = JSON.stringify(devices);

  // Avoid unnecessary DOM replacement during unchanged refreshes.
  if (!force && signature === lastRenderedData) {
    return;
  }

  lastRenderedData = signature;

  const fragment = document.createDocumentFragment();

  for (const device of devices) {
    fragment.appendChild(
      createDeviceRow(device)
    );
  }

  elements.list.replaceChildren(
    elements.loading,
    elements.error,
    elements.empty,
    fragment
  );

  elements.loading.hidden = true;
  elements.error.hidden = true;
  elements.empty.hidden = devices.length !== 0;

  if (devices.length === 0) {
    expandedDeviceId = null;
  }

  updateOverview();
}


/* ============================================================
   15. OVERVIEW COUNTERS
   ============================================================ */

function updateOverview() {
  let online = 0;
  let offline = 0;

  for (const device of devices) {
    const status = getConnectivity(device.fields);

    if (status === "online") {
      online++;
    } else if (status === "offline") {
      offline++;
    }
  }

  elements.total.textContent = devices.length;
  elements.online.textContent = online;
  elements.offline.textContent = offline;

  elements.count.textContent =
    `${devices.length} ${devices.length === 1 ? "DEVICE" : "DEVICES"}`;
}


/* ============================================================
   16. FIRESTORE COLLECTION FETCH
   ============================================================ */

async function fetchAllDevices() {
  const allDocuments = [];

  let nextPageToken = null;
  const usedTokens = new Set();

  do {
    const url = new URL(LOCATION_CONFIG.collectionURL);

    url.searchParams.set(
      "pageSize",
      LOCATION_CONFIG.pageSize
    );

    if (nextPageToken) {
      url.searchParams.set(
        "pageToken",
        nextPageToken
      );
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      let message = `Firestore request failed (${response.status})`;

      try {
        const errorData = await response.json();

        if (errorData.error?.message) {
          message = errorData.error.message;
        }
      } catch {
        // Keep the original error message.
      }

      throw new Error(message);
    }

    const data = await response.json();

    if (Array.isArray(data.documents)) {
      allDocuments.push(...data.documents);
    }

    nextPageToken = data.nextPageToken || null;

    // Protect against a repeated pagination token.
    if (nextPageToken) {
      if (usedTokens.has(nextPageToken)) {
        throw new Error("Firestore returned a repeated page token.");
      }

      usedTokens.add(nextPageToken);
    }

  } while (nextPageToken);


  return allDocuments.map(document => ({
    id: getDeviceId(document),
    fields: decodeFirestoreFields(
      document.fields || {}
    )
  }));
}


/* ============================================================
   17. LOADING & ERROR STATES
   ============================================================ */

function showLoading() {
  if (devices.length === 0) {
    elements.loading.hidden = false;
  }

  elements.error.hidden = true;
  elements.empty.hidden = true;
}


function showError(message) {
  elements.loading.hidden = true;
  elements.error.hidden = false;

  elements.errorMessage.textContent = message;

  // Keep previously loaded devices visible if refresh fails.
  if (devices.length > 0) {
    elements.error.style.order = "-1";
  }
}


function hideError() {
  elements.error.hidden = true;
  elements.error.style.order = "";
}


/* ============================================================
   18. MAIN REFRESH FUNCTION
   ============================================================ */

async function refreshDevices() {
  if (isFetching) {
    return;
  }

  isFetching = true;

  if (devices.length === 0) {
    showLoading();
  }

  try {
    const newDevices = await fetchAllDevices();

    // Keep the expanded device if it still exists.
    if (
      expandedDeviceId &&
      !newDevices.some(device => device.id === expandedDeviceId)
    ) {
      expandedDeviceId = null;
    }

    devices = newDevices;

    hideError();

    // Rebuild only when the data actually changes.
    renderDevices();

    elements.synchronized.textContent = formatClock();

  } catch (error) {
    console.error("[AERIS Location] Fetch error:", error);

    showError(error.message || "Unable to retrieve device information.");

  } finally {
    isFetching = false;
  }
}


/* ============================================================
   19. RETRY BUTTON
   ============================================================ */

elements.retry.addEventListener("click", () => {
  refreshDevices();
});


/* ============================================================
   20. INITIALIZATION
   ============================================================ */

function initializeLocationPage() {
  console.info("[AERIS Location] Device directory initialized.");

  refreshDevices();

  refreshTimer = setInterval(
    refreshDevices,
    LOCATION_CONFIG.refreshInterval
  );
}


/* ============================================================
   21. CLEANUP
   ============================================================ */

window.addEventListener("pagehide", () => {
  if (refreshTimer !== null) {
    clearInterval(refreshTimer);
  }
});


/* ============================================================
   22. START
   ============================================================ */

initializeLocationPage();
