export type Subsystem = "thermal" | "motion" | "extrusion" | "sensors";
export type ScenarioId = "nominal" | Subsystem;

export const subsystems = {
  thermal: { label: "Thermal control", short: "Thermal", description: "Heater, nozzle and temperature feedback" },
  motion: { label: "Motion control", short: "Motion", description: "Gantry, carriage and encoder feedback" },
  extrusion: { label: "Extrusion", short: "Extrusion", description: "Drive rollers, feed path and nozzle" },
  sensors: { label: "Sensor health", short: "Sensors", description: "Sample validity, age and reference channels" },
} as const;

export const scenarios: Record<ScenarioId, string> = {
  nominal: "Nominal print",
  thermal: "Nozzle temperature drop",
  motion: "Y-axis tracking drift",
  extrusion: "Material feed restriction",
  sensors: "Stale bed probe",
};

export const target = {
  nozzle: 245,
  nozzleLow: 240,
  nozzleHigh: 250,
  bed: 85,
  flow: 8,
  flowLow: 7.2,
  flowHigh: 8.8,
  motionMax: 0.18,
  probeAgeMax: 2.5,
};

export const replayDuration = 120;
export const defaultSecond = 62;
const faultOnset = 33;
const confirmationSamples = 4;

export type Sample = {
  nozzle: number;
  nozzleRef: number;
  bed: number;
  bedRef: number;
  heater: number;
  flow: number;
  feedLoad: number;
  motion: number;
  probeAge: number;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function sampleAt(scenario: ScenarioId, second: number, recovery: number | null): Sample {
  const onset = clamp((second - faultOnset) / 13);
  const severity = onset * (recovery === null ? 1 : 1 - clamp((second - recovery) / 8));
  const deviation = Math.sin(second * 0.45);
  const thermal = scenario === "thermal" ? severity : 0;
  const motion = scenario === "motion" ? severity : 0;
  const extrusion = scenario === "extrusion" ? severity : 0;
  const probeStale = scenario === "sensors" && second > faultOnset && (recovery === null || second < recovery + 5);
  const nozzle = target.nozzle + 0.8 * deviation - 22 * thermal;
  const bed = target.bed + 0.30 * Math.cos(second / 3);
  return {
    nozzle,
    nozzleRef: nozzle + 0.5 * Math.cos(second / 5),
    bed: probeStale ? target.bed + 0.30 * Math.cos(faultOnset / 3) : bed,
    bedRef: bed + 0.18 * deviation,
    heater: 46 + 4 * deviation + 51 * thermal,
    flow: target.flow + 0.15 * deviation - 3.1 * extrusion,
    feedLoad: 43 + 3 * Math.sin(second / 4) + 49 * extrusion,
    motion: 0.04 + 0.01 * Math.cos(second / 2) + 0.27 * motion,
    probeAge: probeStale ? second - faultOnset : 0.1 + 0.03 * (1 + deviation),
  };
}

export type Evidence = { label: string; value: string; detail: string };

export const faults = {
  thermal: {
    code: "TH-104", title: "Nozzle below process window", action: "Restore simulated heater output",
    impact: "The nozzle is too cool for the active deposition profile. The simulated print is held to protect layer bonding.",
    causes: [
      { title: "Heat delivery deficit", rank: "Best fit", evidence: "The controller is requesting high heater duty while independent nozzle readings agree that temperature is low." },
      { title: "Excess heat loss near the hotend", rank: "Possible", evidence: "Unexpected cooling can produce the same temperature and duty pattern. This replay has no independent airflow measurement." },
      { title: "Nozzle temperature sensor bias", rank: "Less supported", evidence: "The main and reference channels agree. An isolated sensor bias would usually cause the two readings to diverge." },
    ],
    condition: (sample: Sample) => sample.nozzle < target.nozzleLow && sample.heater >= 85 && Math.abs(sample.nozzle - sample.nozzleRef) < 2,
    recovered: (sample: Sample) => sample.nozzle >= target.nozzleLow && sample.nozzle <= target.nozzleHigh && Math.abs(sample.nozzle - sample.nozzleRef) < 2,
    evidence: (sample: Sample): Evidence[] => [
      { label: "Nozzle temperature", value: `${sample.nozzle.toFixed(1)} °C`, detail: "240–250 °C process window" },
      { label: "Heater duty", value: `${sample.heater.toFixed()}%`, detail: "High demand at ≥85%" },
      { label: "Reference probe", value: `${sample.nozzleRef.toFixed(1)} °C`, detail: "Within 2 °C of primary reading" },
    ],
    verify: "Wait for four consecutive samples within the nozzle process window with both probes in agreement.",
  },
  motion: {
    code: "MO-208", title: "Y-axis tracking drift", action: "Restore simulated axis tracking",
    impact: "The carriage is outside the positional tolerance for this toolpath. The simulated print is held to protect part geometry.",
    causes: [
      { title: "Y-axis load or transmission resistance", rank: "Best fit", evidence: "Position feedback consistently lags the command while the thermal and material signals remain within their windows." },
      { title: "Encoder measurement error", rank: "Possible", evidence: "The following error uses encoder feedback. The replay has no independent position measurement to distinguish actual drag from biased feedback." },
    ],
    condition: (sample: Sample) => sample.motion > target.motionMax,
    recovered: (sample: Sample) => sample.motion <= target.motionMax,
    evidence: (sample: Sample): Evidence[] => [
      { label: "Y following error", value: `${sample.motion.toFixed(2)} mm`, detail: "Maximum 0.18 mm" },
      { label: "Nozzle temperature", value: `${sample.nozzle.toFixed(1)} °C`, detail: "Compare with 240–250 °C" },
      { label: "Estimated flow", value: `${sample.flow.toFixed(1)} mm³/s`, detail: "Compare with 7.2–8.8 mm³/s" },
    ],
    verify: "Confirm Y-axis feedback stays within the position limit for four samples.",
  },
  extrusion: {
    code: "EX-312", title: "Material feed restriction", action: "Clear simulated feed restriction",
    impact: "Material delivery is below the required rate at high drive load. The simulated print is held to prevent under-extrusion.",
    causes: [
      { title: "Resistance in the filament path", rank: "Best fit", evidence: "The drive is working harder while flow drops. A restriction can occur anywhere between the drive rollers and the nozzle." },
      { title: "Hotend below melt temperature", rank: "Less supported", evidence: "The nozzle signal remains in the simulated process window. The model cannot measure polymer temperature directly." },
    ],
    condition: (sample: Sample) => sample.flow < target.flowLow && sample.feedLoad > 75,
    recovered: (sample: Sample) => sample.flow >= target.flowLow && sample.flow <= target.flowHigh && sample.feedLoad <= 75,
    evidence: (sample: Sample): Evidence[] => [
      { label: "Estimated flow", value: `${sample.flow.toFixed(1)} mm³/s`, detail: "7.2–8.8 mm³/s process window" },
      { label: "Drive load", value: `${sample.feedLoad.toFixed()}%`, detail: "High load above 75%" },
      { label: "Nozzle temperature", value: `${sample.nozzle.toFixed(1)} °C`, detail: "Compare with 240–250 °C" },
    ],
    verify: "Confirm flow is back in its window and drive load has dropped.",
  },
  sensors: {
    code: "SE-417", title: "Bed probe data stale", action: "Restore simulated probe updates",
    impact: "The last bed value can look plausible after transmission stops. The simulated print is held because the primary temperature feedback is stale.",
    causes: [
      { title: "Lost primary probe updates", rank: "Best fit", evidence: "The sample age exceeds its allowed maximum while the independent bed probe continues reporting." },
      { title: "Primary acquisition channel stalled", rank: "Possible", evidence: "The available data identify the stale channel. They cannot locate the failure within the probe, wiring, acquisition unit or data path." },
    ],
    condition: (sample: Sample) => sample.probeAge > target.probeAgeMax,
    recovered: (sample: Sample) => sample.probeAge <= target.probeAgeMax,
    evidence: (sample: Sample): Evidence[] => [
      { label: "Primary sample age", value: `${sample.probeAge.toFixed(1)} s`, detail: "Maximum age 2.5 s" },
      { label: "Last primary reading", value: `${sample.bed.toFixed(1)} °C`, detail: "Held value · use sample age to assess validity" },
      { label: "Independent bed probe", value: `${sample.bedRef.toFixed(1)} °C`, detail: "Reference channel still updating" },
    ],
    verify: "Confirm the primary sample age returns to its normal range and stays there for four samples.",
  },
} as const;

export type Event = { at: number; subsystem?: Subsystem; severity: "fault" | "normal" | "info"; text: string };

export function analyze(samples: Sample[]) {
  const active: Partial<Record<Subsystem, number>> = {};
  const events: Event[] = [{ at: 0, severity: "normal", text: "Replay started at steady-state print" }];
  let heldTicks = 0;
  const states = (Object.keys(faults) as Subsystem[]).map((subsystem) => ({ subsystem, streak: 0 }));
  for (const [at, sample] of samples.entries()) {
    for (const state of states) {
      const { subsystem } = state;
      const isActive = active[subsystem] !== undefined;
      const fault = faults[subsystem];
      const transition = isActive ? fault.recovered(sample) : fault.condition(sample);
      state.streak = transition ? state.streak + 1 : 0;
      if (state.streak < confirmationSamples) continue;
      state.streak = 0;
      if (!isActive) {
        active[subsystem] = at;
        events.push({ at, subsystem, severity: "fault", text: faults[subsystem].title });
      } else {
        delete active[subsystem];
        events.push({ at, subsystem, severity: "normal", text: `${subsystems[subsystem].short} fault cleared` });
      }
    }
    if (Object.keys(active).length) heldTicks++;
  }
  return { active, events, heldTicks };
}

export function samplesThrough(scenario: ScenarioId, second: number, recovery: number | null) {
  return Array.from({ length: second + 1 }, (_, index) => sampleAt(scenario, index, recovery));
}

export function clock(second: number) {
  return `${String(Math.floor(second / 60)).padStart(2, "0")}:${String(second % 60).padStart(2, "0")}`;
}
