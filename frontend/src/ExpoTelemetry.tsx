import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import type { Recording, RecordingSummary } from './types'

type Reading = { value: number | null; valid: boolean; unit: string }
type Sensor = {
  status?: string; valid?: boolean; calibrated?: boolean; stale?: boolean; age_seconds?: number
  measurements?: Record<string, Reading>
}
type Channel = { value: number | null; quality?: string }
type Snapshot = {
  connected: boolean; stale: boolean; error?: string | null; sequence?: number
  ina219?: Record<string, Sensor>; channels?: Record<string, Channel>
  motor_sample?: { motor_rpm?: number | null; rpm?: number | null; stale?: boolean } | null
  warnings?: string[]
}
const number = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null
const display = (value: number | null, precision: number) => value === null ? '—' : value.toFixed(precision)

export default function ExpoTelemetry() {
  const [live, setLive] = useState<Snapshot | null>(null)
  const [received, setReceived] = useState<Date | null>(null)
  const [fetchError, setFetchError] = useState('')
  const [recordings, setRecordings] = useState<RecordingSummary[]>([])
  const [recording, setRecording] = useState<Recording | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    let mounted = true
    async function poll() {
      if (busy.current) return
      busy.current = true
      try {
        const response = await fetch('/api/live/status', { cache: 'no-store' })
        if (!response.ok) throw new Error(`Sensor API returned HTTP ${response.status}`)
        const next: Snapshot = await response.json()
        if (mounted) {
          setLive(next)
          setReceived(new Date())
          setFetchError('')
        }
      } catch (error) {
        if (mounted) {
          setLive(null)
          setFetchError(String(error))
        }
      } finally {
        busy.current = false
      }
    }
    void poll()
    const timer = window.setInterval(() => { void poll() }, 1000)
    void api.recordings().then(items => {
      if (!mounted) return
      setRecordings(items)
      if (!items.length) return
      const latest = items[items.length - 1]
      void api.recording(latest.id).then(item => {
        if (mounted) setRecording(item)
      }).catch(() => {})
    }).catch(() => {})
    return () => { mounted = false; window.clearInterval(timer) }
  }, [])

  const connected = live?.connected === true
  const fresh = connected && live?.stale === false
  const motor = live?.ina219?.MOTOR
  const circuit = live?.ina219?.CIRCUIT
  const electrical = (sensor: Sensor | undefined, field: string): number | null => {
    const v = sensor?.measurements?.[field]
    return fresh && sensor?.stale === false && sensor.valid === true && v?.valid === true
      ? number(v.value) : null
  }
  const rpm = fresh
    ? (live?.motor_sample && live.motor_sample.stale === false
      ? number(live.motor_sample.motor_rpm ?? live.motor_sample.rpm)
      : live?.channels?.rpm?.quality !== 'STALE' ? number(live?.channels?.rpm?.value) : null)
    : null
  const motorVoltage = electrical(motor, 'voltage')
  const motorCurrent = electrical(motor, 'current')
  const motorPower = electrical(motor, 'power')
  const circuitVoltage = electrical(circuit, 'voltage')
  const circuitCurrent = electrical(circuit, 'current')
  const circuitPower = electrical(circuit, 'power')
  const motorMetrics = [
    { name: 'Motor voltage', value: motorVoltage, precision: 3, unit: 'V' },
    { name: 'Motor current', value: motorCurrent, precision: 3, unit: 'A' },
    { name: 'Motor power', value: motorPower, precision: 3, unit: 'W' },
    { name: 'Motor speed', value: rpm, precision: 0, unit: 'RPM' },
  ]
  const circuitMetrics = [
    { name: 'Circuit voltage', value: circuitVoltage, precision: 3, unit: 'V' },
    { name: 'Circuit current', value: circuitCurrent, precision: 3, unit: 'A' },
    { name: 'Circuit power', value: circuitPower, precision: 3, unit: 'W' },
  ]

  return <section aria-label="TRACE-X continuous hardware telemetry">
    <header>
      <div>
        <p className="eyebrow">TRACE-X EXPO · LIVE HARDWARE TELEMETRY</p>
        <h1>Live Motor & Circuit Monitoring</h1>
        <p>Continuous read-only STM32 measurements. No motor-start command is sent by this dashboard.</p>
      </div>
    </header>

    <section className="panel">
      <div className="panel-title">
        <div><h2>Live acquisition</h2><p>Raspberry Pi 5 · STM32 · INA219</p></div>
        <span className="mode-chip">READ-ONLY</span>
      </div>
      <p role="status"><strong>{fresh ? 'LIVE — readings updating' : connected ? 'STALE — waiting for new sensor data' : 'NO LIVE SENSOR CONNECTION'}</strong>
        {received ? ` · Last checked ${received.toLocaleTimeString()}` : ' · Connecting…'}
        {live?.sequence != null ? ` · Frame ${live.sequence}` : ''}
      </p>
      {fetchError && <p role="alert">{fetchError}</p>}
      {live?.error && <p role="alert">Serial acquisition: {live.error}</p>}
      <p className="muted">Dashboard refreshes every second. Invalid or stale measurements show — rather than invented readings or old data presented as live.</p>
    </section>

    <section className="panel">
      <div className="panel-title"><div><h2>Motor measurements</h2><p>INA219 #1 (0x40) + STM32 encoder</p></div><span className="mode-chip">HARDWARE</span></div>
      <section className="metric-grid motor-metrics" aria-label="Motor live measurements">
        {motorMetrics.map(metric => <div key={metric.name} className="metric"><span>{metric.name}</span>
          <strong>{display(metric.value, metric.precision)}<small> {metric.unit}</small></strong></div>)}
      </section>
      <p className="muted">Motor sensor: {motor?.status || 'Not reported'} · Calibration: {motor?.calibrated ? 'Reported calibrated' : 'Unverified'} · No active motor run is needed to read sensors.</p>
    </section>

    <section className="panel">
      <div className="panel-title"><div><h2>Circuit measurements</h2><p>INA219 #2 (0x41)</p></div><span className="mode-chip">HARDWARE</span></div>
      <section className="metric-grid" aria-label="Circuit live measurements">
        {circuitMetrics.map(metric => <div key={metric.name} className="metric"><span>{metric.name}</span>
          <strong>{display(metric.value, metric.precision)}<small> {metric.unit}</small></strong></div>)}
      </section>
      <p className="muted">Circuit sensor: {circuit?.status || 'Not reported'} · Calibration: {circuit?.calibrated ? 'Reported calibrated' : 'Unverified'}.</p>
    </section>

    <section className="panel">
      <h2>Recorded baseline evidence</h2>
      <p className="muted">Previously imported measurements; these are historical results, not a simulated live test.</p>
      {recording && <><p><strong>{recording.metadata.filename}</strong> · {recording.analysis_status}</p>
        <section className="metric-grid" aria-label="Historical motor averages">
          {(['voltage', 'current', 'rpm', 'input_power'] as const).map(key => {
            const metric = recording.features[key]
            return <div className="metric" key={key}><span>Recorded {key === 'input_power' ? 'power' : key}</span>
              <strong>{display(number(metric?.mean), 2)}<small> {({ voltage: 'V', current: 'A', rpm: 'RPM', input_power: 'W' })[key]}</small></strong></div>
          })}
        </section></>}
      {recordings.length === 0 && <p>No recordings imported yet. The live telemetry panel works independently.</p>}
    </section>
  </section>
}
