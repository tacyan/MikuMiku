===================================
ダンスモーションファイルについて
===================================

このディレクトリには、初音ミクのダンスモーションファイル（.vmd）を配置してください。

推奨ファイル名: dance.vmd

別のファイル名を使用する場合は、js/app.jsファイル内の以下の部分を変更してください:

```javascript
mmdLoader.loadAnimation(
    'motions/dance.vmd',  // ← ここを変更
    mesh,
    ...
);
```

モーションファイルの入手先:
- VPVP wiki: https://w.atwiki.jp/vpvpwiki/
- ニコニコ動画のMMD関連コンテンツ

注意: モーションデータを使用する際は、各制作者の利用規約を必ず確認してください。 