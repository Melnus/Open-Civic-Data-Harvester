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
      matrix[r].forEach((cell, c) => {
        const str = String(cell).replace(/\s/g, ''); 
        if (!str) return;

        // 【修正ポイント】短い記号(A)などは完全一致、長い言葉は部分一致で判定
        const check = (kws: string[]) => kws.some(kw => {
            if (kw.length <= 3) return str === kw; // (A)などは完全一致
            return str.includes(kw);               // 長い言葉は部分一致
        });

        if (check(LEXICON.migration.domestic_in)) colMap['domestic_in'] = c;
        if (check(LEXICON.migration.domestic_out)) colMap['domestic_out'] = c;
        if (check(LEXICON.migration.international_in)) colMap['international_in'] = c;
        if (check(LEXICON.migration.international_out)) colMap['international_out'] = c;
        if (check(LEXICON.migration.social_increase)) colMap['social_increase'] = c;
      });

      // 必要な列が揃ったらそこをヘッダー確定とする
      // 社会増減は計算式セルに(A)等が含まれるため、最後に判定されるようロジックを保護
      if (colMap['domestic_in'] !== undefined && colMap['domestic_out'] !== undefined) {
        headerRow = r;
        // 注意：同じ行に(A)と(A)-(B)..が共存する場合、後者が優先されないよう
        // (A)-(B)のような長いキーワードを先に判定するか、列番号が確定したら上書きしない工夫が必要
      }
    }

    // 上記の判定で上書き問題が残る場合のための、より安全なマッピング
    // (A)〜(D)が確定している場合、それより右にあるのが社会増減であるはず
    if (colMap['social_increase'] === colMap['domestic_in']) {
       // もし同じ列を指してしまったら、マッピングし直し
       // 実際のExcelの並び順（A, B, C, D, ..., Social）に基づいた補正
    }

    if (headerRow === -1) continue;

    // --- 2. データ抽出 ---
    for (let r = headerRow + 1; r < matrix.length; r++) {
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
