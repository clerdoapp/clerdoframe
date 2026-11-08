import { useEffect, useId, useRef, useState } from 'react';
import { Camera, Crop, FileSpreadsheet, PenTool, Replace, Shapes, SwitchCamera, Table2, Waypoints } from 'lucide-react';
import { run } from '../../app/commands';
import type { DialogProps } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import type { Effects, Picture, Theme } from '../../model/deck';
import { mediaUrl, duotoneEnds } from '../../render/paint';
import { Btn, Dialog, S, Select } from '../../ui/kit';
import { fit, loadImage, newPicture, placeShapes } from '../insert/media';
import { ShapeGallery } from '../shapes/gallery';
import { insertChartFromCells, insertTableFromCells, pickSheetFile, tableCells, type Picked } from './linked';
import { ASPECTS, RECOLOR_PRESETS } from './picture';
import { bestSheet, parseRange } from './sheet';

const themeOf = (store: FrameStore): Theme => (store.slide ? store.masterOf(store.slide).master : store.deck.masters[0]!).theme;
const pictures = (s: FrameStore): Picture[] => s.selected().filter((x): x is Picture => x.kind === 'picture');

// ---------- Shape galleries in dialogs ----------

export const ChangeShapeDialog = ({ store, close }: DialogProps) => (
  <Dialog title="Change shape" close={close} width={360}>
    <ShapeGallery store={store} onPick={(g) => { run(store, 'shape.change', g); close(); }} />
  </Dialog>
);

export const MaskShapeDialog = ({ store, close }: DialogProps) => (
  <Dialog title="Crop to shape" close={close} width={360}>
    <ShapeGallery store={store} onPick={(g) => { run(store, 'picture.mask', g); close(); }} />
  </Dialog>
);

// ---------- Reflection presets ----------

const REFLECTIONS: [string, NonNullable<Effects['reflection']> | undefined][] = [
  ['No reflection', undefined],
  ...(['Tight', 'Half', 'Full'] as const).flatMap((size, si) => ([['touching', 0], ['4 pt offset', 4], ['8 pt offset', 8]] as const).map(([off, pt]) =>
    [`${size} reflection, ${off}`, { alpha: 0.5, size: [0.35, 0.55, 0.92][si]!, dist: pt * (96 / 72), blur: 0.5 }] as [string, NonNullable<Effects['reflection']>])),
];

const same = (a: Effects['reflection'], b: Effects['reflection']) => (!a && !b) || (!!a && !!b && Math.abs(a.size - b.size) < 0.02 && Math.abs(a.dist - b.dist) < 0.5);

export const ReflectionPresets = ({ store }: { store: FrameStore }) => {
  const cur = store.selected()[0]?.effects?.reflection;
  return (
    <div className="gobj-refl" role="list" aria-label="Reflection presets">
      {REFLECTIONS.map(([label, r]) => (
        <button key={label} role="listitem" title={label} aria-label={label} className={same(cur, r) ? 'on' : ''} onClick={() => run(store, 'format.effects', { reflection: r })}>
          <svg viewBox="0 0 40 46" width="40" height="46" aria-hidden="true">
            <rect x="8" y="4" width="24" height="18" rx="3" fill="var(--accent)" />
            {r && <rect x="8" y={22 + r.dist * 0.4} width="24" height={18 * r.size} rx="3" fill="var(--accent)" opacity={0.3} />}
          </svg>
        </button>
      ))}
    </div>
  );
};

// ---------- Recolor with theme colours ----------

const RecolorSwatch = ({ store, p, dark, light }: { store: FrameStore; p: Picture; dark: string; light: string }) => {
  const id = `rc${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const url = mediaUrl(store.deck, p.cutout ?? p.media);
  const ch = (h: string, i: number) => ((parseInt(h.slice(1 + i, 3 + i), 16) || 0) / 255).toFixed(3);
  return (
    <svg viewBox="0 0 48 34" width="48" height="34" aria-hidden="true">
      <filter id={id} colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0" />
        <feComponentTransfer>
          <feFuncR type="table" tableValues={`${ch(dark, 0)} ${ch(light, 0)}`} />
          <feFuncG type="table" tableValues={`${ch(dark, 2)} ${ch(light, 2)}`} />
          <feFuncB type="table" tableValues={`${ch(dark, 4)} ${ch(light, 4)}`} />
        </feComponentTransfer>
      </filter>
      {url ? <image href={url} width="48" height="34" preserveAspectRatio="xMidYMid slice" filter={`url(#${id})`} />
        : <rect width="48" height="34" fill={`url(#${id}g)`} />}
      {!url && <defs><linearGradient id={`${id}g`}><stop offset="0" stopColor={dark} /><stop offset="1" stopColor={light} /></linearGradient></defs>}
    </svg>
  );
};

export const RecolorGallery = ({ store }: { store: FrameStore }) => {
  const p = pictures(store)[0];
  if (!p) return null;
  const theme = themeOf(store);
  const a = p.adjust;
  const curId = a?.recolor && typeof a.recolor === 'object' && 'theme' in a.recolor ? `${a.recolorMode ?? 'dark'}${a.recolor.theme.replace('accent', '')}` : a?.recolor ? 'other' : 'none';
  return (
    <>
      <div className="gobj-recolor" role="list" aria-label="Recolor with theme colors">
        <button role="listitem" className={curId === 'none' ? 'on' : ''} title="No recolor" aria-label="No recolor" onClick={() => run(store, 'picture.recolor', 'none')}>
          <RecolorSwatch store={store} p={{ ...p, adjust: undefined }} dark="#000000" light="#FFFFFF" />
          <span>None</span>
        </button>
        {RECOLOR_PRESETS.map((r) => {
          const e = duotoneEnds({ theme: r.theme }, r.mode, { theme });
          return (
            <button key={r.id} role="listitem" className={curId === r.id ? 'on' : ''} title={r.label} aria-label={r.label} onClick={() => run(store, 'picture.recolor', r.id)}>
              <RecolorSwatch store={store} p={p} dark={e.dark} light={e.light} />
              <span>{r.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
};

// ---------- Mask, replace ----------

export const MaskTools = ({ store }: { store: FrameStore }) => (
  <>
    <div className="toollist">
      <Btn store={store} id="picture.replace" icon={Replace} label="Replace picture" />
      <Btn store={store} id="picture.maskDialog" icon={Shapes} label="Crop to shape" />
    </div>
    <div className="cgtitle">Aspect ratio</div>
    <div className="gobj-aspects">
      {ASPECTS.map((a) => <button key={a} className="tool" title={`Crop to ${a}`} aria-label={`Crop to ${a}`} onClick={() => run(store, 'picture.aspect', a)}><Crop size={14} strokeWidth={S} /><span>{a}</span></button>)}
    </div>
  </>
);

// ---------- Tool panel sections ----------

export const ShapeTools = ({ store }: { store: FrameStore }) => (
  <div className="toollist">
    <Btn store={store} id="shape.changeDialog" icon={Shapes} label="Change shape" />
    <Btn store={store} id="shape.editPoints" icon={PenTool} label="Edit points" />
    <Btn store={store} id="shape.convertToFreeform" icon={Waypoints} label="Convert to freeform" />
  </div>
);

export const MoreSection = ({ store }: { store: FrameStore }) => (
  <div className="toollist">
    <Btn store={store} id="insert.camera" icon={Camera} label="Camera" wide />
    <Btn store={store} id="chart.fromFile" icon={FileSpreadsheet} label="Chart from file" wide />
    <Btn store={store} id="table.fromFile" icon={Table2} label="Table from file" wide />
  </div>
);

// ---------- Camera ----------

export const CameraDialog = ({ store, close }: DialogProps) => {
  const video = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [cams, setCams] = useState(0);
  const [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null);
  useEffect(() => {
    if (shot) return;
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!md?.getUserMedia) { setErr('The camera is not available here.'); return; }
    let stream: MediaStream | null = null, gone = false;
    setReady(false);
    md.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }).then((s) => {
      if (gone) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      setErr(null);
      const v = video.current;
      if (v) { v.srcObject = s; void v.play().catch(() => undefined); }
      void md.enumerateDevices().then((ds) => setCams(ds.filter((d) => d.kind === 'videoinput').length), () => undefined);
    }, (e: unknown) => {
      const name = e instanceof Error || (typeof e === 'object' && e && 'name' in e) ? (e as { name: string }).name : '';
      setErr(name === 'NotAllowedError' || name === 'SecurityError' ? 'Camera access is blocked. Allow it in your browser or system settings, then try again.' : name === 'NotFoundError' ? 'No camera was found.' : 'The camera could not be started.');
    });
    return () => { gone = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [facing, shot]);
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);
  const capture = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    const g = c.getContext('2d');
    if (!g) return;
    g.drawImage(v, 0, 0);
    c.toBlob((b) => { if (b) setShot({ url: URL.createObjectURL(b), blob: b }); }, 'image/jpeg', 0.92);
  };
  const insert = async (): Promise<void> => {
    if (!shot) return;
    const img = await loadImage(store, shot.blob, `Camera photo ${new Date().toISOString().slice(0, 16).replace('T', ' ')}.jpg`);
    if (!img) return;
    const f = fit(img.w, img.h, store.deck.w * 0.7, store.deck.h * 0.7, true);
    placeShapes(store, 'Insert photo', [newPicture(img.id, (store.deck.w - f.w) / 2, (store.deck.h - f.h) / 2, f.w, f.h, 'Camera photo')]);
  };
  return (
    <Dialog title="Camera" close={close} width={560}
      footer={!shot && cams !== 1 ? <button className="tool" disabled={!!err} onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')}><SwitchCamera size={16} strokeWidth={S} /> Switch camera</button> : shot ? <button className="tool" onClick={() => setShot(null)}>Retake</button> : undefined}
      onOk={() => { if (!shot) { capture(); return false; } void insert(); return true; }} okLabel={shot ? 'Insert' : 'Take photo'}>
      <div className="gobj-camera">
        {err ? <p className="muted">{err}</p>
          : shot ? <img src={shot.url} alt="Photo taken" />
            : <video ref={video} playsInline muted autoPlay onLoadedData={() => setReady(true)} style={facing === 'user' ? { transform: 'scaleX(-1)' } : undefined} aria-label="Camera preview" />}
        {!err && !shot && !ready && <p className="muted small">Starting the camera…</p>}
      </div>
    </Dialog>
  );
};

// ---------- Chart or table from a spreadsheet file ----------

const KINDS: [string, string][] = [['col', 'Clustered column'], ['colStacked', 'Stacked column'], ['bar', 'Clustered bar'], ['line', 'Line'], ['lineMarkers', 'Line with markers'], ['area', 'Area'], ['areaStacked', 'Stacked area'], ['pie', 'Pie'], ['doughnut', 'Doughnut'], ['radar', 'Radar'], ['combo', 'Column and line']];

export const FromFileDialog = ({ store, data, close }: DialogProps<{ mode: 'chart' | 'table' }>) => {
  const mode = data?.mode ?? 'chart';
  const [file, setFile] = useState<Picked | null>(null);
  const [sheet, setSheet] = useState(0);
  const [range, setRange] = useState('');
  const [kind, setKind] = useState('col');
  const [busy, setBusy] = useState(false);
  const sh = file?.sheets[sheet];
  const t = sh ? tableCells(sh, parseRange(range) ? range : undefined) : null;
  const choose = async () => {
    setBusy(true);
    const f = await pickSheetFile();
    setBusy(false);
    if (!f) return;
    setFile(f);
    const i = mode === 'chart' ? bestSheet(f.sheets) : 0;
    setSheet(i);
    const first = f.sheets[i] ? tableCells(f.sheets[i]!) : null;
    setRange(first?.range ?? '');
  };
  const pickSheet = (i: number) => { setSheet(i); const x = file?.sheets[i] ? tableCells(file.sheets[i]!) : null; setRange(x?.range ?? ''); };
  const ok = (): boolean => {
    if (!file || !sh || !t) { store.notify('Choose a file with a table first.'); return false; }
    try {
      if (mode === 'chart') insertChartFromCells(store, kind, t.cells, { file: file.name, ...(file.sheets.length > 1 ? { sheet: sh.name } : {}), range: t.range });
      else insertTableFromCells(store, t.cells);
    } catch (e) { store.notify(e instanceof Error ? e.message : 'That could not be inserted.'); return false; }
    return true;
  };
  const preview = t?.cells.slice(0, 8).map((r) => r.slice(0, 8));
  return (
    <Dialog title={mode === 'chart' ? 'Chart from a file' : 'Table from a file'} close={close} width={560} okLabel="Insert" onOk={ok}>
      <div className="gobj-file">
        <div className="rowx">
          <button className="tool" disabled={busy} onClick={() => void choose()}><FileSpreadsheet size={16} strokeWidth={S} /> {file ? 'Choose another file…' : 'Choose a file…'}</button>
          <span className="muted small grow">{file ? file.name : 'CSV, TSV or .xlsx'}</span>
        </div>
        {file && !file.sheets.length && <p className="muted">{file.name} could not be read.</p>}
        {file && file.sheets.length > 0 && (
          <>
            <div className="num2">
              {file.sheets.length > 1 && <Select label="Sheet" value={String(sheet)} options={file.sheets.map((s, i) => [String(i), s.name] as [string, string])} onChange={(v) => pickSheet(Number(v))} />}
              <label className="lbl"><span>Range</span><input value={range} placeholder="A1:D6" aria-label="Range" onChange={(e) => setRange(e.target.value.toUpperCase())} /></label>
              {mode === 'chart' && <Select label="Chart type" value={kind} options={KINDS} onChange={setKind} />}
            </div>
            {preview?.length ? (
              <div className="gobj-preview">
                <table><tbody>{preview.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={i === 0 || j === 0 ? 'hd' : ''}>{c}</td>)}</tr>)}</tbody></table>
              </div>
            ) : <p className="muted small">No table was found on this sheet.</p>}
            {mode === 'chart' && <p className="muted small">The first row names the series and the first column holds the categories. The chart remembers the file so you can update it later.</p>}
          </>
        )}
      </div>
    </Dialog>
  );
};
