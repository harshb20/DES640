import type { Subsystem } from "./model";

export const levels = [
  ["Functional purpose", "Why the printer exists"],
  ["Values and priorities", "What a successful run must preserve"],
  ["Generalized processes", "What must happen to make a part"],
  ["Subsystem functions", "How the machine provides those processes"],
  ["Physical components", "Which parts implement those functions"],
  ["Physical form and state", "What the operator can observe"],
] as const;

type Node = { title: string; description: string; means?: string[] };

const columns: Record<Subsystem, Node[]> = {
  thermal: [
    { title: "Produce a bonded part", description: "Fabricate a structurally sound part with consistent interlayer bonding." },
    { title: "Hold the process window", description: "Use the active profile’s nozzle target of 245 °C and a 240–250 °C deposition window." },
    { title: "Condition the polymer", description: "Transfer energy to the polymer as it moves through the melt zone.", means: ["sensors-4"] },
    { title: "Regulate hotend heat", description: "Drive the heater from the thermal error and verify heat delivery against an independent reading." },
    { title: "Heater block and probes", description: "The block houses a heater and a primary temperature probe. A reference probe independently estimates block temperature." },
    { title: "Temperature and duty", description: "Compare measured and reference nozzle temperature with setpoint and heater duty." },
  ],
  motion: [
    { title: "Match the part geometry", description: "Translate the digital toolpath into repeatable, spatially accurate bead placement." },
    { title: "Respect tracking tolerance", description: "Keep simulated Y-axis following error at or below 0.18 mm during the active toolpath." },
    { title: "Place the deposition path", description: "Coordinate carriage motion with material delivery so beads land at the intended positions.", means: ["extrusion-4"] },
    { title: "Track carriage position", description: "Compare commanded position with encoder feedback and compensate through the drive." },
    { title: "Gantry and encoder", description: "The Y-axis rails, transmission and motor move the carriage. An encoder provides position feedback." },
    { title: "Y following error", description: "Observe the magnitude of the difference between requested and measured carriage position." },
  ],
  extrusion: [
    { title: "Maintain consistent fill", description: "Deliver the material volume needed to form continuous beads and avoid gaps or overfill." },
    { title: "Match deposition demand", description: "Maintain 7.2–8.8 mm³/s flow for this profile while avoiding excessive feed load." },
    { title: "Meter molten material", description: "Coordinate polymer throughput with the toolpath.", means: ["thermal-4"] },
    { title: "Drive and monitor feed", description: "Advance filament through the feed path and estimate delivered flow from drive feedback." },
    { title: "Feeder and nozzle", description: "Drive rollers push filament into the melt zone and through the nozzle orifice." },
    { title: "Flow and drive load", description: "Low flow coupled with rising drive load supports a restriction in the material path." },
  ],
  sensors: [
    { title: "Maintain trustworthy feedback", description: "Keep the machine observable so that continued operation is based on valid feedback." },
    { title: "Use fresh primary readings", description: "Require a primary bed sample age at or below 2.5 seconds. Mark stale signals before they can imply a healthy process." },
    { title: "Observe machine state", description: "Acquire temperature readings through primary and independent measurement paths." },
    { title: "Validate feedback", description: "Track when the last primary sample arrived and expose the reference channel during diagnosis." },
    { title: "Bed probes and acquisition", description: "The bed probe, acquisition channel and independent reference probe publish temperature readings." },
    { title: "Sample age and reference", description: "Compare primary freshness with incoming independent readings. A plausible held value may still be stale." },
  ],
};

export const nodes = (Object.keys(columns) as Subsystem[]).flatMap((subsystem) =>
  columns[subsystem].map((node, index) => ({
    ...node,
    id: `${subsystem}-${index + 1}`,
    subsystem,
    level: index,
    means: [...(index === levels.length - 1 ? [] : [`${subsystem}-${index + 2}`]), ...(node.means ?? [])],
  })),
);
