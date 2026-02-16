import * as XLSX from 'xlsx';
import { parseNumber, normalizePrefecture, PREFECTURES } from '../utils';
import { LEXICON } from '../data/lexicon';
import { PopulationData } from '../types';

export function extractPopulation(workbook: XLSX.WorkBook, fiscalYear: number, sourceFile: string): PopulationData[] {
  const results: PopulationData[] = [];

  for (const sheetName of workbook.SheetNames) {
    if (sheetName.match(/(目次|index|注意|原本|表紙|概況|付表)/i)) continue;

    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
    if (matrix.length < 5) continue;

    // --- 1. ヘッダー解析 (超厳密版) ---
    const colMap: { [key: string]: number } = {};
    
    for (let r = 0; r < Math.min(25, matrix.length); r++) {
      const row = matrix[r];
      for (let c = 0; c < row.length; c++) {
        const cellStr = String(row[c]).replace(/\s/g, '');

        // 出生者数の列特定
        if (LEXICON.population.births.some(kw => cellStr === kw)) colMap['births'] = c;
        // 死亡者数の列特定
        if (LEXICON.population.deaths.some(kw => cellStr === kw)) colMap['deaths'] = c;

        // 人口「計」の特定ロジック
        // 「人口」という単語を見つけたら、その同じ列の直下2行以内に「計」があるか探す
        if (LEXICON.population.population_total.some(kw => cellStr === kw || cellStr.includes(kw))) {
          for (let rowOffset = 1; rowOffset <= 2; rowOffset++) {
            const subCell = String(matrix[r + rowOffset]?.[c] || "").replace(/\s/g, '');
            if (LEXICON.population.sub_total.some(skw => subCell === skw)) {
              colMap['total_population'] = c;
              break;
            }
          }
        }
      }
    }

    // デバッグ用：見つかった列番号（出ない場合はヘッダー解析失敗）
    // console.log(`  Columns found: Population:${colMap.total_population}, Births:${colMap.births}, Deaths:${colMap.deaths}`);

    if (colMap['total_population'] === undefined) continue;

    // --- 2. データ抽出 ---
    for (let r = 0; r < matrix.length; r++) {
      const row = matrix[r];
      // A列〜C列のいずれかが都道府県名かどうかを判定（団体コード A列は無視するロジック）
      const colB = String(row[1] || "").trim();
      const colC = String(row[2] || "").trim();

      // 都道府県名の特定
      const prefMatch = PREFECTURES.find(p => colB.includes(p) || colC.includes(p));
      if (!prefMatch) continue;

      const pref = normalizePrefecture(prefMatch);
      // 市町村名の特定 (BかCに都道府県名が入っているなら、CかDに市町村名がある)
      let city = "";
      if (colC && !PREFECTURES.includes(colC)) {
        city = colC.replace(/\s/g, '');
      } else if (String(row[3])) {
        city = String(row[3]).trim();
      }

      // 団体コード行や合計行を除外
      if (city.match(/(合計|再掲|部計|計)$/)) continue;

      const areaName = city ? `${pref}${city}` : pref;

      // 解析済みの列番号から値を取得（ここが最重要：列を固定して取る）
      const valPopulation = parseNumber(row[colMap['total_population']]);
      const valBirths = colMap['births'] !== undefined ? parseNumber(row[colMap['births']]) : null;
      const valDeaths = colMap['deaths'] !== undefined ? parseNumber(row[colMap['deaths']]) : null;

      // 数値が取れていて、かつ団体コード（10006等）と誤認していないかチェック
      // 人口データとして不自然に小さい数値は除外
      if (valPopulation !== null && valPopulation > 100) {
        results.push({
          fiscal_year: fiscalYear,
          prefecture: pref,
          area: areaName,
          source: sourceFile,
          total_population: valPopulation,
          births: valBirths,
          deaths: valDeaths
        });
      }
    }
  }

  return results;
}
