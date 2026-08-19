# TSCMboard 開発ルール（絶対厳守）

このリポジトリでの開発フローは、ユーザーから「このルールだけは絶対に守ってくれ」と明示された以下の手順に従う。

## ブランチ運用

- `main` = 本番（prod）。
- `dev` = 開発用ブランチ。修正・新規開発・調整はすべてこちらで作業する。
- **ユーザーから明示的な指示があるまで、`dev` → `main` へのPull Request・マージは絶対にしない。**

## 作業手順（順序厳守）

1. 修正・新規開発・調整を依頼されたら、必ずGitHub Issueを立てる（作業着手前）。
2. 着手前に問題点を多角的に検証する:
   - ブラウジングテスト
   - コンソールにエラーが出ていないか
   - W3Cに沿っているか
   - 実運用可能か
   - レピュテーションリスクがないか
   - Pマーク・ISMSに沿ったセキュリティ基準になっているか
3. 作業後、`dev`ブランチにコミットする（`main`に直接コミットしない）。
4. コミット後、上記6観点で再度多角的に検証する。
5. **ユーザーから明示的な指示があるまで、`dev`→`main`へのPull Request・マージは絶対にしない。**
6. コンフリクトが発生したら、最適な形で解消する。
7. 解消後、上記6観点で再度検証する。
8. ユーザーがdev環境で確認し、明示的に指示した場合のみ`dev`→`main`へPR・マージする。
9. マージ後、上記6観点で再度検証する。

## 補足

- 標準オプション・よく使う会場・ヒアリング項目・共有事項テンプレのデータ（単価・選択肢・テンプレ文言）はGoogleスプレッドシート側で管理する。コード側にハードコードしない。詳細は`data/README.md`参照。
- 会場マスタ選択式（venueIdキー）は採用しない。会場名・会場住所は案件ごとの自由入力とする（GPCMボードとの主な設計差）。

## Apps Scriptデプロイの本番/検証分離（絶対厳守、2026-08-19〜）

以前は本番URL(スタッフが実際に使う・ブックマーク済み・マニュアル記載)に、検証未了の変更も含めて毎回直接デプロイしてしまっていた(GPCMボード側で同じ問題により障害発生)。二度と繰り返さないため、以下の分離を徹底する。

- **本番URL(既存・変更しない)**: `https://script.google.com/a/macros/adval.jp/s/AKfycbxPRYx_2qBpq5OTJL7x8iZcseYcjp38jbNGDpxaV5CVjU_q_EhQGAVZzAP2LnfMId_Jig/exec`（デプロイID: `AKfycbxPRYx_2qBpq5OTJL7x8iZcseYcjp38jbNGDpxaV5CVjU_q_EhQGAVZzAP2LnfMId_Jig`、versionNumberを明示的に指定するバージョン固定デプロイ）
- **検証用URL(@HEADデプロイ、以前から存在)**: `https://script.google.com/a/macros/adval.jp/s/AKfycbwe3avIcGdzpcH15ZBmGDLQJ9AJOwly4szTIpQwNK6L/exec`（デプロイID: `AKfycbwe3avIcGdzpcH15ZBmGDLQJ9AJOwly4szTIpQwNK6L`、常に最新の保存内容を自動配信）

**運用ルール**: script.googleapis.comのcontent更新は自由に行ってよいが、新しいバージョンを作成して本番デプロイ(`AKfycbxPRYx_...`)に紐付ける操作は、**ユーザーが検証用URLで確認し、明示的に指示した場合のみ**行う（`dev`→`main`のマージ許可制と全く同じ考え方）。動作確認は必ず検証用URL(`AKfycbwe3avIcGdzpcH15ZBmGDLQJ9AJOwly4szTIpQwNK6L`)で行うこと。
