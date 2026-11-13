# TRACE-X Expo: Continuous Read-Only Telemetry

This Expo display **does not start or stop motors**. Its motor and circuit cards update from live hardware sensor data without an automated test. The STM32 firmware is unchanged; hardware protections are not bypassed.

## Raspberry Pi setup

On the Pi, update your checkout and build the frontend:

```bash
cd ~/Expo
git pull --ff-only origin main
cd frontend
npm ci
npm run build
```

The running backend must serve this checkout's frontend build. If using `trace-x.service`, inspect its path before restarting:

```bash
systemctl --user cat trace-x.service
```

In the environment file loaded by the backend service, set:

```ini
ADS_LIVE_PROTOCOL=ads_json
ADS_LIVE_SERIAL_PORT=/dev/serial/by-id/<your-actual-STM32-serial-device>
```

Replace the device placeholder. To find the actual port:

```bash
ls -l /dev/serial/by-id/
```

Do not start a second serial terminal or application that owns the same STM32 USB serial port. The `ads_json` read-only acquisition path sends `READ_MEASUREMENTS` to the STM32 at approximately one-second intervals and publishes the readings to `/api/live/status`.

If the backend service is configured to use this checkout and reads those environment settings, restart it:

```bash
systemctl --user restart trace-x.service
curl -sS http://127.0.0.1:13115/api/live/status | python3 -m json.tool
```

## Live display behavior

- Motor INA219 sensor: I2C address `0x40`
- Circuit INA219 sensor: I2C address `0x41`
- Motor speed: STM32 encoder-derived RPM, if provided
- Cards refresh approximately every second, without a Start Motor button.
- If acquisition is disconnected, stale, or invalid, cards show **—** instead of showing synthetic numbers or old samples as live.
- Historical baseline cards are separately labeled, and require recordings imported into the backend.

This is **display-only**. To demonstrate a rotating motor, a separately verified driver and physical controller must already be operating it. Do not connect multiple active PWM signal sources to one driver input.

## Presentation checks

```bash
curl -sS http://127.0.0.1:13115/api/health | python3 -m json.tool
curl -sS http://127.0.0.1:13115/api/live/status | python3 -m json.tool
```

Look for `connected: true`, `stale: false`, valid `ina219.MOTOR.measurements`, and an updating `sequence`. Neither a successful frontend build nor a connected STM32 guarantees nonzero current, voltage or RPM. Values depend on real wiring, supply state, sensor placement and encoder calibration.

Do not use a board that becomes unusually hot with USB alone or has an unresolved suspected electrical short.
