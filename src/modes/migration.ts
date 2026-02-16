import * as XLSX from 'xlsx';
import { parseNumber, normalizePrefecture, PREFECTURES } from '../utils';

// 移動モードの設定
const CONFIG = {
  row_key: "prefecture",
  columns: [
    { key: "domestic_in", keywords: ["(A)", "国内"] },
    { key: "domestic_out", keywords: ["(B)", "国内"] },
    { key: "international_in", keywords: ["(C)", "国外"] },
    { key: "international_out", keywords: ["(D)", "国外"] },
    { key: "social_increase", keywords: ["(E)", "社会増減"] }
  ]
};

export function extractMigration(workbook: XLSX.WorkBook, fiscalYear: number, sourceFile: string): any[] {
  const results: any[] = [];

  for (const sheetName of workbook.SheetNames) {
    if (sheetName.match(/(目次|index|注意|原本|Menu|表紙|概況|付表)/i)) continue;
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
    if (matrix.length < 5) continue;

    const colMap: any = {};
    let headerRowIndex = -1;

    // 1. ヘッダー解析
    for (let r = 0; r < Math.min(20, matrix.length); r++) {
      CONFIG.columns.forEach((col: any) => {
        if (colMap[col.key] !== undefined) return;
        matrix[r].forEach((cell, cIdx) => {
           if (cIdx < 2) return; 
           const cellStr = String(cell).replace(/\s/g, '');
           if (col.keywords.some((kw: string) => cellStr.includes(kw))) {
             colMap[col.key] = cIdx;
             headerRowIndex = r;
           }
        });
      });
    }

    if (Object.keys(colMap).length === 0) continue;

    // 2. データ抽出（リスト形式）
    for (let r = headerRowIndex + 1; r < matrix.length; r++) {
      const row = matrix[r];
      // 地域名の候補を探す（A列〜D列あたり）
      const nameCandidates = [row[0], row[1], row[2], row[3]].map(v => String(v || "").trim());
      
      let areaName = "";
      // マスタと一致するか確認
      const prefMatch = nameCandidates.find(n => PREFECTURES.includes(n) || PREFECTURES.includes(n.replace(/\s/g, '')));
      
      if (prefMatch) {
        areaName = normalizePrefecture(prefMatch);
      }

      if (areaName) {
        const entry: any = { fiscal_year: fiscalYear, area: areaName, prefecture: areaName, source: sourceFile };
        let hasData = false;

        CONFIG.columns.forEach((col: any) => {
          const idx = colMap[col.key];
          if (idx !== undefined) {
            const val = parseNumber(row[idx]);
            if (val !== null) {
                entry[col.key] = val;
                hasData = true;
            }
          }
        });
        if (hasData) results.push(entry);
      }
    }
  }
  return results;
}
