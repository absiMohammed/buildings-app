/*
 * Building-app gate controller — Wemos D1 Mini (ESP8266)
 *
 * Hardware
 *   - Wemos D1 Mini (ESP8266)
 *   - 5V 1-channel relay module, active-low (LOW on IN = relay engaged)
 *   - MC-38 reed switch (NO): contacts CLOSED when the magnets are
 *     together (door shut), OPEN when they're apart.
 *
 * Wiring
 *   Wemos                  Module
 *   ───────                ──────────────────────
 *   5V        ── relay     VCC
 *   GND       ── relay     GND
 *   D1 (G5)   ── relay     IN
 *
 *   D2 (G4)   ── reed      one terminal
 *   GND       ── reed      other terminal
 *
 *   The reed pin uses INPUT_PULLUP, so an OPEN reed (door open) reads
 *   HIGH and a CLOSED reed (door shut) reads LOW.
 *
 * Behaviour
 *   - Connects to Wi-Fi, then opens WSS to the backend at /ws/gate.
 *   - On a {"type":"trigger"} message from the server, pulses the relay
 *     LOW for PULSE_MS to fire the contactor.
 *   - On boot and on every debounced reed change, sends
 *     {"type":"door_state","state":"open|closed"} so the server can
 *     keep the rest of the app in sync.
 *
 * Libraries (Arduino Library Manager)
 *   - ESP8266 board support (Boards Manager URL:
 *     http://arduino.esp8266.com/stable/package_esp8266com_index.json)
 *   - WebSockets by Markus Sattler (>= 2.4.0)
 *   - ArduinoJson (>= 7.0.0)
 */

#include <ESP8266WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// ─── Configuration ────────────────────────────────────────────────────

const char *WIFI_SSID     = "Absi's Home";
const char *WIFI_PASSWORD = "Absi@123#";

const char *WS_HOST   = "building-app-server.onrender.com";
const uint16_t WS_PORT = 443;
const bool   WS_USE_TLS = true;
static const char *WS_PATH = "/ws/gate";

// Wemos D1 Mini pin map: D1 = GPIO5, D2 = GPIO4.
const uint8_t  RELAY_PIN  = 5;          // active-low: LOW = relay ON
const uint16_t PULSE_MS   = 500;
const uint8_t  REED_PIN   = 4;          // INPUT_PULLUP; LOW = door closed
const uint16_t REED_DEBOUNCE_MS = 50;

// Onboard LED on Wemos D1 Mini is on GPIO2 (D4), active-low.
const int8_t   LED_PIN    = 2;

// ─── End configuration ────────────────────────────────────────────────

WebSocketsClient ws;
uint32_t lastWifiAttemptMs = 0;

// Reed-switch debounce state
int      lastReedRead   = HIGH;        // raw read
int      stableReed     = HIGH;        // last debounced reading
uint32_t reedChangedAt  = 0;
bool     reedReported   = false;       // have we sent the current state yet?

// LED helpers
static inline void setLed(bool on) {
  if (LED_PIN < 0) return;
  digitalWrite(LED_PIN, on ? LOW : HIGH); // active-low onboard LED
}

// Relay helpers — open-drain style. The 5V opto-isolator on this
// "active-low" module doesn't fully turn off when IN is driven to 3.3V
// (Wemos GPIO HIGH); the ~1.7V drop across the opto LED keeps it
// partially conducting and the relay stays engaged. So instead of
// digitalWrite HIGH for "off", we set the pin to high-Z (INPUT) and
// let the module's own 5V rail pull IN up to 5V — that's enough to
// fully close the opto's input. To engage, we switch the pin back to
// OUTPUT LOW and sink the opto's drive current to GND.
static inline void relayOff() { pinMode(RELAY_PIN, INPUT); }
static inline void relayOn()  {
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);
}

static void pulseRelay() {
  Serial.println(F("[gate] trigger -> pulse relay"));
  relayOn();
  delay(PULSE_MS);
  relayOff();
}

// Reed -> JSON helpers
static const char *reedStateString(int reading) {
  // NO reed + INPUT_PULLUP: LOW = magnet present = door CLOSED.
  return (reading == LOW) ? "closed" : "open";
}

static void sendDoorState(int reading) {
  if (ws.isConnected()) {
    StaticJsonDocument<64> doc;
    doc["type"] = "door_state";
    doc["state"] = reedStateString(reading);
    char buf[64];
    size_t n = serializeJson(doc, buf, sizeof(buf));
    ws.sendTXT(buf, n);
    Serial.printf("[reed] -> %s\n", reedStateString(reading));
    reedReported = true;
  }
}

static void onWsEvent(WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.println(F("[ws] connected"));
      setLed(true);
      reedReported = false;        // re-announce current door state
      break;
    case WStype_DISCONNECTED:
      Serial.println(F("[ws] disconnected"));
      setLed(false);
      break;
    case WStype_TEXT: {
      JsonDocument doc;
      DeserializationError err = deserializeJson(doc, payload, length);
      if (err) {
        Serial.print(F("[ws] bad JSON: "));
        Serial.println(err.c_str());
        return;
      }
      const char *t = doc["type"] | "";
      if (strcmp(t, "trigger") == 0) {
        pulseRelay();
      } else {
        Serial.print(F("[ws] unknown msg type: "));
        Serial.println(t);
      }
      break;
    }
    case WStype_ERROR:
      Serial.println(F("[ws] error"));
      break;
    default:
      break;
  }
}

static void connectWifi() {
  Serial.print(F("[wifi] connecting to "));
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(F("[wifi] IP: "));
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(F("[wifi] connect timed out, will retry"));
  }
}

void setup() {
  Serial.begin(115200);
  delay(50);
  Serial.println();
  Serial.println(F("[boot] gate-wemos-d1 starting"));

  // Drive the relay OFF before anything else so the brief float during
  // GPIO5's boot transition can't latch the gate.
  pinMode(RELAY_PIN, OUTPUT);
  relayOff();

  pinMode(REED_PIN, INPUT_PULLUP);
  lastReedRead = stableReed = digitalRead(REED_PIN);

  if (LED_PIN >= 0) {
    pinMode(LED_PIN, OUTPUT);
    setLed(false);
  }

  connectWifi();

  if (WS_USE_TLS) {
    ws.beginSSL(WS_HOST, WS_PORT, WS_PATH);
  } else {
    ws.begin(WS_HOST, WS_PORT, WS_PATH);
  }
  ws.onEvent(onWsEvent);
  ws.setReconnectInterval(5000);
  ws.enableHeartbeat(20000, 5000, 2);
}

void loop() {
  // Wi-Fi self-heal.
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastWifiAttemptMs > 10000) {
      lastWifiAttemptMs = millis();
      connectWifi();
    }
  }

  ws.loop();

  // Reed debouncing: only commit a new stable value after the input
  // has been steady for REED_DEBOUNCE_MS. Avoids spurious events from
  // the magnet just barely passing the threshold.
  int reading = digitalRead(REED_PIN);
  if (reading != lastReedRead) {
    lastReedRead = reading;
    reedChangedAt = millis();
  }
  if ((millis() - reedChangedAt) > REED_DEBOUNCE_MS) {
    if (reading != stableReed) {
      stableReed = reading;
      sendDoorState(stableReed);
    } else if (!reedReported) {
      // Either just connected or just rebooted — make sure the server
      // has the current state.
      sendDoorState(stableReed);
    }
  }
}
