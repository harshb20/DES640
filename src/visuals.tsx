import { useEffect, useRef } from "react";
import { Activity, Move, Thermometer, Waves } from "lucide-react";
import { clock, subsystems, type Subsystem } from "./model";

const colors = { mint: "#72e8c5", amber: "#ffbf70", muted: "#758997", slate: "#354957", light: "#577180" };
const icons = { thermal: Thermometer, motion: Move, extrusion: Waves, sensors: Activity };
type Point = [number, number];
type Position = [number, number, number];

const markers: Record<Subsystem, { position: Position; labelAt: Point }> = {
  motion: { position: [226, 59, 182], labelAt: [642, 84] },
  extrusion: { position: [101, 67, 251], labelAt: [148, 82] },
  thermal: { position: [139, 108, 174], labelAt: [666, 191] },
  sensors: { position: [157, 174, 49], labelAt: [143, 248] },
};

const width = 760;
const height = 360;

function project([x, y, z]: Position): Point {
  return [365 + (x - y) * 0.79, 194 + (x + y) * 0.32 - z * 0.65];
}

function drawPrinter(canvas: HTMLCanvasElement, selected: Subsystem, faulted: Subsystem[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.clearRect(0, 0, width, height);

  function line(points: Position[], color: string, thickness = 1) {
    ctx!.beginPath();
    points.map(project).forEach(([x, y], index) => index ? ctx!.lineTo(x, y) : ctx!.moveTo(x, y));
    ctx!.strokeStyle = color;
    ctx!.lineWidth = thickness;
    ctx!.stroke();
  }

  function face(points: Position[], fill: string, edge = "#456273") {
    ctx!.beginPath();
    points.map(project).forEach(([x, y], index) => index ? ctx!.lineTo(x, y) : ctx!.moveTo(x, y));
    ctx!.closePath();
    ctx!.fillStyle = fill;
    ctx!.fill();
    ctx!.strokeStyle = edge;
    ctx!.lineWidth = 0.85;
    ctx!.stroke();
  }

  function block(origin: Position, size: Position, tones = ["#253a46", "#182731", "#20343f"], edge?: string) {
    const [x, y, z] = origin;
    const [dx, dy, dz] = size;
    const X = x + dx, Y = y + dy, Z = z + dz;
    face([[X, y, z], [X, Y, z], [X, Y, Z], [X, y, Z]], tones[1], edge);
    face([[x, Y, z], [X, Y, z], [X, Y, Z], [x, Y, Z]], tones[2], edge);
    face([[x, y, Z], [X, y, Z], [X, Y, Z], [x, Y, Z]], tones[0], edge);
  }

  for (let step = -120; step < 390; step += 24) {
    line([[step, -65, 0], [step, 325, 0]], "#58748726");
    line([[-110, step, 0], [380, step, 0]], "#58748726");
  }

  block([2, 10, 2], [262, 202, 26]);
  block([10, 19, 29], [246, 184, 9], ["#1e313c", "#243c47", "#1e2f38"]);
  face([[11, 22, 40], [248, 22, 40], [248, 22, 226], [11, 22, 226]], "#2b465942", "#294758");
  face([[256, 22, 40], [256, 198, 40], [256, 198, 226], [256, 22, 226]], "#28465736", "#3a5768");
  block([2, 10, 31], [11, 11, 205]);
  block([253, 10, 31], [11, 11, 205]);
  block([13, 10, 225], [240, 11, 11]);
  block([253, 21, 225], [11, 177, 11]);
  block([2, 21, 225], [11, 177, 11]);

  const old = ctx.globalAlpha;
  ctx.globalAlpha = 0.75;
  block([22, 33, 43], [218, 153, 11], ["#24424a", "#203842", "#2e5358"], "#548279");
  for (let next = 35; next < 237; next += 16) line([[next, 35, 54], [next, 184, 54]], "#4f7b793e");
  for (let next = 43; next < 186; next += 16) line([[23, next, 54], [237, next, 54]], "#4f7b793e");
  ctx.globalAlpha = old;

  const print: Position = [104, 78, 55];
  block(print, [70, 52, 26], ["#367e73", "#1b494a", "#2d6b62"], "#6ed4b5");
  block([120, 88, 81], [42, 33, 12], ["#3a9282", "#2e665e", "#337e72"], "#71dcbb");
  for (let z = 60; z < 81; z += 4) line([[105, 130, z], [174, 130, z], [174, 78, z]], "#5bb6a778");
  for (let y = 93; y < 120; y += 5) line([[123, y, 93], [159, y, 93]], "#70c7af83");

  block([14, 57, 177], [235, 9, 12], ["#415e6e", "#263944", "#345364"]);
  block([19, 99, 175], [228, 11, 10], ["#426374", "#2d4656", "#365766"]);
  line([[17, 112, 173], [249, 112, 173]], "#53808d");
  block([117, 91, 169], [37, 31, 31], ["#4c6575", "#2e424e", "#344f5b"]);
  block([125, 97, 157], [20, 19, 12], ["#926443", "#583d28", "#765437"], "#c59162");
  block([131, 104, 151], [7, 7, 6], ["#df9d63", "#a56842", "#a97646"], "#daa16d");
  block([72, 38, 234], [60, 29, 29], ["#3e5161", "#263b47", "#354d5b"]);
  block([145, 165, 54], [16, 9, 6], ["#5fc9b7", "#3d7775", "#508e8c"], "#84dbc8");

  const [x1, y1] = project([108, 64, 247]);
  const [x2, y2] = project([137, 105, 198]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(x1 + 43, y1 - 30, x2 + 24, y2 - 50, x2, y2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#7fb7aa";
  ctx.stroke();

  block([2, 198, 31], [11, 13, 205]);
  block([253, 198, 31], [11, 13, 205]);
  block([13, 198, 225], [240, 13, 11]);
  line([[10, 211, 220], [259, 211, 220]], "#587685");
  block([176, 213, 7], [64, 2, 14], ["#233e45", "#192a33", "#233e45"], "#426775");
  line([[184, 215, 14], [224, 215, 14]], "#65d6bc", 1.5);
  line([[-8, 224, 2], [22, 224, 2]], "#729a9a");
  line([[-8, 224, 2], [-8, 250, 2]], "#729a9a");
  line([[-8, 224, 2], [-8, 224, 24]], "#729a9a");

  for (const [key, marker] of Object.entries(markers) as [Subsystem, (typeof markers)[Subsystem]][]) {
    const [x, y] = project(marker.position);
    const [lx, ly] = marker.labelAt;
    const color = faulted.includes(key) ? colors.amber : key === selected ? colors.mint : colors.light;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (lx - x) * 0.28, ly);
    ctx.lineTo(lx, ly);
    ctx.strokeStyle = color;
    ctx.lineWidth = key === selected ? 1.45 : 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, 2 * Math.PI);
    ctx.fillStyle = color + "28";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 3.1, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

export function MachineDrawing({ selected, faulted, onSelect }: { selected: Subsystem; faulted: Subsystem[]; onSelect: (id: Subsystem) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (canvas.current) drawPrinter(canvas.current, selected, faulted); }, [selected, faulted]);
  return <div className="machine-viewport">
    <canvas ref={canvas} width={width * 2} height={height * 2} aria-hidden="true" />
    {(Object.keys(markers) as Subsystem[]).map((id) => {
      const [x, y] = markers[id].labelAt;
      const Icon = icons[id];
      return <button key={id} type="button" className={`marker ${faulted.includes(id) ? "problem" : ""}`} style={{ left: `${x / width * 100}%`, top: `${y / height * 100}%` }}
        aria-pressed={selected === id} aria-label={`Locate ${subsystems[id].label}`} onClick={() => onSelect(id)}>
        <Icon size={14} aria-hidden="true" /><span>{subsystems[id].short}</span>
      </button>;
    })}
  </div>;
}

type TraceProps = {
  values: number[];
  reference?: number[];
  limits?: [number, number];
  range: [number, number];
  fault?: boolean;
  small?: boolean;
  label: string;
  start?: number;
  end?: number;
};

export function Trace({ values, reference, limits, range, fault, small, label, start, end }: TraceProps) {
  const element = useRef<HTMLCanvasElement>(null);
  const color = fault ? colors.amber : colors.mint;
  useEffect(() => {
    const canvas = element.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas || values.length === 0) return;
    const w = canvas.width;
    const h = canvas.height;
    const margin = small ? 5 : 13;
    const px = (index: number) => margin + index * (w - 2 * margin) / Math.max(1, values.length - 1);
    const py = (value: number) => h - margin - (h - 2 * margin) * Math.min(1, Math.max(0, (value - range[0]) / (range[1] - range[0])));
    ctx.clearRect(0, 0, w, h);
    if (limits) {
      ctx.fillStyle = "#72e8c515";
      ctx.fillRect(margin, py(limits[1]), w - margin * 2, py(limits[0]) - py(limits[1]));
    }
    if (!small) {
      ctx.strokeStyle = "#354957";
      ctx.lineWidth = 1;
      for (let index = 0; index <= 4; index++) {
        const x = margin + (w - margin * 2) * index / 4;
        const y = margin + (h - margin * 2) * index / 4;
        ctx.beginPath();
        ctx.moveTo(margin, y);
        ctx.lineTo(w - margin, y);
        ctx.moveTo(x, margin);
        ctx.lineTo(x, h - margin);
        ctx.stroke();
      }
    }

    function stroke(points: number[], strokeColor: string, dashed = false) {
      ctx!.beginPath();
      ctx!.setLineDash(dashed ? [9, 8] : []);
      points.forEach((point, index) => index ? ctx!.lineTo(px(index), py(point)) : ctx!.moveTo(px(index), py(point)));
      ctx!.strokeStyle = strokeColor;
      ctx!.lineWidth = small ? 3 : 3.5;
      ctx!.lineJoin = "round";
      ctx!.stroke();
      ctx!.setLineDash([]);
    }

    if (reference) stroke(reference, "#92a7b3", true);
    stroke(values, color);
    ctx.beginPath();
    ctx.arc(px(values.length - 1), py(values.at(-1)!), small ? 3 : 5, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }, [color, limits, range, reference, small, values]);

  if (small) return <canvas className="sparkline" ref={element} width={168} height={44} aria-hidden="true" />;
  return <div className="trace" role="img" aria-label={label}>
    <div className="trace-scale" aria-hidden="true"><span>{range[1]}</span><span>{(range[0] + range[1]) / 2}</span><span>{range[0]}</span></div>
    <div>
      <canvas ref={element} width={720} height={205} aria-hidden="true" />
      <div className="trace-time" aria-hidden="true"><span>{clock(start ?? 0)}</span><span>{clock(end ?? 0)}</span></div>
    </div>
  </div>;
}
