"use client";
import { useRef, useState } from "react";
import { Copy, Download, FileText, Search, Upload } from "lucide-react";
import { del, download, get, patch, post, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/useData";
import type { Doc, EmpBrief, Page } from "@/lib/types";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Pager, Select, Table, Td, Textarea, fmtBytes, fmtDate, useToast } from "@/components/ui";

const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.png,.jpg,.jpeg,.gif,.webp,.tif,.tiff,.zip,.dwg,.dxf,.msg,.eml";

export default function DocumentsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(1);
  const list = useData<Page<Doc>>(`/api/documents${qs({ q, category, tag, page, size: 25 })}`);
  const cats = useData<string[]>("/api/documents/categories");
  const emps = useData<EmpBrief[]>(can("employees:view") ? "/api/employees/lookup" : null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<null | { file: File | null; title: string; category: string; tags: string; description: string; employee_id: string }>(null);
  const [detail, setDetail] = useState<Doc | null>(null);
  const [dupes, setDupes] = useState<Doc[]>([]);
  const [meta, setMeta] = useState({ title: "", category: "", tags: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  async function doUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!upload?.file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", upload.file);
    fd.append("title", upload.title);
    fd.append("category", upload.category);
    fd.append("tags", upload.tags);
    fd.append("description", upload.description);
    if (upload.employee_id) fd.append("employee_id", upload.employee_id);
    try {
      setProgress(0);
      const d = await post<Doc>("/api/documents", fd);
      const dup = await get<Doc[]>(`/api/documents/${d.id}/duplicates`);
      toast(dup.length ? `Uploaded — note: identical file already exists (${dup[0].title})` : "Document uploaded", dup.length ? "err" : "ok");
      setUpload(null);
      list.reload();
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function openDetail(d: Doc) {
    setDetail(d);
    setMeta({ title: d.title, category: d.category, tags: d.tags.join(", "), description: d.description ?? "" });
    setDupes([]);
    get<Doc[]>(`/api/documents/${d.id}/duplicates`).then(setDupes).catch(() => {});
  }

  async function saveMeta(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setBusy(true);
    try {
      await patch(`/api/documents/${detail.id}`, { title: meta.title, category: meta.category, tags: meta.tags.split(",").map((t) => t.trim()).filter(Boolean), description: meta.description || null });
      toast("Saved");
      setDetail(null);
      list.reload();
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!detail || !confirm(`Delete ${detail.original_filename}? This removes the file permanently.`)) return;
    try {
      await del(`/api/documents/${detail.id}`);
      toast("Deleted");
      setDetail(null);
      list.reload();
    } catch (err) {
      toast((err as Error).message, "err");
    }
  }

  const dl = (d: Doc) => download(`/api/documents/${d.id}/download`, d.original_filename).catch((e) => toast(e.message, "err"));

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="Central repository for tender files, contracts, drawings, HR and project documents"
        actions={can("documents:create") && <Button onClick={() => setUpload({ file: null, title: "", category: "general", tags: "", description: "", employee_id: "" })}><Upload className="size-4" /> Upload</Button>}
      />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Search title, file name, description" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <Select className="w-auto" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} aria-label="Category">
            <option value="">All categories</option>
            {cats.data?.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Input className="w-40" placeholder="Tag" value={tag} onChange={(e) => { setTag(e.target.value); setPage(1); }} />
        </div>
        <Table head={["Document", "Category", "Tags", "Size", "Uploaded by", "Date", ""]} loading={list.loading && !list.data} empty={list.data?.items.length === 0}>
          {list.data?.items.map((d) => (
            <tr key={d.id} className="hover:bg-surface-2">
              <Td>
                <button className="flex items-center gap-2 text-left" onClick={() => openDetail(d)}>
                  <FileText className="size-4 shrink-0 text-muted" />
                  <span>
                    <span className="block font-medium hover:underline">{d.title}</span>
                    <span className="block text-xs text-muted">{d.original_filename}</span>
                  </span>
                </button>
              </Td>
              <Td><Badge tone="blue">{d.category}</Badge></Td>
              <Td><div className="flex flex-wrap gap-1">{d.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div></Td>
              <Td className="tabular-nums text-muted">{fmtBytes(d.size_bytes)}</Td>
              <Td className="text-muted">{d.uploaded_by.full_name}</Td>
              <Td className="text-muted">{fmtDate(d.created_at)}</Td>
              <Td>{can("documents:download") && <Button size="sm" variant="ghost" onClick={() => dl(d)} aria-label="Download"><Download className="size-4" /></Button>}</Td>
            </tr>
          ))}
        </Table>
        {list.data && <Pager page={page} size={25} total={list.data.total} onPage={setPage} />}
      </Card>

      <Modal open={!!upload} onClose={() => !busy && setUpload(null)} title="Upload document">
        {upload && (
          <form onSubmit={doUpload} className="space-y-4">
            <div
              className="flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-line p-6 text-center hover:border-accent"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) setUpload({ ...upload, file: f, title: upload.title || f.name.replace(/\.[^.]+$/, "") });
              }}
            >
              <Upload className="mb-2 size-6 text-muted" />
              {upload.file ? <span className="text-sm font-medium">{upload.file.name} · {fmtBytes(upload.file.size)}</span> : <span className="text-sm text-muted">Click or drop a file (max 50 MB)</span>}
              <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setUpload({ ...upload, file: f, title: upload.title || f.name.replace(/\.[^.]+$/, "") }); }} />
            </div>
            <Field label="Title"><Input value={upload.title} onChange={(e) => setUpload({ ...upload, title: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Category">
                <Select value={upload.category} onChange={(e) => setUpload({ ...upload, category: e.target.value })}>
                  {cats.data?.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Tags" hint="Comma separated"><Input value={upload.tags} onChange={(e) => setUpload({ ...upload, tags: e.target.value })} placeholder="LT panel, Hyderabad" /></Field>
            </div>
            {emps.data && (
              <Field label="Related employee">
                <Select value={upload.employee_id} onChange={(e) => setUpload({ ...upload, employee_id: e.target.value })}>
                  <option value="">—</option>
                  {emps.data.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Description"><Textarea value={upload.description} onChange={(e) => setUpload({ ...upload, description: e.target.value })} /></Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setUpload(null)}>Cancel</Button>
              <Button type="submit" disabled={!upload.file} loading={busy}>{progress !== null ? "Uploading…" : "Upload"}</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Document details">
        {detail && (
          <form onSubmit={saveMeta} className="space-y-4">
            <div className="rounded-md bg-surface-2 p-3 text-xs text-muted">
              <div><b className="text-ink">{detail.original_filename}</b> · {fmtBytes(detail.size_bytes)} · {detail.content_type}</div>
              <div className="mt-1 break-all font-mono">SHA-256 {detail.sha256}</div>
              <div className="mt-1">Uploaded by {detail.uploaded_by.full_name} on {fmtDate(detail.created_at)}</div>
            </div>
            {dupes.length > 0 && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                <Copy className="mt-0.5 size-4 shrink-0" />
                <span>Identical file also stored as: {dupes.map((d) => d.title).join(", ")}</span>
              </div>
            )}
            <fieldset disabled={!can("documents:edit")} className="space-y-4">
              <Field label="Title"><Input required value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Category">
                  <Select value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value })}>
                    {cats.data?.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </Field>
                <Field label="Tags"><Input value={meta.tags} onChange={(e) => setMeta({ ...meta, tags: e.target.value })} /></Field>
              </div>
              <Field label="Description"><Textarea value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} /></Field>
            </fieldset>
            <div className="flex justify-between">
              <div>{can("documents:delete") && <Button type="button" variant="danger" onClick={remove}>Delete</Button>}</div>
              <div className="flex gap-2">
                {can("documents:download") && <Button type="button" variant="secondary" onClick={() => dl(detail)}><Download className="size-4" /> Download</Button>}
                {can("documents:edit") && <Button type="submit" loading={busy}>Save</Button>}
              </div>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
