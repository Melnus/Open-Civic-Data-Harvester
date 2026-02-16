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

    // --- 1. ヘッダー解析 (多段ヘッダー対応) ---
    const colMap: { [key: string]: number } = {};
    let dataStartRow = -1;

    // ヘッダー領域（0行目〜20行目）を走査
    // 戦略: 「出生者数」「死亡者数」は一意なワードなのでそのまま探す。
    //       「総人口」は「人口」の下に「計」がある列を探す。
    
    // まず、主要なキーワードがある行範囲を特定
    for (let r = 0; r < Math.min(20, matrix.length); r++) {
      const rowStr = matrix[r].join("").replace(/\s/g, '');
      
      // 出生・死亡の列特定（これらは1セルで完結していることが多い）
      if (LEXICON.population.births.some(kw => rowStr.includes(kw))) {
        matrix[r].forEach((cell, c) => {
          const str = String(cell).replace(/\s/g, '');
          if (LEXICON.population.births.some(kw => str === kw || str.includes(kw))) colMap['births'] = c;
          if (LEXICON.population.deaths.some(kw => str === kw || str.includes(kw))) colMap['deaths'] = c;
        });
        // データ開始行はこのヘッダーの次の行以降と仮定（後で調整）
        if (dataStartRow === -1) dataStartRow = r + 1;
      }

      // 人口列の特定（親：「人口」 → 子：「計/総数」）
      // 例: 行4に「人口」、行5に「計」があるケース
      if (LEXICON.population.total_population_label.some(kw => rowStr.includes(kw))) {
        matrix[r].forEach((cell, c) => {
          const str = String(cell).replace(/\s/g, '');
          if (LEXICON.population.total_population_label.some(kw => str.includes(kw))) {
            // 親ヘッダー「人口」を見つけた。
            // 同じ列の直下(r+1)〜2行下(r+2)に「計」があるか確認
            const subHeader1 = String(matrix[r+1]?.[c] || "").replace(/\s/g, '');
            const subHeader2 = String(matrix[r+2]?.[c] || "").replace(/\s/g, '');
            
            if (LEXICON.population.total_population_sub_label.some(kw => subHeader1 === kw || subHeader2 === kw)) {
              colMap['total_population'] = c;
            } else {
              // 「計」がない場合、その列自体が人口である可能性（単一行ヘッダーの場合）
              // 他に「計」が見つからなければこれを採用する予備ロジック
              if (colMap['total_population'] === undefined) {
                 colMap['total_population'] = c;
              }
            }
          }
        });
      }
    }

    // 必須カラムが見つからなければスキップ
    if (colMap['births'] === undefined || colMap['deaths'] === undefined) continue;
    if (dataStartRow === -1) dataStartRow = 5; // フォールバック

    // --- 2. データ抽出 ---
    for (let r = dataStartRow; r < matrix.length; r++) {
      const row = matrix[r];
      const rowStr = row.join("");
      if (rowStr.length < 5) continue; // 空行スキップ

      // 地域名の特定 (A列:団体コード, B列:都道府県, C列:市区町村 と仮定)
      // 画像4を見ると、B列に都道府県、C列に市町村がある
      const colB = String(row[1] || "").replace(/\s/g, '');
      const colC = String(row[2] || "").replace(/\s/g, '');
      const colD = String(row[3] || "").replace(/\s/g, ''); // 念のためD列も

      let pref = "";
      let city = "";

      // 都道府県名の検出
      if (PREFECTURES.some(p => colB.includes(p))) {
        pref = normalizePrefecture(colB);
      } else if (PREFECTURES.some(p => colC.includes(p))) { // 稀なケース
        pref = normalizePrefecture(colC);
      }

      // 市区町村名の検出
      // 市、区、町、村で終わる、かつ「合計」などではない
      const candidateCity = colC || colD; // CになければDを見る
      if (candidateCity && candidateCity.match(/(市|区|町|村)$/) && !candidateCity.match(/(計|総数|再掲)/)) {
        city = candidateCity.trim();
      } else if (colC === "合計" || colC === "計") {
          // 合計行も必要ならここで取得（今回はスキップ、または area="合計" で取る）
          // city = "合計"; 
      }

      // エリア名決定
      let areaName = "";
      if (pref && city) {
        areaName = `${pref}${city}`; // 例: 北海道札幌市
      } else if (pref) {
        areaName = pref; // 都道府県のみ（県計など）
      } else {
        continue; // 地域名が特定できない行はスキップ
      }

      // 値の抽出
      const valPopulation = parseNumber(row[colMap['total_population']]);
      const valBirths = parseNumber(row[colMap['births']]);
      const valDeaths = parseNumber(row[colMap['deaths']]);

      // 有効なデータがあれば追加
      if (valPopulation !== null || valBirths !== null) {
        results.push({
          fiscal_year: fiscalYear,
          prefecture: pref || normalizePrefecture(areaName), // prefが取れてない場合（全国計など）のガード
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
