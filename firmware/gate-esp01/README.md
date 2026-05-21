# Gate controller — ESP-01 firmware

Connects outbound (WSS) to the building-app backend and pulses a relay
when the server pushes a `{"type":"trigger"}` message.

## Hardware

- ESP-01 or ESP-01S
- ESP-01 relay shield (or a separate 5V relay module wired to GPIO0)
- 5V power supply (the shield steps down to 3v3 for the ESP)
- USB-to-serial adapter (CH340 / FTDI) for flashing

## Prerequisites

1. **Arduino IDE** (1.8.x or 2.x).
2. **ESP8266 board support** — File → Preferences → Additional Boards
   Manager URLs: `http://arduino.esp8266.com/stable/package_esp8266com_index.json`
   then Tools → Board → Boards Manager → install "esp8266".
3. **Libraries** (Sketch → Include Library → Manage Libraries):
   - `WebSockets` by Markus Sattler (≥ 2.4.0)
   - `ArduinoJson` (≥ 7.0.0)

## Provisioning the device

1. Log into the backend as a system admin or the building's admin.
2. `POST /api/v1/gate/devices/provision` — body `{ "buildingId": "...", "name": "Main gate" }`.
   - System admin must include `buildingId`; building admin may omit it.
   - Response includes a one-time `token` field. **Copy it now** — you can't read it again.
3. Open `gate-esp01.ino` and fill in:
   - `WIFI_SSID`, `WIFI_PASSWORD`
   - `BUILDING_ID`, `DEVICE_TOKEN`

## Flashing

1. Plug the ESP-01 into the USB-serial adapter with GPIO0 pulled low (flash
   mode). On many relay shields there's a button for this.
2. Tools → Board → "Generic ESP8266 Module" (or "ESP-01 (1M)" depending
   on flash size). Set Flash Size to match your chip.
3. Tools → Port → your USB-serial port.
4. Upload (→ button). Once done, power-cycle without GPIO0 pulled low.

Open Serial Monitor at 115200 baud — you should see:

```
[boot] gate-esp01 starting
[wifi] connecting to ...
[wifi] IP: 192.168.x.x
[ws] connected
```

After that, calling `POST /api/v1/gate/trigger` from the mobile app
will print `[gate] trigger -> pulse relay` and energize GPIO0 for 500 ms.

## Rotating the token

Call `POST /api/v1/gate/devices/provision` again — the old token is
invalidated. Reflash with the new value.

## Disabling the device

`DELETE /api/v1/gate/devices` clears the stored hash; any connected
ESP-01 stays online for one ping interval, then gets disconnected by
the server (auth re-checks at connect time).
