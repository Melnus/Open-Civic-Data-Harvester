import * as XLSX from 'xlsx';
import { parseNumber, normalizePrefecture, PREFECTURES } from '../utils';
import { LEXICON } from '../data/lexicon';
import { MigrationData } from '../types';

export function extractMigration(workbook: XLSX.WorkBook, fiscalYear: number, sourceFile: string): MigrationData[] {
  const results: MigrationData[] = [];

  for (const sheetName of workbook.SheetNames) {
    if (sheetName.match(/(目次|index|注意|原本)/i)) continue;
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
    if (matrix.length < 5) continue;

    // --- 1. ヘッダー解析 ---
    const colMap: { [key: string]: number } = {};
    let headerRow = -1;

    for (let r = 0; r < Math.min(20, matrix.length); r++) {
      let foundInThisRow = false; // ★この行でキーワードが見つかったかフラグ

      matrix[r].forEach((cell, c) => {
        const str = String(cell).replace(/\s/g, ''); 
        if (!str) return;

        const check = (kws: string[]) => kws.some(kw => {
            if (kw.length <= 3) return str === kw; 
            return str.includes(kw);               
        });

        // キーワードが見つかったらマップに登録し、フラグを立てる
        if (check(LEXICON.migration.domestic_in)) { colMap['domestic_in'] = c; foundInThisRow = true; }
        if (check(LEXICON.migration.domestic_out)) { colMap['domestic_out'] = c; foundInThisRow = true; }
        if (check(LEXICON.migration.international_in)) { colMap['international_in'] = c; foundInThisRow = true; }
        if (check(LEXICON.migration.international_out)) { colMap['international_out'] = c; foundInThisRow = true; }
        if (check(LEXICON.migration.social_increase)) { colMap['social_increase'] = c; foundInThisRow = true; }
      });

      // 必要な列が揃っており、かつ「この行にキーワードがあった」場合のみヘッダー位置を更新
      if (foundInThisRow && colMap['domestic_in'] !== undefined && colMap['domestic_out'] !== undefined) {
        headerRow = r;
      }
    }

    if (headerRow === -1) continue;

    // --- 2. データ抽出 ---
    for (let r = headerRow + 1; r < matrix.length; r++) {
      // (以下変更なし)
      const row = matrix[r];
      const nameCandidates = [row[0], row[1], row[2]].map(v => String(v || "").trim());
      const prefMatch = nameCandidates.find(n => PREFECTURES.includes(n) || PREFECTURES.includes(n.replace(/\s/g, '')));
      
      if (prefMatch) {
        const cleanName = normalizePrefecture(prefMatch);
        results.push({
          fiscal_year: fiscalYear,
          prefecture: cleanName,
          area: cleanName,
          source: sourceFile,
          domestic_in: parseNumber(row[colMap['domestic_in']]),
          domestic_out: parseNumber(row[colMap['domestic_out']]),
          international_in: parseNumber(row[colMap['international_in']]),
          international_out: parseNumber(row[colMap['international_out']]),
          social_increase: parseNumber(row[colMap['social_increase']])
        });
      }
    }
  }
  return results;
}
