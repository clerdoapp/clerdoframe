import './review.css';
import { useMemo, useState } from 'react';
import {
  Accessibility, BarChart3, BookCheck, CircleAlert, CircleHelp, Crop, FileLock2, Hash, ImageDown, Info, Keyboard, Languages, MessageSquare,
  MessageSquarePlus, PenOff, Replace, SpellCheck, Trash2, TriangleAlert, Lightbulb, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { command, openDialog, openPane, registerCommands, run } from '../../app/commands';
import { registerCanvasLayer, registerDialog, registerPane, registerPanelSection, type DialogProps } from '../../app/registry';
import type { FrameStore } from '../../app/store';
import { textBody, walkShapes, type AutoShape, type Shape } from '../../model/deck';
import { setInkHidden } from '../../render/SlideView';
import { Btn, Dialog, Field, S } from '../../ui/kit';
import { accessibility, ISSUE_INFO, stats, type Issue } from './check';
import { allComments, AuthorDialog, CommentMarkers, CommentsPane, focusComment, newComment } from './comments';
import { SpellingPane } from './spelling';
import { AboutDialog, CleanupDialog, CompressDialog, ShortcutsDialog, StatsDialog } from './tools';

// ---------- Accessibility pane ----------

const shapeOn = (s: FrameStore, slide: number, id?: string): Shape | null => {
  const sl = s.deck.slides[slide];
  if (!sl || !id) return null;
  let hit: Shape | null = null;
  walkShapes(sl.shapes, (x) => { if (x.id === id) hit = x; });
  return hit;
};

const AltDialog = ({ store, data, close }: DialogProps<{ slide: number; shape: string }>) => {
  const sh = data ? shapeOn(store, data.slide, data.shape) : null;
  const [alt, setAlt] = useState(sh?.alt ?? '');
  const [dec, setDec] = useState(!!sh?.decorative);
  if (!sh) return null;
  return (
    <Dialog title="Alt text" close={close} onOk={() => { store.tryChange('Alt text', () => { sh.alt = alt.trim() || undefined; sh.decorative = dec || undefined; }); }}>
      <Field label="Describe this for people who can't see it"><textarea autoFocus rows={4} value={alt} disabled={dec} onChange={(e) => setAlt(e.target.value)} /></Field>
      <label className="check"><input type="checkbox" checked={dec} onChange={(e) => setDec(e.target.checked)} /> Mark as decorative</label>
    </Dialog>
  );
};

const TitleDialog = ({ store, data, close }: DialogProps<{ slide: number }>) => {
  const [t, setT] = useState('');
  return (
    <Dialog title="Add slide title" close={close} okLabel="Add" onOk={() => {
      if (!t.trim() || data === undefined) return false;
      store.tryChange('Add title', () => {
        const slide = store.deck.slides[data.slide]!;
        const ex = slide.shapes.find((x): x is AutoShape => x.kind === 'shape' && !!x.ph && (x.ph.type === 'title' || x.ph.type === 'ctrTitle'));
        if (ex) { ex.text = { ...(ex.text ?? { paras: [] }), paras: textBody(t.trim()).paras.map((p) => ({ ...p, ...(ex.text?.paras[0]?.style ? { style: ex.text.paras[0].style } : {}) })) }; return; }
        const { master, layout } = store.masterOf(slide);
        const src = layout.shapes.find((x) => x.ph?.type === 'title') ?? master.shapes.find((x) => x.ph?.type === 'title');
        const box = src ?? { x: Math.round(store.deck.w * 0.07), y: Math.round(store.deck.h * 0.05), w: Math.round(store.deck.w * 0.86), h: Math.round(store.deck.h * 0.19) };
        slide.shapes.unshift({ id: `s${Date.now().toString(36)}t`, kind: 'shape', geom: 'rect', name: 'Title', x: box.x, y: box.y, w: box.w, h: box.h, ph: { type: 'title' }, text: textBody(t.trim()) });
      });
      return true;
    }}>
      <Field label="Title"><input autoFocus value={t} onChange={(e) => setT(e.target.value)} /></Field>
      <p className="muted small">Tip: to keep the slide's look, you can drag the title off the slide edge afterwards; it is still read out.</p>
    </Dialog>
  );
};

const sevIcon = (s: Issue['severity']) => (s === 'error' ? CircleAlert : s === 'warning' ? TriangleAlert : Lightbulb);

const AccessibilityPane = ({ store }: { store: FrameStore }) => {
  const ver = store.getVersion();
  const issues = useMemo(() => accessibility(store.deck), [ver, store]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState<string | null>(null);
  const groups = (['error', 'warning', 'tip'] as const).map((sev) => ({ sev, kinds: [...new Set(issues.filter((i) => i.severity === sev).map((i) => i.kind))] })).filter((g) => g.kinds.length);
  const pick = (i: Issue) => {
    if (store.view.mode !== 'normal') run(store, 'view.mode', 'normal');
    store.goto(i.slide);
    if (i.shape) store.select([i.shape]);
  };
  const fix = (i: Issue) => {
    pick(i);
    if (i.kind === 'alt') { if (command('format.altText')) run(store, 'format.altText'); else openDialog(store, 'review.alt', { slide: i.slide, shape: i.shape }); }
    else if (i.kind === 'title') openDialog(store, 'review.title', { slide: i.slide });
    else if (i.kind === 'order') { if (command('arrange.selectionPane')) run(store, 'arrange.selectionPane'); }
    else if (i.kind === 'tableHeader') store.tryChange('Header row', () => { const t = shapeOn(store, i.slide, i.shape); if (t?.kind === 'table') t.opts = { ...(t.opts ?? {}), firstRow: true }; });
    else if (i.kind === 'emptyPh') store.tryChange('Delete placeholder', () => { const sl = store.deck.slides[i.slide]!; sl.shapes = sl.shapes.filter((x) => x.id !== i.shape); });
  };
  const decorative = (i: Issue) => store.tryChange('Mark as decorative', () => { const sh = shapeOn(store, i.slide, i.shape); if (sh) sh.decorative = true; });
  if (!issues.length) return <div className="rv-empty"><BookCheck size={30} strokeWidth={1.6} /><p>No accessibility issues found.</p><p className="muted small">People with disabilities should have no trouble reading this presentation.</p></div>;
  return (
    <div className="rv-a11y">
      {groups.map((g) => (
        <section key={g.sev}>
          <h3 className="rv-h">{g.sev === 'error' ? 'Errors' : g.sev === 'warning' ? 'Warnings' : 'Tips'}</h3>
          {g.kinds.map((k) => {
            const items = issues.filter((i) => i.kind === k);
            const Icon = sevIcon(g.sev);
            const isOpen = open === k || (open === null && g === groups[0] && k === g.kinds[0]);
            return (
              <div key={k} className="rv-kind">
                <button className="rv-khead" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? '' : k)}>
                  <Icon size={15} strokeWidth={S} className={`rv-sev ${g.sev}`} /><span>{ISSUE_INFO[k].title}</span><span className="badge">{items.length}</span>
                </button>
                {isOpen && (
                  <div className="rv-kbody">
                    {items.map((i, n) => (
                      <div key={n} className="rv-issue">
                        <button className="rv-ilink" onClick={() => pick(i)}>{i.text}</button>
                        <div className="rowx">
                          {(i.kind === 'alt' || i.kind === 'title' || i.kind === 'order' || i.kind === 'tableHeader' || i.kind === 'emptyPh') && (
                            <button className="tool" onClick={() => fix(i)}>{i.kind === 'alt' ? 'Add alt text' : i.kind === 'title' ? 'Add title' : i.kind === 'order' ? 'Selection pane' : i.kind === 'tableHeader' ? 'Turn on header row' : 'Delete'}</button>
                          )}
                          {i.kind === 'alt' && <button className="tool" onClick={() => decorative(i)}>Mark as decorative</button>}
                        </div>
                      </div>
                    ))}
                    <p className="muted small"><b>Why fix:</b> {ISSUE_INFO[k].why}</p>
                    <p className="muted small"><b>How:</b> {ISSUE_INFO[k].fix}</p>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
};

// ---------- Word count ----------

const WordCount = ({ store, close }: DialogProps) => {
  const st = stats(store.deck);
  return (
    <Dialog title="Word count" close={close} width={320}>
      <table className="rv-stats"><tbody>
        <tr><th>Slides</th><td>{st.slides}</td></tr>
        <tr><th>Hidden slides</th><td>{st.hidden}</td></tr>
        <tr><th>Words</th><td>{st.words.toLocaleString()}</td></tr>
        <tr><th>Paragraphs</th><td>{st.paragraphs.toLocaleString()}</td></tr>
        <tr><th>Words in notes</th><td>{st.notesWords.toLocaleString()}</td></tr>
        <tr><th>Pictures</th><td>{st.pictures}</td></tr>
        <tr><th>Media clips</th><td>{st.media}</td></tr>
      </tbody></table>
    </Dialog>
  );
};

// ---------- Registration ----------

const inkCount = (s: FrameStore) => { let n = 0; for (const sl of s.deck.slides) walkShapes(sl.shapes, (x) => { if (x.kind === 'ink') n++; }); return n; };

export const registerReview = (): void => {
  registerPane({ id: 'spelling', title: 'Spelling', render: (s) => <SpellingPane store={s} /> });
  registerPane({ id: 'accessibility', title: 'Accessibility', render: (s) => <AccessibilityPane store={s} /> });
  registerPane({ id: 'comments', title: 'Comments', width: 320, render: (s) => <CommentsPane store={s} /> });
  registerDialog('review.author', AuthorDialog);
  registerDialog('review.alt', AltDialog);
  registerDialog('review.title', TitleDialog);
  registerDialog('review.wordCount', WordCount);
  registerDialog('tools.compress', CompressDialog);
  registerDialog('tools.cleanup', CleanupDialog);
  registerDialog('tools.stats', StatsDialog);
  registerDialog('help.shortcuts', ShortcutsDialog);
  registerDialog('help.about', AboutDialog);
  registerCanvasLayer({ id: 'comments', order: 50, render: (s, scale) => <CommentMarkers store={s} scale={scale} /> });

  const commentNav = (s: FrameStore, dir: 1 | -1) => {
    const all = allComments(s);
    if (!all.length) { s.notify('There are no comments.'); return; }
    const k = all.findIndex(([, c]) => c.id === s.ext.activeComment);
    const i = k < 0 ? (dir > 0 ? Math.max(0, all.findIndex(([si]) => si >= s.cur)) : all.length - 1) : (k + dir + all.length) % all.length;
    const [si, c] = all[i]!;
    s.view.pane = 'comments';
    s.goto(si);
    focusComment(s, c.id);
  };

  registerCommands([
    { id: 'review.spelling', label: 'Spelling…', group: 'Review', keys: 'F7', active: (s) => s.view.pane === 'spelling', run: (s) => openPane(s, 'spelling') },
    { id: 'review.accessibility', label: 'Check accessibility', group: 'Review', active: (s) => s.view.pane === 'accessibility', run: (s) => openPane(s, 'accessibility') },
    { id: 'review.wordCount', label: 'Word count', group: 'Review', run: (s) => openDialog(s, 'review.wordCount') },
    { id: 'review.comments', label: 'Comments', group: 'Review', active: (s) => s.view.pane === 'comments', run: (s) => openPane(s, 'comments') },
    { id: 'review.newComment', label: 'New comment', group: 'Review', keys: 'Mod+Alt+M', enabled: (s) => !!s.slide, run: (s) => newComment(s) },
    { id: 'review.nextComment', label: 'Next comment', group: 'Review', run: (s) => commentNav(s, 1) },
    { id: 'review.prevComment', label: 'Previous comment', group: 'Review', run: (s) => commentNav(s, -1) },
    {
      id: 'review.deleteAllComments', label: 'Delete all comments', group: 'Review', enabled: (s) => allComments(s).length > 0,
      run: (s) => s.tryChange('Delete all comments', () => { for (const sl of s.deck.slides) sl.comments = undefined; }),
    },
    { id: 'review.author', label: 'Comment author name…', group: 'Review', run: (s) => openDialog(s, 'review.author') },
    {
      id: 'review.hideInk', label: 'Hide ink', group: 'Review', active: (s) => !!s.ext.hideInk,
      run: (s) => { s.ext.hideInk = !s.ext.hideInk; setInkHidden(!!s.ext.hideInk); if (s.ext.hideInk) s.sel = s.sel.filter((id) => s.shape(id)?.kind !== 'ink'); s.emit(); },
    },
    {
      id: 'review.markFinal', label: 'Mark as final', group: 'Review', active: (s) => !!s.deck.final,
      run: (s) => {
        if (command('file.markFinal')) { run(s, 'file.markFinal'); return; }
        s.change('!Mark as final', () => { s.deck.final = !s.deck.final || undefined; });
        s.notify(s.deck.final ? 'Marked as final. Editing is turned off.' : 'Editing is turned on again.');
      },
    },
    // ----- Tools -----
    { id: 'tools.replaceFonts', label: 'Replace fonts…', group: 'Tools', enabled: () => !!command('edit.replaceFonts'), run: (s) => run(s, 'edit.replaceFonts') },
    { id: 'tools.compress', label: 'Compress pictures…', group: 'Tools', run: (s) => openDialog(s, 'tools.compress') },
    { id: 'tools.deleteCropped', label: 'Delete cropped areas of pictures', group: 'Tools', run: (s) => openDialog(s, 'tools.compress', { crop: true }) },
    { id: 'tools.cleanup', label: 'Remove unused items…', group: 'Tools', run: (s) => openDialog(s, 'tools.cleanup') },
    { id: 'tools.stats', label: 'Presentation statistics', group: 'Tools', run: (s) => openDialog(s, 'tools.stats') },
    { id: 'help.shortcuts', label: 'Keyboard shortcuts', group: 'Help', keys: 'Mod+/', run: (s) => openDialog(s, 'help.shortcuts') },
    { id: 'help.about', label: 'About ClerdoFrame', group: 'Help', run: (s) => openDialog(s, 'help.about') },
  ]);

  const B = (s: FrameStore, id: string, icon: typeof Info, label?: string) => <Btn store={s} id={id} icon={icon} {...(label ? { label } : {})} />;
  registerPanelSection({
    tab: 'review', title: 'Proofing', order: 10, render: (s) => (
      <div className="toollist">{B(s, 'review.spelling', SpellCheck, 'Spelling')}{B(s, 'review.wordCount', Hash)}</div>
    ),
  });
  registerPanelSection({ tab: 'review', title: 'Accessibility', order: 20, render: (s) => <div className="toollist">{B(s, 'review.accessibility', Accessibility)}</div> });
  registerPanelSection({
    tab: 'review', title: 'Comments', order: 30, render: (s) => (
      <div className="toollist">
        {B(s, 'review.newComment', MessageSquarePlus)}{B(s, 'review.comments', MessageSquare, 'Show comments')}
        <div className="iconrow">{B(s, 'review.prevComment', ChevronLeft)}{B(s, 'review.nextComment', ChevronRight)}</div>
        {B(s, 'review.deleteAllComments', Trash2)}
      </div>
    ),
  });
  registerPanelSection({
    tab: 'review', title: 'Ink', order: 40, render: (s) => (
      <div className="toollist">{B(s, 'review.hideInk', PenOff)}{inkCount(s) === 0 && <span className="muted small rv-pad">No ink in this presentation.</span>}</div>
    ),
  });
  registerPanelSection({
    tab: 'review', title: 'Language', order: 50, render: (s) => (
      <div className="toollist">
        <label className="lbl rv-pad"><span><Languages size={12} strokeWidth={S} /> Proofing language</span>
          <select value={s.deck.props.language ?? 'en-US'} onChange={(e) => s.tryChange('Proofing language', () => { s.deck.props.language = e.target.value; })}>
            <option value="en-US">English (United States)</option><option value="en-GB">English (United Kingdom)</option><option value="en-AU">English (Australia)</option><option value="en-CA">English (Canada)</option>
          </select>
        </label>
      </div>
    ),
  });
  registerPanelSection({ tab: 'review', title: 'Protect', order: 60, render: (s) => <div className="toollist">{B(s, 'review.markFinal', FileLock2)}</div> });

  registerPanelSection({
    tab: 'tools', title: 'Fonts and text', order: 10, render: (s) => (
      <div className="toollist">{B(s, 'tools.replaceFonts', Replace)}{B(s, 'review.spelling', SpellCheck, 'Spelling')}{B(s, 'review.wordCount', Hash)}</div>
    ),
  });
  registerPanelSection({ tab: 'tools', title: 'Check', order: 20, render: (s) => <div className="toollist">{B(s, 'review.accessibility', Accessibility, 'Accessibility')}{B(s, 'tools.stats', BarChart3, 'Statistics')}</div> });
  registerPanelSection({
    tab: 'tools', title: 'File size', order: 30, render: (s) => (
      <div className="toollist">{B(s, 'tools.compress', ImageDown)}{B(s, 'tools.deleteCropped', Crop)}{B(s, 'tools.cleanup', Trash2)}</div>
    ),
  });
  registerPanelSection({ tab: 'tools', title: 'Help', order: 40, render: (s) => <div className="toollist">{B(s, 'help.shortcuts', Keyboard)}{B(s, 'help.about', CircleHelp)}</div> });
};
