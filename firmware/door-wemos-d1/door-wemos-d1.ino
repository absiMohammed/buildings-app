/*
 * Building-app door controller — Wemos D1 Mini (ESP8266)
 *
 * Fail-safe 12V solenoid lock: the relay is held ENGAGED at idle, which
 * keeps the solenoid energized and the door LOCKED. To open the door
 * we briefly DISENGAGE the relay; the solenoid loses power and the
 * bolt retracts. After UNLOCK_MS the relay re-engages and the door
 * re-locks.
 *
 * Power loss to either the Wemos or the 12V supply = solenoid drops =
 * door unlocks. That's the "fail-safe" property, useful for fire
 * egress.
 *
 * Hardware
 *   - Wemos D1 Mini (ESP8266)
 *   - 5V 1-channel relay module, active-low (LOW on IN = relay engaged)
 *     + 4.7kΩ pull-up resistor between relay IN and relay VCC (needed
 *       because the Wemos's 3.3V HIGH isn't enough to fully turn off
 *       the 5V opto-isolator; see git history for the original gate
 *       sketch + the resistor wiring)
 *   - 12V DC adapter feeding the solenoid through the relay's COM/NO
 *     dry contacts (relay engaged → contact closed → solenoid powered
 *     → locked)
 *
 * Wiring (control side)
 *   Wemos     Component
 *   ───────   ─────────────────────
 *   5V        ── relay VCC ── 4.7kΩ to IN
 *   G         ── relay GND
 *   D1 (G5)   ── relay IN
 *
 * Wiring (load side)
 *   12V (+)   ── relay COM
 *   relay NO  ── solenoid (+)
 *   solenoid (-) ── 12V (-)
 *
 * Behaviour
 *   - Connects to Wi-Fi, then opens WSS to /ws/door on the backend.
 *   - Holds the relay ENGAGED at idle (door locked).
 *   - On {"type":"unlock"} from the server, switches the Wemos pin to
 *     INPUT for UNLOCK_MS (releases the relay → solenoid de-energizes
 *     → door unlocks), then re-engages.
 *
 * Libraries (Arduino Library Manager)
 *   - ESP8266 board support
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
static const char *WS_PATH = "/ws/door";

// Wemos D1 Mini pin map: D1 = GPIO5.
const uint8_t  RELAY_PIN  = 5;
const uint16_t UNLOCK_MS  = 5000;   // door stays unlocked for this long

// Onboard LED on Wemos D1 Mini is on GPIO2 (D4), active-low.
const int8_t   LED_PIN    = 2;

// ─── End configuration ────────────────────────────────────────────────

WebSocketsClient ws;
uint32_t lastWifiAttemptMs = 0;

// Track the active unlock window so we can return the relay to its
// locked state from loop() without blocking inside the WS callback.
bool     unlocking      = false;
uint32_t unlockStartMs  = 0;

static inline void setLed(bool on) {
  if (LED_PIN < 0) return;
  digitalWrite(LED_PIN, on ? LOW : HIGH); // active-low onboard LED
}

// Open-drain relay drive — same trick as the gate firmware (3.3V HIGH
// from a Wemos GPIO can't fully turn off a 5V opto-isolator without a
// pull-up resistor on the module side). For this fail-safe door,
// "engaged / locked" means we pull IN to GND (active-low module
// triggers); "released / unlocked" means we float the pin and let the
// 4.7kΩ pull-up to 5V take over.
static inline void lockDoor() {
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);
}
static inline void unlockDoor() {
  pinMode(RELAY_PIN, INPUT);
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
      if (strcmp(t, "unlock") == 0) {
        Serial.println(F("[door] unlock"));
        unlockDoor();
        unlocking = true;
        unlockStartMs = millis();
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
  Serial.println(F("[boot] door-wemos-d1 starting"));

  // Lock immediately — important for fail-safe: at power-on the lock
  // should be engaged before anything else (the lock IS energised at
  // rest in fail-safe wiring; "engage relay" closes the 12V circuit
  // to the solenoid).
  lockDoor();

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
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastWifiAttemptMs > 10000) {
      lastWifiAttemptMs = millis();
      connectWifi();
    }
  }

  ws.loop();

  if (unlocking && (millis() - unlockStartMs) >= UNLOCK_MS) {
    Serial.println(F("[door] re-lock"));
    lockDoor();
    unlocking = false;
  }
}
