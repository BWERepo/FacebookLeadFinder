import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { CheckCircle2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IMPORT_TARGET_FIELDS, autoMapColumns, type ColumnMapping } from "@/lib/import-mapping";
import {
  commitImport,
  saveColumnMapping,
  uploadImportFile,
  validateImport,
} from "@/lib/import.functions";
import type { DuplicatePolicy, ImportFileType } from "@/lib/domain";

const NONE = "__none__";

type Step = "upload" | "map" | "review" | "done";

type ValidateResult = Awaited<ReturnType<typeof validateImport>>;
type CommitResult = Awaited<ReturnType<typeof commitImport>>;

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function ImportWizard() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [uploading, setUploading] = useState(false);

  const [importId, setImportId] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [filename, setFilename] = useState("");

  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [onDuplicate, setOnDuplicate] = useState<DuplicatePolicy>("skip");

  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidateResult | null>(null);

  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);

  function reset() {
    setStep("upload");
    setImportId(null);
    setHeaders([]);
    setRows([]);
    setTotalRows(0);
    setTruncated(false);
    setFilename("");
    setMapping({});
    setOnDuplicate("skip");
    setValidation(null);
    setCommitResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileSelected(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const fileType: ImportFileType | null = ext === "csv" ? "csv" : ext === "xlsx" ? "xlsx" : null;
    if (!fileType) {
      toast.error("Only .csv and .xlsx files are supported.");
      return;
    }

    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const result = await uploadImportFile({ data: { filename: file.name, fileType, base64 } });
      setImportId(result.importId);
      setHeaders(result.headers);
      setRows(result.rows);
      setTotalRows(result.totalRows);
      setTruncated(result.truncated);
      setFilename(file.name);
      setMapping(autoMapColumns(result.headers));
      setStep("map");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read that file.");
    } finally {
      setUploading(false);
    }
  }

  async function handleValidate() {
    if (!importId) return;
    setValidating(true);
    try {
      await saveColumnMapping({ data: { importId, columnMapping: mapping, onDuplicate } });
      const result = await validateImport({
        data: { importId, headers, rows, columnMapping: mapping },
      });
      setValidation(result);
      setStep("review");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not validate the file.");
    } finally {
      setValidating(false);
    }
  }

  async function handleCommit() {
    if (!importId) return;
    setCommitting(true);
    try {
      const result = await commitImport({
        data: { importId, headers, rows, columnMapping: mapping, onDuplicate },
      });
      setCommitResult(result);
      setStep("done");
      await qc.invalidateQueries({ queryKey: ["imports"] });
      await qc.invalidateQueries({ queryKey: ["leads"] });
      await qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import the file.");
    } finally {
      setCommitting(false);
    }
  }

  if (step === "upload") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Upload a file</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A .csv or .xlsx file with one row per business. The first row must be column headers.
          </p>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileSelected(file);
              }}
              className="block w-full max-w-sm text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
            {uploading ? <span className="text-sm text-muted-foreground">Parsing…</span> : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === "map") {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Map columns — {filename}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {totalRows} row{totalRows === 1 ? "" : "s"} found
              {truncated ? ` (only the first ${rows.length} will be imported)` : ""}. Match each
              field below to a column from your file.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {IMPORT_TARGET_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {field.label}
                    {field.required ? " *" : ""}
                  </label>
                  <Select
                    value={mapping[field.key] ?? NONE}
                    onValueChange={(v) =>
                      setMapping((prev) => ({
                        ...prev,
                        [field.key]: v === NONE ? undefined : v,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Not mapped" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Not mapped</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                If a lead already exists
              </label>
              <Select
                value={onDuplicate}
                onValueChange={(v) => setOnDuplicate(v as DuplicatePolicy)}
              >
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Skip it — leave the existing lead untouched</SelectItem>
                  <SelectItem value="update">Update it — fill in any blank fields</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <PreviewTable headers={headers} rows={rows.slice(0, 5)} />

        <div className="flex justify-between">
          <Button variant="outline" onClick={reset}>
            Start over
          </Button>
          <Button disabled={validating || !mapping.business_name} onClick={handleValidate}>
            {validating ? "Checking…" : "Check for issues"}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "review" && validation) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Review before importing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="New leads" value={validation.newRows} />
              <Stat label="Existing matches" value={validation.duplicateRows} />
              <Stat label="Invalid rows" value={validation.invalidRows} />
              <Stat label="Total valid" value={validation.validRows} />
            </div>

            {validation.errors.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Problems found (row numbers match your spreadsheet)
                </p>
                <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                  {validation.errors.map((err, i) => (
                    <li key={i} className="text-muted-foreground">
                      Row {err.row}: {err.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep("map")}>
            Back to mapping
          </Button>
          <Button disabled={committing || validation.validRows === 0} onClick={handleCommit}>
            {committing ? "Importing…" : `Import ${validation.validRows} lead(s)`}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "done" && commitResult) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-status-qualified" aria-hidden="true" />
            Import complete
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Imported" value={commitResult.imported} />
            <Stat label="Updated" value={commitResult.updated} />
            <Stat label="Skipped" value={commitResult.skipped} />
            <Stat label="Errors" value={commitResult.errorRows} />
          </div>
          <Button onClick={reset}>
            <Upload className="mr-1.5 size-4" aria-hidden="true" />
            Import another file
          </Button>
        </CardContent>
      </Card>
    );
  }

  return null;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function PreviewTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Preview (first {rows.length} rows)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="table-scroll rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {headers.map((h) => (
                  <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
