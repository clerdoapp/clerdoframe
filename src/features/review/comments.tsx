import { useEffect, useRef, useState } from 'react';
import { Check as CheckIcon, CheckCheck, ChevronLeft, ChevronRight, MessageSquare, MessageSquarePlus, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { openDialog, openPane } from '../../app/commands';
import type { FrameStore } from '../../app/store';
import { uid, type Comment, type Slide } from '../../model/deck';
import type { DialogProps } from '../../app/registry';
import { Dialog, Field, S } from '../../ui/kit';

const AUTHOR_KEY = 'clerdoframe.author';
export const getAuthor = (): string => { try { return localStorage.getItem(AUTHOR_KEY) ?? ''; } catch { return ''; } };
export const setAuthor = (n: string): void => { try { localStorage.setItem(AUTHOR_KEY, n); } catch { /* private mode */ } };
export const initialsOf = (n: string): string => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
const PALETTE = ['#D9480F', '#1C7ED6', '#2B8A3E', '#AE3EC9', '#E67700', '#0C8599', '#C2255C', '#5F3DC4'];
export const colorOf = (n: string): string => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) | 0; return PALETTE[Math.abs(h) % PALETTE.length]!; };

const when = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400 && new Date().getDate() === d.getDate()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
};

/** Where comments live in the deck, in reading order: [slide index, comment]. */
export const allComments = (s: FrameStore): [number, Comment][] => s.deck.slides.flatMap((sl, i) => (sl.comments ?? []).map((c): [number, Comment] => [i, c]));

const anchorFor = (s: FrameStore): { x: number; y: number; shape?: string } => {
  const one = s.one();
  if (one) return { x: Math.round(one.x + one.w), y: Math.round(one.y), shape: one.id };
  const n = (s.slide?.comments ?? []).length;
  return { x: 24 + (n % 6) * 34, y: 24 + Math.floor(n / 6) * 34 };
};

/** Starts a new comment: asks for a name the first time. */
export const newComment = (s: FrameStore): void => {
  if (!s.slide) return;
  if (s.view.mode !== 'normal') { s.notify('Comments are added in Normal view.'); return; }
  if (!getAuthor()) { openDialog(s, 'review.author', { then: 'new' }); return; }
  s.ext.commentDraft = { slide: s.slide.id, ...anchorFor(s) };
  s.view.pane = 'comments';
  s.emit();
};

/** Marks used on the canvas and in the pane to show which thread is active. */
export const activeComment = (s: FrameStore): string | null => (typeof s.ext.activeComment === 'string' ? s.ext.activeComment : null);
export const focusComment = (s: FrameStore, id: string | null): void => { s.ext.activeComment = id; s.emit(); };

export const AuthorDialog = ({ store, data, close }: DialogProps<{ then?: string }>) => {
  const [name, setName] = useState(getAuthor());
  return (
    <Dialog title="Your name for comments" close={close} okLabel="Save"
      onOk={() => { const n = name.trim(); if (!n) return false; setAuthor(n); if (data?.then === 'new') queueMicrotask(() => newComment(store)); return true; }}>
      <p className="muted small">Shown next to the comments you write. It stays on this device.</p>
      <Field label="Name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></Field>
    </Dialog>
  );
};

const Avatar = ({ name }: { name: string }) => <span className="rv-av" style={{ background: colorOf(name) }} aria-hidden>{initialsOf(name)}</span>;

const Mention = ({ text }: { text: string }) => (
  <>{text.split(/(@[\p{L}\p{N}._-]+)/gu).map((part, i) => (part.startsWith('@') ? <b key={i} className="rv-at">{part}</b> : <span key={i}>{part}</span>))}</>
);

/** The first person mentioned with @name, without the @. */
export const mentionIn = (text: string): string | null => /(?:^|[^\p{L}\p{N}_])@([\p{L}\p{N}._-]*[\p{L}\p{N}_])/u.exec(text)?.[1] ?? null;
const norm = (n: string) => n.toLowerCase().replace(/^@/, '').replace(/[._-]+/g, ' ').trim();
/** Whether an assignee name means this author (full name, or first name). */
export const isAssignedTo = (assignee: string | undefined, author: string): boolean => {
  if (!assignee || !author.trim()) return false;
  const a = norm(assignee), me = norm(author);
  return a === me || a === me.split(/\s+/)[0] || a.replace(/\s+/g, '') === me.replace(/\s+/g, '');
};

const Composer = ({ onSend, onCancel, initial = '', label, assignable }: { onSend: (t: string, assign?: string) => void; onCancel?: () => void; initial?: string; label: string; assignable?: boolean }) => {
  const [t, setT] = useState(initial);
  const [assign, setAssign] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const who = assignable ? mentionIn(t) : null;
  const send = () => { const v = t.trim(); if (v) { onSend(v, who && assign ? who : undefined); setT(''); setAssign(false); } };
  return (
    <div className="rv-compose">
      <textarea ref={ref} value={t} aria-label={label} placeholder={`${label}. Use @name to mention someone.`} rows={2}
        onChange={(e) => setT(e.target.value)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } if (e.key === 'Escape') onCancel?.(); }} />
      <div className="rowx">
        {who && <label className="rv-assign"><input type="checkbox" checked={assign} onChange={(e) => setAssign(e.target.checked)} /> Assign to {who}</label>}
        <div className="grow" />
        {onCancel && <button className="tool" onClick={onCancel}>Cancel</button>}
        <button className="primary" disabled={!t.trim()} onClick={send}>Post</button>
      </div>
    </div>
  );
};

const Entry = ({ store, c, onEdit, onDelete, reply }: { store: FrameStore; c: Comment; onEdit: (t: string) => void; onDelete: () => void; reply?: boolean }) => {
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  void store;
  return (
    <div className={`rv-entry${reply ? ' reply' : ''}`}>
      <div className="rv-ehead">
        <Avatar name={c.author} />
        <div className="rv-who"><b>{c.author}</b><span className="muted small">{when(c.at)}</span></div>
        <div className="grow" />
        <div className="rv-more">
          <button className="ico sm" aria-label="More" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={15} strokeWidth={S} /></button>
          {menu && (
            <div className="popup rv-emenu" onPointerLeave={() => setMenu(false)}>
              <button className="tool" onClick={() => { setEditing(true); setMenu(false); }}><Pencil size={14} strokeWidth={S} /> Edit</button>
              <button className="tool" onClick={() => { setMenu(false); onDelete(); }}><Trash2 size={14} strokeWidth={S} /> {reply ? 'Delete reply' : 'Delete thread'}</button>
            </div>
          )}
        </div>
      </div>
      {editing ? <Composer label="Edit comment" initial={c.text} onSend={(t) => { onEdit(t); setEditing(false); }} onCancel={() => setEditing(false)} /> : <p className="rv-text"><Mention text={c.text} /></p>}
    </div>
  );
};

const findSlide = (s: FrameStore, c: Comment): Slide | undefined => s.deck.slides.find((x) => x.comments?.includes(c));

export const CommentsPane = ({ store }: { store: FrameStore }) => {
  const [showResolved, setShowResolved] = useState(true);
  const [mine, setMine] = useState(false);
  const all = allComments(store);
  const cur = store.slide;
  const me = getAuthor();
  const list = mine
    ? all.filter(([, c]) => isAssignedTo(c.assignee, me) && (showResolved || !c.resolved)).map(([, c]) => c)
    : (cur?.comments ?? []).filter((c) => showResolved || !c.resolved);
  const slideNo = (c: Comment) => store.deck.slides.findIndex((x) => x.comments?.includes(c)) + 1;
  const draft = store.ext.commentDraft as { slide: string; x: number; y: number; shape?: string } | undefined;
  const active = activeComment(store);
  const author = getAuthor();
  const mutate = (label: string, fn: () => void) => store.tryChange(label, fn);
  const go = (dir: 1 | -1) => {
    if (!all.length) return;
    const k = all.findIndex(([, c]) => c.id === active);
    let i = k < 0 ? (dir > 0 ? all.findIndex(([si]) => si >= store.cur) : [...all].reverse().findIndex(([si]) => si <= store.cur)) : k + dir;
    if (k < 0 && dir < 0 && i >= 0) i = all.length - 1 - i;
    if (i < 0) i = dir > 0 ? 0 : all.length - 1;
    const [si, c] = all[(i + all.length) % all.length]!;
    store.goto(si);
    focusComment(store, c.id);
  };
  return (
    <div className="rv-comments">
      <div className="rowx">
        <button className="tool" onClick={() => newComment(store)}><MessageSquarePlus size={16} strokeWidth={S} /> New comment</button>
        <div className="grow" />
        <button className="ico sm" aria-label="Previous comment" title="Previous comment" disabled={!all.length} onClick={() => go(-1)}><ChevronLeft size={16} strokeWidth={S} /></button>
        <button className="ico sm" aria-label="Next comment" title="Next comment" disabled={!all.length} onClick={() => go(1)}><ChevronRight size={16} strokeWidth={S} /></button>
      </div>
      <div className="rowx">
        <label className="check small"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved</label>
        <label className="check small" title={me ? `Comments assigned to ${me}` : 'Set your name first'}><input type="checkbox" checked={mine} disabled={!me} onChange={(e) => setMine(e.target.checked)} /> Assigned to me</label>
      </div>
      {draft && cur && draft.slide === cur.id && (
        <div className="rv-thread on">
          <div className="rv-ehead"><Avatar name={author || '?'} /><div className="rv-who"><b>{author}</b><span className="muted small">New comment</span></div></div>
          <Composer label="New comment" assignable onCancel={() => { delete store.ext.commentDraft; store.emit(); }}
            onSend={(text, assign) => {
              const c: Comment = { id: uid('c'), author, initials: initialsOf(author), at: new Date().toISOString(), text, x: draft.x, y: draft.y, ...(draft.shape ? { shape: draft.shape } : {}), ...(assign ? { assignee: assign } : {}) };
              delete store.ext.commentDraft;
              mutate('New comment', () => { cur.comments = [...(cur.comments ?? []), c]; });
              focusComment(store, c.id);
            }} />
        </div>
      )}
      {mine && !list.length && <p className="muted small">Nothing is assigned to {me}.</p>}
      {!mine && !list.length && !draft && <div className="rv-empty"><MessageSquare size={28} strokeWidth={1.6} /><p className="muted">No comments on this slide.</p>{all.length > 0 && <p className="muted small">{all.length} comment{all.length === 1 ? '' : 's'} on other slides. Use the arrows to go to them.</p>}</div>}
      {list.map((c) => (
        <div key={c.id} className={`rv-thread${c.id === active ? ' on' : ''}${c.resolved ? ' resolved' : ''}`} onClick={() => { if (mine) { const n = slideNo(c); if (n > 0 && n - 1 !== store.cur) store.goto(n - 1); } if (c.id !== active) focusComment(store, c.id); }}>
          {mine && <span className="rv-slideref">Slide {slideNo(c)}</span>}
          <Entry store={store} c={c} onEdit={(t) => mutate('Edit comment', () => { c.text = t; })}
            onDelete={() => mutate('Delete comment', () => { const sl = findSlide(store, c); if (sl) sl.comments = sl.comments!.filter((x) => x !== c); })} />
          {(c.replies ?? []).map((r) => (
            <Entry key={r.id} store={store} c={r} reply onEdit={(t) => mutate('Edit reply', () => { r.text = t; })} onDelete={() => mutate('Delete reply', () => { c.replies = c.replies!.filter((x) => x !== r); })} />
          ))}
          {c.assignee && <span className="rv-badge" title={`Assigned to ${c.assignee}`}>Assigned to {c.assignee}</span>}
          {c.resolved && <p className="muted small rv-res">Resolved</p>}
          <div className="rowx rv-tfoot">
            {c.assignee && !c.resolved && (
              <button className="tool" onClick={(e) => { e.stopPropagation(); mutate('Mark as done', () => { c.resolved = true; }); }}><CheckCheck size={14} strokeWidth={S} /> Mark as done</button>
            )}
            <button className="tool" onClick={(e) => { e.stopPropagation(); mutate(c.resolved ? 'Reopen comment' : 'Resolve comment', () => { c.resolved = !c.resolved || undefined; }); }}>
              {c.resolved ? <><RotateCcw size={14} strokeWidth={S} /> Reopen</> : <><CheckIcon size={14} strokeWidth={S} /> Resolve</>}
            </button>
          </div>
          {c.id === active && !c.resolved && (
            <Composer label="Reply" assignable onSend={(text, assign) => {
              if (!getAuthor()) { openDialog(store, 'review.author'); return; }
              const a = getAuthor();
              mutate('Reply', () => { c.replies = [...(c.replies ?? []), { id: uid('c'), author: a, initials: initialsOf(a), at: new Date().toISOString(), text }]; if (assign) c.assignee = assign; });
            }} />
          )}
        </div>
      ))}
      <p className="muted small">Signed in as {author || 'nobody yet'}. <button className="rv-link" onClick={() => openDialog(store, 'review.author')}>Change name</button></p>
    </div>
  );
};

/** Speech markers drawn over the slide on the canvas. */
export const CommentMarkers = ({ store, scale }: { store: FrameStore; scale: number }) => {
  const slide = store.slide;
  if (!slide || store.view.mode !== 'normal' || store.ext.hideComments) return null;
  const list = (slide.comments ?? []).filter((c) => !c.resolved || store.view.pane === 'comments');
  const active = activeComment(store);
  const k = 1 / Math.max(scale, 0.05);
  const size = 26 * k;
  return (
    <g className="rv-markers">
      {list.map((c, i) => {
        const sh = c.shape ? slide.shapes.find((x) => x.id === c.shape) : undefined;
        const x = sh ? sh.x + sh.w : c.x ?? 20, y = sh ? sh.y : c.y ?? 20;
        const col = colorOf(c.author);
        return (
          <g key={c.id} transform={`translate(${x} ${y - size})`} style={{ cursor: 'pointer' }} role="button" aria-label={`Comment by ${c.author}`}
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); store.view.pane = 'comments'; focusComment(store, c.id); }}>
            <path d={`M0 0 H${size} V${size * 0.78} H${size * 0.42} L${size * 0.18} ${size} V${size * 0.78} H0 Z`} fill={c.resolved ? '#9aa0ab' : col} stroke="#fff" strokeWidth={1.5 * k} opacity={c.id === active ? 1 : 0.92} />
            <text x={size / 2} y={size * 0.52} fontSize={11 * k} fontWeight={700} fill="#fff" textAnchor="middle" fontFamily="Hanken Grotesk, sans-serif">{(c.initials ?? initialsOf(c.author)) || i + 1}</text>
          </g>
        );
      })}
    </g>
  );
};

export const openComments = (s: FrameStore) => openPane(s, 'comments');
