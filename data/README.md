# データソースについて

TSCMボードはオプション・会場・ヒアリング項目・共有事項テンプレ・案件データをすべてGoogleスプレッドシートから実行時に読み込む設計（`OptionMaster.gs`）。そのため、これらのスプレッドシートの中身はこのリポジトリにスナップショットとして複製せず、参照先のみ記録する（コードはGit、可変マスタ・案件データはスプレッドシート、というGPCMボードと同じ方針）。

## Google Drive フォルダ

- 「TSCMボード」フォルダ: フォルダID `11rSBdjheMmqORHxajWySbEWeA5PYJi8m`
- 「TSCM_共通マスタ」サブフォルダ: フォルダID `1ERHY0dOkMjwzp6DBHfn2d8cRJYmCYM8e`（利用確認書・レイアウト図PDFの保存先。`ConfirmationPdf.gs`の`TSCM_MASTER_FOLDER_ID`が参照）

## スプレッドシート構成（2026-08-17〜）

当初計画では「TSCM_共通マスタ」という1スプレッドシートに4タブ（共通オプション・料金マスタ／よく使う会場／ヒアリング項目マスタ／共有事項テンプレ）を持つ想定だったが、Google Drive側のツール制約で「1ファイルに複数タブを持つxlsxのアップロード変換」が失敗したため、**4つの独立したGoogleスプレッドシートファイル（各1シート）**として作成した。案件データ用の「TSCM_管理システム」と合わせて計5ファイル。

| ファイル名 | 役割 | スプレッドシートID | コード内の定数（OptionMaster.gs） |
| --- | --- | --- | --- |
| 共通オプション・料金マスタ | 標準オプション4項目の単価・計算方式 | `1zdMfgckhlEOx5qfNsdTxYLOlgOZlV4HrfpMHvUkTkpE` | `OM_STANDARD_ID` |
| よく使う会場 | 会場名+住所の再利用リスト | `1FfVjdV4pOuGWbyDHy-wtSlS_Q7E6qm7tn0I4Mwl21iU` | `OM_VENUES_ID` |
| ヒアリング項目マスタ | ①ヒアリングシートの項目定義（会場非依存・単一マスタ） | `1tRvTedwSmbr07zdfvog_WxZwGmMXEibe_CljE-PN_D8` | `OM_FORMSCHEMA_ID` |
| 共有事項テンプレ | 立会スタッフ共有事項の既定文言（単一テンプレ） | `1RbM2so7-79D9xZLn9ZeVw_lB3CHhluVkMW7nsOEXeqE` | `OM_STAFF_ID` |
| TSCM_管理システム | 案件データの保存先 | `1zRRDTTt9luoiH5Za8ooi00AOBC-bJwNMeWI4jGYfD60` | `CASE_SPREADSHEET_ID` |

各スプレッドシートはいずれも「1シート目（デフォルトシート名）」にヘッダ行+データを持つ。シート名指定ではなく`om_readSheetById_(spreadsheetId)`（`ss.getSheets()[0]`経由）で読み込むため、シート名を変更しても動作に影響しない。

### 各シートの列構成

| シート | 列 |
| --- | --- |
| 共通オプション・料金マスタ | コード／品目名／種別(manual・fixed・percentage)／単価(税別)／率(%)／単位／税表記(税別・税込)／表示順／備考 |
| よく使う会場 | 会場名／会場住所／登録日時／登録者／備考 |
| ヒアリング項目マスタ | カテゴリ／項目名／種別(select/text/date/datetime/timerange/textarea)／選択肢(｜または|区切り)／初期値／補足メモ／会場依存フラグ(常時FALSE運用)／新規項目フラグ／ラクラクパック関連フラグ／ケータリング関連フラグ／お食事関連フラグ |
| 共有事項テンプレ | テンプレ本文（2行目に本文） |
| TSCM_管理システム | caseId／保存日時／更新日時／作成者／最終更新者／会場名／会場住所／会社名／担当者／データ(JSON)／URL |

金額を直すときは「共通オプション・料金マスタ」の単価(税別)列を書き換えるだけ、ヒアリング項目を増やすときは「ヒアリング項目マスタ」に行を追加するだけでボードに反映される（コード修正・再デプロイ不要）。

## 案件データ（TSCM_管理システム）

ボードの入力内容（ヒアリングシート全項目、複数会場/日程を比較検討中の場合はその全ブロック分、標準/自由記述オプション）は、案件(caseId)ごとに1行で保存される（`OptionMaster.gs`の`saveCase()`）。GPCMボードの「会場ID」列は廃止し、会場名は自由入力のため「会場住所」列を追加した。

保存済み案件の一覧表示・呼び出し(読み込み)・削除機能を実装済み（`listCases()`/`loadCase()`/`deleteCase()`）。

## セキュリティ運用メモ

- 各スプレッドシートは、owner（`hiroto-saito@adval.jp`）+ ドメイン「株式会社あどばる」内のみ（writer）に統一する想定（GPCMボードと同方針）。
- 生成したPDFはファイル単位でadval.jpドメイン内閲覧権限を自動付与する（`DriveApp.Access.DOMAIN` + `Permission.VIEW`）。フォルダ全体は公開しない。
- 会場名・会場住所は自由入力のため、XSS対策（`esc()`/`ce_()`/`sanitizeRichHtml_()`）を会場名・会場住所の表示箇所を含めて徹底する。
- 案件保存・よく使う会場登録の双方で、`Session.getActiveUser().getEmail()`から操作者を自動記録する（Pマーク対応：追跡性の確保）。
- 案件データの削除機能（🗑）を実装済み（本人からの削除依頼等への対応手段）。保持期間の自動失効は未実装のため、削除は手動運用。
- ドメイン制限デプロイ（adval.jpドメイン内のユーザーのみアクセス可）を前提とする。実際のデプロイ後、`OptionMaster.gs`の`WEBAPP_BASE_URL`と`Index.html`内の`WEBAPP_BASE_URL`を実際の配布URL（`/a/macros/adval.jp/s/.../exec`形式）に更新すること（現状はプレースホルダ）。

## 注意: 参考資料の実データについて

ユーザー提示の参考資料（Google Sheets fileId: `1y9l4Rl6YYHTOP_cVgJju7u8lXzgqYVYidBdWSQiGtMw`）には実在案件の金額情報が含まれていた可能性があり、設計参考のみに用いた。実データは本リポジトリ・ドキュメントに一切転記していない。
