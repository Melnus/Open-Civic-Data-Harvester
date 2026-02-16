import * as XLSX from 'xlsx';
import { parseNumber, normalizePrefecture } from '../utils';

// 決算カード用の設定
const CONFIG = {
  keys: [
    { key: "population", keywords: ["住民基本台帳人口", "人口"] },
    { key: "total_revenue", keywords: ["歳入総額", "歳入決算総額", "歳入合計"] },
    { key: "total_expenditure", keywords: ["歳出総額", "歳出決算総額", "歳出合計"] },
    { key: "local_tax", keywords: ["地方税", "普通税", "都道府県税"] },
    { key: "consumption_tax_share", keywords: ["地方消費税"] },
    { key: "real_balance", keywords: ["実質収支"] }
  ]
};

export function extractSettlement(workbook: XLSX.WorkBook, fiscalYear: number, sourceFile: string): any[] {
  const results: any[] = [];

  for (const sheetName of workbook.SheetNames) {
    if (sheetName.match(/(目次|index|注意|原本|Menu|表紙|概況|付表)/i)) continue;
    
    // シート全体をJSON行列として取得
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
    if (matrix.length < 5) continue;

    const cleanPref = normalizePrefecture(sheetName);
    const entry: any = { fiscal_year: fiscalYear, prefecture: cleanPref, source: sourceFile };
    let foundAny = false;

    CONFIG.keys.forEach((k) => {
      outer: for (const row of matrix) {
        for (let c = 0; c < row.length; c++) {
          // キーワードを含むセルを探す
          if (CONFIG.keys.some((chk) => String(row[c]).includes(chk.keywords[0]))) {
            if (String(row[c]).includes(k.keywords[0])) {
              // 見つけたら右側50セル以内を探査
              for (let nc = c + 1; nc < Math.min(c + 50, row.length); nc++) {
                const val = parseNumber(row[nc]);
                if (val !== null) { 
                  // 人口が極端に少ない数値(誤検出)を除外するロジック
                  if (k.key.includes("population") && val < 10000) continue;
                  entry[k.key] = val;
                  foundAny = true;
                  break outer; 
                }
              }
            }
          }
        }
      }
    });

    if (foundAny) {
      results.push(entry);
    }
  }

  return results;
}
