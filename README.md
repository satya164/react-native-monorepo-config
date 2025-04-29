# react-native-monorepo-config

Helper to configure Metro for a React Native app in a monorepo.

## Why

[Metro](https://metrobundler.dev/) ([React Native](https://reactnative.dev)'s bundler) doesn't work well with monorepos out of the box. This package is intended to make the configuration easier.

## Installation

```bash
yarn add -D react-native-monorepo-config
```

## Usage

Let's consider the following monorepo structure:

```sh
my-monorepo
├── apps
│   └── my-app
└── packages
    ├── a/
    └── b/
```

Here, `my-app` is a React Native app, and `a` and `b` are libraries that are used in the app.

To configure Metro for `my-app`, you can create a `metro.config.js` file in the `my-app` directory with the following content:

```js
const { getDefaultConfig } = require("@react-native/metro-config"); // Import from `@expo/metro-config` if using Expo CLI
const { withMetroConfig } = require("react-native-monorepo-config");

module.exports = withMetroConfig(
  getDefaultConfig(__dirname), // Metro config to extend
  {
    root: path.resolve(__dirname, "../.."), // Path to the monorepo root
    dirname: __dirname, // Path to the current directory
  }
);
```

It's also recommended to disable hoisting for the React Native app's dependencies to avoid issues.

For Yarn 4, hoisting can be disabled by setting `nmHoistingLimits: 'workspaces'` in `.yarnrc.yml`. See [Yarn documentation](https://yarnpkg.com/configuration/yarnrc#nmHoistingLimits) for more details.

If you want to customize the returned Metro config, remember to merge the returned config with your custom config. For example:

```js
const monoRepoConfig = withMetroConfig(getDefaultConfig(__dirname), {
  root: path.resolve(__dirname, "../.."),
  dirname: __dirname,
});

module.exports = {
  ...monoRepoConfig,

  resolver: {
    ...monoRepoConfig.resolver,

    assetExts: resolver.assetExts.filter((ext) => ext !== "svg"),
    sourceExts: [...resolver.sourceExts, "svg"],
  },
};
```

## How it works

This configuration will setup a few things:

- Configure Metro to watch for changes in other packages in the monorepo instead of just the current package. This may slow down the bundling process, in large monorepos. In that case, you can override `watchFolders` to add specific folders to watch instead.
- Block packages defined in `peerDependencies` of other packages in the monorepo to avoid duplicate versions from being loaded. Loading duplicate versions of some packages such as `react` can cause issues. Make sure to specify `peerDependencies` for your packages appropriately.
- If the packages defined in `peerDependencies` have been hoisted to the monorepo root, point Metro to them so they can be found.
- Configure Metro's resolve to prioritize `package.json#source` or the `source` condition in `package.json#exports` so that the app can import source code directly from other packages in the monorepo. To utilize this, make sure to add `"source": "src/index.ts"` or `"exports": { ".": { "source": "./src/index.ts" } }` to the `package.json` of the packages you want to import from.
