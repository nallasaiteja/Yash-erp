"use client";
import { useState } from "react";
import { qs } from "@/lib/api";
import { useData } from "@/lib/useData";
import type { AuditEntry, Page } from "@/lib/types";
import { Badge, Card, PageHeader, Pager, Select, Table, Td, fmtDateTime } from "@/components/ui";

const ENTITIES = ["auth", "user", "role", "employee", "department", "attendance", "leave", "task", "document"];

export default function AuditPage() {
  const [entity, setEntity] = useState("");
  const [page, setPage] = useState(1);
  const list = useData<Page<AuditEntry>>(`/api/audit${qs({ entity, page, size: 50 })}`);
  return (
    <>
      <PageHeader title="Audit Log" subtitle="Who did what, and when. Entries cannot be edited." />
      <Card>
        <div className="border-b border-line p-3">
          <Select className="w-auto" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} aria-label="Entity">
            <option value="">All areas</option>
            {ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
          </Select>
        </div>
        <Table head={["When", "User", "Action", "Area", "Details", "IP"]} loading={list.loading && !list.data} empty={list.data?.items.length === 0}>
          {list.data?.items.map((a) => (
            <tr key={a.id}>
              <Td className="whitespace-nowrap text-muted">{fmtDateTime(a.created_at)}</Td>
              <Td>{a.user?.full_name ?? "—"}</Td>
              <Td><Badge tone={a.action.includes("fail") || a.action.includes("reuse") || a.action === "delete" ? "red" : "blue"}>{a.action}</Badge></Td>
              <Td>{a.entity}{a.entity_id ? ` #${a.entity_id}` : ""}</Td>
              <Td className="max-w-md text-muted">{a.summary}</Td>
              <Td className="font-mono text-xs text-muted">{a.ip_address}</Td>
            </tr>
          ))}
        </Table>
        {list.data && <Pager page={page} size={50} total={list.data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
