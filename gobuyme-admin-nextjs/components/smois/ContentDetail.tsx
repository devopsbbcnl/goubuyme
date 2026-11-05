'use client';
import { useEffect, useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { cloudinaryUpload } from '@/lib/cloudinaryUpload';
import {
  Btn, Empty, Field, Input, Notice, Pill, PlatformTag, Select, StatusPill, Tabs, TextArea,
  fmtDateTime, fromLocalInput, pretty, toLocalInput, useAction, useLoad, useSmois,
} from './ui';

interface Review { id: string; decision: string; comments: string | null; rejectionReason: string | null; versionReviewed: number; emergencyBypass: boolean; createdAt: string; reviewerName: string | null }
interface Version { id: string; version: number; caption: string; hashtags: string[]; reason: string | null; createdAt: string; editorName: string | null }
interface Comment { id: string; body: string; createdAt: string; authorName: string | null }
interface Attempt { id: string; success: boolean; mechanism: string; errorCode: string | null; errorMessage: string | null; publishedUrl: string | null; createdAt: string; initiatedByName: string | null; recovery: string | null }
export interface Variant {
  id: string; status: string; caption: string; hashtags: string[]; mentions: string[]; mediaUrls: { url: string }[]; linkUrl: string | null;
  plannedAt: string | null; scheduledAt: string | null; version: number; publishedAt: string | null; publishedUrl: string | null; publishMechanism: string | null; emergencyBypass: boolean;
  account: { id: string; name: string; platform: string };
  creatorName: string | null; submittedByName: string | null; approvedByName: string | null; publishedByName: string | null;
  versions: Version[]; reviews: Review[]; comments: Comment[]; attempts: Attempt[]; warnings: string[];
  actions: { edit: boolean; submit: boolean; review: boolean; schedule: boolean; publish: boolean; emergencyPublish: boolean; retry: boolean };
}
interface Detail {
  id: string; number: number; title: string; description: string | null; objective: string | null; audience: string | null; format: string; keywords: string[];
  category: { id: string; name: string } | null; creatorName: string | null; variants: Variant[]; settings: { requireApproval: boolean };
}

type Panel = null | 'review' | 'schedule' | 'publish' | 'emergency' | 'fail';

export function ContentDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged?: () => void }) {
  const { theme: T } = useTheme();
  const { data, reload, loading } = useLoad(() => api.get<{ data: Detail }>(`/admin/smois/content/${id}`).then((r) => r.data), [id]);
  const [vid, setVid] = useState<string | null>(null);
  const [tab, setTab] = useState<'copy' | 'reviews' | 'versions' | 'comments' | 'attempts' | 'results'>('copy');
  const v = data?.variants.find((x) => x.id === vid) ?? data?.variants[0];

  const changed = () => { reload(); onChanged?.(); window.dispatchEvent(new Event('gbm:pending-counts-updated')); };

  return (
    <Modal open onClose={onClose} title={data ? `#${data.number} · ${data.title}` : 'Content'} width={860}>
      {loading && !data && <Empty>Loading…</Empty>}
      {data && (
        <div style={{ padding: 20 }}>
          <div style={{ fontSize: 12, color: T.textSec, lineHeight: 1.7, marginBottom: 14 }}>
            {data.objective && <div>Objective: <b style={{ color: T.text }}>{data.objective}</b></div>}
            <div>
              {data.category && <>Category: <b style={{ color: T.text }}>{data.category.name}</b> · </>}Format: <b style={{ color: T.text }}>{pretty(data.format)}</b> · Created by <b style={{ color: T.text }}>{data.creatorName}</b>
              {data.audience && <> · Audience: <b style={{ color: T.text }}>{data.audience}</b></>}
            </div>
            {data.description && <div>{data.description}</div>}
          </div>

          {data.variants.length === 0 ? <Empty>No platform versions yet.</Empty> : (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                {data.variants.map((x) => (
                  <button key={x.id} onClick={() => { setVid(x.id); setTab('copy'); }} style={{
                    background: v?.id === x.id ? T.primaryTint : T.surface2, border: `1px solid ${v?.id === x.id ? T.primary : T.border}`,
                    borderRadius: 4, padding: '7px 11px', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', fontFamily: 'inherit',
                  }}>
                    <PlatformTag platform={x.account.platform} name={x.account.name} /><StatusPill status={x.status} />
                  </button>
                ))}
              </div>
              {v && <VariantPanel key={v.id} v={v} detail={data} tab={tab} setTab={setTab} onChanged={changed} />}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function VariantPanel({ v, detail, tab, setTab, onChanged }: { v: Variant; detail: Detail; tab: string; setTab: (t: 'copy' | 'reviews' | 'versions' | 'comments' | 'attempts' | 'results') => void; onChanged: () => void }) {
  const { theme: T } = useTheme();
  const { me } = useSmois();
  const { busy, error, setError, run } = useAction();
  const [panel, setPanel] = useState<Panel>(null);
  const [info, setInfo] = useState('');

  const [caption, setCaption] = useState(v.caption);
  const [hashtags, setHashtags] = useState(v.hashtags.map((h) => `#${h}`).join(' '));
  const [mentions, setMentions] = useState(v.mentions.join(' '));
  const [media, setMedia] = useState(v.mediaUrls.map((m) => m.url).join('\n'));
  const [link, setLink] = useState(v.linkUrl ?? '');
  const [planned, setPlanned] = useState(v.plannedAt ? toLocalInput(v.plannedAt) : '');
  const [reason, setReason] = useState('');
  const [upErr, setUpErr] = useState('');

  useEffect(() => { setError(''); setInfo(''); }, [panel, tab, setError]);

  const copy = () => ({
    caption,
    hashtags: hashtags.split(/[\s,]+/).filter(Boolean),
    mentions: mentions.split(/[\s,]+/).filter(Boolean),
    mediaUrls: media.split('\n').map((s) => s.trim()).filter(Boolean).map((url) => ({ url })),
    linkUrl: link.trim() || null,
    plannedAt: planned ? fromLocalInput(planned) : null,
    reason: reason.trim() || undefined,
  });
  const dirty = caption !== v.caption || hashtags !== v.hashtags.map((h) => `#${h}`).join(' ') || media !== v.mediaUrls.map((m) => m.url).join('\n') || link !== (v.linkUrl ?? '') || mentions !== v.mentions.join(' ') || planned !== (v.plannedAt ? toLocalInput(v.plannedAt) : '');
  const reviewed = ['SUBMITTED', 'RESUBMITTED', 'APPROVED', 'SCHEDULED', 'PUBLISH_FAILED'].includes(v.status);

  const post = (path: string, body: unknown = {}, msg?: string) => run(async () => {
    const r = await api.post<{ message?: string }>(`/admin/smois/variants/${v.id}/${path}`, body);
    setInfo(msg ?? r.message ?? 'Done.'); setPanel(null); onChanged();
  });
  const save = () => run(async () => {
    const r = await api.patch<{ message?: string }>(`/admin/smois/variants/${v.id}`, copy());
    setInfo(r.message ?? 'Saved.'); setReason(''); onChanged();
  });

  const upload = async (file?: File) => {
    if (!file) return;
    setUpErr('');
    try { const url = await cloudinaryUpload(file); setMedia((m) => (m ? `${m}\n${url}` : url)); } catch (e) { setUpErr((e as Error).message); }
  };

  const charCount = caption.length;
  return (
    <div>
      {error && <Notice kind="error">{error}</Notice>}
      {info && <Notice kind="success">{info}</Notice>}
      {v.status === 'REVISION_REQUESTED' && v.reviews[0] && <Notice kind="warn">Changes requested by {v.reviews[0].reviewerName}: {v.reviews[0].comments}</Notice>}
      {v.status === 'REJECTED' && v.reviews[0] && <Notice kind="error">Rejected by {v.reviews[0].reviewerName}: {v.reviews[0].rejectionReason}</Notice>}
      {v.status === 'PUBLISH_FAILED' && v.attempts[0] && <Notice kind="error">Publishing failed: {v.attempts[0].errorMessage}{v.attempts[0].errorCode ? ` (${v.attempts[0].errorCode})` : ''}</Notice>}
      {v.emergencyBypass && <Notice kind="warn">Published through an emergency bypass of approval.</Notice>}
      {v.status === 'SCHEDULED' && v.scheduledAt && new Date(v.scheduledAt).getTime() < Date.now() && <Notice kind="warn">This was due {fmtDateTime(v.scheduledAt)}. Nothing posts automatically yet: post it on {pretty(v.account.platform)}, then record it as published.</Notice>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {v.actions.submit && <Btn kind="primary" disabled={busy || dirty} onClick={() => post('submit', {}, 'Submitted for review.')}>{v.status === 'REVISION_REQUESTED' ? 'Resubmit for review' : 'Submit for review'}</Btn>}
        {v.actions.review && <Btn kind="primary" onClick={() => setPanel('review')}>Review…</Btn>}
        {v.actions.schedule && <Btn onClick={() => setPanel('schedule')}>{v.status === 'SCHEDULED' ? 'Reschedule' : v.status === 'PUBLISH_FAILED' ? 'Retry · reschedule' : 'Schedule'}</Btn>}
        {v.actions.publish && <Btn kind="primary" onClick={() => setPanel('publish')}>Record as published</Btn>}
        {v.actions.publish && ['APPROVED', 'SCHEDULED'].includes(v.status) && <Btn onClick={() => setPanel('fail')}>Record failure</Btn>}
        {v.actions.emergencyPublish && <Btn kind="danger" onClick={() => setPanel('emergency')}>Emergency publish…</Btn>}
        {v.status === 'SCHEDULED' && v.actions.schedule && <Btn onClick={() => post('status', { status: 'APPROVED' }, 'Back to approved, no longer scheduled.')}>Unschedule</Btn>}
        {v.actions.edit && !['PUBLISHED', 'CANCELLED', 'ARCHIVED', 'REJECTED'].includes(v.status) && <Btn kind="ghost" onClick={() => { if (window.confirm('Cancel this version?')) post('status', { status: 'CANCELLED' }, 'Cancelled.'); }}>Cancel version</Btn>}
        {['PUBLISHED', 'REJECTED', 'CANCELLED'].includes(v.status) && v.actions.edit && <Btn kind="ghost" onClick={() => post('status', { status: 'ARCHIVED' }, 'Archived.')}>Archive</Btn>}
      </div>

      {panel === 'review' && <ReviewForm v={v} busy={busy} onCancel={() => setPanel(null)} onSubmit={(b) => post('review', { ...b, version: v.version })} />}
      {panel === 'schedule' && <TimeForm title="Publish time" confirm="Schedule" initial={v.scheduledAt ?? v.plannedAt} busy={busy} onCancel={() => setPanel(null)} onSubmit={(at) => post('schedule', { scheduledAt: at }, 'Scheduled. Record it as published once it is posted.')} />}
      {panel === 'publish' && <PublishForm busy={busy} onCancel={() => setPanel(null)} onSubmit={(b) => post('publish', b, 'Recorded as published.')} />}
      {panel === 'emergency' && <PublishForm emergency busy={busy} onCancel={() => setPanel(null)} onSubmit={(b) => post('publish', b, 'Emergency publication recorded; management has been told.')} />}
      {panel === 'fail' && <FailForm busy={busy} onCancel={() => setPanel(null)} onSubmit={(b) => post('fail', b, 'Failure recorded.')} />}

      <Tabs value={tab as 'copy'} onChange={setTab} items={[
        { id: 'copy', label: 'Copy' }, { id: 'reviews', label: `Reviews (${v.reviews.length})` }, { id: 'versions', label: `Versions (${v.versions.length})` },
        { id: 'comments', label: `Comments (${v.comments.length})` }, { id: 'attempts', label: `Publishing (${v.attempts.length})` },
        ...(v.status === 'PUBLISHED' && me?.can.viewAnalytics ? [{ id: 'results' as const, label: 'Results' }] : []),
      ]} />

      {tab === 'copy' && (
        <>
          <div style={{ fontSize: 12, color: T.textSec, marginBottom: 12, lineHeight: 1.7 }}>
            Version {v.version} · Written by <b style={{ color: T.text }}>{v.creatorName}</b>
            {v.submittedByName && <> · Submitted by <b style={{ color: T.text }}>{v.submittedByName}</b></>}
            {v.approvedByName && <> · Approved by <b style={{ color: T.text }}>{v.approvedByName}</b></>}
            {v.publishedByName && <> · Recorded by <b style={{ color: T.text }}>{v.publishedByName}</b> ({v.publishMechanism?.toLowerCase()})</>}
            {v.publishedUrl && <> · <a href={v.publishedUrl} target="_blank" rel="noreferrer" style={{ color: T.primary, fontWeight: 700 }}>View post ↗</a></>}
          </div>
          {v.warnings.length > 0 && <Notice kind="warn">{v.warnings.map((w) => <div key={w}>• {w}</div>)}</Notice>}
          <Field label={`Caption (${charCount})`}><TextArea rows={6} value={caption} disabled={!v.actions.edit} onChange={(e) => setCaption(e.target.value)} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <Field label="Hashtags"><Input value={hashtags} disabled={!v.actions.edit} onChange={(e) => setHashtags(e.target.value)} placeholder="#GoBuyMe #food" /></Field>
            <Field label="Mentions / tags"><Input value={mentions} disabled={!v.actions.edit} onChange={(e) => setMentions(e.target.value)} placeholder="@partner" /></Field>
            <Field label="Link"><Input value={link} disabled={!v.actions.edit} onChange={(e) => setLink(e.target.value)} placeholder="https://" /></Field>
            <Field label="Planned publish time"><Input type="datetime-local" value={planned} disabled={!v.actions.edit} onChange={(e) => setPlanned(e.target.value)} /></Field>
          </div>
          <Field label="Media (one link per line)">
            <TextArea rows={3} value={media} disabled={!v.actions.edit} onChange={(e) => setMedia(e.target.value)} placeholder="https://…" />
            {v.actions.edit && <div style={{ marginTop: 6 }}><input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0])} style={{ fontSize: 12, color: T.textSec }} /></div>}
            {upErr && <div style={{ fontSize: 11, color: T.error, marginTop: 4 }}>{upErr}</div>}
          </Field>
          {v.mediaUrls.length > 0 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {v.mediaUrls.map((m) => /\.(mp4|mov|webm)(\?|$)/i.test(m.url)
              ? <a key={m.url} href={m.url} target="_blank" rel="noreferrer" style={{ color: T.primary, fontSize: 12 }}>🎬 {m.url.slice(-30)}</a>
              // eslint-disable-next-line @next/next/no-img-element
              : <img key={m.url} src={m.url} alt="" style={{ height: 72, borderRadius: 4, border: `1px solid ${T.border}` }} />)}
          </div>}
          {v.actions.edit && (
            <>
              {reviewed && <Field label="Reason for the change" hint="Required when changing content that was already submitted or approved. Material edits to approved copy go back to review."><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
              <Btn kind="primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</Btn>
              {dirty && v.actions.submit && <span style={{ fontSize: 11, color: T.textSec, marginLeft: 10 }}>Save before submitting.</span>}
            </>
          )}
        </>
      )}

      {tab === 'reviews' && (v.reviews.length === 0 ? <Empty>No reviews yet.</Empty> : v.reviews.map((r) => (
        <div key={r.id} style={{ padding: '10px 0', borderTop: `1px solid ${T.border}`, fontSize: 12 }}>
          <StatusPill status={r.decision} /> {r.emergencyBypass && <Pill tone="bad">Emergency bypass</Pill>} <b style={{ color: T.text }}>{r.reviewerName}</b> · version {r.versionReviewed} · {fmtDateTime(r.createdAt)}
          {r.comments && <div style={{ color: T.textSec, marginTop: 4 }}>{r.comments}</div>}
          {r.rejectionReason && <div style={{ color: T.error, marginTop: 4 }}>Reason: {r.rejectionReason}</div>}
        </div>
      )))}

      {tab === 'versions' && v.versions.map((x) => (
        <div key={x.id} style={{ padding: '10px 0', borderTop: `1px solid ${T.border}`, fontSize: 12 }}>
          <b style={{ color: T.text }}>Version {x.version}</b> · {x.editorName} · {fmtDateTime(x.createdAt)}{x.reason ? ` · “${x.reason}”` : ''}
          <div style={{ color: T.textSec, marginTop: 4, whiteSpace: 'pre-wrap' }}>{x.caption}</div>
        </div>
      ))}

      {tab === 'comments' && <Comments v={v} onChanged={onChanged} />}

      {tab === 'results' && <PostResults variantId={v.id} />}

      {tab === 'attempts' && (v.attempts.length === 0 ? <Empty>Nothing recorded yet.</Empty> : v.attempts.map((a) => (
        <div key={a.id} style={{ padding: '10px 0', borderTop: `1px solid ${T.border}`, fontSize: 12 }}>
          <Pill tone={a.success ? 'good' : 'bad'}>{a.success ? 'Published' : 'Failed'}</Pill> <b style={{ color: T.text }}>{a.initiatedByName}</b> · {a.mechanism.toLowerCase()} · {fmtDateTime(a.createdAt)}
          {a.errorMessage && <div style={{ color: T.error, marginTop: 4 }}>{a.errorCode ? `${a.errorCode}: ` : ''}{a.errorMessage}</div>}
          {a.publishedUrl && <div><a href={a.publishedUrl} target="_blank" rel="noreferrer" style={{ color: T.primary }}>{a.publishedUrl}</a></div>}
        </div>
      )))}
      {!detail.settings.requireApproval && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 14 }}>Approval is currently optional (Social Settings).</div>}
      {me?.level === 'VIEWER' && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 14 }}>You have read-only access.</div>}
    </div>
  );
}

function Comments({ v, onChanged }: { v: Variant; onChanged: () => void }) {
  const { theme: T } = useTheme();
  const [body, setBody] = useState('');
  const { busy, error, run } = useAction();
  const { me } = useSmois();
  return (
    <div>
      {v.comments.length === 0 && <Empty>No comments yet.</Empty>}
      {v.comments.map((c) => (
        <div key={c.id} style={{ padding: '9px 0', borderTop: `1px solid ${T.border}`, fontSize: 12 }}>
          <b style={{ color: T.text }}>{c.authorName}</b> <span style={{ color: T.textMuted }}>{fmtDateTime(c.createdAt)}</span>
          <div style={{ color: T.textSec, marginTop: 3, whiteSpace: 'pre-wrap' }}>{c.body}</div>
        </div>
      ))}
      {me?.level !== 'VIEWER' && (
        <div style={{ marginTop: 12 }}>
          {error && <Notice kind="error">{error}</Notice>}
          <TextArea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment…" />
          <div style={{ marginTop: 8 }}><Btn kind="primary" disabled={busy || !body.trim()} onClick={() => run(async () => { await api.post(`/admin/smois/variants/${v.id}/comments`, { body }); setBody(''); onChanged(); })}>Comment</Btn></div>
        </div>
      )}
    </div>
  );
}

const box = (T: ReturnType<typeof useTheme>['theme']) => ({ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: 14, marginBottom: 14 });

function ReviewForm({ v, busy, onCancel, onSubmit }: { v: Variant; busy: boolean; onCancel: () => void; onSubmit: (b: { decision: string; comments: string; rejectionReason: string }) => void }) {
  const { theme: T } = useTheme();
  const [decision, setDecision] = useState('APPROVED');
  const [comments, setComments] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  return (
    <div style={box(T)}>
      <div style={{ fontSize: 12, color: T.textSec, marginBottom: 10 }}>You are reviewing version {v.version}, as written by {v.creatorName}.</div>
      <Field label="Decision"><Select value={decision} onChange={(e) => setDecision(e.target.value)}><option value="APPROVED">Approve</option><option value="REVISION_REQUESTED">Request changes</option><option value="REJECTED">Reject</option></Select></Field>
      {decision === 'REJECTED' && <Field label="Rejection reason"><Input value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} /></Field>}
      <Field label={decision === 'REVISION_REQUESTED' ? 'What needs to change' : 'Comments (optional)'}><TextArea rows={3} value={comments} onChange={(e) => setComments(e.target.value)} /></Field>
      <div style={{ display: 'flex', gap: 8 }}><Btn kind="primary" disabled={busy} onClick={() => onSubmit({ decision, comments, rejectionReason })}>Submit decision</Btn><Btn onClick={onCancel}>Cancel</Btn></div>
    </div>
  );
}

function TimeForm({ title, confirm, initial, busy, onCancel, onSubmit }: { title: string; confirm: string; initial: string | null; busy: boolean; onCancel: () => void; onSubmit: (iso: string) => void }) {
  const { theme: T } = useTheme();
  const [at, setAt] = useState(toLocalInput(initial && new Date(initial) > new Date() ? initial : new Date(Date.now() + 3600_000).toISOString()));
  return (
    <div style={box(T)}>
      <Field label={title}><Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
      <div style={{ display: 'flex', gap: 8 }}><Btn kind="primary" disabled={busy || !at} onClick={() => onSubmit(fromLocalInput(at)!)}>{confirm}</Btn><Btn onClick={onCancel}>Cancel</Btn></div>
    </div>
  );
}

function PublishForm({ emergency, busy, onCancel, onSubmit }: { emergency?: boolean; busy: boolean; onCancel: () => void; onSubmit: (b: { publishedUrl?: string; publishedAt: string; emergencyReason?: string }) => void }) {
  const { theme: T } = useTheme();
  const [url, setUrl] = useState('');
  const [at, setAt] = useState(toLocalInput());
  const [why, setWhy] = useState('');
  return (
    <div style={box(T)}>
      {emergency
        ? <Notice kind="error">This bypasses approval. The reason, your name and the post link are recorded and management is notified.</Notice>
        : <div style={{ fontSize: 12, color: T.textSec, marginBottom: 10 }}>Post it on the platform first, then log it here. This is recorded as a manual publication by you.</div>}
      {emergency && <Field label="Reason for bypassing approval"><Input value={why} onChange={(e) => setWhy(e.target.value)} /></Field>}
      <Field label="Link to the live post (if available)"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></Field>
      <Field label="Published at"><Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn kind={emergency ? 'danger' : 'primary'} disabled={busy || (emergency && !why.trim())} onClick={() => onSubmit({ ...(url.trim() ? { publishedUrl: url.trim() } : {}), publishedAt: fromLocalInput(at)!, ...(emergency ? { emergencyReason: why } : {}) })}>{emergency ? 'Publish without approval' : 'Record as published'}</Btn>
        <Btn onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}

function FailForm({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (b: { errorCode?: string; errorMessage: string }) => void }) {
  const { theme: T } = useTheme();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  return (
    <div style={box(T)}>
      <Field label="What went wrong"><Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="e.g. Platform rejected the image" /></Field>
      <Field label="Error code (optional)"><Input value={code} onChange={(e) => setCode(e.target.value)} /></Field>
      <div style={{ display: 'flex', gap: 8 }}><Btn kind="danger" disabled={busy || !msg.trim()} onClick={() => onSubmit({ ...(code.trim() ? { errorCode: code.trim() } : {}), errorMessage: msg.trim() })}>Record failure</Btn><Btn onClick={onCancel}>Cancel</Btn></div>
    </div>
  );
}

interface PostReading { id: string; recordedAt: string; reach: number | null; impressions: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null; clicks: number | null; videoViews: number | null; note: string | null; enteredByName: string | null }
const READING_FIELDS: [string, string][] = [['reach', 'Reach'], ['impressions', 'Impressions'], ['likes', 'Likes'], ['comments', 'Comments'], ['shares', 'Shares'], ['saves', 'Saves'], ['clicks', 'Link clicks'], ['videoViews', 'Video views']];

/** Results of a published post: readings a person copied from the platform, newest first. */
function PostResults({ variantId }: { variantId: string }) {
  const { theme: T } = useTheme();
  const { me } = useSmois();
  const { data, reload } = useLoad(() => api.get<{ data: PostReading[] }>(`/admin/smois/metrics/posts?variantId=${variantId}`).then((r) => r.data), [variantId]);
  const [f, setF] = useState<Record<string, string>>({ note: '' });
  const { busy, error, run } = useAction();
  const show = (v: number | null) => (v === null ? 'Not recorded' : v.toLocaleString());
  return (
    <div>
      <Notice kind="info">Copy the figures the platform shows for this post. Leave a box empty if you don&apos;t have it. Engagement counts likes, comments, shares and saves; link clicks and video views are separate. Record again later to build a history (early, day 7, final).</Notice>
      {data && data.length === 0 && <Empty>No results recorded yet.</Empty>}
      {data?.map((r, i) => (
        <div key={r.id} style={{ padding: '9px 0', borderTop: `1px solid ${T.border}`, fontSize: 12 }}>
          <b style={{ color: T.text }}>{fmtDateTime(r.recordedAt)}</b> <span style={{ color: T.textMuted }}>by {r.enteredByName}{i === 0 ? ' · latest' : ''}</span>
          <div style={{ color: T.textSec, marginTop: 3 }}>{READING_FIELDS.map(([k, l]) => `${l} ${show((r as unknown as Record<string, number | null>)[k])}`).join(' · ')}</div>
          {r.note && <div style={{ color: T.textMuted }}>{r.note}</div>}
        </div>
      ))}
      {me?.can.recordMetrics && (
        <div style={{ marginTop: 14, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: 14 }}>
          {error && <Notice kind="error">{error}</Notice>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            {READING_FIELDS.map(([k, l]) => <Field key={k} label={l}><Input type="number" min={0} value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}
          </div>
          <Field label="Note"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          <Btn kind="primary" disabled={busy} onClick={() => run(async () => { await api.post('/admin/smois/metrics/posts', { variantId, ...f }); setF({ note: '' }); reload(); })}>{busy ? 'Saving…' : 'Record results'}</Btn>
        </div>
      )}
    </div>
  );
}
