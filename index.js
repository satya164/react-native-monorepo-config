import escape from 'escape-string-regexp';
import glob from 'fast-glob';
import fs from 'node:fs';
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

  // Get the list of monorepo packages except current package
  const packages = (pkg.workspaces.packages || pkg.workspaces)
    .flatMap((pattern) =>
      glob.sync(pattern, {
        cwd: root,
        onlyDirectories: true,
        ignore: [`**/node_modules`, `**/.git`, `**/.yarn`],
      })
    )
    .filter((p) => {
      const dir = path.join(root, p);

      // Ignore current package
      if (path.relative(dir, dirname) === '') {
        return false;
      }

      // Ignore packages that don't have a package.json
      return fs.existsSync(path.join(dir, 'package.json'));
    });

  // Get the list of peer dependencies for all packages in the monorepo
  const peers = packages
    .flatMap((it) => {
      const pak = JSON.parse(
        fs.readFileSync(path.join(root, it, 'package.json'), 'utf8')
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
      packages
        .flatMap((it) =>
          peers.map((m) => `^${escape(path.join(it, 'node_modules', m))}\\/.*$`)
        )
        .join('|') +
      ')$'
  );

  // When we import a package from the monorepo, metro won't be able to find their deps if they are hoisted
  // We need to specify them in `extraNodeModules` to tell metro where to find them
  const extraNodeModules = peers.reduce((acc, name) => {
    if (fs.existsSync(path.join(root, 'node_modules', name))) {
      acc[name] = path.join(root, 'node_modules', name);
    }

    return acc;
  }, {});

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
      resolveRequest: (context, realModuleName, platform) => {
        // Prefer the source field for monorepo packages to consume source code
        if (packages.includes(realModuleName)) {
          context.mainFields = ['source', ...context.mainFields];
          context.unstable_conditionNames = [
            'source',
            ...context.unstable_conditionNames,
          ];
        }

        return context.resolveRequest(context, realModuleName, platform);
      },
    },
  };
}
