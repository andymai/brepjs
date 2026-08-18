# brepjs-app

A [brepjs](https://github.com/andymai/brepjs) + brepjs-families project.

```sh
npm install
npm start                          # evaluate src/main.ts and print mesh stats
npx brepjs add room storey slab    # copy starter families into src/families/
npx brepjs diff room               # compare a copied family against the registry
```

Families copied in by `brepjs add` are yours: edit them freely. `brepjs diff`
compares your copies against the registry when you want to see upstream drift.
