import * as XLSX from 'xlsx';
import { parseNumber, normalizePrefecture } from '../utils';
import { LEXICON } from '../data/lexicon';
import { SettlementData } from '../types';

export function extractSettlement(workbook: XLSX.WorkBook, fiscalYear: number, sourceFile: string): SettlementData[] {
  const results: SettlementData[] = [];

  for (const sheetName of workbook.SheetNames) {
    if (sheetName.match(/(目次|index|注意|原本|Menu|表紙|概況|付表)/i)) continue;
    
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
    if (matrix.length < 5) continue;

    const cleanPref = normalizePrefecture(sheetName);
    
    // データ格納用オブジェクト
    const data: any = {
      fiscal_year: fiscalYear,
      prefecture: cleanPref,
      source: sourceFile
    };

    // マトリックス全体を走査
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        const cellVal = String(matrix[r][c]).replace(/\s/g, ''); // 空白除去して比較

        // 1. 歳入合計
        if (LEXICON.settlement.revenue.some(kw => cellVal.includes(kw))) {
            data.total_revenue = findValueRight(matrix, r, c);
        }
        // 2. 歳出合計
        else if (LEXICON.settlement.expenditure.some(kw => cellVal.includes(kw))) {
            // 歳出合計は複数箇所に出てくるが、値は同じはずなので上書きしてOK
            const val = findValueRight(matrix, r, c);
            if(val) data.total_expenditure = val;
        }
        // 3. 実質収支
        else if (LEXICON.settlement.real_balance.some(kw => cellVal.includes(kw))) {
            data.real_balance = findValueRight(matrix, r, c);
        }
        // 4. 地方税
        else if (LEXICON.settlement.local_tax.some(kw => cellVal === kw)) { // 完全一致推奨（「地方税」を含む他の単語を除外）
            data.local_tax = findValueRight(matrix, r, c);
        }
        // 5. 地方消費税（重要：内訳欄にある）
        else if (LEXICON.settlement.local_consumption_tax.some(kw => cellVal.includes(kw))) {
            data.local_consumption_tax = findValueRight(matrix, r, c);
        }
        // 6. 人口（住民基本台帳人口）
        else if (LEXICON.settlement.population.some(kw => cellVal.includes(kw))) {
            // 人口は「右」ではなく「下」や「右下」にあるケースが多い
            // 画像2を見ると、セルの結合状況によるが、右隣かその下の行の可能性が高い
            const val = findValueAround(matrix, r, c);
            if (val && val > 1000) data.population = val; // 1000人以上なら採用
        }
      }
    }

    if (data.total_revenue || data.population) {
      results.push(data as SettlementData);
    }
  }
  return results;
}

// 指定セルの右側(近傍)から数値を探すヘルパー
function findValueRight(matrix: any[][], row: number, col: number): number | null {
  for (let i = 1; i <= 5; i++) { // 右に5つまで見る
    const val = parseNumber(matrix[row][col + i]);
    if (val !== null) return val;
  }
  return null;
}

// 周辺(右・下)から数値を探す（人口用）
function findValueAround(matrix: any[][], row: number, col: number): number | null {
  // 右を見る
  let val = findValueRight(matrix, row, col);
  if (val !== null) return val;
  
  // 下の行を見る（結合セルの場合）
  if (row + 1 < matrix.length) {
    val = findValueRight(matrix, row + 1, col); // 下の行の右側
    if (val !== null) return val;
     // 下の行の同じ列
    const valDown = parseNumber(matrix[row + 1][col]);
    if (valDown !== null) return valDown;
  }
  return null;
}
