# react-native-monorepo-config

Helper to configure Metro for a React Native app in a monorepo.

## Why

[Metro](https://metrobundler.dev/) ([React Native](https://reactnative.dev)'s bundler) doesn't work well with monorepos out of the box. This package is intended to make the configuration easier.

## Installation

```bash
npm install --save-dev react-native-monorepo-config
```

Also make sure that your're using recent version of Node.js, i.e. v20.19.0 and higher (LTS), v22.12.0 and higher (LTS) or v23.4.0 and higher.

## Usage

Let's consider the following monorepo structure:

```sh
my-monorepo
├── apps
│   └── my-app
└── packages
    ├── a
    └── b
```

Here, `my-app` is a React Native app, and `a` and `b` are libraries that are used in the app.

To configure Metro for `my-app`, you can create a `metro.config.js` file in the `my-app` directory with the following content:

```js
const path = require('path');
const { getDefaultConfig } = require('@react-native/metro-config'); // Import from `@expo/metro-config` if using Expo CLI
const { withMetroConfig } = require('react-native-monorepo-config');

module.exports = withMetroConfig(
  getDefaultConfig(__dirname), // Metro config to extend
  {
    root: path.resolve(__dirname, '../..'), // Path to the monorepo root
    dirname: __dirname, // Path to the current directory
  }
);
```

It's also recommended to disable hoisting for the React Native app's dependencies to avoid issues.

For Yarn 4, hoisting can be disabled by setting `nmHoistingLimits: 'workspaces'` in `.yarnrc.yml`. See [Yarn documentation](https://yarnpkg.com/configuration/yarnrc#nmHoistingLimits) for more details.

If you want to customize the returned Metro config, remember to merge the returned config with your custom config. For example:

```js
const monoRepoConfig = withMetroConfig(getDefaultConfig(__dirname), {
  root: path.resolve(__dirname, '../..'),
  dirname: __dirname,
});

module.exports = {
  ...monoRepoConfig,

  resolver: {
    ...monoRepoConfig.resolver,

    assetExts: resolver.assetExts.filter((ext) => ext !== 'svg'),
    sourceExts: [...resolver.sourceExts, 'svg'],
  },
};
```

## How it works

This configuration will setup a few things:

- Configure Metro to watch for changes in the monorepo root instead of only the current package.

  This may slow down the bundling process in large monorepos. In that case, you can override `watchFolders` to add specific folders to watch instead:

  ```js
  module.exports = {
    watchFolders: [
      path.resolve(__dirname),
      // Path to packages that the app depends on
      path.resolve(__dirname, '../packages/a'),
      path.resolve(__dirname, '../packages/b'),
    ],

    ...monoRepoConfig,
  };
  ```

- Block packages defined in `peerDependencies` of other packages in the monorepo to avoid duplicate versions from being loaded. They must be added under `dependencies` or `devDependencies` in the app's `package.json`.

  Loading duplicate versions of some packages such as `react` can cause issues. So this way multiple versions are not loaded. Make sure to specify `peerDependencies` for your packages appropriately.

- If the packages defined in `peerDependencies` have been hoisted to the monorepo root, point Metro to them so they can be found.
- Configure Metro's resolve to prioritize `package.json#source` or the `source` condition in `package.json#exports` so that the app can import source code directly from other packages in the monorepo.

  To utilize this, make sure to add the `source` field to the `package.json` of the packages you want to import from, e.g.:

  ```json
  "source": "src/index.ts"
  ```

  Or in the `exports` field if you're using `exports` field and Metro 0.82.0+:

  ```json
  "exports": {
     ".": {
       "source": "./src/index.ts",
       // other conditions...
     },
   }
  ```
