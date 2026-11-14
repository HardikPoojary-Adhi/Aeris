#include <ArduinoJson.h>
#include "secrets.h"
#include "google_root_ca.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <Preferences.h>
#include <DHT.h>
#include <HardwareSerial.h>
#include <time.h>
#include <math.h>

// ============================================================
// AERIS — AIR INTELLIGENCE
// ESP32 + WiFi Provisioning + Sensors + Firestore
// ============================================================

// -------------------- PINS --------------------
#define DHTPIN 4
#define DHTTYPE DHT22
#define RESET_BUTTON_PIN 0
#define SDS_RX 16
#define SDS_TX 17
#define MQ7_PIN 34
#define MQ135_PIN 35

// -------------------- OBJECTS --------------------
DHT dht(DHTPIN, DHTTYPE);
HardwareSerial sdsSerial(2);
WebServer server(80);
Preferences preferences;

// -------------------- ACCESS POINT --------------------
const char* AP_SSID = "ESP32_Setup";
const char* AP_PASSWORD = "12345678";

// -------------------- FIRESTORE --------------------
const char* FIRESTORE_URL =
"https://firestore.googleapis.com/v1/projects/"
"aeris-e4168/databases/(default)/documents/devices/device_01";

// -------------------- DASHBOARD --------------------
const char* DASHBOARD_URL =
"https://hardikpoojary-adhi.github.io/Aeris-demo/index.html";

// -------------------- WIFI --------------------
String savedSSID = "";
String savedPassword = "";
String savedLocation = "";

bool wifiConnected = false;

// New Wi-Fi configuration is processed after the HTTP response
// has been sent, preventing the browser from timing out.
bool wifiConnectionPending = false;
String pendingSSID = "";
String pendingPassword = "";

// -------------------- SENSOR VALUES --------------------
float pm25 = 0.0;
float pm10 = 0.0;
float temperature = 0.0;
float humidity = 0.0;

int mq7 = 0;
int mq135 = 0;
int currentAQI = 0;

String currentStatus = "Good";

// -------------------- TIMING --------------------
unsigned long lastSensorRead = 0;
unsigned long lastFirestoreUpload = 0;
unsigned long lastWiFiReconnectAttempt = 0;

const unsigned long SENSOR_INTERVAL = 2000;
const unsigned long FIRESTORE_INTERVAL = 10000;
const unsigned long WIFI_RECONNECT_INTERVAL = 30000;

// -------------------- SDS011 --------------------
float PM_CALIBRATION_FACTOR = 1.0;

// -------------------- RESET BUTTON --------------------
unsigned long resetButtonStart = 0;
bool resetButtonHeld = false;

// ============================================================
// FUNCTION PROTOTYPES
// ============================================================

void loadWiFiCredentials();
void saveWiFiCredentials(String ssid, String password, String location);
void clearWiFiCredentials();

void startSetupAP();
bool connectWiFi(String ssid, String password);
void stopWiFiStation();
void printWiFiStatus();

void setupWebServer();
void handleRoot();
void handleConnect();
void handleNotFound();

void readSensors();
void readSDS011();

int calculateAQI(float pm);
String getAQIStatus(int aqi);

String getTimestamp();
String escapeJsonString(const String& input);

void uploadSensorData();
void checkResetButton();

// ============================================================
// WIFI CREDENTIAL STORAGE
// ============================================================

void loadWiFiCredentials() {

  preferences.begin("wifi", true);

  savedSSID = preferences.getString("ssid", "");
  savedPassword = preferences.getString("password", "");
  savedLocation = preferences.getString("location", "");

  preferences.end();

  Serial.println();
  Serial.println("===== SAVED DEVICE DATA =====");

  Serial.print("SSID: ");
  Serial.println(savedSSID);

  Serial.print("Location: ");
  Serial.println(
    savedLocation.length() ? savedLocation : "Not configured"
  );

  Serial.println("=============================");
}

void saveWiFiCredentials(
  String ssid,
  String password,
  String location
) {

  preferences.begin("wifi", false);

  preferences.putString("ssid", ssid);
  preferences.putString("password", password);
  preferences.putString("location", location);

  preferences.end();

  savedSSID = ssid;
  savedPassword = password;
  savedLocation = location;

  Serial.println();
  Serial.println("Device configuration saved.");

  Serial.print("Location: ");
  Serial.println(savedLocation);
}

void clearWiFiCredentials() {

  preferences.begin("wifi", false);

  preferences.clear();

  preferences.end();

  savedSSID = "";
  savedPassword = "";
  savedLocation = "";

  Serial.println("Device configuration cleared.");
}

// ============================================================
// START ESP32 ACCESS POINT
// ============================================================

void startSetupAP() {

  Serial.println();
  Serial.println("Starting ESP32 setup hotspot...");

  WiFi.disconnect(false, false);
  delay(500);

  WiFi.mode(WIFI_AP_STA);
  delay(200);

  bool result = WiFi.softAP(
    AP_SSID,
    AP_PASSWORD,
    1,
    false,
    4
  );

  if (result) {

    Serial.println();
    Serial.println("================================");
    Serial.println("ESP32 SETUP HOTSPOT STARTED");
    Serial.println("================================");

    Serial.print("SSID: ");
    Serial.println(AP_SSID);

    Serial.print("Password: ");
    Serial.println(AP_PASSWORD);

    Serial.print("Setup IP: ");
    Serial.println(WiFi.softAPIP());

    Serial.println("================================");

  } else {

    Serial.println("ERROR: Failed to start Access Point.");
  }
}

// ============================================================
// STOP WIFI STATION
// ============================================================

void stopWiFiStation() {

  Serial.println("Stopping previous Wi-Fi connection...");

  // Disconnect only the station interface.
  // Do not turn off the ESP32 Wi-Fi radio because the setup AP
  // must remain available during provisioning.
  WiFi.disconnect(false, false);
  delay(300);

  WiFi.mode(WIFI_AP_STA);
  delay(300);

  if (WiFi.softAPIP() == IPAddress(0, 0, 0, 0)) {
    WiFi.softAP(AP_SSID, AP_PASSWORD, 1, false, 4);
    delay(300);
  }

  wifiConnected = false;
}

// ============================================================
// WIFI STATUS
// ============================================================

void printWiFiStatus() {

  Serial.print("Wi-Fi status: ");

  switch (WiFi.status()) {

    case WL_IDLE_STATUS:
      Serial.println("IDLE");
      break;

    case WL_NO_SSID_AVAIL:
      Serial.println("SSID NOT FOUND");
      break;

    case WL_SCAN_COMPLETED:
      Serial.println("SCAN COMPLETED");
      break;

    case WL_CONNECTED:
      Serial.println("CONNECTED");
      break;

    case WL_CONNECT_FAILED:
      Serial.println("CONNECT FAILED");
      break;

    case WL_CONNECTION_LOST:
      Serial.println("CONNECTION LOST");
      break;

    case WL_DISCONNECTED:
      Serial.println("DISCONNECTED");
      break;

    default:
      Serial.println("UNKNOWN");
      break;
  }
}

// ============================================================
// CONNECT TO WIFI
// ============================================================

bool connectWiFi(String ssid, String password) {

  Serial.println();
  Serial.println("================================");
  Serial.println("CONNECTING TO WIFI");
  Serial.println("================================");

  Serial.print("SSID: ");
  Serial.println(ssid);

  stopWiFiStation();

  delay(500);

  WiFi.mode(WIFI_AP_STA);
  delay(200);

  if (password.length() == 0) {
    WiFi.begin(ssid.c_str());
  } else {
    WiFi.begin(ssid.c_str(), password.c_str());
  }

  unsigned long startTime = millis();
  unsigned long lastDot = millis();

  while (
    WiFi.status() != WL_CONNECTED &&
    millis() - startTime < 20000
  ) {

    delay(100);
    server.handleClient();

    if (millis() - lastDot >= 500) {
      Serial.print(".");
      lastDot = millis();
    }
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {

    wifiConnected = true;

    Serial.println("WIFI CONNECTED");

    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());

    Serial.print("RSSI: ");
    Serial.println(WiFi.RSSI());

    Serial.print("Gateway: ");
    Serial.println(WiFi.gatewayIP());

    return true;
  }

  wifiConnected = false;

  Serial.println("WIFI CONNECTION FAILED");

  printWiFiStatus();

  WiFi.disconnect(false, false);
  delay(500);

  WiFi.mode(WIFI_AP_STA);
  delay(200);

  if (WiFi.softAPIP() == IPAddress(0, 0, 0, 0)) {
    WiFi.softAP(AP_SSID, AP_PASSWORD, 1, false, 4);
  }

  return false;
}

// ============================================================
// WEB SERVER
// ============================================================

void setupWebServer() {

  server.on("/", HTTP_GET, handleRoot);

  server.on("/connect", HTTP_POST, handleConnect);

  server.on("/reset", HTTP_GET, []() {

    clearWiFiCredentials();

    server.send(
      200,
      "text/html",
      "<h2>Device configuration cleared.</h2>"
      "<p>Restarting ESP32...</p>"
    );

    delay(1000);
    ESP.restart();
  });

  server.onNotFound(handleNotFound);

  server.begin();

  Serial.println("Web server started.");
}

// ============================================================
// SETUP PAGE
// ============================================================

void handleRoot() {

  String html = R"rawliteral(
<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width, initial-scale=1.0">

<title>AERIS — Device Setup</title>

<style>

:root {
  --bg: #050a12;
  --bg2: #081321;
  --text: #edfaff;
  --muted: #8298aa;
  --cyan: #35d6e5;
  --border: rgba(53,214,229,0.18);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family: Arial, sans-serif;
  color: var(--text);

  background:
    radial-gradient(
      circle at top right,
      rgba(53,214,229,0.08),
      transparent 35%
    ),
    linear-gradient(
      135deg,
      var(--bg),
      var(--bg2)
    );

  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
}

.container {
  width: 100%;
  max-width: 480px;
}

.brand {
  text-align: center;
  margin-bottom: 24px;
}

.brand-title {
  font-size: 30px;
  font-weight: 800;
  letter-spacing: 4px;
  color: var(--cyan);
}

.brand-sub {
  margin-top: 7px;
  font-size: 12px;
  letter-spacing: 2px;
  color: var(--muted);
  text-transform: uppercase;
}

.card {
  background: linear-gradient(
    145deg,
    rgba(14,29,46,0.96),
    rgba(7,17,29,0.96)
  );

  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 28px;

  box-shadow: 0 20px 60px rgba(0,0,0,0.4);
}

.header {
  margin-bottom: 26px;
}

.header h1 {
  margin: 0;
  font-size: 23px;
}

.header p {
  margin-top: 9px;
  color: var(--muted);
  line-height: 1.5;
  font-size: 14px;
}

label {
  display: block;
  margin: 18px 0 8px;
  font-size: 13px;
  color: #a8bdca;
}

input {
  width: 100%;
  padding: 14px 15px;

  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.08);

  background: #07111d;
  color: white;
  font-size: 15px;
  outline: none;
}

input:focus {
  border-color: var(--cyan);
  box-shadow: 0 0 0 3px rgba(53,214,229,0.08);
}

button {
  width: 100%;
  margin-top: 25px;
  padding: 14px;

  border: none;
  border-radius: 12px;

  background: var(--cyan);
  color: #031016;

  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
}

.info {
  margin-top: 22px;
  padding: 13px 15px;

  border-radius: 12px;

  background: rgba(53,214,229,0.05);
  border: 1px solid rgba(53,214,229,0.1);

  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.footer {
  text-align: center;
  margin-top: 18px;

  font-size: 10px;
  letter-spacing: 2px;
  color: #506574;
}

</style>

</head>

<body>

<div class="container">

  <div class="brand">

    <div class="brand-title">AERIS</div>

    <div class="brand-sub">
      Air Intelligence
    </div>

  </div>

  <div class="card">

    <div class="header">

      <h1>Device Network Setup</h1>

      <p>
        Connect your AERIS monitoring device
        to your local Wi-Fi network.
      </p>

    </div>

    <form action="/connect" method="POST">

      <label>Wi-Fi Network</label>

      <input
        type="text"
        name="ssid"
        placeholder="Enter Wi-Fi name"
        required
      >

      <label>Wi-Fi Password</label>

      <input
        type="password"
        name="password"
        placeholder="Enter Wi-Fi password"
      >

      <label>Device Location</label>

      <input
        type="text"
        name="location"
        placeholder="e.g. Innovation Hub, St. Lawrence School"
        maxlength="120"
        required
      >

      <button type="submit">
        Connect Device
      </button>

    </form>

    <div class="info">

      <strong>Setup Network</strong>

      <br>

      Connected through:
      <b>ESP32_Setup</b>

      <br>

      Device address:
      <b>192.168.4.1</b>

    </div>

  </div>

  <div class="footer">
    AERIS — AIR INTELLIGENCE
  </div>

</div>

</body>
</html>
)rawliteral";

  server.send(200, "text/html", html);
}

// ============================================================
// HANDLE WIFI CONNECTION + LOCATION
// ============================================================

void handleConnect() {

  if (
    !server.hasArg("ssid") ||
    !server.hasArg("location")
  ) {

    server.send(
      400,
      "text/html",
      "<h2>Wi-Fi name and device location are required.</h2>"
    );

    return;
  }

  String ssid = server.arg("ssid");
  String password = server.arg("password");
  String location = server.arg("location");

  ssid.trim();
  location.trim();

  if (
    ssid.length() == 0 ||
    location.length() == 0 ||
    location.length() > 120
  ) {

    server.send(
      400,
      "text/html",
      "<h2>Please enter a valid Wi-Fi name and location.</h2>"
    );

    return;
  }

  if (wifiConnectionPending) {
    server.send(
      409,
      "text/html",
      "<h2>A Wi-Fi configuration is already being processed. Please wait.</h2>"
    );
    return;
  }

  Serial.println();
  Serial.println("===== NEW DEVICE CONFIGURATION =====");

  Serial.print("SSID: ");
  Serial.println(ssid);

  Serial.print("Location: ");
  Serial.println(location);

  // Save first so the configuration is not lost if the network
  // connection fails. The user can retry without re-entering it.
  saveWiFiCredentials(ssid, password, location);

  pendingSSID = ssid;
  pendingPassword = password;
  wifiConnectionPending = true;

  // Prevent the normal reconnect timer from immediately starting
  // a second connection attempt.
  lastWiFiReconnectAttempt = millis();

  // Respond before starting the potentially long Wi-Fi connection.
  server.send(
    200,
    "text/html",
    R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AERIS — Configuration Saved</title>
<style>
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: #050a12;
  color: #edfaff;
  font-family: Arial, sans-serif;
}
.card {
  width: 100%;
  max-width: 480px;
  padding: 30px;
  text-align: center;
  background: #0b1726;
  border: 1px solid rgba(53,214,229,.18);
  border-radius: 18px;
}
.logo {
  color: #35d6e5;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 4px;
}
.status {
  margin: 24px 0 12px;
  color: #35d6e5;
  font-size: 18px;
  font-weight: bold;
}
p {
  color: #8298aa;
  line-height: 1.6;
}
.note {
  margin-top: 20px;
  padding: 13px;
  border-radius: 10px;
  background: rgba(53,214,229,.06);
  color: #a8bdca;
  font-size: 13px;
}
a {
  display: inline-block;
  margin-top: 20px;
  color: #35d6e5;
}
</style>
</head>
<body>
<div class="card">
  <div class="logo">AERIS</div>
  <div class="status">Configuration Saved</div>
  <h2>Connecting to your network</h2>
  <p>
    Your Wi-Fi details and device location have been saved.
    AERIS is now attempting to connect to the network.
  </p>
  <div class="note">
    Keep this setup page open for a moment. The ESP32 setup
    hotspot may remain available after the connection attempt.
  </div>
  <a href="/">Return to device setup</a>
</div>
</body>
</html>
)rawliteral"
  );
}

// ============================================================
// NOT FOUND
// ============================================================

void handleNotFound() {

  server.send(
    404,
    "text/plain",
    "AERIS: Page not found."
  );
}

// ============================================================
// SENSOR READING
// ============================================================

void readSensors() {

  float newTemperature = dht.readTemperature();
  float newHumidity = dht.readHumidity();

  if (!isnan(newTemperature)) {
    temperature = newTemperature;
  }

  if (!isnan(newHumidity)) {
    humidity = newHumidity;
  }

  mq7 = analogRead(MQ7_PIN);
  mq135 = analogRead(MQ135_PIN);

  readSDS011();

  currentAQI = calculateAQI(pm25);
  currentStatus = getAQIStatus(currentAQI);

  Serial.println();
  Serial.println("========== SENSOR DATA ==========");

  Serial.print("Temperature: ");
  Serial.print(temperature);
  Serial.println(" °C");

  Serial.print("Humidity: ");
  Serial.print(humidity);
  Serial.println(" %");

  Serial.print("PM2.5: ");
  Serial.print(pm25);
  Serial.println(" µg/m³");

  Serial.print("PM10: ");
  Serial.print(pm10);
  Serial.println(" µg/m³");

  Serial.print("MQ7: ");
  Serial.println(mq7);

  Serial.print("MQ135: ");
  Serial.println(mq135);

  Serial.print("AQI: ");
  Serial.println(currentAQI);

  Serial.print("Status: ");
  Serial.println(currentStatus);

  Serial.println("=================================");
}

// ============================================================
// SDS011 READING
// ============================================================

void readSDS011() {

  while (sdsSerial.available() >= 10) {

    uint8_t buffer[10];

    if (sdsSerial.read() != 0xAA) {
      continue;
    }

    buffer[0] = 0xAA;

    for (int i = 1; i < 10; i++) {
      buffer[i] = sdsSerial.read();
    }

    if (buffer[1] != 0xC0) {
      continue;
    }

    uint8_t checksum = 0;

    for (int i = 2; i <= 7; i++) {
      checksum += buffer[i];
    }

    if (checksum != buffer[8]) {
      continue;
    }

    if (buffer[9] != 0xAB) {
      continue;
    }

    uint16_t pm25Raw =
      ((uint16_t)buffer[3] << 8) | buffer[2];

    uint16_t pm10Raw =
      ((uint16_t)buffer[5] << 8) | buffer[4];

    pm25 =
      (pm25Raw / 10.0) * PM_CALIBRATION_FACTOR;

    pm10 =
      (pm10Raw / 10.0) * PM_CALIBRATION_FACTOR;

    return;
  }
}

// ============================================================
// AQI CALCULATION
// ============================================================

int calculateAQI(float pm) {

  if (pm <= 30.0) {

    return round(
      ((50.0 - 0.0) / (30.0 - 0.0)) * pm
    );

  } else if (pm <= 60.0) {

    return round(
      ((100.0 - 51.0) / (60.0 - 30.0))
      * (pm - 30.0) + 51.0
    );

  } else if (pm <= 90.0) {

    return round(
      ((200.0 - 101.0) / (90.0 - 60.0))
      * (pm - 60.0) + 101.0
    );

  } else if (pm <= 120.0) {

    return round(
      ((300.0 - 201.0) / (120.0 - 90.0))
      * (pm - 90.0) + 201.0
    );

  } else if (pm <= 250.0) {

    return round(
      ((400.0 - 301.0) / (250.0 - 120.0))
      * (pm - 120.0) + 301.0
    );

  } else {

    int aqi = round(
      ((500.0 - 401.0) / (500.0 - 250.0))
      * (pm - 250.0) + 401.0
    );

    return constrain(aqi, 401, 500);
  }
}

// ============================================================
// AQI STATUS
// ============================================================

String getAQIStatus(int aqi) {

  if (aqi <= 50) return "Good";
  else if (aqi <= 100) return "Satisfactory";
  else if (aqi <= 200) return "Moderate";
  else if (aqi <= 300) return "Poor";
  else if (aqi <= 400) return "Very Poor";
  else return "Severe";
}

// ============================================================
// TIMESTAMP
// ============================================================

String getTimestamp() {

  struct tm timeinfo;

  if (!getLocalTime(&timeinfo)) {
    return "Not Synced";
  }

  char buffer[32];

  strftime(
    buffer,
    sizeof(buffer),
    "%Y-%m-%d %H:%M:%S",
    &timeinfo
  );

  return String(buffer);
}

// ============================================================
// JSON STRING ESCAPING
// ============================================================

String escapeJsonString(const String& input) {

  String escaped;
  escaped.reserve(input.length() + 8);

  for (size_t i = 0; i < input.length(); i++) {

    char c = input[i];

    switch (c) {

      case '"':
        escaped += "\\\"";
        break;

      case '\\':
        escaped += "\\\\";
        break;

      case '\b':
        escaped += "\\b";
        break;

      case '\f':
        escaped += "\\f";
        break;

      case '\n':
        escaped += "\\n";
        break;

      case '\r':
        escaped += "\\r";
        break;

      case '\t':
        escaped += "\\t";
        break;

      default:

        if ((uint8_t)c < 0x20) {
          escaped += ' ';
        } else {
          escaped += c;
        }

        break;
    }
  }

  return escaped;
}

// ============================================================
// FIRESTORE UPLOAD
// ============================================================

void uploadSensorData() {

  if (WiFi.status() != WL_CONNECTED) {

    wifiConnected = false;

    Serial.println(
      "Firestore skipped: Wi-Fi disconnected."
    );

    return;
  }

  wifiConnected = true;

  WiFiClientSecure client;

  // Preserved from the existing firmware.
  // For production, configure certificate validation.
  client.setInsecure();

  HTTPClient http;

  if (!http.begin(client, FIRESTORE_URL)) {

    Serial.println("Firestore HTTP begin failed.");

    return;
  }

  http.addHeader(
    "Content-Type",
    "application/json"
  );

  String timestamp = getTimestamp();

  String safeLocation =
    escapeJsonString(savedLocation);

  // ==========================================================
  // FIRESTORE JSON
  // ==========================================================

  String json = "{";

  json += "\"fields\":{";

  json +=
    "\"aqi\":{\"integerValue\":" +
    String(currentAQI) + "},";

  json +=
    "\"status\":{\"stringValue\":\"" +
    currentStatus + "\"},";

  json +=
    "\"temp\":{\"doubleValue\":" +
    String(temperature, 2) + "},";

  json +=
    "\"humidity\":{\"doubleValue\":" +
    String(humidity, 2) + "},";

  json +=
    "\"pm25\":{\"doubleValue\":" +
    String(pm25, 2) + "},";

  json +=
    "\"pm10\":{\"doubleValue\":" +
    String(pm10, 2) + "},";

  json +=
    "\"mq7\":{\"integerValue\":" +
    String(mq7) + "},";

  json +=
    "\"mq135\":{\"integerValue\":" +
    String(mq135) + "},";

  json +=
    "\"last_updated\":{\"stringValue\":\"" +
    timestamp + "\"},";

  // NEW LOCATION FIELD
  json +=
    "\"location\":{\"stringValue\":\"" +
    safeLocation + "\"}";

  json += "}";
  json += "}";

  Serial.println();
  Serial.println("Uploading data to Firestore...");

  Serial.print("Device location: ");
  Serial.println(savedLocation);

  int httpCode = http.PATCH(json);

  Serial.print("Firestore HTTP code: ");
  Serial.println(httpCode);

  if (httpCode > 0) {

    String response = http.getString();

    if (httpCode >= 200 && httpCode < 300) {

      Serial.println(
        "Firestore upload successful."
      );

    } else {

      Serial.println(
        "Firestore returned an error:"
      );

      Serial.println(response);
    }

  } else {

    Serial.print("Firestore request failed: ");

    Serial.println(
      http.errorToString(httpCode)
    );
  }

  http.end();
}

// ============================================================
// RESET BUTTON
// ============================================================

void checkResetButton() {

  bool pressed =
    digitalRead(RESET_BUTTON_PIN) == LOW;

  if (pressed) {

    if (!resetButtonHeld) {

      resetButtonHeld = true;

      resetButtonStart = millis();

      Serial.println("Reset button pressed.");
    }

    if (
      millis() - resetButtonStart >= 3000
    ) {

      Serial.println();
      Serial.println(
        "RESET BUTTON HELD FOR 3 SECONDS."
      );

      Serial.println(
        "Clearing device configuration..."
      );

      clearWiFiCredentials();

      delay(500);

      ESP.restart();
    }

  } else {

    resetButtonHeld = false;
  }
}

// ============================================================
// SETUP
// ============================================================

void setup() {

  Serial.begin(115200);

  delay(1000);

  Serial.println();
  Serial.println();

  Serial.println("================================");
  Serial.println("        AERIS DEVICE BOOT");
  Serial.println("================================");

  pinMode(
    RESET_BUTTON_PIN,
    INPUT_PULLUP
  );

  dht.begin();

  sdsSerial.begin(
    9600,
    SERIAL_8N1,
    SDS_RX,
    SDS_TX
  );

  analogReadResolution(12);

  loadWiFiCredentials();

  startSetupAP();

  setupWebServer();

  configTime(
    19800,
    0,
    "pool.ntp.org",
    "time.nist.gov"
  );

  if (savedSSID.length() > 0) {

    Serial.println(
      "Saved Wi-Fi credentials found."
    );

    Serial.print("Saved device location: ");
    Serial.println(savedLocation);

    bool connected = connectWiFi(
      savedSSID,
      savedPassword
    );

    if (!connected) {

      Serial.println();
      Serial.println(
        "Saved Wi-Fi connection failed."
      );

      Serial.println(
        "Enter new credentials through the setup page."
      );
    }

  } else {

    Serial.println();
    Serial.println(
      "No saved Wi-Fi credentials."
    );

    Serial.println(
      "Connect to ESP32_Setup and open http://192.168.4.1"
    );
  }

  Serial.println("================================");
  Serial.println("AERIS READY");
  Serial.println("================================");
}

// ============================================================
// MAIN LOOP
// ============================================================

void loop() {

  server.handleClient();

  checkResetButton();

  // Process a newly submitted Wi-Fi configuration only after the
  // HTTP response has been sent to the browser.
  if (wifiConnectionPending) {

    wifiConnectionPending = false;

    Serial.println();
    Serial.println("Processing new Wi-Fi configuration...");

    connectWiFi(pendingSSID, pendingPassword);

    pendingSSID = "";
    pendingPassword = "";
  }

  // SENSOR READING
  if (
    millis() - lastSensorRead >= SENSOR_INTERVAL
  ) {

    lastSensorRead = millis();

    readSensors();
  }

  // WIFI STATUS
  if (WiFi.status() == WL_CONNECTED) {

    if (!wifiConnected) {

      wifiConnected = true;

      Serial.println(
        "Wi-Fi connection restored."
      );
    }

  } else {

    if (wifiConnected) {

      wifiConnected = false;

      Serial.println(
        "Wi-Fi connection lost."
      );
    }
  }

  // AUTOMATIC WIFI RECONNECTION
  if (
    savedSSID.length() > 0 &&
    WiFi.status() != WL_CONNECTED &&
    millis() - lastWiFiReconnectAttempt >=
      WIFI_RECONNECT_INTERVAL
  ) {

    lastWiFiReconnectAttempt = millis();

    connectWiFi(
      savedSSID,
      savedPassword
    );
  }

  // FIRESTORE UPLOAD
  if (
    millis() - lastFirestoreUpload >=
      FIRESTORE_INTERVAL
  ) {

    lastFirestoreUpload = millis();

    uploadSensorData();
  }
}