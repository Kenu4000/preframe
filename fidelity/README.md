# 再現差分台帳

`known-differences.json` は原作と移植版の差、未検証箇所、実装を止める未知仕様を管理します。

状態は `open`、`investigating`、`fixed`、`accepted` のいずれかです。原作と異なるが都合上許容した項目だけを `accepted` にし、未実装をaccepted扱いにはしません。

各差分には再現手順、原作での期待値、移植版の実測値、根拠、検証方法を追記します。`npm run check` は必須フィールドとID重複を検査します。

