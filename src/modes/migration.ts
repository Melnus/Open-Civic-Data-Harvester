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

    // 上から20行以内でヘッダーを探す
    for (let r = 0; r < Math.min(20, matrix.length); r++) {
      matrix[r].forEach((cell, c) => {
        const str = String(cell).replace(/\s/g, ''); // 空白除去
        
        // 転入(国内)
        if (LEXICON.migration.domestic_in.some(kw => str.includes(kw))) colMap['domestic_in'] = c;
        // 転出(国内)
        if (LEXICON.migration.domestic_out.some(kw => str.includes(kw))) colMap['domestic_out'] = c;
        // 転入(国外)
        if (LEXICON.migration.international_in.some(kw => str.includes(kw))) colMap['international_in'] = c;
        // 転出(国外)
        if (LEXICON.migration.international_out.some(kw => str.includes(kw))) colMap['international_out'] = c;
        // 社会増減
        if (LEXICON.migration.social_increase.some(kw => str.includes(kw))) colMap['social_increase'] = c;
      });

      // 主要な列が3つ以上見つかったら、そこをヘッダー行とみなす
      if (Object.keys(colMap).length >= 3) {
        headerRow = r;
        break;
      }
    }

    if (headerRow === -1) continue; // ヘッダー見つからずスキップ

    // --- 2. データ抽出 ---
    for (let r = headerRow + 1; r < matrix.length; r++) {
      const row = matrix[r];
      // A列〜D列あたりにある都道府県名を探す
      const nameCandidates = [row[0], row[1], row[2], row[3]].map(v => String(v || "").trim());
      const prefMatch = nameCandidates.find(n => PREFECTURES.includes(n) || PREFECTURES.includes(n.replace(/\s/g, '')));
      
      if (prefMatch) {
        const cleanName = normalizePrefecture(prefMatch);
        const data: MigrationData = {
          fiscal_year: fiscalYear,
          prefecture: cleanName,
          area: cleanName,
          source: sourceFile,
          domestic_in: parseNumber(row[colMap['domestic_in']]),
          domestic_out: parseNumber(row[colMap['domestic_out']]),
          international_in: parseNumber(row[colMap['international_in']]),
          international_out: parseNumber(row[colMap['international_out']]),
          social_increase: parseNumber(row[colMap['social_increase']])
        };
        results.push(data);
      }
    }
  }
  return results;
}
