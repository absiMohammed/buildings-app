/*
 * Building-app gate controller — ESP-01 / ESP-01S
 *
 * Connects outbound (WSS) to the deployed backend and waits for a
 * {"type":"trigger"} message, then pulses RELAY_PIN HIGH for PULSE_MS
 * to fire the contactor.
 *
 * No port-forwarding needed: the device initiates the connection, the
 * server pushes triggers down the same socket.
 *
 * Dependencies (install via Arduino Library Manager):
 *   - ESP8266 board support (Boards Manager URL:
 *     http://arduino.esp8266.com/stable/package_esp8266com_index.json)
 *   - WebSockets by Markus Sattler (>=2.4.0)
 *   - ArduinoJson (>=7.0.0)
 *
 * Wiring (ESP-01S relay shield: relay is already on GPIO0):
 *   - VCC  -> 5V (relay shields tolerate 5V; the ESP runs on its onboard 3v3)
 *   - GND  -> GND
 *   - GPIO0 -> relay coil (already on the relay shield)
 *   - Optional: GPIO2 -> status LED (active-low on most ESP-01s)
 *
 * Provisioning the token:
 *   On the backend, an admin POSTs /api/v1/gate/devices/provision and
 *   receives a one-time token. Paste it into DEVICE_TOKEN below, along
 *   with the corresponding BUILDING_ID.
 */

#include <ESP8266WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// ─── Configuration ────────────────────────────────────────────────────────

// Wi-Fi
const char *WIFI_SSID     = "YOUR_WIFI_SSID";
const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Backend (Render)
const char *WS_HOST   = "building-app-server.onrender.com";
const uint16_t WS_PORT = 443;       // 443 for wss, 80 for ws
const bool   WS_USE_TLS = true;

// Permissive mode: server accepts any /ws/gate connection. Add auth
// before deploying for real (see git history for a tokened version).

// Relay
const uint8_t  RELAY_PIN  = 0;     // GPIO0 — relay shield default
const bool     RELAY_ACTIVE_HIGH = true;
const uint16_t PULSE_MS   = 500;   // contactor close duration

// Optional status LED (GPIO2 onboard; comment out if unused)
const int8_t   LED_PIN    = 2;
const bool     LED_ACTIVE_HIGH = false; // most ESP-01 onboard LEDs are active-low

// ─── End configuration ────────────────────────────────────────────────────

WebSocketsClient ws;
uint32_t lastWifiAttemptMs = 0;

// Shared device token — must equal the server's DEVICE_WS_TOKEN env var.
const char *DEVICE_TOKEN = "YOUR_DEVICE_WS_TOKEN";
static const char *WS_PATH = "/ws/gate";

static void setLed(bool on) {
  if (LED_PIN < 0) return;
  digitalWrite(LED_PIN, (LED_ACTIVE_HIGH ? on : !on) ? HIGH : LOW);
}

static void setRelay(bool on) {
  digitalWrite(RELAY_PIN, (RELAY_ACTIVE_HIGH ? on : !on) ? HIGH : LOW);
}

static void pulseRelay() {
  Serial.println(F("[gate] trigger -> pulse relay"));
  setRelay(true);
  setLed(true);
  delay(PULSE_MS);
  setRelay(false);
  setLed(false);
}

static void onWsEvent(WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.println(F("[ws] connected"));
      setLed(true);
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
  // We don't block forever — loop() will retry if not connected yet.
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
  Serial.println(F("[boot] gate-esp01 starting"));

  pinMode(RELAY_PIN, OUTPUT);
  setRelay(false);
  if (LED_PIN >= 0) {
    pinMode(LED_PIN, OUTPUT);
    setLed(false);
  }

  connectWifi();

  // Render terminates TLS — use ws.beginSSL for wss://, ws.begin for ws://.
  // beginSSL with no fingerprint defaults to insecure on ESP8266, which
  // is fine for now: traffic is still encrypted, just not pinned.
  String wsPath = String(WS_PATH) + "?token=" + DEVICE_TOKEN;
  if (WS_USE_TLS) {
    ws.beginSSL(WS_HOST, WS_PORT, wsPath.c_str());
  } else {
    ws.begin(WS_HOST, WS_PORT, wsPath.c_str());
  }
  ws.onEvent(onWsEvent);
  ws.setReconnectInterval(5000);   // try again every 5s after a disconnect
  ws.enableHeartbeat(20000, 5000, 2); // ping every 20s, expect pong within 5s, drop after 2 misses
}

void loop() {
  // Wi-Fi self-heal: if we lose AP, retry every 10s.
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastWifiAttemptMs > 10000) {
      lastWifiAttemptMs = millis();
      connectWifi();
    }
  }
  ws.loop();
}
