import escape from 'escape-string-regexp';
import glob from 'fast-glob';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Configure Metro for a React Native app in a monorepo.
 *
 * @param {import('metro-config').MetroConfig} baseConfig Base Metro config to extend.
 * @param {string} options.root Root directory path of the monorepo.
 * @param {string} options.dirname Directory path of the current package.
 *
 * @returns {import('metro-config').MetroConfig}
 */
export function withMetroConfig(baseConfig, { root, dirname }) {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8')
  );

  if (pkg.workspaces == null) {
    throw new Error(
      `No 'workspaces' field found in the 'package.json' at '${root}'.`
    );
  }

  if (
    !Array.isArray(pkg.workspaces) &&
    !Array.isArray(pkg.workspaces.packages)
  ) {
    throw new Error(
      `The 'workspaces' field in the 'package.json' at '${root}' must be an array.`
    );
  }

  // Get the list of monorepo packages except current package
  // Yarn also supports workspaces as an object with a "packages" field
  const packages = Object.fromEntries(
    (pkg.workspaces.packages || pkg.workspaces)
      .flatMap((pattern) =>
        glob.sync(pattern, {
          cwd: root,
          onlyDirectories: true,
          ignore: [`**/node_modules`, `**/.git`, `**/.yarn`],
        })
      )
      .map((p) => path.join(root, p))
      .filter((dir) => {
        // Exclude current package
        if (path.relative(dir, dirname) === '') {
          return false;
        }

        // Ignore folders that don't have a package.json
        return fs.existsSync(path.join(dir, 'package.json'));
      })
      .map((dir) => {
        const pak = JSON.parse(
          fs.readFileSync(path.join(dir, 'package.json'), 'utf8')
        );

        return [pak.name, dir];
      })
  );

  // If monorepo root contains a name, add it to the list of packages
  // Necessary if the root is a package itself
  if (pkg.name) {
    packages[pkg.name] = root;
  }

  // Get the list of peer dependencies for all packages in the monorepo
  const peers = Object.values(packages)
    .flatMap((dir) => {
      const pak = JSON.parse(
        fs.readFileSync(path.join(dir, 'package.json'), 'utf8')
      );

      return pak.peerDependencies ? Object.keys(pak.peerDependencies) : [];
    })
    .sort()
    .filter(
      (m, i, self) => self.lastIndexOf(m) === i // Remove duplicates
    );

  // We need to exclude the peerDependencies we've collected in packages' node_modules
  // Otherwise duplicate versions of the same package will be loaded
  const blockList = new RegExp(
    '(' +
      Object.values(packages)
        .flatMap((dir) =>
          peers.map(
            (m) => `^${escape(path.join(dir, 'node_modules', m))}\\/.*$`
          )
        )
        .join('|') +
      ')$'
  );

  // When we import a package from the monorepo, metro may not be able to find the deps in blockList
  // We need to specify them in `extraNodeModules` to tell metro where to find them
  const extraNodeModules = peers.reduce((acc, name) => {
    let dir;

    try {
      // Try to resolve the package relative to the current package using node resolution
      // This may fail if the module's `package.json` is not in its `exports`
      const require = createRequire(path.join(dirname, 'package.json'));

      dir = path.dirname(require.resolve(`${name}/package.json`));
    } catch (e) {
      // First, try to find the package in the current package's node_modules
      // As a fallback, try to find it in the monorepo root
      dir = [dirname, root]
        .map((d) => path.join(d, 'node_modules', name))
        .find((d) => fs.existsSync(d));
    }

    if (dir) {
      acc[name] = dir;
    }

    return acc;
  }, {});

  // If monorepo root is a package, add it to extraNodeModules so metro can find it
  // Normally monorepo packages are symlinked to node_modules, but the root is not
  // So we need to add it manually
  if (pkg.name) {
    extraNodeModules[pkg.name] = root;
  }

  /** @type {import('metro-config').MetroConfig} */
  return {
    ...baseConfig,

    projectRoot: dirname,

    // We need to watch the root of the monorepo
    // This lets Metro find the monorepo packages automatically using haste
    // This also lets us import modules from monorepo root
    watchFolders: [root],

    resolver: {
      ...baseConfig.resolver,

      blockList,
      extraNodeModules,
      resolveRequest: (originalContext, moduleName, platform) => {
        let context = originalContext;

        // Prefer the source field for monorepo packages to consume source code
        if (packages[moduleName]) {
          context = {
            ...context,
            mainFields: ['source', ...context.mainFields],
            unstable_conditionNames: [
              'source',
              ...context.unstable_conditionNames,
            ],
          };
        }

        if (baseConfig.resolver.resolveRequest) {
          return baseConfig.resolver.resolveRequest(
            context,
            moduleName,
            platform
          );
        } else {
          return context.resolveRequest(context, moduleName, platform);
        }
      },
    },
  };
}
