import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, ArrowDown, ArrowDownUp, ArrowLeft, ArrowRight, ArrowUpRight, Box, Check, ChevronDown, CircleAlert, Crosshair, Gauge, History, Layers3, ListFilter, Move, Pause, Play, RotateCcw, ScanLine, SlidersHorizontal, Thermometer, Waves } from "lucide-react";
import { analyze, clock, defaultSecond, faults, replayDuration, samplesThrough, scenarios, subsystems, target, type Event, type Sample, type ScenarioId, type Subsystem } from "./model";
import { levels, nodes } from "./domain";
import { MachineDrawing, Trace } from "./visuals";
import "@fontsource-variable/manrope";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./styles.css";

const subsystemIds = Object.keys(subsystems) as Subsystem[];
const icons = { thermal: Thermometer, motion: Move, extrusion: Waves, sensors: ScanLine };
const pages = [
  { id: "overview", label: "Machine overview", icon: Gauge },
  { id: "diagnose", label: "Fault diagnosis", icon: Crosshair },
  { id: "domain", label: "Work domain model", icon: Layers3 },
  { id: "events", label: "Event log", icon: History },
] as const;
type Page = (typeof pages)[number]["id"];
type Replay = { scenario: ScenarioId; head: number; recovery: number | null; events: Event[] };
type Signal = {
  name: string; unit: string; limits: [number, number]; range: [number, number]; precision: number;
  value: (sample: Sample) => number; reference?: (sample: Sample) => number; referenceLabel?: string; constraint: string;
};

const signals: Record<Subsystem, Signal> = {
  thermal: { name: "Nozzle temperature", unit: "°C", limits: [target.nozzleLow, target.nozzleHigh], range: [210, 260], precision: 1, value: (s) => s.nozzle, reference: () => target.nozzle, referenceLabel: "Setpoint", constraint: "240–250 °C process window" },
  motion: { name: "Y following error", unit: "mm", limits: [0, target.motionMax], range: [0, 0.4], precision: 2, value: (s) => s.motion, constraint: "Maximum 0.18 mm" },
  extrusion: { name: "Estimated material flow", unit: "mm³/s", limits: [target.flowLow, target.flowHigh], range: [4, 10], precision: 1, value: (s) => s.flow, reference: () => target.flow, referenceLabel: "Commanded flow", constraint: "7.2–8.8 mm³/s process window" },
  sensors: { name: "Bed probe sample age", unit: "s", limits: [0, target.probeAgeMax], range: [0, 100], precision: 1, value: (s) => s.probeAge, constraint: "Maximum sample age 2.5 s" },
};

function nominalState(scenario: ScenarioId, head: number): Replay {
  return { scenario, head, recovery: null, events: [] };
}

function readPage(): Page {
  const hash = window.location.hash.slice(1);
  return pages.find((page) => page.id === hash)?.id ?? "overview";
}

function App() {
  const [page, setPage] = useState<Page>(readPage);
  const [replay, setReplay] = useState<Replay>(() => nominalState("thermal", defaultSecond));
  const [selected, setSelected] = useState<Subsystem>("thermal");
  const [playing, setPlaying] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const end = Math.max(replayDuration, (replay.recovery ?? 0) + 16);
  const cursor = historyCursor ?? replay.head;
  const historical = cursor !== replay.head;
  const samples = useMemo(() => samplesThrough(replay.scenario, cursor, replay.recovery), [cursor, replay.scenario, replay.recovery]);
  const outcome = useMemo(() => analyze(samples), [samples]);
  const sample = samples.at(-1)!;
  const active = subsystemIds.filter((id) => outcome.active[id] !== undefined);
  const manual = replay.events.filter((event) => event.at <= cursor);
  const events = [...outcome.events, ...manual].sort((a, b) => b.at - a.at);
  const acknowledged = manual.some((event) => event.subsystem === selected && event.text === "Operator acknowledged fault");
  const recovering = replay.recovery !== null && !historical && active.includes(selected);
  const held = !!active.length;
  const deviating = subsystemIds.some((id) => {
    const signal = signals[id];
    const value = signal.value(sample);
    return value < signal.limits[0] || value > signal.limits[1];
  });
  const atEnd = replay.head >= end;

  useEffect(() => {
    const onHash = () => { setPage(readPage()); window.scrollTo(0, 0); document.getElementById("main-content")?.focus({ preventScroll: true }); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!playing || atEnd) return;
    const timer = window.setInterval(() => setReplay((previous) => ({ ...previous, head: Math.min(end, previous.head + 1) })), 420);
    return () => window.clearInterval(timer);
  }, [atEnd, end, playing]);

  const isPlaying = playing && !atEnd;
  const firstFault = active[0];

  function changeScenario(scenario: ScenarioId, second = defaultSecond) {
    setReplay(nominalState(scenario, second));
    setSelected(scenario === "nominal" ? "thermal" : scenario);
    setPlaying(false);
    setHistoryCursor(null);
  }

  function markAcknowledged() {
    if (historical || !active.includes(selected)) return;
    setReplay((previous) => previous.events.some((event) => event.subsystem === selected && event.text === "Operator acknowledged fault") ? previous : ({
      ...previous, events: [...previous.events, { at: previous.head, subsystem: selected, severity: "info", text: "Operator acknowledged fault" }],
    }));
  }

  function recover() {
    if (historical || !active.includes(selected) || replay.recovery !== null) return;
    setReplay((previous) => previous.recovery !== null ? previous : ({
      ...previous, recovery: previous.head, events: [...previous.events, { at: previous.head, subsystem: selected, severity: "info", text: faults[selected].action }],
    }));
    setPlaying(true);
    setHistoryCursor(null);
  }

  function inspect(id: Subsystem) {
    setSelected(id);
    const alreadyOpen = page === "diagnose";
    window.location.hash = "diagnose";
    if (alreadyOpen) document.getElementById("diagnosis-title")?.focus();
  }

  const activeInfo = firstFault ? faults[firstFault] : undefined;
  const currentPage = pages.find((entry) => entry.id === page)!;
  const layer = 108 + Math.floor(Math.max(0, cursor - outcome.heldTicks) / 2);
  const progress = Math.round(layer / 200 * 100);
  const activeSignal = signals[selected];

  return <div className="shell">
    <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById("main-content")?.focus(); }}>Skip to content</a>
    <aside className="sidebar">
      <a className="brand" href="#overview" aria-label="Aether overview"><span className="logo"><Layers3 size={23} strokeWidth={2} aria-hidden /></span><span><strong>AETHER</strong><small>DIAGNOSTIC SUITE</small></span></a>
      <nav aria-label="Console navigation">
        {pages.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} aria-current={page === id ? "page" : undefined}><Icon size={18} aria-hidden /><span>{label}</span></a>)}
      </nav>
      <div className="sidebar-bottom"><span className="sidebar-machine"><Box size={17} aria-hidden /></span><div><strong>AX-04</strong><small>Simulated FFF cell</small></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumb"><span>AX-04</span><span className="slash">/</span><strong>{currentPage.label}</strong></div>
        <span className="simulation"><span /> SIMULATION MODE</span>
      </header>
      <main id="main-content" tabIndex={-1}>
        <header className="page-head">
          <div><div className="line-label"><span /> AX-04 · INDUSTRIAL FFF</div><h1>{currentPage.label}</h1><p>{page === "overview" ? "Monitor the print against its operating constraints." : page === "diagnose" ? "Investigate the signals behind a subsystem fault." : page === "domain" ? "Trace why a constraint matters and how the printer maintains it." : "Inspect the sequence of faults, acknowledgements and recoveries."}</p></div>
          <div className="scenario-controls">
            <label className="scenario-select"><SlidersHorizontal size={16} aria-hidden /><span className="sr-only">Replay scenario</span><select value={replay.scenario} onChange={(event) => changeScenario(event.target.value as ScenarioId)}>
              {(Object.keys(scenarios) as ScenarioId[]).map((id) => <option key={id} value={id}>{scenarios[id]}</option>)}
            </select><ChevronDown size={15} aria-hidden /></label>
            <button type="button" className="icon-button" title="Restart replay" aria-label="Restart replay" onClick={() => changeScenario(replay.scenario, 0)}><RotateCcw size={17} aria-hidden /></button>
          </div>
        </header>
        <section className="replay-bar" aria-label="Replay timeline">
          <button className="play-button" type="button" aria-label={isPlaying ? "Pause replay" : "Play replay"} onClick={() => {
            if (historical) { setHistoryCursor(null); setPlaying(true); }
            else if (replay.head >= end) { changeScenario(replay.scenario, 0); setPlaying(true); }
            else setPlaying(!playing);
          }}>{isPlaying ? <Pause size={17} aria-hidden /> : <Play size={17} aria-hidden />}</button>
          <div className="replay-times"><strong>{clock(cursor)}</strong><small>{historical ? "REVIEWING" : "ELAPSED"}</small></div>
          <label className="time-range"><span className="sr-only">Replay position in seconds</span><input type="range" min={0} max={Math.max(1, replay.head)} value={cursor} disabled={replay.head === 0}
            onChange={(event) => { setHistoryCursor(Number(event.target.value)); setPlaying(false); }} aria-valuetext={clock(cursor)} /></label>
          {historical ? <button type="button" className="text-action" onClick={() => setHistoryCursor(null)}>Return to latest <ArrowRight size={15} aria-hidden /></button> : <span className="replay-end">LATEST {clock(replay.head)}</span>}
        </section>

        {page === "overview" && <>
          <div className="metric-grid">
            {subsystemIds.map((id) => <Metric key={id} id={id} selected={selected === id} fault={active.includes(id)} samples={samples} onClick={() => setSelected(id)} />)}
          </div>
          <div className="dashboard-grid">
            <section className="panel machine-panel">
              <div className="panel-head"><div><h2>Machine schematic</h2><p>{subsystems[selected].description}</p></div><span className={`status ${held || deviating ? "alert" : "good"}`}><span />{held ? "Print held" : deviating ? "Printing · check limits" : "Printing"}</span></div>
              <MachineDrawing selected={selected} faulted={active} onSelect={setSelected} />
              <div className="print-progress"><div><span className="file-name">manifold_housing.gcode</span><small>Layer {layer} of 200</small></div><progress max={100} value={progress} aria-label="Simulated print progress" /><strong>{progress}%</strong></div>
            </section>
            <section className={`panel fault-panel ${held ? "has-fault" : ""}`} aria-label="Machine fault summary">
              <div className="panel-head"><h2>Machine status</h2><span className="count-label">{active.length} ACTIVE</span></div>
              <div className="fault-body">
                <span className={`fault-icon ${held || deviating ? "warn" : "ok"}`}>{held || deviating ? <CircleAlert size={23} aria-hidden /> : <Check size={23} aria-hidden />}</span>
                <span className="fault-kicker">{activeInfo ? `${activeInfo.code} / ${subsystems[firstFault!].short.toUpperCase()}` : deviating ? "SIGNAL DEVIATION" : "OPERATING NORMALLY"}</span>
                <h3>{activeInfo?.title ?? (deviating ? "Signal outside its operating window" : "All subsystems within limits")}</h3>
                <p>{activeInfo?.impact ?? (deviating ? "No fault has been confirmed. Compare the signal with its operating window and watch for sustained deviation." : "Current telemetry shows no confirmed fault. Select a subsystem to inspect its operating window and history.")}</p>
                {activeInfo && <div className="fault-mini">
                  {activeInfo.evidence(sample).slice(0, 2).map((row) => <div key={row.label}><span>{row.label}</span><strong>{row.value}</strong></div>)}
                </div>}
                <button type="button" className={`button ${held ? "primary" : "secondary"}`} onClick={() => inspect(firstFault ?? selected)}>{activeInfo ? "Investigate fault" : "Inspect subsystem"} <ArrowUpRight size={17} aria-hidden /></button>
              </div>
            </section>
          </div>
          <div className="dashboard-grid lower-grid">
            <SignalPanel id={selected} samples={samples} faulty={active.includes(selected)} />
            <EventPanel events={events.slice(0, 5)} compact onPick={inspect} />
          </div>
        </>}

        {page === "diagnose" && <>
          <SubsystemTabs selected={selected} onSelect={setSelected} active={active} />
          <div className="dashboard-grid diagnostic-grid">
            <Diagnosis id={selected} sample={sample} activeAt={outcome.active[selected]} historical={historical} acknowledged={acknowledged} recovering={recovering} onAcknowledge={markAcknowledged} onRecover={recover} />
            <div className="diagnostic-side"><SignalPanel id={selected} samples={samples} faulty={active.includes(selected)} />
              <div className="panel domain-callout"><Layers3 size={21} aria-hidden /><div><h2>Trace the operating constraint</h2><p>{activeSignal.constraint}</p></div><a href="#domain" aria-label="Open work domain model"><ArrowUpRight size={18} aria-hidden /></a></div>
            </div>
          </div>
        </>}
        {page === "domain" && <DomainModel key={selected} selected={selected} />}
        {page === "events" && <EventPanel events={events} onPick={inspect} />}
      </main>
    </div>
  </div>;
}

function Metric({ id, selected, fault, samples, onClick }: {
  id: Subsystem; selected: boolean; fault: boolean; samples: Sample[]; onClick: () => void;
}) {
  const Icon = icons[id];
  const signal = signals[id];
  const sample = samples.at(-1)!;
  const value = signal.value(sample);
  const outside = value < signal.limits[0] || value > signal.limits[1];
  const status = fault ? "Fault" : outside ? "Outside limit" : "In range";
  return <button type="button" className={`metric ${fault || outside ? "off-limit" : ""}`} aria-pressed={selected} onClick={onClick}>
    <div className="metric-top"><span className="metric-icon"><Icon size={17} aria-hidden /></span><span>{signal.name}</span><ArrowUpRight size={14} className="metric-arrow" aria-hidden /></div>
    <div className="metric-value"><strong>{value.toFixed(signal.precision)}</strong><span>{signal.unit}</span></div>
    <div className="metric-bottom"><span className="metric-status"><span />{status}</span>
      <Trace small values={samples.slice(-38).map(signal.value)} range={signal.range} label="" fault={fault || outside} />
    </div>
  </button>;
}

function SignalPanel({ id, samples, faulty }: { id: Subsystem; samples: Sample[]; faulty: boolean }) {
  const signal = signals[id];
  const recent = samples.slice(-55);
  const value = signal.value(recent.at(-1)!);
  const start = samples.length - recent.length;
  const end = samples.length - 1;
  return <section className="panel signal-panel">
    <div className="panel-head"><div><h2>Operating envelope</h2><p>{signal.name} · {signal.unit}</p></div><span className="count-label">1 HZ</span></div>
    <div className="signal-content">
      <Trace values={recent.map(signal.value)} reference={signal.reference ? recent.map(signal.reference) : undefined} limits={signal.limits} range={signal.range} fault={faulty} start={start} end={end}
        label={`${signal.name} from ${clock(start)} to ${clock(end)}. Latest value ${value.toFixed(signal.precision)} ${signal.unit}. ${signal.constraint}.`} />
      <div className="legend"><span><i className={faulty ? "fault-line" : "signal-line"} /> Measured</span>{signal.referenceLabel && <span><i className="reference-line" /> {signal.referenceLabel}</span>}<span><i className="limit-box" /> Allowed range</span></div>
      <p className="constraint"><span>{signal.constraint}</span><strong>{value.toFixed(signal.precision)} {signal.unit}</strong></p>
    </div>
  </section>;
}

function SubsystemTabs({ selected, onSelect, active }: { selected: Subsystem; onSelect: (id: Subsystem) => void; active: Subsystem[] }) {
  return <div className="subsystem-tabs" role="group" aria-label="Subsystem">
    {subsystemIds.map((id) => {
      const Icon = icons[id];
      return <button type="button" key={id} aria-pressed={selected === id} onClick={() => onSelect(id)}><Icon size={16} aria-hidden />{subsystems[id].short}{active.includes(id) && <span className="tab-fault" aria-label="Fault active" />}</button>;
    })}
  </div>;
}

function Diagnosis({ id, sample, activeAt, historical, acknowledged, recovering, onAcknowledge, onRecover }: {
  id: Subsystem; sample: Sample; activeAt?: number; historical: boolean; acknowledged: boolean; recovering: boolean; onAcknowledge: () => void; onRecover: () => void;
}) {
  const fault = faults[id];
  const active = activeAt !== undefined;
  return <section className="panel diagnosis-panel">
    <div className="panel-head"><div><h2 id="diagnosis-title" tabIndex={-1}>{subsystems[id].label}</h2><p>{active ? `${fault.code} · Detected at ${clock(activeAt)}` : "No confirmed fault at this replay position"}</p></div><span className={`status ${active ? "alert" : "good"}`}><span />{active ? "Fault active" : "No active fault"}</span></div>
    <div className="diagnosis-content">
      <section><h3>{active ? fault.title : "Signal check"}</h3><p>{active ? fault.impact : subsystems[id].description}</p>
        <dl className="evidence">{fault.evidence(sample).map((item) => <div key={item.label}><dt>{item.label}<small>{item.detail}</small></dt><dd>{item.value}</dd></div>)}</dl>
      </section>
      {active && <>
        <section><h3>Probable causes</h3><ol className="causes">{fault.causes.map((cause) => <li key={cause.title}><div><strong>{cause.title}</strong><span>{cause.rank}</span></div><p>{cause.evidence}</p></li>)}</ol></section>
        <section><h3>Corrective action</h3><p>{fault.verify}</p>
          {historical && <p className="history-note">Return to the latest sample to act on the current replay.</p>}
          {recovering && <p className="history-note" role="status">Recovery in progress. Check the live trend and wait for the fault to clear.</p>}
          <div className="button-row">
            <button className="button primary" type="button" onClick={onRecover} disabled={historical || recovering}>{fault.action}</button>
            <button className="button secondary" type="button" onClick={onAcknowledge} disabled={historical || acknowledged}>{acknowledged ? "Acknowledged" : "Acknowledge"}</button>
          </div>
        </section>
      </>}
    </div>
  </section>;
}

function EventPanel({ events, compact, onPick }: { events: Event[]; compact?: boolean; onPick: (id: Subsystem) => void }) {
  const [filter, setFilter] = useState<"all" | Event["severity"]>("all");
  const visible = events.filter((event) => filter === "all" || event.severity === filter);
  return <section className="panel event-panel">
    <div className="panel-head"><div><h2>{compact ? "Recent events" : "Replay events"}</h2><p>{compact ? "Latest simulated changes" : `${visible.length} entries at the selected replay position`}</p></div>
      {compact ? <a className="text-action" href="#events">View log <ArrowRight size={15} aria-hidden /></a> :
        <label className="scenario-select"><ListFilter size={16} aria-hidden /><span className="sr-only">Event type</span><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">All events</option><option value="fault">Faults</option><option value="normal">State changes</option><option value="info">Operator actions</option></select><ChevronDown size={15} aria-hidden /></label>}
    </div>
    {visible.length === 0 ? <p className="no-events">No matching events at this replay position.</p> : <ul className="event-list">
      {visible.map((event, index) => <li key={`${event.at}-${event.text}-${index}`}><span className={`event-dot ${event.severity}`} aria-label={event.severity} /><time>{clock(event.at)}</time><span>{event.text}</span>{event.subsystem && <button type="button" className="icon-button small" onClick={() => onPick(event.subsystem!)} aria-label={`Inspect ${subsystems[event.subsystem].short} at latest selected sample`}><ArrowUpRight size={15} aria-hidden /></button>}</li>)}
    </ul>}
  </section>;
}

function DomainModel({ selected }: { selected: Subsystem }) {
  const [current, setCurrent] = useState(`${selected}-2`);
  const node = nodes.find((item) => item.id === current)!;
  const why = nodes.filter((item) => item.means.includes(current));
  const how = nodes.filter((item) => node.means.includes(item.id));
  return <div className="domain-layout">
    <section className="panel hierarchy">
      <div className="panel-head"><div><h2>Abstraction hierarchy</h2><p>Select a node to see its means–end relationships.</p></div><span className="count-label">6 LEVELS</span></div>
      <div className="hierarchy-scroll" tabIndex={0} role="region" aria-label="Scrollable six-level abstraction hierarchy">
        <table className="domain-table"><thead><tr><th scope="col">Level</th>{subsystemIds.map((id) => <th key={id} scope="col">{subsystems[id].short}</th>)}</tr></thead>
          <tbody>{levels.map(([name, desc], index) => <tr key={name}><th scope="row"><span className="level-number">{String(index + 1).padStart(2, "0")}</span><span>{name}<small>{desc}</small></span></th>
            {subsystemIds.map((id) => {
              const item = nodes.find((entry) => entry.subsystem === id && entry.level === index)!;
              return <td key={id}><button type="button" aria-pressed={current === item.id} className={why.includes(item) || how.includes(item) ? "related" : ""} onClick={() => setCurrent(item.id)}>{item.title}</button></td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
    </section>
    <section className="panel node-panel" aria-live="polite">
      <div className="panel-head"><h2>Means–end trace</h2><ArrowDownUp size={18} aria-hidden /></div>
      <div className="node-content">
        {why.length > 0 && <div className="node-links"><h3>Why it matters</h3>{why.map((item) => <button type="button" key={item.id} onClick={() => setCurrent(item.id)}>{item.title}<ArrowUpRight size={15} aria-hidden /></button>)}</div>}
        {why.length > 0 && <ArrowDown size={19} className="node-arrow" aria-hidden />}
        <div className="node-current"><span>{levels[node.level][0]}</span><h3>{node.title}</h3><p>{node.description}</p></div>
        {how.length > 0 && <><ArrowDown size={19} className="node-arrow" aria-hidden /><div className="node-links"><h3>How it is achieved</h3>{how.map((item) => <button type="button" key={item.id} onClick={() => setCurrent(item.id)}>{item.title}<ArrowDown size={15} aria-hidden /></button>)}</div></>}
        <a className="text-action" href="#diagnose"><ArrowLeft size={15} aria-hidden /> Back to diagnosis</a>
      </div>
    </section>
  </div>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
