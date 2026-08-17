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
| `bgmFadeOut(rawDuration)` | `kanon.bgm.fadeOut` | 録画音声で1200が約1.2秒のfade-outと一致するためms単位として確認 |
| `msgHide` | `kanon.message.hide` | 30fps録画でtxtwindowが約0.20秒かけて消えることを確認 |
| `pause` | `kanon.message.pause` | txtwindow方式でクリック待ちし、その後に本文を消去することを実機確認 |
| `grpOpenBg('FGNY02A', 0)` | `kanon.background.open` | 30fps録画で約0.50秒のcrossfadeを確認。開始時の白画面はこの命令ではなく「初めから」の処理 |
| `grpOpenBg('SIRO', 26)` | `kanon.background.open` | 30fps録画で約2.0秒かけて白へ移行することを確認 |
| `wait(2000)` | `wait` | 白への移行完了後、OP呼出し前に約2.0秒保持することを録画から確認 |
| `farcall(8502)` | `kanon.opening.start` | 白画面保持後にOPへ移行することを確認。OP本体の再生実装は未対応 |
| その他の命令 | `unknown` | 命令名と型付き引数を保持し、挙動は推測しない |

`.org` に原作バイナリ上のbyte offsetと数値opcodeはありません。そのため `source.offset` は `.org` 内のUTF-8 byte offset、`source.opcode` はKprlの命令名で、`provenance` は `kprl-disassembly` です。元バイナリ位置・opcodeを回復できる資料が得られた時点で、別Decoderまたは対応表を追加します。

## 未確定のまま保持するもの

`title`、確認済みの組合せ以外の `grpOpenBg`・`farcall`、`jump`、`eof`、`halt` 等は、名前だけからランタイム挙動を決めません。`kanon.kprl.<命令名>` を候補名として保持し、Parserでは `unknown` になります。`farcall(8502)`はOP開始として識別できますが、OP本体のアセットと演出が未実装のためKAG出力を拒否します。

本文先頭の `\\{...}` はspeaker markupとして分離します。`\\m{A}` のような式は展開せず `speakerExpression` に残します。クリック待ちと本文消去は確認済みですが、名前欄、文字配置、ウィンドウ外観、macro展開は未確認なので、KAG emitterは実本文の出力をまだ拒否します。
