# brepjs-app

A [brepjs](https://github.com/andymai/brepjs) + brepjs-families project.

```sh
npm install
npm run preview                    # live viewer; add -- --watch to re-render on save
npm start                          # evaluate src/main.tsx and print mesh stats
npm run export:ifc                 # write dist/model.ifc
npm test                           # resolve + mesh every element
npx brepjs add room storey slab    # copy starter families into src/families/
npx brepjs diff room               # compare a copied family against the registry
```

`src/main.tsx` default-exports the element tree; the tools own evaluation.
Families copied in by `brepjs add` are yours: edit them freely. `brepjs diff`
compares your copies against the registry when you want to see upstream drift.
