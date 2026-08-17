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
| `bgmLoop(id)` | `bgm.play` | `bgmFadeOut`までループ再生を続けることを実機確認 |
| `bgmFadeOut(rawDuration)` | `kanon.bgm.fadeOut` | BGMの終了契機として確認。引数の時間単位は未確認なのでKAG出力は停止 |
| `msgHide` | `kanon.message.hide` | 30fps録画でtxtwindowが約0.20秒かけて消えることを確認 |
| `pause` | `kanon.message.pause` | txtwindow方式でクリック待ちし、その後に本文を消去することを実機確認 |
| `grpOpenBg('FGNY02A', 0)` | `kanon.background.open` | 30fps録画で約0.50秒のcrossfadeを確認。開始時の白画面はこの命令ではなく「初めから」の処理 |
| その他の命令 | `unknown` | 命令名と型付き引数を保持し、挙動は推測しない |

`.org` に原作バイナリ上のbyte offsetと数値opcodeはありません。そのため `source.offset` は `.org` 内のUTF-8 byte offset、`source.opcode` はKprlの命令名で、`provenance` は `kprl-disassembly` です。元バイナリ位置・opcodeを回復できる資料が得られた時点で、別Decoderまたは対応表を追加します。

## 未確定のまま保持するもの

`title`、`FGNY02A + 0`以外の `grpOpenBg`、`wait`、`farcall`、`jump`、`eof`、`halt` 等は、名前だけからランタイム挙動を決めません。`kanon.kprl.<命令名>` を候補名として保持し、Parserでは `unknown` になります。`bgmFadeOut`は命令の意味だけknownですが、引数の時間単位を確定するまではKAG出力を拒否します。

本文先頭の `\\{...}` はspeaker markupとして分離します。`\\m{A}` のような式は展開せず `speakerExpression` に残します。クリック待ちと本文消去は確認済みですが、名前欄、文字配置、ウィンドウ外観、macro展開は未確認なので、KAG emitterは実本文の出力をまだ拒否します。
