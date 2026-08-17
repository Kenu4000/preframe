# 原作データ配置規約

原作データは読み取り専用です。実際のファイル名やディレクトリ構造は解析環境のまま保持し、`config/kanon.project.example.json` をコピーしたローカル設定から相対パスで参照します。

推奨例は次のとおりですが、固定仕様ではありません。

```text
private/
  kanon_original/
    kanon.project.local.json
    SEEN.TXT
    control-data/
    images/
    bgm/
    se/
    voice/
    assets.local.json
cache/
  kanon/
    decoded/
    converted-assets/
    kag-data/
```

規則:

1. `private/kanon_original/` 内をImporterから更新しない。
2. 変換後アセットと中間表現は `cache/kanon/` だけに書く。
3. cacheは削除後に原作データから再生成できるようにする。
4. 原作IDとKAG storage名の対応はローカルのアセットmanifestに記録する。
5. 原作本文、画像、音声、変換物をGitへ追加しない。

