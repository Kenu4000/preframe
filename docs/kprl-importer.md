# Kprl逆アセンブルImporter

Kprl 1.45が出力する `.org` と番号付き `.utf` を、Kanon固有のdecoded record列へ変換します。原作本文を含む生成JSONは `cache/` にだけ書き、Gitへは入れません。

```console
npm run import:kprl -- \
  --org private/kanon_original/scenario/SCENE.org \
  --resource private/kanon_original/scenario/SCENE.utf
```

既定の出力先は `cache/kanon/imported/<scene>.decoded.json` です。入力は `private/`、出力は `cache/` の内側でなければImporterが拒否します。

## 現在確定して扱う構造

| Kprl構造 | decoded record | 根拠 |
|---|---|---|
| `#entrypoint` | `label` | エントリ番号とシンボルを構造として保持 |
| `intX[index] = literal` | `variable.set` | 代入先bank、index、literalを分離して保持 |
| 単独の `#res<id>` | `text` | `.utf` の同一IDと結合し、本文側の位置も保持 |
| その他の命令 | `unknown` | 命令名と型付き引数を保持し、挙動は推測しない |

`.org` に原作バイナリ上のbyte offsetと数値opcodeはありません。そのため `source.offset` は `.org` 内のUTF-8 byte offset、`source.opcode` はKprlの命令名で、`provenance` は `kprl-disassembly` です。元バイナリ位置・opcodeを回復できる資料が得られた時点で、別Decoderまたは対応表を追加します。

## 未確定のまま保持するもの

`title`、`bgmLoop`、`msgHide`、`grpOpenBg`、`pause`、`bgmFadeOut`、`wait`、`farcall`、`jump`、`eof`、`halt` 等は、名前だけからランタイム挙動を決めません。`kanon.kprl.<命令名>` を候補名として保持し、Parserでは `unknown` になります。この状態でKAG出力を試すと意図どおり失敗します。

本文先頭の `\\{...}` はspeaker markupとして分離します。`\\m{A}` のような式は展開せず `speakerExpression` に残します。名前欄・本文欄・改ページの原作レイアウトが確認できるまでは、KAG emitterはこの本文を出力しません。
