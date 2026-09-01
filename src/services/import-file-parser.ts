import type { SyncContent, SyncField, UploadedSyncSource } from "../types/data-sync";

type CellValue = string | number | boolean | Date | null;
type DataRow = Record<string, CellValue>;
type ParsedSheet = { name: string; rows: DataRow[] };

const SPU_ID_KEYS = ["spu_id", "spuid", "spu", "货号", "款号", "商品编码", "商品id", "product_id"];
const SKU_ID_KEYS = ["sku_id", "skuid", "sku", "sku编码", "规格编码", "条码", "barcode"];
const SKU_FIELD_HINT = /(^|_)(color|colour|size|stock|barcode)($|_)|颜色|色号|尺码|规格|库存|条码/i;

function normalizedKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function valueText(value: CellValue | undefined) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function findKey(row: DataRow, candidates: string[]) {
  const candidateSet = new Set(candidates.map(normalizedKey));
  return Object.keys(row).find((key) => candidateSet.has(normalizedKey(key)));
}

function fieldsFor(entityId: string, row: DataRow, excludedKeys: Set<string>): SyncField[] {
  return Object.entries(row)
    .filter(([key, value]) => !excludedKeys.has(key) && valueText(value) !== "")
    .map(([key, value]) => ({ id: `${entityId}:${key}`, key, label: key, value: valueText(value) }));
}

function uniqueHeaders(values: CellValue[]) {
  const seen = new Map<string, number>();
  return values.map((value, index) => {
    const base = valueText(value) || `column_${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base}_${count + 1}` : base;
  });
}

function matrixToRows(matrix: CellValue[][]): DataRow[] {
  const nonEmpty = matrix.filter((row) => row.some((value) => valueText(value) !== ""));
  if (nonEmpty.length < 2) return [];
  const headers = uniqueHeaders(nonEmpty[0]);
  return nonEmpty.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? null])))
    .filter((row) => Object.values(row).some((value) => valueText(value) !== ""));
}

function parseDelimited(text: string, delimiter: string): CellValue[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(cell); cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else {
      cell += character;
    }
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function textToSheets(text: string, fileName: string): ParsedSheet[] {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("文件内容为空");

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return [{ name: fileName, rows: parsed.filter((row): row is DataRow => Boolean(row) && typeof row === "object" && !Array.isArray(row)) }];
    if (parsed && typeof parsed === "object") return [{ name: fileName, rows: [parsed as DataRow] }];
  } catch { /* Continue with delimited or key-value text. */ }

  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
  const delimiter = lines[0]?.includes("\t") ? "\t" : lines[0]?.includes(",") ? "," : null;
  if (delimiter && lines.length > 1) return [{ name: fileName, rows: matrixToRows(parseDelimited(trimmed, delimiter)) }];

  const pairs = lines.map((line) => /^\s*([^:：=]+)\s*[:：=]\s*(.+?)\s*$/.exec(line)).filter(Boolean) as RegExpExecArray[];
  if (pairs.length) return [{ name: fileName, rows: [Object.fromEntries(pairs.map((match) => [match[1].trim(), match[2].trim()]))] }];
  return [{ name: fileName, rows: [{ content: trimmed }] }];
}

function contentFromSheets(sheets: ParsedSheet[], fallbackId: string, expectedSpuId?: string): SyncContent {
  const populated = sheets.filter((sheet) => sheet.rows.length);
  if (!populated.length) throw new Error("没有从文件中读取到数据行");
  const explicitSpuIds = new Set(populated.flatMap((sheet) => sheet.rows).flatMap((row) => {
    const key = findKey(row, SPU_ID_KEYS);
    const value = valueText(key ? row[key] : undefined);
    return value ? [value] : [];
  }));
  if (expectedSpuId && explicitSpuIds.size && !explicitSpuIds.has(expectedSpuId)) {
    throw new Error(`文件中未找到当前页面的 SPU ${expectedSpuId}`);
  }
  const scoped = expectedSpuId && explicitSpuIds.size
    ? populated.map((sheet) => ({ ...sheet, rows: sheet.rows.filter((row) => {
      const key = findKey(row, SPU_ID_KEYS);
      const rowSpuId = valueText(key ? row[key] : undefined);
      return !rowSpuId || rowSpuId === expectedSpuId;
    }) }))
    : populated;
  const spuSheet = scoped.find((sheet) => /(^|\b)spu(\b|$)|商品|产品/i.test(sheet.name));
  const skuSheet = scoped.find((sheet) => /(^|\b)sku(\b|$)|规格|库存/i.test(sheet.name));
  const genericRows = scoped.flatMap((sheet) => sheet.rows);
  const firstRow = spuSheet?.rows[0] ?? genericRows[0];
  if (!firstRow) throw new Error(`文件中未找到 SPU ${expectedSpuId ?? "数据"}`);
  const spuIdKey = findKey(firstRow, SPU_ID_KEYS);
  const spuId = expectedSpuId ?? (valueText(spuIdKey ? firstRow[spuIdKey] : undefined) || fallbackId);
  const skuRows = skuSheet?.rows ?? genericRows;
  const allKeys = Array.from(new Set(genericRows.flatMap((row) => Object.keys(row))));

  const explicitSheets = Boolean(spuSheet && skuSheet && spuSheet !== skuSheet);
  const constantKeys = new Set(allKeys.filter((key) => {
    const values = new Set(genericRows.map((row) => valueText(row[key])).filter(Boolean));
    return values.size <= 1 && !SKU_FIELD_HINT.test(key);
  }));
  const spuExcluded = new Set([...(spuIdKey ? [spuIdKey] : []), ...SKU_ID_KEYS.flatMap((candidate) => Object.keys(firstRow).filter((key) => normalizedKey(key) === normalizedKey(candidate)))]);
  const spuRow = explicitSheets
    ? firstRow
    : Object.fromEntries(Object.entries(firstRow).filter(([key]) => constantKeys.has(key)));
  const spuFields = fieldsFor(spuId, spuRow, spuExcluded);

  const hasSkuShape = Boolean(skuSheet || skuRows.length > 1 || skuRows.some((row) => findKey(row, SKU_ID_KEYS)) || allKeys.some((key) => SKU_FIELD_HINT.test(key)));
  const skus = hasSkuShape ? skuRows.map((row, index) => {
    const skuIdKey = findKey(row, SKU_ID_KEYS);
    const rowSpuIdKey = findKey(row, SPU_ID_KEYS);
    const skuId = valueText(skuIdKey ? row[skuIdKey] : undefined) || `${spuId}-ROW-${index + 1}`;
    const excluded = new Set([...(skuIdKey ? [skuIdKey] : []), ...(rowSpuIdKey ? [rowSpuIdKey] : [])]);
    const skuRow = explicitSheets ? row : Object.fromEntries(Object.entries(row).filter(([key]) => !constantKeys.has(key) || SKU_FIELD_HINT.test(key)));
    return { id: skuId, fields: fieldsFor(skuId, skuRow, excluded) };
  }).filter((sku) => sku.fields.length) : [];

  if (!spuFields.length && !skus.length) throw new Error("文件中没有可同步的字段");
  return { spu: { id: spuId, fields: spuFields }, skus };
}

export async function parseImportFile(file: File, expectedSpuId?: string): Promise<UploadedSyncSource> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const fallbackId = file.name.replace(/\.[^.]+$/, "").replace(/\s+/g, "-") || `upload-${Date.now()}`;
  const binary = ["xlsx", "docx"].includes(extension);
  const maxBytes = binary ? 5_000_000 : 500_000;
  if (file.size > maxBytes) throw new Error(`文件过大，${binary ? "Excel/Word" : "文本"}文件最大支持 ${Math.round(maxBytes / 1_000_000 * 10) / 10}MB`);

  let sheets: ParsedSheet[];
  if (extension === "xlsx") {
    const { default: readXlsxFile } = await import("read-excel-file/browser");
    const workbook = await readXlsxFile(file);
    sheets = workbook.map((sheet) => ({ name: sheet.sheet, rows: matrixToRows(sheet.data as CellValue[][]) }));
  } else if (extension === "docx") {
    const { default: mammoth } = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    sheets = textToSheets(result.value, file.name);
  } else if (["csv", "tsv", "txt", "json"].includes(extension)) {
    const text = await file.text();
    if (extension === "csv" || extension === "tsv") {
      sheets = [{ name: file.name, rows: matrixToRows(parseDelimited(text, extension === "tsv" ? "\t" : ",")) }];
    } else {
      sheets = textToSheets(text, file.name);
    }
  } else {
    throw new Error("暂不支持该文件类型，请上传 .xlsx、.docx、.csv、.tsv、.txt 或 .json 文件");
  }

  return {
    id: `uploaded-${Date.now()}-${file.name}`,
    label: file.name,
    content: contentFromSheets(sheets, fallbackId, expectedSpuId),
  };
}
