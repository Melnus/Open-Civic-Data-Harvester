import * as XLSX from 'xlsx';
import { parseNumber, normalizePrefecture, PREFECTURES } from '../utils';

// 動態モードの設定
const CONFIG = {
  row_key: "city",
  columns: [
    { key: "total_population", keywords: ["人口", "計", "総数"] },
    { key: "births", keywords: ["出生"] },
    { key: "deaths", keywords: ["死亡"] }
  ]
};

export function extractPopulation(workbook: XLSX.WorkBook, fiscalYear: number, sourceFile: string): any[] {
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

    // 2. データ抽出
    for (let r = headerRowIndex + 1; r < matrix.length; r++) {
      const row = matrix[r];
      const nameCandidates = [row[0], row[1], row[2], row[3]].map(v => String(v || "").trim());
      
      let areaName = "";
      
      // 動態は市町村レベルも拾うロジックが入っていたため、ここも再現
      // 都道府県名チェック
      const prefMatch = nameCandidates.find(n => PREFECTURES.includes(n) || PREFECTURES.includes(n.replace(/\s/g, '')));
      if (prefMatch) {
        areaName = normalizePrefecture(prefMatch);
      } else {
        // 市区町村チェック
        const cityMatch = nameCandidates.find(n => n.match(/(市|区|町|村)$/) && !n.match(/^(合計|再掲|全国|県計|総数)$/));
        if (cityMatch) areaName = cityMatch;
      }

      if (areaName) {
        const entry: any = { fiscal_year: fiscalYear, area: areaName, source: sourceFile };
        if (PREFECTURES.includes(areaName)) entry.prefecture = areaName;

        let hasData = false;
        CONFIG.columns.forEach((col: any) => {
          const idx = colMap[col.key];
          if (idx !== undefined) {
            const val = parseNumber(row[idx]);
            if (val !== null) {
                if (col.key.includes("population") && val < 10000) return;
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
