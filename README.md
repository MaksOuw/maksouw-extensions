# MaksOuw sources — Paperback 0.9

Sources pour l'application Paperback (>= 0.9), écrites nativement contre `@paperback/types` 0.9 (pas de couche de compatibilité 0.8).

## Structure

```
src/
  <NomDeLaSource>/
    main.ts        # point d'entrée, export default d'une instance implémentant Extension
    pbconfig.ts     # export default d'un objet ExtensionInfo (métadonnées de la source)
    static/
      icon.png      # icône carrée de la source
```

Chaque dossier sous `src/` n'est reconnu par le bundler que s'il contient **à la fois** `main.ts` et `pbconfig.ts`.

## Commandes

```
npm install
npm run bundle       # build de production dans bundles/
npm run watch        # build + serveur local avec rechargement à chaque modification
npm run logcat        # logs de l'app connectée en local (--ip=127.0.0.1 par défaut)
npm run lint
```

## Prérequis

- Node.js >= 24
- `@paperback/toolchain` et `@paperback/types` en version `1.0.0-alpha.91` (à réaligner sur la dernière version publiée avant de démarrer un nouveau développement — vérifier `npm view @paperback/types version` et `npm view @paperback/toolchain version`)

## Ajouter une nouvelle source

1. Créer `src/MaNouvelleSource/`
2. Copier `ExampleSource/pbconfig.ts` et `ExampleSource/main.ts` comme point de départ
3. Ajouter `src/MaNouvelleSource/static/icon.png`
4. `npm run watch` pour développer avec rechargement automatique
